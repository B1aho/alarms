//! Fake daemon for a plain browser (visual tests, development): a `Snapshot` fixture
//! from `fixtures/` and a minimal reaction to commands.

use leptos::prelude::*;
use protocol::{Command, HourCycle, Snapshot, Theme, TimerStatus};
use web_sys::UrlSearchParams;

use crate::state::Store;

fn fixture(name: &str) -> Option<&'static str> {
    Some(match name {
        "empty" => include_str!("../fixtures/empty.json"),
        "banner" => include_str!("../fixtures/banner.json"),
        "list" => include_str!("../fixtures/list.json"),
        "ringing" => include_str!("../fixtures/ringing.json"),
        "ringing-math" => include_str!("../fixtures/ringing-math.json"),
        "ringing-wrong" => include_str!("../fixtures/ringing-wrong.json"),
        "ringing-nosnooze" => include_str!("../fixtures/ringing-nosnooze.json"),
        "ringing-retype" => include_str!("../fixtures/ringing-retype.json"),
        "sw-laps" => include_str!("../fixtures/sw-laps.json"),
        "sw-stopped" => include_str!("../fixtures/sw-stopped.json"),
        "timer-recents" => include_str!("../fixtures/timer-recents.json"),
        "timer-running" => include_str!("../fixtures/timer-running.json"),
        "timer-paused" => include_str!("../fixtures/timer-paused.json"),
        "timer-done" => include_str!("../fixtures/timer-done.json"),
        _ => return None,
    })
}

pub fn load(store: &Store, params: &UrlSearchParams) {
    let name = params.get("fixture").unwrap_or_else(|| "list".into());
    let Some(json) = fixture(&name).or_else(|| fixture("list")) else {
        return;
    };
    let mut snap: Snapshot = match serde_json::from_str(json) {
        Ok(s) => s,
        Err(e) => {
            web_sys::console::error_1(&format!("fixture {name}: {e}").into());
            return;
        }
    };
    match params.get("theme").as_deref() {
        Some("light") => snap.settings.theme = Theme::Light,
        Some("dark") => snap.settings.theme = Theme::Dark,
        Some("system") => snap.settings.theme = Theme::System,
        _ => {}
    }
    match params.get("cycle").as_deref() {
        Some("12h") => snap.hour_cycle = HourCycle::H12,
        Some("24h") => snap.hour_cycle = HourCycle::H24,
        _ => {}
    }
    match params.get("newtask").as_deref() {
        Some("none") => snap.new_alarm.task.kind = protocol::TaskType::None,
        Some("math") => snap.new_alarm.task.kind = protocol::TaskType::Math,
        Some("retype") => snap.new_alarm.task.kind = protocol::TaskType::Retype,
        _ => {}
    }
    if !store.is_frozen() {
        snap.now = js_sys::Date::now() as i64;
    }
    store.set_snapshot(snap);
}

/// Just enough behaviour to click around without a daemon.
pub fn apply(store: &Store, cmd: Command) {
    let now = store.now() as i64;
    store.snap.update(|s| {
        let Some(s) = s.as_mut() else { return };
        match cmd {
            Command::UpdateSettings { settings } => s.settings = settings,
            Command::SetAlarmEnabled { id, enabled } => {
                if let Some(a) = s.alarms.iter_mut().find(|a| a.id == id) {
                    a.enabled = enabled;
                    a.snooze_until = None;
                }
            }
            Command::CancelSnooze { id } => {
                if let Some(a) = s.alarms.iter_mut().find(|a| a.id == id) {
                    a.snooze_until = None;
                }
            }
            Command::DeleteAlarm { id } => s.alarms.retain(|a| a.id != id),
            Command::Snooze { id } | Command::Stop { id } => s.ringing.retain(|r| r.alarm.id != id),
            Command::PreviewPlay { .. } => s.preview_playing = true,
            Command::PreviewStop => s.preview_playing = false,
            Command::SetTimerDuration { duration_ms } => s.timer.duration_ms = duration_ms.max(1000),
            Command::SetTimerLabel { label } => s.timer.label = label,
            Command::SetTimerSound { sound } => s.timer.sound = sound,
            Command::StartTimer { duration_ms, label } => {
                s.timer.status = TimerStatus::Running;
                s.timer.duration_ms = duration_ms;
                s.timer.ends_at = Some(now + duration_ms);
                if let Some(l) = label {
                    s.timer.label = l;
                }
            }
            Command::PauseTimer => {
                s.timer.remaining_ms = s.timer.ends_at.map(|e| (e - now).max(0)).unwrap_or(0);
                s.timer.status = TimerStatus::Paused;
                s.timer.ends_at = None;
            }
            Command::ResumeTimer => {
                s.timer.status = TimerStatus::Running;
                s.timer.ends_at = Some(now + s.timer.remaining_ms);
            }
            Command::CancelTimer | Command::StopTimerAlert => {
                s.timer.status = TimerStatus::Idle;
                s.timer.ends_at = None;
            }
            Command::StopwatchStart => s.stopwatch.started_at = Some(now),
            Command::StopwatchStop => {
                if let Some(t) = s.stopwatch.started_at.take() {
                    s.stopwatch.accumulated_ms += now - t;
                }
            }
            Command::StopwatchLap => {
                if let Some(t) = s.stopwatch.started_at {
                    let total = s.stopwatch.accumulated_ms + now - t;
                    s.stopwatch.laps.push(total);
                }
            }
            Command::StopwatchReset => s.stopwatch = Default::default(),
            _ => {}
        }
    });
}
