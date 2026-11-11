//! Settings page (3.12 with TZ_RUST 3.3–3.6). Every change sends the whole settings at once.

use leptos::prelude::*;
use protocol::{Command, Difficulty, HourCyclePref, NotifyStatus, Settings, SoundRef, TaskType, Theme};

use domain::format;
use domain::strings as s;

use super::PageHeader;
use super::sound_picker::{SoundPicker, start_import};
use crate::state::{Import, next_owner, use_store};
use crate::widgets::icons::{I, icon};
use crate::widgets::row::{ActionRow, NavRow, Row, Section};
use crate::widgets::segmented::Segmented;
use crate::widgets::sheet::{Sheet, SheetHeader, text_button};
use crate::widgets::slider::VolumeRow;
use crate::widgets::stepper::Stepper;
use crate::widgets::switch::Switch;

const RAMP_OPTIONS: [u32; 7] = [0, 15, 30, 60, 120, 300, 600];
const GRACE_OPTIONS: [u32; 6] = [5, 15, 30, 60, 120, 240];

#[component]
pub fn SettingsPage() -> impl IntoView {
    let store = use_store();
    let settings = Memo::new(move |_| store.with(|s| s.settings.clone()));
    let update = move |f: Box<dyn Fn(&mut Settings)>| {
        if let Some(mut s) = settings.get_untracked() {
            f(&mut s);
            store.send(Command::UpdateSettings { settings: s });
        }
    };
    let field =
        move |f: fn(&Settings) -> u64| Signal::derive(move || settings.with(|s| s.as_ref().map(f).unwrap_or(0)));
    let sound_open = RwSignal::new(store.opening.with_value(|o| o.open.as_deref() == Some("default-sound")));
    let close_sound = Callback::new(move |_| sound_open.set(false));
    let task_kind =
        Signal::derive(move || settings.with(|s| s.as_ref().map(|s| s.default_task.kind).unwrap_or(TaskType::Math)));
    let sounds = move || store.with(|s| s.sounds.clone()).unwrap_or_default();

    view! {
        <PageHeader title=s::SETTINGS />
        <Section header=s::SECTION_APPEARANCE>
            <Row>
                <span class="row-text">{s::THEME}</span>
                <Segmented
                    class="w-220"
                    label="Theme"
                    options=vec![(Theme::System, s::AUTO), (Theme::Light, s::LIGHT), (Theme::Dark, s::DARK)]
                    value=Signal::derive(move || settings.with(|s| s.as_ref().map(|s| s.theme).unwrap_or(Theme::System)))
                    on_change=Callback::new(move |t| update(Box::new(move |s| s.theme = t)))
                />
            </Row>
            <Row>
                <span class="row-text">{s::TIME_FORMAT}</span>
                <Segmented
                    class="w-220"
                    label="Time format"
                    options=vec![
                        (HourCyclePref::Auto, s::AUTO),
                        (HourCyclePref::H12, s::HOUR_12),
                        (HourCyclePref::H24, s::HOUR_24),
                    ]
                    value=Signal::derive(move || {
                        settings.with(|s| s.as_ref().map(|s| s.hour_cycle).unwrap_or(HourCyclePref::Auto))
                    })
                    on_change=Callback::new(move |c| update(Box::new(move |s| s.hour_cycle = c)))
                />
            </Row>
        </Section>
        <Section header=s::SECTION_NEW_ALARM_DEFAULTS footer=s::DEFAULTS_FOOTER>
            <NavRow
                label=s::SOUND
                detail=Signal::derive(move || {
                    settings.with(|x| x.as_ref().map(|x| s::sound_name(&x.default_sound, &sounds())).unwrap_or_default())
                })
                on_click=Callback::new(move |_| sound_open.set(true))
            />
            <VolumeRow
                value=Signal::derive(move || settings.with(|s| s.as_ref().map(|s| s.volume).unwrap_or(0.9)))
                on_change=Callback::new(move |v| update(Box::new(move |s| s.volume = v)))
                label="Default volume"
            />
            <SelectRow
                label=s::GRADUAL_VOLUME
                value=field(|s| u64::from(s.ramp_seconds))
                options=RAMP_OPTIONS.iter().map(|&v| (u64::from(v), format::duration_short(v))).collect()
                on_change=Callback::new(move |v: u64| update(Box::new(move |s| s.ramp_seconds = v as u32)))
            />
            <Row>
                <span class="row-text">{s::TURN_OFF_WITH}</span>
                <Segmented
                    class="w-240"
                    label="Default dismissal task"
                    options=vec![(TaskType::None, s::NONE), (TaskType::Math, s::MATH), (TaskType::Retype, s::CODE)]
                    value=task_kind
                    on_change=Callback::new(move |k| update(Box::new(move |s| s.default_task.kind = k)))
                />
            </Row>
            <Show when=move || task_kind.get() != TaskType::None>
                <Row>
                    <span class="row-text">{s::DIFFICULTY}</span>
                    <Segmented
                        class="w-240"
                        label="Default difficulty"
                        options=vec![(Difficulty::Easy, s::EASY), (Difficulty::Medium, s::MEDIUM), (Difficulty::Hard, s::HARD)]
                        value=Signal::derive(move || {
                            settings.with(|s| s.as_ref().map(|s| s.default_task.difficulty).unwrap_or(Difficulty::Medium))
                        })
                        on_change=Callback::new(move |d| update(Box::new(move |s| s.default_task.difficulty = d)))
                    />
                </Row>
                <Row>
                    <span class="row-label">{move || s::tasks_in_a_row(field(|s| u64::from(s.default_task.count)).get() as u8)}</span>
                    <span class="row-accessory">
                        <Stepper
                            label="Default task count"
                            value=Signal::derive(move || field(|s| u64::from(s.default_task.count)).get() as i64)
                            min=1
                            max=5
                            on_change=Callback::new(move |c: i64| update(Box::new(move |s| s.default_task.count = c as u8)))
                        />
                    </span>
                </Row>
            </Show>
        </Section>
        <Section header=s::SECTION_SNOOZE>
            <Row>
                <span class="row-label">{move || s::snooze_length(field(|s| u64::from(s.snooze_minutes)).get() as u8)}</span>
                <span class="row-accessory">
                    <Stepper
                        label="Snooze minutes"
                        value=Signal::derive(move || field(|s| u64::from(s.snooze_minutes)).get() as i64)
                        min=1
                        max=30
                        on_change=Callback::new(move |m: i64| update(Box::new(move |s| s.snooze_minutes = m as u8)))
                    />
                </span>
            </Row>
        </Section>
        <Section header=s::SECTION_RELIABILITY footer=s::RELIABILITY_FOOTER>
            <Row>
                <span class="row-label">{s::NOTIFICATIONS}</span>
                {move || match store.with(|s| s.notifications) {
                    Some(NotifyStatus::On) => view! { <span class="row-detail tone-green">{s::ON}</span> }.into_any(),
                    Some(NotifyStatus::Blocked) => {
                        view! { <span class="row-detail tone-orange">{s::BLOCKED}</span> }.into_any()
                    }
                    Some(NotifyStatus::NotDetermined) => {
                        view! {
                            <span class="row-accessory">
                                <button
                                    type="button"
                                    class="filled-btn accent pill"
                                    on:click=move |_| store.send(Command::RequestNotificationPermission)
                                >
                                    {s::TURN_ON}
                                </button>
                            </span>
                        }
                            .into_any()
                    }
                    None => ().into_any(),
                }}
            </Row>
            <Row>
                <span class="row-text">{s::OPEN_AT_LOGIN}</span>
                <Switch
                    checked=Signal::derive(move || settings.with(|s| s.as_ref().is_some_and(|s| s.open_at_login)))
                    label=s::OPEN_AT_LOGIN.to_string()
                    on_change=Callback::new(move |v| update(Box::new(move |s| s.open_at_login = v)))
                />
            </Row>
            <Row>
                <span class="row-text">{s::KEEP_COMPUTER_AWAKE}</span>
                <Switch
                    checked=Signal::derive(move || settings.with(|s| s.as_ref().is_some_and(|s| s.keep_awake)))
                    label="Keep computer awake while alarms are on".to_string()
                    on_change=Callback::new(move |v| update(Box::new(move |s| s.keep_awake = v)))
                />
            </Row>
            <SelectRow
                label=s::RING_LATE_ALARMS_FOR
                value=field(|s| u64::from(s.missed_grace_minutes))
                options=GRACE_OPTIONS.iter().map(|&v| (u64::from(v), format::grace(v))).collect()
                on_change=Callback::new(move |v: u64| update(Box::new(move |s| s.missed_grace_minutes = v as u32)))
            />
        </Section>
        <MusicLibrary />
        <Section header=s::SECTION_ABOUT>
            <Row>
                <span class="row-label">{s::VERSION}</span>
                <span class="row-detail">{move || store.with(|s| s.version.clone())}</span>
            </Row>
            <Row>
                <span class="row-label">{s::STORAGE}</span>
                <span class="row-detail">{s::THIS_COMPUTER_ONLY}</span>
            </Row>
        </Section>
        <Show when=move || sound_open.get()>
            <Sheet label="Default sound".to_string() on_close=close_sound>
                <SheetHeader title=s::DEFAULT_SOUND_SHEET.to_string() trailing=text_button(s::DONE, true, close_sound) />
                <div class="sheet-body">
                    <SoundPicker
                        value=Signal::derive(move || {
                            settings
                                .with(|s| s.as_ref().map(|s| s.default_sound.clone()))
                                .unwrap_or(SoundRef::Builtin(protocol::BuiltinSound::Sunrise))
                        })
                        volume=Signal::derive(move || settings.with(|s| s.as_ref().map(|s| s.volume).unwrap_or(0.9)))
                        on_change=Callback::new(move |snd: SoundRef| {
                            update(Box::new(move |s| s.default_sound = snd.clone()))
                        })
                    />
                </div>
            </Sheet>
        </Show>
    }
}

#[component]
fn SelectRow(
    label: &'static str,
    value: Signal<u64>,
    options: Vec<(u64, String)>,
    on_change: Callback<u64>,
) -> impl IntoView {
    view! {
        <Row>
            <span class="row-text">{label}</span>
            <select
                class="row-select"
                aria-label=label
                prop:value=move || value.get().to_string()
                on:change=move |e| {
                    if let Ok(v) = event_target_value(&e).parse() {
                        on_change.run(v);
                    }
                }
            >
                {options
                    .into_iter()
                    .map(|(v, text)| {
                        view! {
                            <option value=v.to_string() selected=move || value.get() == v>
                                {text}
                            </option>
                        }
                    })
                    .collect_view()}
            </select>
        </Row>
    }
}

#[component]
fn MusicLibrary() -> impl IntoView {
    let store = use_store();
    let owner = next_owner();
    let error = RwSignal::new(None::<String>);
    Effect::new(move |_| match store.import.get() {
        Import::Done { owner: o, .. } if o == owner => {
            store.import.set(Import::Idle);
            error.set(None);
        }
        Import::Failed { owner: o, message } if o == owner => {
            store.import.set(Import::Idle);
            error.set(Some(message));
        }
        _ => {}
    });
    let adding = move || matches!(store.import.get(), Import::Adding { owner: o } if o == owner);
    let customs = move || store.with(|s| s.sounds.clone()).unwrap_or_default();
    view! {
        <Section
            header=s::SECTION_YOUR_MUSIC
            footer=Signal::derive(move || error.get().unwrap_or_else(|| s::MUSIC_LIBRARY_FOOTER.to_string()))
        >
            <For each=customs key=|c| c.id.clone() let:c>
                {
                    let id = c.id.clone();
                    view! {
                        <Row>
                            <span class="row-icon">{icon(I::Music, "tone-indigo")}</span>
                            <span class="row-label">{c.name.clone()}</span>
                            <span class="row-detail">{format::megabytes(c.size)}</span>
                            <span class="row-accessory">
                                <button
                                    type="button"
                                    class="trash-btn"
                                    aria-label=s::delete_aria(&c.name)
                                    on:click=move |_| store.send(Command::RemoveSound { id: id.clone() })
                                >
                                    {icon(I::Trash, "")}
                                </button>
                            </span>
                        </Row>
                    }
                }
            </For>
            <ActionRow
                label=Signal::derive(move || if adding() { s::ADDING } else { s::ADD_MUSIC_FILE }.to_string())
                tone="accent"
                icon_view=icon(I::Plus, "tone-accent").into_any()
                on_click=Callback::new(move |_| {
                    error.set(None);
                    start_import(owner);
                })
            />
        </Section>
    }
}
