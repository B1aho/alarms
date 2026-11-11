//! Bridge to the Tauri shell (`withGlobalTauri`): `invoke` and the `daemon` event.
//! Without `window.__TAURI__` (a plain browser, the visual tests) the app runs on a fake daemon.

use js_sys::{Function, Object, Promise, Reflect};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

fn tauri() -> Option<JsValue> {
    let w = web_sys::window()?;
    let t = Reflect::get(&w, &"__TAURI__".into()).ok()?;
    (!t.is_undefined() && !t.is_null()).then_some(t)
}

pub fn has_shell() -> bool {
    tauri().is_some()
}

fn args(pairs: &[(&str, JsValue)]) -> JsValue {
    let o = Object::new();
    for (k, v) in pairs {
        let _ = Reflect::set(&o, &(*k).into(), v);
    }
    o.into()
}

fn invoke(cmd: &str, a: JsValue) -> Option<Promise> {
    let core = Reflect::get(&tauri()?, &"core".into()).ok()?;
    let f: Function = Reflect::get(&core, &"invoke".into()).ok()?.dyn_into().ok()?;
    f.call2(&core, &cmd.into(), &a).ok()?.dyn_into().ok()
}

fn fire(cmd: &str, a: JsValue) {
    if let Some(p) = invoke(cmd, a) {
        wasm_bindgen_futures::spawn_local(async move {
            if let Err(e) = JsFuture::from(p).await {
                web_sys::console::warn_1(&e);
            }
        });
    }
}

/// One JSON-serialized `protocol::Command`.
pub fn send_line(line: String) {
    fire("send", args(&[("line", line.into())]));
}

/// Listen to daemon events (one JSON `protocol::Event` per payload), then ask for a replay.
pub fn listen(on_line: impl Fn(String) + 'static) {
    let Some(t) = tauri() else { return };
    let Ok(event) = Reflect::get(&t, &"event".into()) else {
        return;
    };
    let Ok(listen) = Reflect::get(&event, &"listen".into()).and_then(|f| f.dyn_into::<Function>()) else {
        return;
    };
    let cb = Closure::<dyn Fn(JsValue)>::new(move |e: JsValue| {
        if let Some(s) = Reflect::get(&e, &"payload".into()).ok().and_then(|p| p.as_string()) {
            on_line(s);
        }
    });
    let promise = listen.call2(&event, &"daemon".into(), cb.as_ref().unchecked_ref());
    cb.forget();
    if let Ok(p) = promise.and_then(|p| p.dyn_into::<Promise>()) {
        wasm_bindgen_futures::spawn_local(async move {
            let _ = JsFuture::from(p).await;
            fire("ready", args(&[]));
        });
    }
}

/// Native file dialog; `None` when cancelled.
pub async fn pick_audio_file() -> Option<String> {
    let p = invoke("pick_audio_file", args(&[]))?;
    JsFuture::from(p).await.ok()?.as_string()
}

pub fn set_window(title: &str, alert: bool) {
    fire("set_window", args(&[("title", title.into()), ("alert", alert.into())]));
}

pub fn set_theme(theme: &str) {
    fire("set_theme", args(&[("theme", theme.into())]));
}
