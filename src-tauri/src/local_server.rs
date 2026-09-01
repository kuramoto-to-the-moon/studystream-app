use async_stream::stream;
use axum::{
    extract::{Request, State},
    http::{header, HeaderMap, HeaderValue, StatusCode, Uri},
    middleware::{self, Next},
    response::{sse::Event, IntoResponse, Response, Sse},
    routing::{get, post},
    Json, Router,
};
use futures_core::Stream;
use rust_embed::RustEmbed;
use serde_json::{json, Value};
use std::{
    convert::Infallible,
    fs, io,
    io::Write,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
    thread,
};
use tokio::sync::{broadcast, RwLock};

const HOST: &str = "127.0.0.1:47831";
const LOCALHOST: &str = "localhost:47831";
const OBS_OVERLAY_URL: &str = "http://127.0.0.1:47831/overlay";

#[derive(RustEmbed)]
#[folder = "../dist/"]
struct WebAssets;

#[derive(Clone)]
struct ServerState {
    document: Arc<RwLock<Value>>,
    state_path: Arc<PathBuf>,
    updates: broadcast::Sender<Value>,
}

pub fn start(data_dir: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(&data_dir)?;
    let state_path = data_dir.join("state.json");
    let document = load_or_initialize(&state_path)?;
    let listener = TcpListener::bind(HOST).map_err(|error| {
        io::Error::new(
            error.kind(),
            format!(
                "StudyStream could not use http://{HOST}. Close another running copy and try again: {error}"
            ),
        )
    })?;
    listener.set_nonblocking(true)?;
    let (updates, _) = broadcast::channel(32);

    let state = ServerState {
        document: Arc::new(RwLock::new(document)),
        state_path: Arc::new(state_path),
        updates,
    };

    thread::Builder::new()
        .name("studystream-local-server".into())
        .spawn(move || {
            let runtime = tokio::runtime::Runtime::new().expect("create local server runtime");
            runtime.block_on(async move {
                let listener =
                    tokio::net::TcpListener::from_std(listener).expect("use local server socket");
                let app = Router::new()
                    .route("/api/state", get(get_state).put(put_state))
                    .route("/api/events", get(events))
                    .route("/api/copy-obs-url", post(copy_obs_url))
                    .route("/api/copy-obs-size", post(copy_obs_size))
                    .fallback(static_asset)
                    .with_state(state)
                    .layer(middleware::from_fn(enforce_local_host));
                axum::serve(listener, app).await.expect("run local server");
            });
        })?;

    Ok(())
}

async fn enforce_local_host(request: Request, next: Next) -> Response {
    let allowed = is_allowed_host(
        request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
    );

    if !allowed {
        return StatusCode::FORBIDDEN.into_response();
    }

    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        header::HeaderName::from_static("cross-origin-resource-policy"),
        HeaderValue::from_static("same-origin"),
    );
    response
}

fn is_allowed_host(host: Option<&str>) -> bool {
    host.is_some_and(|value| value == HOST || value == LOCALHOST)
}

async fn get_state(State(state): State<ServerState>) -> Json<Value> {
    Json(state.document.read().await.clone())
}

async fn put_state(
    State(state): State<ServerState>,
    Json(next): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    // Serialize disk writes as well as the in-memory update. Concurrent PUTs
    // must never race through the shared temporary state file.
    let mut document = state.document.write().await;
    let current_updated_at = document
        .get("updatedAt")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let incoming_updated_at = next
        .get("updatedAt")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if current_updated_at > 0 && incoming_updated_at <= current_updated_at {
        return Err(StatusCode::CONFLICT);
    }
    save_atomic(&state.state_path, &next).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    *document = next.clone();
    drop(document);
    let _ = state.updates.send(next.clone());
    Ok(Json(next))
}

async fn events(
    State(state): State<ServerState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let initial = state.document.read().await.clone();
    let mut receiver = state.updates.subscribe();
    let output = stream! {
        yield Ok(Event::default().data(initial.to_string()));
        loop {
            match receiver.recv().await {
                Ok(value) => yield Ok(Event::default().data(value.to_string())),
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    };
    Sse::new(output)
}

async fn copy_obs_url() -> StatusCode {
    match write_clipboard(OBS_OVERLAY_URL) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn copy_obs_size(Json(payload): Json<Value>) -> StatusCode {
    let Some(value) = payload.get("value").and_then(Value::as_u64) else {
        return StatusCode::BAD_REQUEST;
    };
    if value == 0 || value > 100_000 {
        return StatusCode::BAD_REQUEST;
    }

    match write_clipboard(&value.to_string()) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn write_clipboard(text: &str) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    let mut child = Command::new("pbcopy").stdin(Stdio::piped()).spawn()?;

    #[cfg(target_os = "windows")]
    let mut child = Command::new("cmd")
        .args(["/C", "clip"])
        .stdin(Stdio::piped())
        .spawn()?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err(io::Error::new(io::ErrorKind::Unsupported, "unsupported platform"));

    child
        .stdin
        .take()
        .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "clipboard input unavailable"))?
        .write_all(text.as_bytes())?;

    if child.wait()?.success() {
        Ok(())
    } else {
        Err(io::Error::other("clipboard command failed"))
    }
}

async fn static_asset(uri: Uri) -> Response {
    let requested = uri.path().trim_start_matches('/');
    let path = if requested.is_empty() || requested == "overlay" {
        "index.html"
    } else {
        requested
    };
    let asset = WebAssets::get(path).or_else(|| WebAssets::get("index.html"));

    match asset {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_str(mime.as_ref())
                    .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
            );
            headers.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static(if path == "index.html" {
                    "no-cache"
                } else {
                    "public, max-age=31536000, immutable"
                }),
            );
            (StatusCode::OK, headers, content.data.into_owned()).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

fn load_or_initialize(path: &Path) -> io::Result<Value> {
    if let Ok(raw) = fs::read_to_string(path) {
        if let Ok(value) = serde_json::from_str(&raw) {
            return Ok(value);
        }
    }

    let initial = default_state();
    save_atomic(path, &initial)?;
    Ok(initial)
}

fn save_atomic(path: &Path, value: &Value) -> io::Result<()> {
    let temporary = path.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(&temporary, bytes)?;
    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temporary, path)
}

fn default_state() -> Value {
    json!({
        "version": 1,
        "updatedAt": 0,
        "session": {
            "phase": "idle",
            "tracking": false,
            "intervalCompleted": false,
            "phaseStartedAt": null,
            "phaseEndsAt": null,
            "pausedRemainingSeconds": null,
            "lastCheckpointAt": 0,
            "sessionSeconds": 0,
            "todaySeconds": 0,
            "offstreamTodaySeconds": 0,
            "totalSeconds": 0,
            "dayKey": "",
            "dailySeconds": {}
        },
        "settings": {
            "studyMinutes": 30,
            "breakMinutes": 10,
            "studyDurationSeconds": 1800,
            "breakDurationSeconds": 600,
            "autoCycleEnabled": true,
            "completionSoundEnabled": true,
            "completionSound": "chime",
            "language": "ja",
            "layout": "horizontal",
            "boardFont": "sans",
            "colorPreset": "dark",
            "background": "#000000",
            "backgroundOpacity": 0.62,
            "textColor": "#ffffff",
            "textOpacity": 1.0,
            "secondaryTextColor": "#ffffff",
            "secondaryTextOpacity": 0.78,
            "secondaryTextDefaultVersion": 2,
            "boardAppearanceDefaultVersion": 2,
            "defaultStreakVersion": 2,
            "showMetricSeconds": false,
            "note": "",
            "metricKinds": {
                "session": "session", "today": "today", "streaks": "streaks",
                "metric4": "week", "metric5": "month", "metric6": "year", "metric7": "total"
            },
            "messages": {
                "study": "集中しています。コメントは休憩中に読みます。",
                "paused": "少し会話しています。学習タイマーは一時停止中です。",
                "break": "休憩中です。コメントを読んでいます。",
                "idle": "まもなく学習を始めます。"
            },
            "widgets": [
                { "id": "state", "visible": true },
                { "id": "timer", "visible": true },
                { "id": "message", "visible": true },
                { "id": "offstream", "visible": true },
                { "id": "note", "visible": true },
                { "id": "session", "visible": true },
                { "id": "today", "visible": true },
                { "id": "streaks", "visible": true },
                { "id": "metric4", "visible": false },
                { "id": "metric5", "visible": false },
                { "id": "metric6", "visible": false },
                { "id": "metric7", "visible": false }
            ],
            "streaks": [
                { "id": "workout", "name": "筋トレ", "kind": "count", "count": 0, "unit": "回", "visible": true }
            ]
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_host, HOST, LOCALHOST};

    #[test]
    fn accepts_only_the_expected_loopback_hosts() {
        assert!(is_allowed_host(Some(HOST)));
        assert!(is_allowed_host(Some(LOCALHOST)));
        assert!(!is_allowed_host(Some("studystream.example:47831")));
        assert!(!is_allowed_host(Some("127.0.0.1:9999")));
        assert!(!is_allowed_host(None));
    }
}
