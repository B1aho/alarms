//! Stopwatch page (3.11): drawn every animation frame from `startedAt`; Space and L keys.

use leptos::ev;
use leptos::prelude::*;
use protocol::{Command, Stopwatch};

use domain::format;
use domain::strings as s;

use super::PageHeader;
use crate::state::use_store;
use crate::widgets::button::CircleButton;

fn elapsed(sw: &Stopwatch, now: f64) -> i64 {
    sw.accumulated_ms + sw.started_at.map(|t| (now as i64 - t).max(0)).unwrap_or(0)
}

#[component]
pub fn StopwatchPage() -> impl IntoView {
    let store = use_store();
    let sw = Memo::new(move |_| store.with(|s| s.stopwatch.clone()).unwrap_or_default());
    let running = move || sw.with(|s| s.started_at.is_some());
    let (now, set_now) = signal(store.now());

    // Frame clock while running.
    let alive = StoredValue::new(true);
    on_cleanup(move || alive.set_value(false));
    fn frame(alive: StoredValue<bool>, set_now: WriteSignal<f64>, store: crate::state::Store) {
        if !alive.get_value() {
            return;
        }
        set_now.set(store.now());
        if !store.is_frozen() {
            request_animation_frame(move || frame(alive, set_now, store));
        }
    }
    Effect::new(move |_| {
        if running() {
            request_animation_frame(move || frame(alive, set_now, store));
        }
    });

    let total = move || sw.with(|s| elapsed(s, now.get()));
    let laps = move || {
        sw.with(|s| {
            let splits: Vec<i64> = s
                .laps
                .iter()
                .enumerate()
                .map(|(i, t)| t - if i == 0 { 0 } else { s.laps[i - 1] })
                .collect();
            let (min, max) = if splits.len() >= 2 {
                (splits.iter().min().copied(), splits.iter().max().copied())
            } else {
                (None, None)
            };
            let current = elapsed(s, now.get()) - s.laps.last().copied().unwrap_or(0);
            let mut rows = vec![(s.laps.len() + 1, current, "")];
            for (i, ms) in splits.iter().enumerate().rev() {
                let tone = if Some(*ms) == min {
                    "best"
                } else if Some(*ms) == max {
                    "worst"
                } else {
                    ""
                };
                rows.push((i + 1, *ms, tone));
            }
            rows
        })
    };

    let handle = window_event_listener(ev::keydown, move |e| {
        let typing = e
            .target()
            .and_then(|t| wasm_bindgen::JsCast::dyn_into::<web_sys::Element>(t).ok())
            .and_then(|el| el.closest("input, textarea, select, [contenteditable]").ok().flatten())
            .is_some();
        if typing || e.meta_key() || e.ctrl_key() {
            return;
        }
        if e.code() == "Space" {
            e.prevent_default();
            store.send(if running() {
                Command::StopwatchStop
            } else {
                Command::StopwatchStart
            });
        } else if e.key().eq_ignore_ascii_case("l") {
            if running() {
                store.send(Command::StopwatchLap);
            } else if total() > 0 {
                store.send(Command::StopwatchReset);
            }
        }
    });
    on_cleanup(move || handle.remove());

    view! {
        <PageHeader title=s::STOPWATCH />
        <div class="sw-display">
            <p class="sw-time">{move || format::stopwatch(total())}</p>
        </div>
        <div class="circle-row sw-buttons">
            {move || {
                if running() {
                    view! {
                        <CircleButton
                            tone="gray"
                            title="Lap (L)"
                            on_click=Callback::new(move |_| store.send(Command::StopwatchLap))
                        >
                            {s::LAP}
                        </CircleButton>
                        <CircleButton
                            tone="red"
                            title="Stop (Space)"
                            on_click=Callback::new(move |_| store.send(Command::StopwatchStop))
                        >
                            {s::STOP}
                        </CircleButton>
                    }
                        .into_any()
                } else {
                    view! {
                        <CircleButton
                            tone="gray"
                            title="Reset (L)"
                            disabled=Signal::derive(move || total() == 0)
                            on_click=Callback::new(move |_| store.send(Command::StopwatchReset))
                        >
                            {s::RESET}
                        </CircleButton>
                        <CircleButton
                            tone="green"
                            title="Start (Space)"
                            on_click=Callback::new(move |_| store.send(Command::StopwatchStart))
                        >
                            {s::START}
                        </CircleButton>
                    }
                        .into_any()
                }
            }}
        </div>
        <Show when={move || total() > 0 || sw.with(|s| !s.laps.is_empty())}>
            <ul class="laps">
                {move || {
                    laps()
                        .into_iter()
                        .map(|(n, ms, tone)| {
                            view! {
                                <li class=format!("lap {tone}")>
                                    <span>{s::lap_n(n)}</span>
                                    <span class="tabular">{format::stopwatch(ms)}</span>
                                </li>
                            }
                        })
                        .collect_view()
                }}
            </ul>
        </Show>
    }
}
