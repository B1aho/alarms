//! After every request: sounds follow the stored state, keep-awake, tray and the client view.

use domain::model::*;
use domain::ramp::{FADE_STOP_MS, TIMER_RAMP_SECONDS, TIMER_VOLUME};
use domain::sounds::{self, Resolved};
use domain::{format, schedule};

use crate::ports::{PlayRequest, PlaybackId, PortResult, Ports, SoundSource, UiEvent};
use crate::state::Runtime;
use crate::view::{AppView, RingingView, TaskView};

pub fn sound_source(p: &Ports, sound: &SoundRef, library: &[CustomSound]) -> SoundSource {
    match sounds::resolve(sound, library) {
        Resolved::Builtin(b) => SoundSource::Builtin(b),
        Resolved::Custom(c) => SoundSource::File(p.sounds.file_path(&c)),
    }
}

pub fn hour_cycle(p: &Ports, settings: &Settings) -> HourCycle {
    format::resolve_hour_cycle(settings.hour_cycle, p.system.hour_cycle())
}

pub fn alarm_tag(id: &str) -> String {
    format!("alarm-{id}")
}

pub const TIMER_TAG: &str = "timer";

pub fn refresh(p: &Ports, rt: &mut Runtime) -> PortResult<()> {
    let mut alarms = p.alarms.list()?;
    schedule::sort_alarms(&mut alarms);
    let settings = p.settings.load()?;
    let timer = p.timer.load()?;
    let library = {
        let mut l = p.sounds.list()?;
        sounds::sort(&mut l);
        l
    };
    sync_sounds(p, rt, &alarms, &timer, &library);
    super::power::sync(p, rt, &settings, &alarms);
    sync_tray(p, rt, &settings, &alarms);
    rt.tasks
        .retain(|id, _| alarms.iter().any(|a| &a.id == id && a.ringing_since.is_some()));
    if p.sink.has_client() {
        let view = build_view(p, rt, alarms, settings, timer, library)?;
        let mut key = view.clone();
        key.now = 0;
        if rt.last_view.as_ref() != Some(&key) {
            p.sink.publish(&view);
            rt.last_view = Some(key);
        }
    } else {
        rt.last_view = None;
    }
    Ok(())
}

fn sync_sounds(p: &Ports, rt: &mut Runtime, alarms: &[Alarm], timer: &Timer, library: &[CustomSound]) {
    let now = p.clock.now();
    let ringing: Vec<&Alarm> = alarms.iter().filter(|a| a.ringing_since.is_some()).collect();
    let stale: Vec<PlaybackId> = rt
        .playing
        .iter()
        .filter(|id| match id {
            PlaybackId::Alarm(a) => !ringing.iter().any(|r| &r.id == a),
            PlaybackId::Timer => timer.status != TimerStatus::Ringing,
            PlaybackId::Preview => false,
        })
        .cloned()
        .collect();
    for id in stale {
        p.audio.stop(&id, FADE_STOP_MS);
        rt.playing.remove(&id);
    }
    for a in ringing {
        let id = PlaybackId::Alarm(a.id.clone());
        if rt.playing.contains(&id) {
            continue;
        }
        let elapsed = a.ringing_since.map(|s| (now - s).max(0) as f64 / 1000.0).unwrap_or(0.0);
        p.audio.play(
            id.clone(),
            PlayRequest {
                source: sound_source(p, &a.sound, library),
                volume: a.volume,
                ramp_seconds: a.ramp_seconds,
                looped: true,
                elapsed_seconds: elapsed,
            },
        );
        rt.playing.insert(id);
    }
    if timer.status == TimerStatus::Ringing && !rt.playing.contains(&PlaybackId::Timer) {
        p.audio.play(
            PlaybackId::Timer,
            PlayRequest {
                source: sound_source(p, &timer.sound, library),
                volume: TIMER_VOLUME,
                ramp_seconds: TIMER_RAMP_SECONDS,
                looped: true,
                elapsed_seconds: 0.0,
            },
        );
        rt.playing.insert(PlaybackId::Timer);
    }
}

/// Stop a ringing sound now with the given fade (Snooze: 120 ms, turn off: 250 ms).
pub fn stop_sound(p: &Ports, rt: &mut Runtime, id: PlaybackId, fade_ms: u32) {
    if rt.playing.remove(&id) {
        p.audio.stop(&id, fade_ms);
    }
}

pub fn stop_all_sounds(p: &Ports, rt: &mut Runtime) {
    for id in std::mem::take(&mut rt.playing) {
        p.audio.stop(&id, FADE_STOP_MS);
    }
    if rt.preview {
        p.audio.stop(&PlaybackId::Preview, FADE_STOP_MS);
        rt.preview = false;
    }
}

fn sync_tray(p: &Ports, rt: &mut Runtime, settings: &Settings, alarms: &[Alarm]) {
    let snoozable = alarms.iter().any(|a| a.ringing_since.is_some() && a.snooze);
    let label = snoozable.then(|| domain::strings::snooze_action(settings.snooze_minutes));
    if rt.tray_snooze.as_ref() != Some(&label) {
        p.tray.set_snooze(label.clone());
        rt.tray_snooze = Some(label);
    }
}

fn build_view(
    p: &Ports,
    rt: &Runtime,
    alarms: Vec<Alarm>,
    settings: Settings,
    timer: Timer,
    sounds: Vec<CustomSound>,
) -> PortResult<AppView> {
    let now = p.clock.now();
    let tz = p.clock.time_zone();
    let ringing = alarms
        .iter()
        .filter(|a| a.ringing_since.is_some())
        .map(|a| RingingView {
            alarm: a.clone(),
            task: rt.tasks.get(&a.id).map(|s| TaskView {
                kind: s.problem.kind,
                prompt: s.problem.prompt.clone(),
                solved: s.solved,
                total: a.task.count,
                wrong: s.wrong,
            }),
        })
        .collect();
    let (h, m) = format::local_hm(now, &tz);
    Ok(AppView {
        version: p.system.app_version(),
        platform: p.system.platform(),
        now,
        next_alarm_at: schedule::next_upcoming(&alarms),
        hour_cycle: hour_cycle(p, &settings),
        new_alarm: domain::defaults::new_alarm_draft(&settings, h, m),
        alarms,
        settings,
        timer,
        stopwatch: p.stopwatch.load()?,
        sounds,
        ringing,
        notifications: p.notifier.status(),
        preview_playing: rt.preview,
    })
}

/// Tray `Open Alarm` or a click on a notification: focus the client or start it.
pub fn open_window(p: &Ports) -> PortResult<()> {
    let ringing = p.alarms.list()?.iter().any(|a| a.ringing_since.is_some());
    let timer_alert = p.timer.load()?.status == TimerStatus::Ringing;
    if p.sink.has_client() {
        p.sink.emit(if ringing {
            UiEvent::ShowRinging
        } else if timer_alert {
            UiEvent::ShowTimerAlert
        } else {
            UiEvent::Focus
        });
    } else if ringing {
        p.launcher.show_ringing();
    } else if timer_alert {
        p.launcher.show_timer_alert();
    } else {
        p.launcher.show_window();
    }
    Ok(())
}

/// Bring the ringing screen up: in the open client, or start the client.
pub fn present_ringing(p: &Ports) {
    if p.sink.has_client() {
        p.sink.emit(UiEvent::ShowRinging);
    } else {
        p.launcher.show_ringing();
    }
}

pub fn present_timer_alert(p: &Ports) {
    if p.sink.has_client() {
        p.sink.emit(UiEvent::ShowTimerAlert);
    } else {
        p.launcher.show_timer_alert();
    }
}
