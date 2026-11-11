//! UiLauncher adapter: starts `alarm-ui` when no client is connected.
//! The client binary sits next to the daemon (dev: `target/<profile>/`), or is the main
//! executable of the `.app` bundle that contains the daemon (macOS, TZ_RUST 9).
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use app::ports::UiLauncher;

pub struct Launcher {
    client: Option<PathBuf>,
    /// Extra arguments (e.g. the daemon's `--data-dir` in tests).
    extra: Vec<String>,
}

#[cfg(windows)]
const CLIENT: &str = "alarm-ui.exe";
#[cfg(not(windows))]
const CLIENT: &str = "alarm-ui";

/// Find the client relative to the daemon executable.
pub fn find_client(daemon_exe: &Path) -> Option<PathBuf> {
    let dir = daemon_exe.parent()?;
    let sibling = dir.join(CLIENT);
    if sibling.exists() {
        return Some(sibling);
    }
    // Alarm.app/Contents/Library/Helpers/alarmd.app/Contents/MacOS/alarmd → Alarm.app/Contents/MacOS/alarm-ui
    let mut cur = dir;
    while let Some(parent) = cur.parent() {
        if cur.file_name().is_some_and(|n| n == "Contents") && parent.extension().is_some_and(|e| e == "app") {
            let candidate = cur.join("MacOS").join(CLIENT);
            if candidate.exists() && !candidate.starts_with(dir) {
                return Some(candidate);
            }
        }
        cur = parent;
    }
    None
}

impl Launcher {
    /// `client = None` disables launching (headless e2e).
    pub fn new(client: Option<PathBuf>, extra: Vec<String>) -> Self {
        Launcher { client, extra }
    }

    fn launch(&self, mode: &str) {
        let Some(exe) = &self.client else {
            log::info!("client launch skipped ({mode}): no client");
            return;
        };
        let mut cmd = Command::new(exe);
        cmd.arg(format!("--show={mode}"))
            .args(&self.extra)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        match cmd.spawn() {
            Ok(child) => log::info!("started client ({mode}), pid {}", child.id()),
            Err(e) => log::warn!("cannot start client {}: {e}", exe.display()),
        }
    }
}

impl UiLauncher for Launcher {
    fn show_window(&self) {
        self.launch("window");
    }
    fn show_ringing(&self) {
        self.launch("ringing");
    }
    fn show_timer_alert(&self) {
        self.launch("timer");
    }
}
