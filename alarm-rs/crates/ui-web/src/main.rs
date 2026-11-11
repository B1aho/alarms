//! `ui-web`: the client view. Shows the daemon's state and sends commands; it makes no
//! decisions (TZ_RUST 5.6). Runs in the Tauri WebView, or on a fake daemon in a browser.
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

mod app;
mod bridge;
mod fake;
mod gallery;
mod keyboard;
mod screens;
mod state;
mod widgets;

use leptos::prelude::*;
use protocol::Event;

use crate::state::{Opening, Page, Store};

fn main() {
    console_error_panic_hook::set_once();
    let params = web_sys::UrlSearchParams::new_with_str(&window().location().search().unwrap_or_default())
        .unwrap_or_else(|_| web_sys::UrlSearchParams::new().expect("UrlSearchParams"));
    let shell = bridge::has_shell();
    let frozen = params.get("now").and_then(|n| n.parse::<f64>().ok());
    if let Some(root) = document().document_element() {
        if frozen.is_some() || params.has("still") {
            let _ = root.class_list().add_1("no-motion");
        }
        // Visual tests only: headless WebKit does not paint `backdrop-filter`.
        if params.get("shim").as_deref() == Some("backdrop") && !shell {
            let _ = root.class_list().add_1("backdrop-shim");
        }
    }
    let opening = Opening {
        open: params.get("open"),
        example: params.get("example"),
        answer: params.get("answer"),
    };
    let store = Store::new(!shell, frozen, opening);
    if let Some(p) = params.get("page").as_deref().and_then(Page::from_str) {
        store.page.set(p);
    }
    if shell {
        bridge::listen(move |line| match serde_json::from_str::<Event>(&line) {
            Ok(e) => store.on_event(e),
            Err(e) => web_sys::console::warn_1(&format!("bad event: {e}").into()),
        });
    } else {
        fake::load(&store, &params);
    }
    let gallery = params.has("gallery");
    leptos::mount::mount_to_body(move || view! { <app::App store=store gallery=gallery /> });
}
