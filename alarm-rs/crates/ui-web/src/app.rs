//! Root layout (3.1): toolbar with the section switcher and the clock, the page, the overlays.

use leptos::prelude::*;
use protocol::{HourCycle, Theme, TimerStatus};

use domain::format;
use domain::strings as s;

use crate::bridge;
use crate::screens::alarms::AlarmsPage;
use crate::screens::ringing::{RingingOverlay, TimerAlert};
use crate::screens::settings::SettingsPage;
use crate::screens::stopwatch::StopwatchPage;
use crate::screens::timer::TimerPage;
use crate::state::{Page, Store, local_hm, use_store, use_ticker};
use crate::widgets::icons::{I, icon};
use crate::{gallery, keyboard};

#[component]
pub fn App(store: Store, gallery: bool) -> impl IntoView {
    provide_context(store);
    sync_theme(store);
    sync_window(store);
    keyboard::install(store);
    if gallery {
        return view! { <gallery::Gallery /> }.into_any();
    }
    view! {
        <div class="app-root">
            <Toolbar />
            <main class="content">
                {move || match store.page.get() {
                    Page::Alarms => view! { <AlarmsPage /> }.into_any(),
                    Page::Stopwatch => view! { <StopwatchPage /> }.into_any(),
                    Page::Timer => view! { <TimerPage /> }.into_any(),
                    Page::Settings => view! { <SettingsPage /> }.into_any(),
                }}
            </main>
            <RingingOverlay />
            <TimerAlert />
        </div>
    }
    .into_any()
}

const TABS: [(Page, &str, I); 4] = [
    (Page::Alarms, s::ALARMS, I::Alarm),
    (Page::Stopwatch, s::STOPWATCH, I::Stopwatch),
    (Page::Timer, s::TIMER, I::Timer),
    (Page::Settings, s::SETTINGS, I::Gear),
];

#[component]
fn Toolbar() -> impl IntoView {
    let store = use_store();
    let index = move || Page::ALL.iter().position(|p| *p == store.page.get()).unwrap_or(0);
    view! {
        <header class="toolbar">
            <div class="toolbar-inner">
                <div class="toolbar-brand">
                    <span class="app-icon">{icon(I::Alarm, "")}</span>
                    <span class="brand-name">{s::APP_NAME}</span>
                </div>
                <nav aria-label="Sections" class="tabs">
                    <span
                        aria-hidden="true"
                        class="seg-thumb"
                        style=move || format!("width: calc((100% - 4px) / 4); transform: translateX({}%)", index() * 100)
                    ></span>
                    {TABS
                        .iter()
                        .map(|&(page, label, i)| {
                            view! {
                                <a
                                    href="#"
                                    class="tab"
                                    class:active=move || store.page.get() == page
                                    aria-current=move || (store.page.get() == page).then_some("page")
                                    on:click=move |e| {
                                        e.prevent_default();
                                        store.page.set(page);
                                    }
                                >
                                    {icon(i, "")}
                                    <span class="tab-label">{label}</span>
                                </a>
                            }
                        })
                        .collect_view()}
                </nav>
                <ToolbarClock />
            </div>
        </header>
    }
}

#[component]
fn ToolbarClock() -> impl IntoView {
    let store = use_store();
    let now = use_ticker(store, 1000);
    let clock = move || {
        let (h, m) = local_hm(now.get());
        format::clock(h, m, store.with(|s| s.hour_cycle).unwrap_or(HourCycle::H24))
    };
    view! {
        <div class="toolbar-clock tabular" aria-label="Current time">
            {move || clock().0}
            {move || clock().1.map(|p| view! { <span class="period">{p}</span> })}
        </div>
    }
}

fn theme_name(t: Theme) -> &'static str {
    match t {
        Theme::System => "system",
        Theme::Light => "light",
        Theme::Dark => "dark",
    }
}

/// `data-theme` on the root follows the setting; `Auto` follows the system live.
fn sync_theme(store: Store) {
    let system_dark = RwSignal::new(false);
    if let Some(mq) = window().match_media("(prefers-color-scheme: dark)").ok().flatten() {
        system_dark.set(mq.matches());
        let cb = wasm_bindgen::closure::Closure::<dyn Fn(web_sys::MediaQueryListEvent)>::new(
            move |e: web_sys::MediaQueryListEvent| system_dark.set(e.matches()),
        );
        let _ = mq.add_event_listener_with_callback("change", wasm_bindgen::JsCast::unchecked_ref(cb.as_ref()));
        cb.forget();
    }
    let theme = Memo::new(move |_| store.with(|s| s.settings.theme).unwrap_or(Theme::System));
    Effect::new(move |_| {
        let t = theme.get();
        let dark = match t {
            Theme::System => system_dark.get(),
            Theme::Light => false,
            Theme::Dark => true,
        };
        if let Some(root) = document().document_element() {
            let _ = root.set_attribute("data-theme", if dark { "dark" } else { "light" });
        }
    });
    Effect::new(move |_| {
        let t = theme.get();
        if store.snap.with_untracked(Option::is_some) {
            bridge::set_theme(theme_name(t));
        }
    });
}

/// Window title and full-screen alert mode follow the ringing state (3.5).
fn sync_window(store: Store) {
    let mode = Memo::new(move |_| {
        store
            .with(|s| match s.ringing.first() {
                Some(r) => (s::ringing_title(&r.alarm), true),
                None => (s::APP_NAME.to_string(), s.timer.status == TimerStatus::Ringing),
            })
            .unwrap_or_else(|| (s::APP_NAME.to_string(), false))
    });
    Effect::new(move |_| {
        let (title, alert) = mode.get();
        document().set_title(&title);
        bridge::set_window(&title, alert);
    });
}
