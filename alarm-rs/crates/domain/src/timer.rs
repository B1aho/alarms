//! The timer (3.10).

use crate::defaults::{MIN_TIMER_MS, RECENTS_MAX};
use crate::model::{MINUTE_MS, Ms, Recent, Timer, TimerStatus};

/// A timer that should have ended more than this long ago does not ring.
pub const LATE_LIMIT_MS: Ms = 10 * MINUTE_MS;

pub fn remaining_at(t: &Timer, now: Ms) -> i64 {
    match t.status {
        TimerStatus::Running => t.ends_at.map(|e| (e - now).max(0)).unwrap_or(t.duration_ms),
        TimerStatus::Paused => t.remaining_ms,
        TimerStatus::Ringing => 0,
        TimerStatus::Idle => t.duration_ms,
    }
}

pub fn set_duration(t: &Timer, duration_ms: i64) -> Timer {
    Timer {
        duration_ms: duration_ms.max(MIN_TIMER_MS),
        ..t.clone()
    }
}

/// Start for `duration_ms`; the duration goes to the top of Recents, replacing a same-length entry.
pub fn start(t: &Timer, duration_ms: i64, label: Option<String>, now: Ms) -> Timer {
    let duration_ms = duration_ms.max(MIN_TIMER_MS);
    let label = label.unwrap_or_else(|| t.label.clone());
    let mut recents = vec![Recent {
        duration_ms,
        label: label.clone(),
    }];
    recents.extend(t.recents.iter().filter(|r| r.duration_ms != duration_ms).cloned());
    recents.truncate(RECENTS_MAX);
    Timer {
        status: TimerStatus::Running,
        duration_ms,
        label,
        ends_at: Some(now + duration_ms),
        remaining_ms: duration_ms,
        recents,
        ..t.clone()
    }
}

pub fn pause(t: &Timer, now: Ms) -> Option<Timer> {
    match (t.status, t.ends_at) {
        (TimerStatus::Running, Some(e)) => Some(Timer {
            status: TimerStatus::Paused,
            remaining_ms: (e - now).max(0),
            ends_at: None,
            ..t.clone()
        }),
        _ => None,
    }
}

pub fn resume(t: &Timer, now: Ms) -> Option<Timer> {
    (t.status == TimerStatus::Paused).then(|| Timer {
        status: TimerStatus::Running,
        ends_at: Some(now + t.remaining_ms),
        ..t.clone()
    })
}

/// Cancel, or Stop on the alert: back to idle.
pub fn reset(t: &Timer) -> Timer {
    Timer {
        status: TimerStatus::Idle,
        ends_at: None,
        remaining_ms: 0,
        ..t.clone()
    }
}

pub fn remove_recent(t: &Timer, duration_ms: i64) -> Timer {
    Timer {
        recents: t
            .recents
            .iter()
            .filter(|r| r.duration_ms != duration_ms)
            .cloned()
            .collect(),
        ..t.clone()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TimerVerdict {
    Wait,
    Ring,
    /// Ended while the computer slept, more than 10 min ago.
    Late,
}

pub fn decide(t: &Timer, now: Ms) -> TimerVerdict {
    match (t.status, t.ends_at) {
        (TimerStatus::Running, Some(e)) if now >= e => {
            if now - e > LATE_LIMIT_MS {
                TimerVerdict::Late
            } else {
                TimerVerdict::Ring
            }
        }
        _ => TimerVerdict::Wait,
    }
}

pub fn ring(t: &Timer) -> Timer {
    Timer {
        status: TimerStatus::Ringing,
        ends_at: None,
        remaining_ms: 0,
        ..t.clone()
    }
}

pub fn late(t: &Timer) -> Timer {
    Timer {
        status: TimerStatus::Idle,
        ends_at: None,
        ..t.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::defaults;

    #[test]
    fn start_pause_resume_cancel() {
        let t = defaults::timer();
        let r = start(&t, 60_000, None, 1000);
        assert_eq!(r.status, TimerStatus::Running);
        assert_eq!(r.ends_at, Some(61_000));
        assert_eq!(remaining_at(&r, 31_000), 30_000);
        let p = pause(&r, 31_000).unwrap();
        assert_eq!(p.remaining_ms, 30_000);
        assert_eq!(remaining_at(&p, 99_999), 30_000);
        let q = resume(&p, 50_000).unwrap();
        assert_eq!(q.ends_at, Some(80_000));
        assert!(pause(&p, 0).is_none());
        assert_eq!(reset(&q).status, TimerStatus::Idle);
    }

    #[test]
    fn recents_dedupe_and_cap() {
        let mut t = defaults::timer();
        for d in [1, 2, 3, 4, 5, 6, 7, 3] {
            t = start(&t, d * 60_000, None, 0);
        }
        let ds: Vec<i64> = t.recents.iter().map(|r| r.duration_ms / 60_000).collect();
        assert_eq!(ds, vec![3, 7, 6, 5, 4, 2]);
        assert_eq!(remove_recent(&t, 7 * 60_000).recents.len(), 5);
    }

    #[test]
    fn verdicts() {
        let t = start(&defaults::timer(), 60_000, None, 0);
        assert_eq!(decide(&t, 59_999), TimerVerdict::Wait);
        assert_eq!(decide(&t, 60_000), TimerVerdict::Ring);
        assert_eq!(decide(&t, 60_000 + LATE_LIMIT_MS), TimerVerdict::Ring);
        assert_eq!(decide(&t, 60_001 + LATE_LIMIT_MS), TimerVerdict::Late);
    }

    #[test]
    fn minimum_duration() {
        assert_eq!(set_duration(&defaults::timer(), 0).duration_ms, 1000);
    }
}
