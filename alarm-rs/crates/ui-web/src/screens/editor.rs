//! Alarm editor sheet (3.3) with its subpages. The draft lives here; `Save` sends it.

use leptos::prelude::*;
use protocol::{AlarmDraft, Command, Difficulty, DismissTask, HourCycle, TaskType};

use domain::format;
use domain::schedule::repeat_summary;
use domain::strings as s;
use domain::tasks;

use super::sound_picker::SoundPicker;
use crate::state::use_store;
use crate::widgets::row::{ActionRow, CheckRow, InputRow, NavRow, Row, Section};
use crate::widgets::segmented::Segmented;
use crate::widgets::sheet::{BackButton, Sheet, SheetHeader, text_button};
use crate::widgets::slider::VolumeRow;
use crate::widgets::stepper::Stepper;
use crate::widgets::switch::Switch;
use crate::widgets::wheel_picker::{WheelGroup, WheelPicker, range_items};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EditorPage {
    Main,
    Repeat,
    Sound,
    Ramp,
    Task,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EditorState {
    pub draft: AlarmDraft,
    pub is_new: bool,
    pub page: EditorPage,
    /// Scroll the main page to the bottom when opened (screenshots).
    pub bottom: bool,
}

impl EditorState {
    pub fn new(draft: AlarmDraft, is_new: bool, sub: Option<&str>) -> Self {
        let page = match sub {
            Some("repeat") => EditorPage::Repeat,
            Some("sound") => EditorPage::Sound,
            Some("ramp") => EditorPage::Ramp,
            Some("task") => EditorPage::Task,
            _ => EditorPage::Main,
        };
        EditorState {
            draft,
            is_new,
            page,
            bottom: sub == Some("bottom"),
        }
    }
}

const WEEK_ORDER: [u8; 7] = [1, 2, 3, 4, 5, 6, 0];
const DAY_LONG: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

#[component]
pub fn Editor(state: EditorState, on_close: Callback<()>) -> impl IntoView {
    let store = use_store();
    let draft = RwSignal::new(state.draft.clone());
    let page = RwSignal::new(state.page);
    let is_new = state.is_new;
    let playing = RwSignal::new(false);

    let close = Callback::new(move |_| {
        if playing.get_untracked() {
            store.send(Command::PreviewStop);
        }
        on_close.run(());
    });
    let save = Callback::new(move |_| {
        if playing.get_untracked() {
            store.send(Command::PreviewStop);
        }
        store.send(Command::SaveAlarm {
            alarm: draft.get_untracked(),
        });
        on_close.run(());
    });
    let back = Callback::new(move |_| page.set(EditorPage::Main));

    // The preview stops when the daemon reports its end or stops playing.
    Effect::new(move |prev: Option<u32>| {
        let n = store.preview_ended.get();
        if prev.is_some_and(|p| p != n) {
            playing.set(false);
        }
        n
    });
    Effect::new(move |_| {
        if store.with(|s| s.preview_playing) == Some(false) {
            playing.set(false);
        }
    });
    // Leaving the main page stops the preview.
    Effect::new(move |_| {
        if page.get() != EditorPage::Main && playing.get_untracked() {
            store.send(Command::PreviewStop);
            playing.set(false);
        }
    });
    if state.bottom {
        request_animation_frame(|| {
            if let Some(el) = document().query_selector(".sheet-body").ok().flatten() {
                el.set_scroll_top(100_000);
            }
        });
    }

    let title = Signal::derive(move || {
        match page.get() {
            EditorPage::Main if is_new => s::ADD_ALARM,
            EditorPage::Main => s::EDIT_ALARM,
            EditorPage::Repeat => s::REPEAT,
            EditorPage::Sound => s::SOUND,
            EditorPage::Ramp => s::GRADUAL_VOLUME,
            EditorPage::Task => s::TURN_OFF_WITH,
        }
        .to_string()
    });
    let cycle = Signal::derive(move || store.with(|s| s.hour_cycle).unwrap_or(HourCycle::H24));
    let sounds = move || store.with(|s| s.sounds.clone()).unwrap_or_default();

    let main = move || {
        view! {
            <TimeWheels
                hour=Signal::derive(move || draft.with(|d| d.hour))
                minute=Signal::derive(move || draft.with(|d| d.minute))
                cycle=cycle
                on_change=Callback::new(move |(h, m): (u8, u8)| {
                    draft.update(|d| {
                        d.hour = h;
                        d.minute = m;
                    })
                })
            />
            <Section class="mt-24">
                <NavRow
                    label=s::REPEAT
                    detail=Signal::derive(move || draft.with(|d| repeat_summary(&d.days)))
                    on_click=Callback::new(move |_| page.set(EditorPage::Repeat))
                />
                <InputRow
                    label=s::LABEL
                    placeholder=s::APP_NAME
                    value=Signal::derive(move || draft.with(|d| d.label.clone()))
                    on_input=Callback::new(move |v: String| draft.update(|d| d.label = v))
                />
                <NavRow
                    label=s::SOUND
                    detail=Signal::derive(move || draft.with(|d| s::sound_name(&d.sound, &sounds())))
                    on_click=Callback::new(move |_| page.set(EditorPage::Sound))
                />
                <Row>
                    <span class="row-text">{s::SNOOZE}</span>
                    <Switch
                        checked=Signal::derive(move || draft.with(|d| d.snooze))
                        label=s::SNOOZE.to_string()
                        on_change=Callback::new(move |v| draft.update(|d| d.snooze = v))
                    />
                </Row>
            </Section>
            <Section header=s::SECTION_VOLUME footer=s::VOLUME_FOOTER>
                <VolumeRow
                    value=Signal::derive(move || draft.with(|d| d.volume))
                    on_change=Callback::new(move |v| draft.update(|d| d.volume = v))
                    label="Alarm volume"
                />
                <NavRow
                    label=s::GRADUAL_VOLUME
                    detail=Signal::derive(move || draft.with(|d| format::duration_short(d.ramp_seconds)))
                    on_click=Callback::new(move |_| page.set(EditorPage::Ramp))
                />
                <ActionRow
                    label=Signal::derive(move || {
                        if playing.get() { s::STOP_PREVIEW } else { s::PREVIEW_WAKE_UP }.to_string()
                    })
                    tone="accent"
                    on_click=Callback::new(move |_| {
                        if playing.get_untracked() {
                            store.send(Command::PreviewStop);
                            playing.set(false);
                        } else {
                            let d = draft.get_untracked();
                            store.send(Command::PreviewPlay {
                                sound: d.sound,
                                volume: d.volume,
                                ramp_seconds: d.ramp_seconds,
                                looped: true,
                            });
                            playing.set(true);
                        }
                    })
                />
            </Section>
            <Section header=s::SECTION_TURN_OFF footer=s::TURN_OFF_FOOTER>
                <NavRow
                    label=s::TURN_OFF_WITH
                    detail=Signal::derive(move || draft.with(|d| s::task_summary(&d.task)))
                    on_click=Callback::new(move |_| page.set(EditorPage::Task))
                />
            </Section>
            {(!is_new)
                .then(|| {
                    view! {
                        <Section>
                            <ActionRow
                                label=s::DELETE_ALARM.to_string()
                                tone="red"
                                on_click=Callback::new(move |_| {
                                    if let Some(id) = draft.with_untracked(|d| d.id.clone()) {
                                        store.send(Command::DeleteAlarm { id });
                                    }
                                    close.run(());
                                })
                            />
                        </Section>
                    }
                })}
        }
    };

    let repeat = move || {
        view! {
            <Section>
                {WEEK_ORDER
                    .iter()
                    .map(|&d| {
                        view! {
                            <CheckRow
                                label=s::every_day_name(DAY_LONG[d as usize])
                                checked=Signal::derive(move || draft.with(|x| x.days.contains(&d)))
                                on_click=Callback::new(move |_| {
                                    draft.update(|x| {
                                        if x.days.contains(&d) {
                                            x.days.retain(|y| *y != d);
                                        } else {
                                            x.days.push(d);
                                            x.days.sort_unstable();
                                        }
                                    })
                                })
                            />
                        }
                    })
                    .collect_view()}
            </Section>
        }
    };

    let ramp = move || {
        view! {
            <Section footer=s::RAMP_FOOTER>
                {[0u32, 15, 30, 60, 120, 300, 600]
                    .into_iter()
                    .map(|v| {
                        view! {
                            <CheckRow
                                label=format::duration_short(v)
                                checked=Signal::derive(move || draft.with(|d| d.ramp_seconds == v))
                                on_click=Callback::new(move |_| draft.update(|d| d.ramp_seconds = v))
                            />
                        }
                    })
                    .collect_view()}
            </Section>
        }
    };

    view! {
        <Sheet label=title on_close=close>
            <SheetHeader
                leading=(move || {
                    if page.get() == EditorPage::Main {
                        text_button(s::CANCEL, false, close)
                    } else {
                        view! { <BackButton on_click=back /> }.into_any()
                    }
                })
                    .into_any()
                title=title
                trailing=(move || (page.get() == EditorPage::Main).then(|| text_button(s::SAVE, true, save)))
                    .into_any()
            />
            <div class="sheet-body">
                {move || {
                    let p = page.get();
                    let body = match p {
                        EditorPage::Main => main().into_any(),
                        EditorPage::Repeat => repeat().into_any(),
                        EditorPage::Sound => {
                            view! {
                                <SoundPicker
                                    value=Signal::derive(move || draft.with(|d| d.sound.clone()))
                                    volume=Signal::derive(move || draft.with(|d| d.volume))
                                    on_change=Callback::new(move |v| draft.update(|d| d.sound = v))
                                />
                            }
                                .into_any()
                        }
                        EditorPage::Ramp => ramp().into_any(),
                        EditorPage::Task => {
                            view! {
                                <TaskPage
                                    task=Signal::derive(move || draft.with(|d| d.task))
                                    on_change=Callback::new(move |t| draft.update(|d| d.task = t))
                                />
                            }
                                .into_any()
                        }
                    };
                    let class = if p == EditorPage::Main { "" } else { "anim-push-in" };
                    view! { <div class=class>{body}</div> }
                }}
            </div>
        </Sheet>
    }
}

/// Hour and minute wheels (24h) or hour, minute and AM/PM (12h).
#[component]
fn TimeWheels(
    hour: Signal<u8>,
    minute: Signal<u8>,
    cycle: Signal<HourCycle>,
    on_change: Callback<(u8, u8)>,
) -> impl IntoView {
    move || {
        if cycle.get() == HourCycle::H24 {
            view! {
                <WheelGroup>
                    <WheelPicker
                        label="Hour"
                        items=range_items(0, 23, true)
                        value=Signal::derive(move || i64::from(hour.get()))
                        on_change=Callback::new(move |h: i64| on_change.run((h as u8, minute.get_untracked())))
                        align="right"
                        width=72
                    />
                    <span class="wheel-colon">":"</span>
                    <WheelPicker
                        label="Minute"
                        items=range_items(0, 59, true)
                        value=Signal::derive(move || i64::from(minute.get()))
                        on_change=Callback::new(move |m: i64| on_change.run((hour.get_untracked(), m as u8)))
                        align="left"
                        width=72
                    />
                </WheelGroup>
            }
            .into_any()
        } else {
            let h12 = move || {
                let h = hour.get() % 12;
                if h == 0 { 12 } else { i64::from(h) }
            };
            let pm = move || i64::from(hour.get() >= 12);
            let to24 = |h: i64, pm: i64| ((h % 12) + pm * 12) as u8;
            view! {
                <WheelGroup>
                    <WheelPicker
                        label="Hour"
                        items=range_items(1, 12, false)
                        value=Signal::derive(h12)
                        on_change=Callback::new(move |h: i64| {
                            on_change.run((to24(h, pm()), minute.get_untracked()))
                        })
                        align="right"
                        width=64
                    />
                    <span class="wheel-colon">":"</span>
                    <WheelPicker
                        label="Minute"
                        items=range_items(0, 59, true)
                        value=Signal::derive(move || i64::from(minute.get()))
                        on_change=Callback::new(move |m: i64| on_change.run((hour.get_untracked(), m as u8)))
                        align="left"
                        width=64
                    />
                    <WheelPicker
                        label="AM or PM"
                        items=vec![(0, "AM".to_string()), (1, "PM".to_string())]
                        value=Signal::derive(pm)
                        on_change=Callback::new(move |p: i64| {
                            on_change.run((to24(h12(), p), minute.get_untracked()))
                        })
                        width=64
                    />
                </WheelGroup>
            }
            .into_any()
        }
    }
}

/// `Turn Off With` subpage. The example is generated here, on the client (TZ_RUST 5.6).
#[component]
fn TaskPage(task: Signal<DismissTask>, on_change: Callback<DismissTask>) -> impl IntoView {
    let store = use_store();
    let fixed = store.opening.with_value(|o| o.example.clone());
    let example = Memo::new(move |_| {
        let t = task.get();
        if let Some(text) = fixed.clone() {
            return (t.kind != TaskType::None).then_some((text, t.kind == TaskType::Math));
        }
        let seed = (js_sys::Math::random() * 9.0e15) as u64;
        tasks::generate(&t, &mut tasks::SplitMix64(seed))
            .map(|p| (p.prompt, matches!(p.kind, tasks::ProblemKind::Math)))
    });
    view! {
        <Section>
            <div class="row-pad">
                <Segmented
                    label="Task type"
                    class="full"
                    options=vec![(TaskType::None, s::NONE), (TaskType::Math, s::MATH), (TaskType::Retype, s::RETYPE_CODE)]
                    value=Signal::derive(move || task.get().kind)
                    on_change=Callback::new(move |kind| on_change.run(DismissTask { kind, ..task.get_untracked() }))
                />
            </div>
        </Section>
        <Show when=move || task.get().kind != TaskType::None>
            <Section header=s::SECTION_DIFFICULTY>
                <div class="row-pad">
                    <Segmented
                        label="Difficulty"
                        class="full"
                        options=vec![(Difficulty::Easy, s::EASY), (Difficulty::Medium, s::MEDIUM), (Difficulty::Hard, s::HARD)]
                        value=Signal::derive(move || task.get().difficulty)
                        on_change=Callback::new(move |difficulty| {
                            on_change.run(DismissTask { difficulty, ..task.get_untracked() })
                        })
                    />
                </div>
                <Row>
                    <span class="row-label">{move || s::tasks_in_a_row(task.get().count)}</span>
                    <span class="row-accessory">
                        <Stepper
                            label="Number of tasks"
                            value=Signal::derive(move || i64::from(task.get().count))
                            min=1
                            max=5
                            on_change=Callback::new(move |c: i64| {
                                on_change.run(DismissTask { count: c as u8, ..task.get_untracked() })
                            })
                        />
                    </span>
                </Row>
            </Section>
            {move || {
                example
                    .get()
                    .map(|(prompt, math)| {
                        view! {
                            <Section header=s::SECTION_EXAMPLE>
                                <div class="example">
                                    <p>{format!("{prompt}{}", if math { " = ?" } else { "" })}</p>
                                </div>
                            </Section>
                        }
                    })
            }}
        </Show>
    }
}
