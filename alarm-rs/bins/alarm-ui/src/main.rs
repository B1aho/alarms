//! `alarm-ui`: the client shell (TZ_RUST 5.1, 5.4). It owns the window, relays the protocol
//! between the daemon socket and the WebView, and opens the file dialog. It makes no decisions.
//!
//! WebView bridge: `invoke("send", { line })` → one JSON `Command` to the daemon; event
//! `"daemon"` ← one JSON `Event` line; `invoke("ready")` replays the latest Hello + Snapshot;
//! `invoke("pick_audio_file")`; `invoke("set_window", { title, alert })`; `invoke("set_theme", { theme })`.
//!
//! Flags: `--data-dir <dir>` (must match the daemon's), `--show=window|ringing|timer`,
//! `--daemon <path>`.
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod daemon;

use std::path::PathBuf;
use std::sync::Mutex;

use protocol::Command;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Default)]
struct Replay {
    hello: Option<String>,
    snapshot: Option<String>,
    ready: bool,
}

struct Shell {
    link: daemon::Link,
    replay: Mutex<Replay>,
    alert: Mutex<bool>,
}

#[tauri::command]
fn send(line: String, shell: tauri::State<'_, Shell>) {
    shell.link.send_line(&line);
}

#[tauri::command]
fn ready(app: tauri::AppHandle, shell: tauri::State<'_, Shell>) {
    let mut r = shell.replay.lock().unwrap_or_else(|p| p.into_inner());
    r.ready = true;
    for line in [r.hello.clone(), r.snapshot.clone()].into_iter().flatten() {
        let _ = app.emit("daemon", line);
    }
}

#[tauri::command]
async fn pick_audio_file(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter(
            "Audio",
            &["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "webm"],
        )
        .blocking_pick_file()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/// Ringing screen / timer alert: full screen and on top of every window (TZ_RUST 6, row 3.5).
#[tauri::command]
fn set_window(title: String, alert: bool, app: tauri::AppHandle, shell: tauri::State<'_, Shell>) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    let _ = w.set_title(&title);
    let mut cur = shell.alert.lock().unwrap_or_else(|p| p.into_inner());
    if *cur != alert {
        *cur = alert;
        let _ = w.set_always_on_top(alert);
        let _ = w.set_fullscreen(alert);
        if alert {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

#[tauri::command]
fn set_theme(theme: String, app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let t = match theme.as_str() {
            "light" => Some(tauri::Theme::Light),
            "dark" => Some(tauri::Theme::Dark),
            _ => None,
        };
        let _ = w.set_theme(t);
    }
}

fn bring_forward(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let mut data_dir: Option<PathBuf> = None;
    let mut daemon_path: Option<PathBuf> = None;
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--data-dir" => data_dir = it.next().map(PathBuf::from),
            "--daemon" => daemon_path = it.next().map(PathBuf::from),
            _ => {}
        }
    }
    let opts = daemon::Options {
        data_dir,
        daemon: daemon_path,
    };

    // Connect (starting the daemon if needed) before any window exists: a second client quits here.
    let link = match daemon::Link::connect(&opts) {
        Ok(l) => l,
        Err(daemon::ConnectError::AlreadyOpen) => {
            log::info!("another window is open; it was brought forward");
            return;
        }
        Err(daemon::ConnectError::Failed(e)) => {
            log::error!("cannot reach the daemon: {e}");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Shell {
            link: link.clone(),
            replay: Mutex::new(Replay::default()),
            alert: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            send,
            ready,
            pick_audio_file,
            set_window,
            set_theme
        ])
        .setup(move |app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Alarm")
                .inner_size(1100.0, 820.0)
                .min_inner_size(400.0, 560.0)
                .center()
                .build()?;
            let link_focus = link.clone();
            window.on_window_event(move |e| {
                if let WindowEvent::Focused(true) = e {
                    link_focus.send(&Command::WindowFocused);
                }
            });
            let handle = app.handle().clone();
            link.start_reader(opts.clone(), move |line, kind| {
                let shell = handle.state::<Shell>();
                match kind {
                    daemon::LineKind::Hello => {
                        shell.replay.lock().unwrap_or_else(|p| p.into_inner()).hello = Some(line.clone())
                    }
                    daemon::LineKind::Snapshot => {
                        shell.replay.lock().unwrap_or_else(|p| p.into_inner()).snapshot = Some(line.clone())
                    }
                    daemon::LineKind::Focus => bring_forward(&handle),
                    daemon::LineKind::Other => {}
                    daemon::LineKind::Closed => {
                        // The daemon quit (tray `Quit`): the window closes too (TZ_RUST 7). The event
                        // loop may not wake up while the window is full screen; a hard exit backs it up.
                        log::info!("daemon gone; closing the window");
                        handle.exit(0);
                        std::thread::spawn(|| {
                            std::thread::sleep(std::time::Duration::from_millis(800));
                            std::process::exit(0);
                        });
                        return;
                    }
                }
                if shell.replay.lock().unwrap_or_else(|p| p.into_inner()).ready {
                    let _ = handle.emit("daemon", line);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("tauri");
}
