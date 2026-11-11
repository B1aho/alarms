//! Timer page (3.10). The countdown is drawn from `endsAt` with the client's clock.

use leptos::prelude::*;
use protocol::{Command, SoundRef, TimerStatus};

use domain::format;
use domain::strings as s;

use super::PageHeader;
use super::sound_picker::SoundPicker;
use crate::state::{tz, use_store, use_ticker};
use crate::widgets::button::CircleButton;
use crate::widgets::icons::{I, icon};
use crate::widgets::row::{InputRow, NavRow, Section};
use crate::widgets::sheet::{Sheet, SheetHeader, text_button};
use crate::widgets::wheel_picker::{WheelGroup, WheelPicker, range_items};

#[component]
pub fn TimerPage() -> impl IntoView {
    let store = use_store();
    let sound_open = RwSignal::new(store.opening.with_value(|o| o.open.as_deref() == Some("timer-sound")));
    let status = move || store.with(|s| s.timer.status).unwrap_or(TimerStatus::Idle);
    let active = move || matches!(status(), TimerStatus::Running | TimerStatus::Paused);
    let duration = move || store.with(|s| s.timer.duration_ms).unwrap_or(300_000);
    let sounds = move || store.with(|s| s.sounds.clone()).unwrap_or_default();
    let close_sound = Callback::new(move |_| sound_open.set(false));

    view! {
        <PageHeader title=s::TIMER />
        <div class="timer-stage">
            {move || if active() { view! { <Countdown /> }.into_any() } else { view! { <DurationWheels /> }.into_any() }}
        </div>
        <div class="circle-row timer-buttons">
            <CircleButton
                tone="gray"
                disabled=Signal::derive(move || !active())
                on_click=Callback::new(move |_| store.send(Command::CancelTimer))
            >
                {s::CANCEL}
            </CircleButton>
            {move || match status() {
                TimerStatus::Running => {
                    view! {
                        <CircleButton tone="orange" on_click=Callback::new(move |_| store.send(Command::PauseTimer))>
                            {s::PAUSE}
                        </CircleButton>
                    }
                        .into_any()
                }
                TimerStatus::Paused => {
                    view! {
                        <CircleButton tone="green" on_click=Callback::new(move |_| store.send(Command::ResumeTimer))>
                            {s::RESUME}
                        </CircleButton>
                    }
                        .into_any()
                }
                _ => {
                    view! {
                        <CircleButton
                            tone="green"
                            on_click=Callback::new(move |_| {
                                store.send(Command::StartTimer { duration_ms: duration(), label: None })
                            })
                        >
                            {s::START}
                        </CircleButton>
                    }
                        .into_any()
                }
            }}
        </div>
        <Section>
            <InputRow
                label=s::LABEL
                placeholder=s::TIMER
                value=Signal::derive(move || store.with(|s| s.timer.label.clone()).unwrap_or_default())
                on_input=Callback::new(move |label| store.send(Command::SetTimerLabel { label }))
            />
            <NavRow
                label=s::WHEN_TIMER_ENDS
                detail=Signal::derive(move || store.with(|x| s::sound_name(&x.timer.sound, &sounds())).unwrap_or_default())
                on_click=Callback::new(move |_| sound_open.set(true))
            />
        </Section>
        <Recents />
        <Show when=move || sound_open.get()>
            <Sheet label=s::WHEN_TIMER_ENDS.to_string() on_close=close_sound>
                <SheetHeader title=s::WHEN_TIMER_ENDS.to_string() trailing=text_button(s::DONE, true, close_sound) />
                <div class="sheet-body">
                    <SoundPicker
                        value=Signal::derive(move || {
                            store.with(|s| s.timer.sound.clone()).unwrap_or(SoundRef::Builtin(protocol::BuiltinSound::Chimes))
                        })
                        volume=Signal::derive(|| 0.9)
                        on_change=Callback::new(move |sound| store.send(Command::SetTimerSound { sound }))
                    />
                </div>
            </Sheet>
        </Show>
    }
}

#[component]
fn Recents() -> impl IntoView {
    let store = use_store();
    let recents = move || store.with(|s| s.timer.recents.clone()).unwrap_or_default();
    view! {
        <Show when=move || !recents().is_empty()>
            <Section header=s::SECTION_RECENTS>
                <For each=recents key=|r| (r.duration_ms, r.label.clone()) let:r>
                    {
                        let words = format::duration_words(r.duration_ms);
                        let sub = if r.label.trim().is_empty() { words.clone() } else { r.label.trim().to_string() };
                        let (ms, label) = (r.duration_ms, r.label.clone());
                        view! {
                            <div class="recent ios-row">
                                <div class="recent-main">
                                    <p class="recent-time">{format::countdown(r.duration_ms)}</p>
                                    <p class="recent-sub">{sub}</p>
                                </div>
                                <button
                                    type="button"
                                    class="recent-remove"
                                    aria-label="Remove from recents"
                                    on:click=move |_| store.send(Command::RemoveRecent { duration_ms: ms })
                                >
                                    {s::REMOVE}
                                </button>
                                <button
                                    type="button"
                                    class="recent-play"
                                    aria-label=s::start_timer_aria(&words)
                                    on:click=move |_| {
                                        store.send(Command::StartTimer { duration_ms: ms, label: Some(label.clone()) })
                                    }
                                >
                                    {icon(I::Play, "")}
                                </button>
                            </div>
                        }
                    }
                </For>
            </Section>
        </Show>
    }
}

#[component]
fn DurationWheels() -> impl IntoView {
    let store = use_store();
    let total = move || store.with(|s| s.timer.duration_ms / 1000).unwrap_or(300);
    let h = Signal::derive(move || total() / 3600);
    let m = Signal::derive(move || (total() % 3600) / 60);
    let sec = Signal::derive(move || total() % 60);
    let set = move |hh: i64, mm: i64, ss: i64| {
        store.send(Command::SetTimerDuration {
            duration_ms: (hh * 3600 + mm * 60 + ss).max(1) * 1000,
        })
    };
    view! {
        <WheelGroup class="timer">
            <WheelPicker
                label="Hours"
                items=range_items(0, 23, false)
                value=h
                on_change=Callback::new(move |v| set(v, m.get_untracked(), sec.get_untracked()))
                align="right"
                width=56
            />
            <span class="wheel-unit">{s::HOURS_UNIT}</span>
            <WheelPicker
                label="Minutes"
                items=range_items(0, 59, false)
                value=m
                on_change=Callback::new(move |v| set(h.get_untracked(), v, sec.get_untracked()))
                align="right"
                width=56
            />
            <span class="wheel-unit">{s::MIN_UNIT}</span>
            <WheelPicker
                label="Seconds"
                items=range_items(0, 59, false)
                value=sec
                on_change=Callback::new(move |v| set(h.get_untracked(), m.get_untracked(), v))
                align="right"
                width=56
            />
            <span class="wheel-unit">{s::SEC_UNIT}</span>
        </WheelGroup>
    }
}

#[component]
fn Countdown() -> impl IntoView {
    let store = use_store();
    let now = use_ticker(store, 250);
    let remaining = move || {
        let n = now.get() as i64;
        store
            .with(|s| match s.timer.status {
                TimerStatus::Running => s.timer.ends_at.map(|e| (e - n).max(0)).unwrap_or(s.timer.duration_ms),
                TimerStatus::Paused => s.timer.remaining_ms,
                TimerStatus::Ringing => 0,
                TimerStatus::Idle => s.timer.duration_ms,
            })
            .unwrap_or(0)
    };
    let progress = move || {
        let d = store.with(|s| s.timer.duration_ms).unwrap_or(1).max(1);
        remaining() as f64 / d as f64
    };
    const R: f64 = 120.0;
    let c = 2.0 * std::f64::consts::PI * R;
    let ends_at = move || {
        store
            .with(|s| match (s.timer.status, s.timer.ends_at) {
                (TimerStatus::Running, Some(e)) => e,
                _ => now.get() as i64 + remaining(),
            })
            .unwrap_or(0)
    };
    let paused = move || store.with(|s| s.timer.status == TimerStatus::Paused).unwrap_or(false);
    let cycle = move || store.with(|s| s.hour_cycle).unwrap_or(protocol::HourCycle::H24);
    view! {
        <div class="ring">
            <svg viewBox="0 0 280 280">
                <circle cx="140" cy="140" r="120" fill="none" stroke="var(--fill-2)" stroke-width="8"></circle>
                <circle
                    class="ring-progress"
                    cx="140"
                    cy="140"
                    r="120"
                    fill="none"
                    stroke="var(--orange)"
                    stroke-width="8"
                    stroke-linecap="round"
                    stroke-dasharray=c.to_string()
                    stroke-dashoffset=move || (c * (1.0 - progress())).to_string()
                ></circle>
            </svg>
            <div class="ring-inner">
                <p class="ring-label">{move || store.with(|x| s::timer_label(&x.timer.label))}</p>
                <p class="ring-time">{move || format::countdown(remaining())}</p>
                <p class="ring-end" class:paused=paused>
                    {icon(I::Bell, "")}
                    {move || format::timestamp(ends_at(), &tz(), cycle())}
                </p>
            </div>
        </div>
    }
}
