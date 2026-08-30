use async_stream::stream;
use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue, StatusCode, Uri},
    response::{sse::Event, IntoResponse, Response, Sse},
    routing::get,
    Json, Router,
};
use futures_core::Stream;
use rust_embed::RustEmbed;
use serde_json::{json, Value};
use std::{
    convert::Infallible,
    fs, io,
    net::TcpListener,
    path::{Path, PathBuf},
    sync::Arc,
    thread,
};
use tokio::sync::{broadcast, RwLock};

const HOST: &str = "127.0.0.1:47831";

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
                    .fallback(static_asset)
                    .with_state(state);
                axum::serve(listener, app).await.expect("run local server");
            });
        })?;

    Ok(())
}

async fn get_state(State(state): State<ServerState>) -> Json<Value> {
    Json(state.document.read().await.clone())
}

async fn put_state(
    State(state): State<ServerState>,
    Json(next): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    save_atomic(&state.state_path, &next).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    *state.document.write().await = next.clone();
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
        "session": {
            "phase": "idle",
            "tracking": false,
            "phaseStartedAt": null,
            "phaseEndsAt": null,
            "lastCheckpointAt": 0,
            "sessionSeconds": 0,
            "todaySeconds": 0,
            "totalSeconds": 0,
            "dayKey": ""
        },
        "settings": {
            "studyMinutes": 30,
            "breakMinutes": 10,
            "language": "ja",
            "layout": "horizontal",
            "background": "#000000",
            "backgroundOpacity": 0.9,
            "textColor": "#ffffff",
            "messages": {
                "study": "集中しています。コメントは休憩中に読みます。",
                "paused": "少し会話しています。学習時間の計測は停止中です。",
                "break": "休憩中です。コメントを読んでいます。",
                "idle": "まもなく学習を始めます。"
            },
            "widgets": [
                { "id": "state", "visible": true, "size": "large" },
                { "id": "timer", "visible": true, "size": "large" },
                { "id": "message", "visible": true, "size": "medium" },
                { "id": "session", "visible": true, "size": "small" },
                { "id": "today", "visible": true, "size": "small" },
                { "id": "streaks", "visible": true, "size": "small" }
            ],
            "streaks": [
                { "id": "smoke-free", "name": "禁煙", "startedOn": "2026-07-13", "visible": true }
            ]
        }
    })
}
