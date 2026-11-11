//! Global shortcuts (3.1): ⌘ + 1…4 on macOS, Ctrl + 1…4 on Windows and Linux.

use leptos::ev;
use leptos::prelude::*;
use protocol::Platform;

use crate::state::{Page, Store};

pub fn install(store: Store) {
    let handle = window_event_listener(ev::keydown, move |e| {
        let mac = store.with(|s| s.platform == Platform::Macos).unwrap_or(true);
        let modifier = if mac { e.meta_key() } else { e.ctrl_key() };
        if !modifier {
            return;
        }
        let page = match e.key().as_str() {
            "1" => Page::Alarms,
            "2" => Page::Stopwatch,
            "3" => Page::Timer,
            "4" => Page::Settings,
            _ => return,
        };
        e.prevent_default();
        store.page.set(page);
    });
    on_cleanup(move || handle.remove());
}
