//! Default values (2.1–2.4) and repair of out-of-range values (2.7).

use crate::model::*;

pub const DEFAULT_SOUND: SoundRef = SoundRef::Builtin(BuiltinSound::Sunrise);
pub const DEFAULT_TIMER_SOUND: SoundRef = SoundRef::Builtin(BuiltinSound::Chimes);
pub const DEFAULT_TASK: DismissTask = DismissTask {
    kind: TaskType::Math,
    difficulty: Difficulty::Medium,
    count: 2,
};

/// Options of `Gradual Volume`.
pub const RAMP_OPTIONS: [u32; 7] = [0, 15, 30, 60, 120, 300, 600];
/// Options of `Ring Late Alarms For`, minutes.
pub const GRACE_OPTIONS: [u32; 6] = [5, 15, 30, 60, 120, 240];
pub const LABEL_MAX: usize = 60;
pub const RECENTS_MAX: usize = 6;
pub const DEFAULT_TIMER_MS: i64 = 5 * 60_000;
pub const MIN_TIMER_MS: i64 = 1000;

pub fn settings() -> Settings {
    Settings {
        theme: Theme::System,
        hour_cycle: HourCyclePref::Auto,
        snooze_minutes: 9,
        ramp_seconds: 60,
        volume: 0.9,
        default_sound: DEFAULT_SOUND,
        default_task: DEFAULT_TASK,
        keep_awake: false,
        missed_grace_minutes: 60,
        open_at_login: true,
    }
}

pub fn timer() -> Timer {
    Timer {
        status: TimerStatus::Idle,
        duration_ms: DEFAULT_TIMER_MS,
        ends_at: None,
        remaining_ms: 0,
        label: String::new(),
        sound: DEFAULT_TIMER_SOUND,
        recents: Vec::new(),
    }
}

pub fn stopwatch() -> Stopwatch {
    Stopwatch::default()
}

/// A new alarm on `hour:minute` with the defaults from the settings (2.1).
pub fn new_alarm_draft(settings: &Settings, hour: u8, minute: u8) -> AlarmDraft {
    AlarmDraft {
        id: None,
        hour,
        minute,
        label: String::new(),
        days: Vec::new(),
        sound: settings.default_sound.clone(),
        volume: settings.volume,
        ramp_seconds: settings.ramp_seconds,
        snooze: true,
        task: settings.default_task,
    }
}

fn round_volume(v: f32) -> f32 {
    ((v * 20.0).round() / 20.0).clamp(0.05, 1.0)
}

fn truncate_label(s: &str) -> String {
    s.chars().take(LABEL_MAX).collect()
}

pub fn sanitize_days(days: &[u8]) -> Vec<u8> {
    let mut d: Vec<u8> = days.iter().copied().filter(|d| *d <= 6).collect();
    d.sort_unstable();
    d.dedup();
    d
}

pub fn sanitize_task(t: DismissTask) -> DismissTask {
    DismissTask {
        count: t.count.clamp(1, 5),
        ..t
    }
}

/// Clamp a draft to the limits of 2.1.
pub fn sanitize_draft(d: AlarmDraft) -> AlarmDraft {
    AlarmDraft {
        hour: d.hour.min(23),
        minute: d.minute.min(59),
        label: truncate_label(&d.label),
        days: sanitize_days(&d.days),
        volume: round_volume(d.volume),
        ramp_seconds: d.ramp_seconds.min(600),
        task: sanitize_task(d.task),
        ..d
    }
}

/// `true` when a stored alarm respects the limits of 2.1 (otherwise it is skipped, 2.7).
pub fn alarm_is_valid(a: &Alarm) -> bool {
    a.hour <= 23
        && a.minute <= 59
        && !a.id.is_empty()
        && (0.05..=1.0).contains(&a.volume)
        && a.ramp_seconds <= 600
        && (1..=5).contains(&a.task.count)
        && a.days.iter().all(|d| *d <= 6)
}

/// Replace every out-of-range setting with its default (2.7).
pub fn sanitize_settings(s: Settings) -> Settings {
    let d = settings();
    Settings {
        snooze_minutes: if (1..=30).contains(&s.snooze_minutes) {
            s.snooze_minutes
        } else {
            d.snooze_minutes
        },
        ramp_seconds: if s.ramp_seconds <= 600 {
            s.ramp_seconds
        } else {
            d.ramp_seconds
        },
        volume: if (0.05..=1.0).contains(&s.volume) {
            s.volume
        } else {
            d.volume
        },
        default_task: if (1..=5).contains(&s.default_task.count) {
            s.default_task
        } else {
            d.default_task
        },
        missed_grace_minutes: if (1..=240).contains(&s.missed_grace_minutes) {
            s.missed_grace_minutes
        } else {
            d.missed_grace_minutes
        },
        ..s
    }
}

pub fn sanitize_timer(t: Timer) -> Timer {
    Timer {
        duration_ms: t.duration_ms.max(MIN_TIMER_MS),
        label: truncate_label(&t.label),
        recents: t.recents.into_iter().take(RECENTS_MAX).collect(),
        ..t
    }
}

pub fn sanitize_label(s: &str) -> String {
    truncate_label(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_spec() {
        let s = settings();
        assert_eq!(s.snooze_minutes, 9);
        assert_eq!(s.ramp_seconds, 60);
        assert!((s.volume - 0.9).abs() < 1e-6);
        assert_eq!(s.default_sound, SoundRef::Builtin(BuiltinSound::Sunrise));
        assert_eq!(s.default_task, DEFAULT_TASK);
        assert!(!s.keep_awake);
        assert_eq!(s.missed_grace_minutes, 60);
        assert!(s.open_at_login);
        let t = timer();
        assert_eq!(t.duration_ms, 300_000);
        assert_eq!(t.sound, SoundRef::Builtin(BuiltinSound::Chimes));
    }

    #[test]
    fn sanitize_repairs_out_of_range() {
        let mut s = settings();
        s.snooze_minutes = 0;
        s.volume = 3.0;
        s.missed_grace_minutes = 999;
        let fixed = sanitize_settings(s);
        assert_eq!(fixed.snooze_minutes, 9);
        assert!((fixed.volume - 0.9).abs() < 1e-6);
        assert_eq!(fixed.missed_grace_minutes, 60);
    }

    #[test]
    fn draft_is_clamped() {
        let mut d = new_alarm_draft(&settings(), 7, 30);
        d.label = "x".repeat(100);
        d.days = vec![6, 1, 1, 9];
        d.volume = 0.33;
        let d = sanitize_draft(d);
        assert_eq!(d.label.chars().count(), 60);
        assert_eq!(d.days, vec![1, 6]);
        assert!((d.volume - 0.35).abs() < 1e-6);
    }
}
