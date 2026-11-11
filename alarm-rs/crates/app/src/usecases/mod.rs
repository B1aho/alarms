//! Use cases. Each one reads through the ports, asks `domain`, writes, then triggers effects.

pub mod import_sound;
pub mod power;
pub mod preview;
pub mod save_alarm;
pub mod set_enabled;
pub mod settings;
pub mod snooze;
pub mod stop;
pub mod stopwatch;
pub mod submit_answer;
pub mod sync;
pub mod tick;
pub mod timer;

use domain::model::*;

use crate::ports::{PortResult, Ports, UiEvent};
use crate::state::Runtime;

/// Everything the driving adapters (IPC, tray, notifications, tick loop) can ask for.
#[derive(Clone, Debug, PartialEq)]
pub enum Request {
    Startup,
    Tick,
    SaveAlarm(AlarmDraft),
    DeleteAlarm(String),
    SetAlarmEnabled {
        id: String,
        enabled: bool,
    },
    CancelSnooze(String),
    Snooze(String),
    /// Tray `Snooze N min`: every ringing alarm that allows it.
    SnoozeAllRinging,
    Stop(String),
    SubmitAnswer {
        id: String,
        answer: String,
    },
    BackFromTask(String),
    UpdateSettings(Settings),
    ImportSound {
        path: String,
    },
    RemoveSound(String),
    PreviewPlay {
        sound: SoundRef,
        volume: f32,
        ramp_seconds: u32,
        looped: bool,
    },
    PreviewStop,
    PreviewEnded,
    RequestNotificationPermission,
    SetTimerDuration(i64),
    SetTimerLabel(String),
    SetTimerSound(SoundRef),
    StartTimer {
        duration_ms: i64,
        label: Option<String>,
    },
    PauseTimer,
    ResumeTimer,
    CancelTimer,
    StopTimerAlert,
    RepeatTimer,
    RemoveRecent(i64),
    StopwatchStart,
    StopwatchStop,
    StopwatchLap,
    StopwatchReset,
    WindowFocused,
    /// Tray `Open Alarm` or a click on a notification.
    OpenWindow,
    ClientConnected,
    ClientDisconnected,
    /// Stop every sound before the daemon exits.
    Quit,
}

/// Handle one request, then bring sounds, keep-awake, the tray and the client up to date.
pub fn handle(p: &Ports, rt: &mut Runtime, request: Request) -> PortResult<()> {
    match request {
        Request::Startup => tick::startup(p)?,
        Request::Tick | Request::WindowFocused => tick::tick(p, rt)?,
        Request::SaveAlarm(draft) => save_alarm::save(p, rt, draft)?,
        Request::DeleteAlarm(id) => save_alarm::delete(p, rt, &id)?,
        Request::SetAlarmEnabled { id, enabled } => set_enabled::set_enabled(p, &id, enabled)?,
        Request::CancelSnooze(id) => snooze::cancel(p, &id)?,
        Request::Snooze(id) => snooze::snooze(p, rt, &id)?,
        Request::SnoozeAllRinging => snooze::snooze_all(p, rt)?,
        Request::Stop(id) => stop::stop(p, rt, &id)?,
        Request::SubmitAnswer { id, answer } => submit_answer::submit(p, rt, &id, &answer)?,
        Request::BackFromTask(id) => {
            rt.tasks.remove(&id);
        }
        Request::UpdateSettings(s) => settings::update(p, s)?,
        Request::ImportSound { path } => import_sound::import(p, rt, &path)?,
        Request::RemoveSound(id) => import_sound::remove(p, &id)?,
        Request::PreviewPlay {
            sound,
            volume,
            ramp_seconds,
            looped,
        } => preview::play(p, rt, &sound, volume, ramp_seconds, looped)?,
        Request::PreviewStop => preview::stop(p, rt),
        Request::PreviewEnded => {
            if rt.preview {
                rt.preview = false;
                p.sink.emit(UiEvent::PreviewEnded);
            }
        }
        Request::RequestNotificationPermission => p.notifier.request_permission(),
        Request::SetTimerDuration(ms) => timer::set_duration(p, ms)?,
        Request::SetTimerLabel(label) => timer::set_label(p, &label)?,
        Request::SetTimerSound(sound) => timer::set_sound(p, sound)?,
        Request::StartTimer { duration_ms, label } => timer::start(p, duration_ms, label)?,
        Request::PauseTimer => timer::pause(p)?,
        Request::ResumeTimer => timer::resume(p)?,
        Request::CancelTimer | Request::StopTimerAlert => timer::reset(p)?,
        Request::RepeatTimer => timer::repeat(p)?,
        Request::RemoveRecent(ms) => timer::remove_recent(p, ms)?,
        Request::StopwatchStart => stopwatch::start(p)?,
        Request::StopwatchStop => stopwatch::stop(p)?,
        Request::StopwatchLap => stopwatch::lap(p)?,
        Request::StopwatchReset => stopwatch::reset(p)?,
        Request::OpenWindow => sync::open_window(p)?,
        Request::ClientConnected => rt.last_view = None,
        Request::ClientDisconnected => preview::stop(p, rt),
        Request::Quit => {
            sync::stop_all_sounds(p, rt);
            return Ok(());
        }
    }
    sync::refresh(p, rt)
}
