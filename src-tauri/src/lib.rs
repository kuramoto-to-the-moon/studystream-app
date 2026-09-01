mod local_server;

use std::{fs, path::Path};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const DEFAULT_WINDOW_WIDTH: f64 = 1100.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 720.0;
const MIN_WINDOW_WIDTH: f64 = 520.0;
const MIN_WINDOW_HEIGHT: f64 = 480.0;

fn load_window_size(path: &Path) -> Option<(f64, f64)> {
    let value: serde_json::Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    let width = value.get("width")?.as_f64()?;
    let height = value.get("height")?.as_f64()?;
    if !(MIN_WINDOW_WIDTH..=6000.0).contains(&width)
        || !(MIN_WINDOW_HEIGHT..=4000.0).contains(&height)
    {
        return None;
    }
    Some((width, height))
}

fn save_window_size(path: &Path, width: f64, height: f64) {
    let _ = fs::write(path, serde_json::json!({ "width": width, "height": height }).to_string());
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            local_server::start(data_dir.clone())?;
            let window_size_path = data_dir.join("window-size.json");
            let (window_width, window_height) = load_window_size(&window_size_path)
                .unwrap_or((DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT));

            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("http://127.0.0.1:47831/".parse()?),
            )
            .title("StudyStream")
            .inner_size(window_width, window_height)
            .min_inner_size(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)
            .resizable(true)
            .build()?;

            let window_for_close = window.clone();
            window.on_window_event(move |event| {
                if !matches!(event, WindowEvent::CloseRequested { .. }) {
                    return;
                }
                let Ok(size) = window_for_close.inner_size() else {
                    return;
                };
                let Ok(scale_factor) = window_for_close.scale_factor() else {
                    return;
                };
                let logical = size.to_logical::<f64>(scale_factor);
                save_window_size(&window_size_path, logical.width, logical.height);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run StudyStream");
}
