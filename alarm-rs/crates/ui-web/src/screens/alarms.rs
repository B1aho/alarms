//! Alarms page (3.2): list, edit mode, empty state, notification banner.

use leptos::prelude::*;
use protocol::{Alarm, AlarmDraft, Command, NotifyStatus};

use domain::format;
use domain::schedule::repeat_summary;
use domain::strings as s;

use super::PageHeader;
use super::editor::{Editor, EditorState};
use crate::state::{local_hm, tz, use_store, use_ticker};
use crate::widgets::banner::Banner;
use crate::widgets::icons::{I, icon};
use crate::widgets::row::Section;
use crate::widgets::switch::Switch;

#[component]
pub fn AlarmsPage() -> impl IntoView {
    let store = use_store();
    let now = use_ticker(store, 15_000);
    let editor = RwSignal::new(None::<EditorState>);
    let edit_mode = RwSignal::new(false);
    let confirm_initial = StoredValue::new(None::<String>);

    // Screens opened from the URL (fake daemon, screenshots).
    if let Some(open) = store.opening.with_value(|o| o.open.clone()) {
        let parts: Vec<&str> = open.split(':').collect();
        match parts.as_slice() {
            ["edit-mode"] => edit_mode.set(true),
            ["edit-mode", id] => {
                edit_mode.set(true);
                confirm_initial.set_value(Some(id.to_string()));
            }
            ["editor-new", rest @ ..] => {
                if let Some(t) = store.snap.get_untracked().map(|s| s.new_alarm) {
                    let (h, m) = local_hm(store.now());
                    let draft = AlarmDraft {
                        hour: h,
                        minute: m,
                        ..t
                    };
                    editor.set(Some(EditorState::new(draft, true, rest.first().copied())));
                }
            }
            ["editor", id, rest @ ..] => {
                if let Some(a) = store
                    .snap
                    .get_untracked()
                    .and_then(|s| s.alarms.into_iter().find(|a| a.id == *id))
                {
                    editor.set(Some(EditorState::new(
                        AlarmDraft::from_alarm(&a),
                        false,
                        rest.first().copied(),
                    )));
                }
            }
            _ => {}
        }
    }

    let ids = move || {
        store
            .with(|s| s.alarms.iter().map(|a| a.id.clone()).collect::<Vec<_>>())
            .unwrap_or_default()
    };
    let has_alarms = move || store.with(|s| !s.alarms.is_empty()).unwrap_or(false);
    let add = move || {
        if let Some(t) = store.snap.get_untracked().map(|s| s.new_alarm) {
            let (h, m) = local_hm(store.now());
            editor.set(Some(EditorState::new(
                AlarmDraft {
                    hour: h,
                    minute: m,
                    ..t
                },
                true,
                None,
            )));
        }
    };
    let subtitle = Signal::derive(move || {
        let n = now.get();
        store.with(|s| match s.next_alarm_at {
            Some(at) => s::next_alarm_in(&format::relative(at - n as i64)),
            None => s::NO_ALARMS_ON.to_string(),
        })
    });

    view! {
        <PageHeader
            title=s::ALARMS
            leading=view! {
                <Show when=has_alarms>
                    <button
                        type="button"
                        class="text-btn"
                        class:bold=move || edit_mode.get()
                        on:click=move |_| edit_mode.update(|m| *m = !*m)
                    >
                        {move || if edit_mode.get() { s::DONE } else { s::EDIT }}
                    </button>
                </Show>
            }
                .into_any()
            trailing=view! {
                <Show when=has_alarms>
                    <button
                        type="button"
                        class="icon-btn"
                        aria-label=s::ADD_ALARM_ARIA
                        title=s::ADD_ALARM_ARIA
                        on:click=move |_| add()
                    >
                        {icon(I::Plus, "")}
                    </button>
                </Show>
            }
                .into_any()
            subtitle=subtitle
        />
        <NotificationBanner />
        {move || {
            if has_alarms() {
                view! {
                    <Section header=s::SECTION_ALARMS>
                        <For each=ids key=|id| id.clone() let:id>
                            <AlarmRow
                                id=id.clone()
                                edit_mode=edit_mode
                                confirming_at_start=confirm_initial.with_value(|c| c.as_deref() == Some(id.as_str()))
                                on_edit=Callback::new(move |a: Alarm| {
                                    editor.set(Some(EditorState::new(AlarmDraft::from_alarm(&a), false, None)))
                                })
                            />
                        </For>
                    </Section>
                }
                    .into_any()
            } else if store.snap.with(Option::is_some) {
                view! {
                    <div class="empty">
                        {icon(I::Alarm, "empty-icon")}
                        <p class="empty-title">{s::NO_ALARMS}</p>
                        <p class="empty-hint">{s::NO_ALARMS_HINT}</p>
                        <button type="button" class="filled-btn accent" on:click=move |_| add()>
                            {s::ADD_ALARM}
                        </button>
                    </div>
                }
                    .into_any()
            } else {
                ().into_any()
            }
        }}
        {move || editor.get().map(|st| view! { <Editor state=st on_close=Callback::new(move |_| editor.set(None)) /> })}
    }
}

#[component]
fn NotificationBanner() -> impl IntoView {
    let store = use_store();
    move || {
        let (status, platform) = store.with(|s| (s.notifications, s.platform))?;
        Some(match status {
            NotifyStatus::On => ().into_any(),
            NotifyStatus::Blocked => view! {
                <Banner
                    icon=icon(I::Bell, "tone-red").into_any()
                    title=s::NOTIFICATIONS_BLOCKED
                    body=s::notifications_blocked_text(platform)
                />
            }
            .into_any(),
            NotifyStatus::NotDetermined => view! {
                <Banner
                    icon=icon(I::Bell, "tone-accent").into_any()
                    title=s::ALLOW_NOTIFICATIONS
                    body=s::ALLOW_NOTIFICATIONS_HINT.to_string()
                    action=view! {
                        <button
                            type="button"
                            class="filled-btn accent pill"
                            on:click=move |_| store.send(Command::RequestNotificationPermission)
                        >
                            {s::TURN_ON}
                        </button>
                    }
                        .into_any()
                />
            }
            .into_any(),
        })
    }
}

#[component]
fn AlarmRow(
    id: String,
    edit_mode: RwSignal<bool>,
    confirming_at_start: bool,
    on_edit: Callback<Alarm>,
) -> impl IntoView {
    let store = use_store();
    let confirming = RwSignal::new(confirming_at_start);
    let id2 = id.clone();
    let alarm = Memo::new(move |_| store.with(|s| s.alarms.iter().find(|a| a.id == id2).cloned()).flatten());
    let clock = move || {
        let cycle = store.with(|s| s.hour_cycle)?;
        let a = alarm.get()?;
        Some(format::clock(a.hour, a.minute, cycle))
    };
    let label = move || alarm.get().map(|a| s::alarm_label(&a.label)).unwrap_or_default();
    Effect::new(move |_| {
        if !edit_mode.get() {
            confirming.set(false);
        }
    });

    view! {
        <div
            class="alarm-row ios-row"
            style=move || format!("--row-inset: {}", if edit_mode.get() { "56px" } else { "16px" })
            on:click=move |_| {
                if let Some(a) = alarm.get_untracked() {
                    on_edit.run(a);
                }
            }
        >
            <Show when=move || edit_mode.get()>
                <button
                    type="button"
                    class="alarm-minus"
                    class:confirming=move || confirming.get()
                    aria-label=move || s::delete_aria(&label())
                    on:click=move |e| {
                        e.stop_propagation();
                        confirming.update(|c| *c = !*c);
                    }
                >
                    {icon(I::MinusCircle, "")}
                </button>
            </Show>
            <div
                class="alarm-main"
                class:inactive=move || !alarm.get().is_some_and(|a| a.enabled || a.snooze_until.is_some())
            >
                <div class="alarm-time-line">
                    <span class="alarm-time">{move || clock().map(|c| c.0)}</span>
                    {move || clock().and_then(|c| c.1).map(|p| view! { <span class="alarm-period">{p}</span> })}
                </div>
                <div class="alarm-sub">
                    <span class="truncate">
                        {move || alarm.get().map(|a| s::alarm_subtitle(&a.label, &repeat_summary(&a.days)))}
                    </span>
                </div>
                {move || {
                    let until = alarm.get()?.snooze_until?;
                    let cycle = store.with(|s| s.hour_cycle)?;
                    let id = alarm.get()?.id;
                    Some(
                        view! {
                            <div class="snoozed">
                                {s::snoozed_until(&format::timestamp(until, &tz(), cycle))}
                                <button
                                    type="button"
                                    on:click=move |e| {
                                        e.stop_propagation();
                                        store.send(Command::CancelSnooze { id: id.clone() });
                                    }
                                >
                                    {s::STOP}
                                </button>
                            </div>
                        },
                    )
                }}
            </div>
            {move || {
                if edit_mode.get() {
                    if confirming.get() {
                        let id = id.clone();
                        view! {
                            <button
                                type="button"
                                class="alarm-delete anim-fade-in"
                                on:click=move |e| {
                                    e.stop_propagation();
                                    store.send(Command::DeleteAlarm { id: id.clone() });
                                }
                            >
                                {s::DELETE}
                            </button>
                        }
                            .into_any()
                    } else {
                        icon(I::ChevronRight, "alarm-chevron").into_any()
                    }
                } else {
                    let id = id.clone();
                    view! {
                        <Switch
                            checked=Signal::derive(move || alarm.get().is_some_and(|a| a.enabled))
                            label=Signal::derive(move || {
                                let (t, p) = clock().unwrap_or_default();
                                format!("{} {}{}", label(), t, p.unwrap_or(""))
                            })
                            on_change=Callback::new(move |enabled| {
                                store.send(Command::SetAlarmEnabled { id: id.clone(), enabled })
                            })
                        />
                    }
                        .into_any()
                }
            }}
        </div>
    }
}
