//! Ringing screen (3.5) and the timer alert (3.10). Decisions belong to the daemon:
//! the task, its progress and wrong answers come in the snapshot.

use leptos::html;
use leptos::prelude::*;
use protocol::{Command, ProblemKind, TimerStatus};

use domain::format;
use domain::strings as s;

use crate::state::{local_hm, tz, use_store, use_ticker};
use crate::widgets::icons::{I, icon};

#[component]
pub fn RingingOverlay() -> impl IntoView {
    let store = use_store();
    let first = Memo::new(move |_| store.with(|s| s.ringing.first().cloned()).flatten());
    let id = Memo::new(move |_| first.with(|r| r.as_ref().map(|r| r.alarm.id.clone())));
    move || id.get().map(|id| view! { <RingingScreen id=id /> })
}

#[component]
fn RingingScreen(id: String) -> impl IntoView {
    let store = use_store();
    let now = use_ticker(store, 1000);
    let id2 = id.clone();
    let ringing = Memo::new(move |_| {
        store
            .with(|s| s.ringing.iter().find(|r| r.alarm.id == id2).cloned())
            .flatten()
    });
    let label = move || ringing.with(|r| r.as_ref().map(|r| s::alarm_label(&r.alarm.label)).unwrap_or_default());
    let clock = move || {
        let (h, m) = local_hm(now.get());
        format::clock(h, m, store.with(|s| s.hour_cycle).unwrap_or(protocol::HourCycle::H24))
    };
    let date = move || format::long_date(now.get() as i64, &tz());
    let snooze = move || ringing.with(|r| r.as_ref().is_some_and(|r| r.alarm.snooze));
    let minutes = move || store.with(|s| s.settings.snooze_minutes).unwrap_or(9);
    let has_task = move || ringing.with(|r| r.as_ref().is_some_and(|r| r.task.is_some()));
    let (id_snooze, id_stop) = (id.clone(), id.clone());
    let snooze_btn = NodeRef::<html::Button>::new();
    let stop_btn = NodeRef::<html::Button>::new();
    // Default focus: Snooze when allowed, otherwise Stop.
    Effect::new(move |_| {
        if has_task() {
            return;
        }
        if let Some(b) = snooze_btn.get() {
            let _ = b.focus();
        } else if let Some(b) = stop_btn.get() {
            let _ = b.focus();
        }
    });

    view! {
        <div role="alertdialog" aria-label=move || format!("Alarm: {}", label()) class="ringing anim-fade-in">
            <div aria-hidden="true" class="glow anim-breathe"></div>
            <div class="ringing-col">
                <div class="ringing-label">{icon(I::Alarm, "")} {label}</div>
                <div class="ringing-time-line">
                    <span class="ringing-time">{move || clock().0}</span>
                    {move || clock().1.map(|p| view! { <span class="ringing-period">{p}</span> })}
                </div>
                <p class="ringing-date">{date}</p>
                {move || {
                    if has_task() {
                        view! { <TaskCard id=id.clone() /> }.into_any()
                    } else {
                        let (a, b) = (id_snooze.clone(), id_stop.clone());
                        view! {
                            <div class="ringing-actions">
                                <Show when=snooze>
                                    {
                                        let a = a.clone();
                                        view! {
                                            <button
                                                node_ref=snooze_btn
                                                type="button"
                                                class="filled-btn accent big-pill"
                                                on:click=move |_| store.send(Command::Snooze { id: a.clone() })
                                            >
                                                {move || s::snooze_button(minutes())}
                                            </button>
                                        }
                                    }
                                </Show>
                                <button
                                    node_ref=stop_btn
                                    type="button"
                                    class="ringing-stop"
                                    on:click=move |_| store.send(Command::Stop { id: b.clone() })
                                >
                                    {s::STOP}
                                </button>
                            </div>
                        }
                            .into_any()
                    }
                }}
            </div>
        </div>
    }
}

#[component]
fn TaskCard(id: String) -> impl IntoView {
    let store = use_store();
    let id2 = id.clone();
    let task = Memo::new(move |_| {
        store
            .with(|s| {
                s.ringing
                    .iter()
                    .find(|r| r.alarm.id == id2)
                    .and_then(|r| r.task.clone())
            })
            .flatten()
    });
    let input = RwSignal::new(store.opening.with_value(|o| o.answer.clone()).unwrap_or_default());
    let field = NodeRef::<html::Input>::new();
    let shake = RwSignal::new(0u32);
    // A wrong answer (the counter grows) shakes the new task.
    Effect::new(move |prev: Option<u32>| {
        let w = task.with(|t| t.as_ref().map(|t| t.wrong).unwrap_or(0));
        if prev.is_some_and(|p| w > p) {
            shake.update(|n| *n += 1);
        }
        w
    });
    // Focus the field whenever a new task shows up.
    Effect::new(move |_| {
        task.track();
        if let Some(f) = field.get() {
            let _ = f.focus();
        }
    });
    let math = move || task.with(|t| t.as_ref().is_some_and(|t| t.kind == ProblemKind::Math));
    let (id_submit, id_back) = (id.clone(), id.clone());
    let submit = move |e: leptos::ev::SubmitEvent| {
        e.prevent_default();
        let answer = input.get_untracked();
        if answer.trim().is_empty() {
            return;
        }
        store.send(Command::SubmitAnswer {
            id: id_submit.clone(),
            answer,
        });
        input.set(String::new());
    };

    view! {
        <form class="task-card anim-sheet-in" on:submit=submit>
            <div class="task-head">
                <span>{move || if math() { s::SOLVE_TO_TURN_OFF } else { s::TYPE_CODE_TO_TURN_OFF }}</span>
                <span
                    class="task-dots"
                    aria-label=move || {
                        task.with(|t| t.as_ref().map(|t| format!("{} of {} solved", t.solved, t.total)))
                    }
                >
                    {move || {
                        task.with(|t| {
                            t.as_ref()
                                .map(|t| {
                                    (0..t.total)
                                        .map(|i| {
                                            view! { <span class="task-dot" class:done={i < t.solved}></span> }
                                        })
                                        .collect_view()
                                })
                        })
                    }}
                </span>
            </div>
            {move || {
                let n = shake.get();
                let prompt = task.with(|t| t.as_ref().map(|t| t.prompt.clone()).unwrap_or_default());
                let class = if n > 0 { "task-prompt anim-shake" } else { "task-prompt" };
                view! { <p class=class>{format!("{prompt}{}", if math() { " =" } else { "" })}</p> }
            }}
            <input
                node_ref=field
                class="task-input"
                autocomplete="off"
                spellcheck="false"
                aria-label=s::ANSWER
                inputmode=move || if math() { "numeric" } else { "text" }
                placeholder=move || if math() { s::ANSWER } else { s::CODE }
                prop:value=move || input.get()
                on:input=move |e| input.set(event_target_value(&e))
            />
            <button type="submit" class="filled-btn accent full task-done" disabled=move || input.get().trim().is_empty()>
                {s::DONE}
            </button>
            <button
                type="button"
                class="text-btn task-back"
                on:click=move |_| store.send(Command::BackFromTask { id: id_back.clone() })
            >
                {s::BACK}
            </button>
        </form>
    }
}

#[component]
pub fn TimerAlert() -> impl IntoView {
    let store = use_store();
    let ringing = move || store.with(|s| s.timer.status == TimerStatus::Ringing).unwrap_or(false);
    let stop_btn = NodeRef::<html::Button>::new();
    Effect::new(move |_| {
        if let Some(b) = stop_btn.get() {
            let _ = b.focus();
        }
    });
    move || {
        ringing().then(|| {
            let label = store.with(|s| s::timer_label(&s.timer.label)).unwrap_or_default();
            let up = store
                .with(|s| s::timer_is_up(&format::countdown(s.timer.duration_ms)))
                .unwrap_or_default();
            view! {
                <div class="timer-alert-wrap anim-fade-in">
                    <div role="alertdialog" aria-label="Timer done" class="timer-alert elevated anim-sheet-in">
                        <div class="ta-top">
                            {icon(I::Timer, "")}
                            <p class="ta-title">{label}</p>
                            <p class="ta-sub">{up}</p>
                        </div>
                        <div class="ta-actions">
                            <button
                                node_ref=stop_btn
                                type="button"
                                class="filled-btn accent"
                                on:click=move |_| store.send(Command::StopTimerAlert)
                            >
                                {s::STOP}
                            </button>
                            <button
                                type="button"
                                class="filled-btn gray"
                                on:click=move |_| store.send(Command::RepeatTimer)
                            >
                                {s::REPEAT_TIMER}
                            </button>
                        </div>
                    </div>
                </div>
            }
        })
    }
}
