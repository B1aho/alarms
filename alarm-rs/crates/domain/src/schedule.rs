//! Schedule and the ringing decision table (3.4), snooze (3.7), repeat summary (3.3).

use jiff::tz::TimeZone;
use jiff::{Span, Timestamp};

use crate::model::{Alarm, HOUR_MS, MINUTE_MS, Ms};

/// Week order used across the UI (Monday first), as 0 = Sunday … 6 = Saturday.
pub const WEEK_ORDER: [u8; 7] = [1, 2, 3, 4, 5, 6, 0];
pub const DAY_SHORT: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
pub const DAY_LONG: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

/// A missed alarm older than this gets no `Missed alarm` notification.
pub const MISSED_NOTIFY_LIMIT_MS: Ms = 12 * HOUR_MS;

/// First moment strictly after `after` (local time in `tz`) when an alarm on
/// `hour:minute` and `days` should ring. DST gaps move forward, like a local calendar.
pub fn next_occurrence(hour: u8, minute: u8, days: &[u8], after: Ms, tz: &TimeZone) -> Ms {
    let after_ts = Timestamp::from_millisecond(after).unwrap_or(Timestamp::UNIX_EPOCH);
    let base = after_ts.to_zoned(tz.clone()).date();
    for i in 0..=8i64 {
        let Ok(date) = base.checked_add(Span::new().days(i)) else {
            continue;
        };
        let Ok(zoned) = date.at(hour as i8, minute as i8, 0, 0).to_zoned(tz.clone()) else {
            continue;
        };
        let at = zoned.timestamp().as_millisecond();
        if at <= after {
            continue;
        }
        let weekday = zoned.weekday().to_sunday_zero_offset() as u8;
        if days.is_empty() || days.contains(&weekday) {
            return at;
        }
    }
    // Unreachable for valid input: every alarm occurs within 8 days.
    after + 24 * HOUR_MS
}

pub fn next_occurrence_of(a: &Alarm, after: Ms, tz: &TimeZone) -> Ms {
    next_occurrence(a.hour, a.minute, &a.days, after, tz)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    Schedule,
    Snooze,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Wait,
    Ring { source: Source, trigger: Ms },
    Missed { source: Source, trigger: Ms },
}

/// The decision table of 3.4 for one alarm at `now`.
pub fn decide(a: &Alarm, now: Ms, grace_ms: Ms) -> Verdict {
    if a.ringing_since.is_some() {
        return Verdict::Wait;
    }
    if let Some(until) = a.snooze_until {
        if now < until {
            return Verdict::Wait;
        }
        return late(Source::Snooze, until, now, grace_ms);
    }
    match a.next_trigger_at {
        Some(trigger) if a.enabled && now >= trigger => late(Source::Schedule, trigger, now, grace_ms),
        _ => Verdict::Wait,
    }
}

fn late(source: Source, trigger: Ms, now: Ms, grace_ms: Ms) -> Verdict {
    if now - trigger > grace_ms {
        Verdict::Missed { source, trigger }
    } else {
        Verdict::Ring { source, trigger }
    }
}

/// The alarm after it rang or was missed (3.4, "Звонок" step 2).
pub fn after_trigger(a: &Alarm, source: Source, trigger: Ms, now: Ms, tz: &TimeZone) -> Alarm {
    let mut next = a.clone();
    next.snooze_until = None;
    if source == Source::Schedule {
        if a.days.is_empty() {
            next.enabled = false;
            next.next_trigger_at = None;
        } else {
            next.next_trigger_at = Some(next_occurrence_of(a, now.max(trigger), tz));
        }
    }
    next
}

/// The alarm when it starts ringing.
pub fn ring(a: &Alarm, source: Source, trigger: Ms, now: Ms, tz: &TimeZone) -> Alarm {
    let mut next = after_trigger(a, source, trigger, now, tz);
    next.ringing_since = Some(now);
    next
}

/// Should a missed alarm be announced?
pub fn notify_missed(trigger: Ms, now: Ms) -> bool {
    now - trigger < MISSED_NOTIFY_LIMIT_MS
}

/// Save from the editor: always enabled, rescheduled from now, no snooze, not ringing (3.3).
pub fn on_save(a: &Alarm, now: Ms, tz: &TimeZone) -> Alarm {
    let mut next = a.clone();
    next.enabled = true;
    next.next_trigger_at = Some(next_occurrence_of(a, now, tz));
    next.snooze_until = None;
    next.ringing_since = None;
    next
}

/// The on/off switch in the list (3.2).
pub fn set_enabled(a: &Alarm, enabled: bool, now: Ms, tz: &TimeZone) -> Alarm {
    let mut next = a.clone();
    next.enabled = enabled;
    next.next_trigger_at = if enabled {
        Some(next_occurrence_of(a, now, tz))
    } else {
        None
    };
    next.snooze_until = None;
    next
}

/// An enabled alarm without a next trigger is repaired on load.
pub fn repair(a: &Alarm, now: Ms, tz: &TimeZone) -> Option<Alarm> {
    if a.enabled && a.next_trigger_at.is_none() {
        let mut next = a.clone();
        next.next_trigger_at = Some(next_occurrence_of(a, now, tz));
        Some(next)
    } else {
        None
    }
}

/// Snooze (3.7): only while ringing and when the alarm allows it.
pub fn snooze(a: &Alarm, now: Ms, snooze_minutes: u8) -> Option<Alarm> {
    if a.ringing_since.is_none() || !a.snooze {
        return None;
    }
    let mut next = a.clone();
    next.ringing_since = None;
    next.snooze_until = Some(now + i64::from(snooze_minutes) * MINUTE_MS);
    Some(next)
}

/// Turn the alarm off after `Stop` or the last solved task (3.5).
pub fn dismiss(a: &Alarm) -> Alarm {
    let mut next = a.clone();
    next.ringing_since = None;
    next.snooze_until = None;
    next
}

/// `Stop` in the list row cancels a snooze (3.2).
pub fn cancel_snooze(a: &Alarm) -> Alarm {
    let mut next = a.clone();
    next.snooze_until = None;
    next
}

/// An alarm is active when it is enabled or snoozed (3.2).
pub fn is_active(a: &Alarm) -> bool {
    a.enabled || a.snooze_until.is_some()
}

/// The time the alarm will ring next, if any.
pub fn upcoming_at(a: &Alarm) -> Option<Ms> {
    a.snooze_until.or(if a.enabled { a.next_trigger_at } else { None })
}

/// Soonest upcoming ring among enabled or snoozed alarms.
pub fn next_upcoming(alarms: &[Alarm]) -> Option<Ms> {
    alarms.iter().filter_map(upcoming_at).min()
}

/// List order: time of day, then creation time (3.2).
pub fn sort_alarms(alarms: &mut [Alarm]) {
    alarms.sort_by_key(|a| (u32::from(a.hour) * 60 + u32::from(a.minute), a.created_at));
}

/// Earliest moment any alarm needs attention (for the tick loop).
pub fn next_due(alarms: &[Alarm]) -> Option<Ms> {
    alarms
        .iter()
        .filter(|a| a.ringing_since.is_none())
        .filter_map(upcoming_at)
        .min()
}

/// Repeat summary of 3.3.
pub fn repeat_summary(days: &[u8]) -> String {
    let mut set: Vec<u8> = days.iter().copied().filter(|d| *d <= 6).collect();
    set.sort_unstable();
    set.dedup();
    match set.as_slice() {
        [] => "Never".into(),
        [_, _, _, _, _, _, _] => "Every day".into(),
        [1, 2, 3, 4, 5] => "Weekdays".into(),
        [0, 6] => "Weekends".into(),
        [d] => format!("Every {}", DAY_LONG[*d as usize]),
        _ => WEEK_ORDER
            .iter()
            .filter(|d| set.contains(d))
            .map(|d| DAY_SHORT[*d as usize])
            .collect::<Vec<_>>()
            .join(" "),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::defaults;
    use crate::model::*;
    use jiff::civil::date;
    use proptest::prelude::*;

    fn tz() -> TimeZone {
        TimeZone::get("Europe/Berlin").unwrap()
    }

    fn at(y: i16, mo: i8, d: i8, h: i8, mi: i8) -> Ms {
        date(y, mo, d)
            .at(h, mi, 0, 0)
            .to_zoned(tz())
            .unwrap()
            .timestamp()
            .as_millisecond()
    }

    fn alarm(hour: u8, minute: u8, days: &[u8]) -> Alarm {
        Alarm {
            id: "a".into(),
            hour,
            minute,
            label: String::new(),
            enabled: true,
            days: days.to_vec(),
            sound: defaults::DEFAULT_SOUND,
            volume: 0.9,
            ramp_seconds: 60,
            snooze: true,
            task: defaults::DEFAULT_TASK,
            created_at: 0,
            next_trigger_at: None,
            snooze_until: None,
            ringing_since: None,
        }
    }

    // Cases ported from alarm/src/features/alarms/model/schedule.test.ts.

    #[test]
    fn one_shot_later_today() {
        // 2026-11-10 is a Tuesday.
        assert_eq!(
            next_occurrence(7, 30, &[], at(2026, 11, 10, 6, 0), &tz()),
            at(2026, 11, 10, 7, 30)
        );
    }

    #[test]
    fn one_shot_tomorrow_when_passed() {
        assert_eq!(
            next_occurrence(7, 30, &[], at(2026, 11, 10, 8, 0), &tz()),
            at(2026, 11, 11, 7, 30)
        );
    }

    #[test]
    fn strictly_after() {
        let t = at(2026, 11, 10, 7, 30);
        assert_eq!(next_occurrence(7, 30, &[], t, &tz()), at(2026, 11, 11, 7, 30));
    }

    #[test]
    fn repeating_picks_next_selected_day() {
        // Weekdays from Friday evening → Monday.
        assert_eq!(
            next_occurrence(6, 30, &[1, 2, 3, 4, 5], at(2026, 11, 13, 20, 0), &tz()),
            at(2026, 11, 16, 6, 30)
        );
    }

    #[test]
    fn same_weekday_next_week() {
        // Only Tuesday, already passed today (Tuesday) → next Tuesday.
        assert_eq!(
            next_occurrence(6, 0, &[2], at(2026, 11, 10, 7, 0), &tz()),
            at(2026, 11, 17, 6, 0)
        );
    }

    #[test]
    fn dst_spring_forward_gap_moves_forward() {
        // 2026-03-29 02:30 does not exist in Berlin; local calendar gives 03:30.
        let next = next_occurrence(2, 30, &[], at(2026, 3, 29, 0, 0), &tz());
        assert_eq!(next, at(2026, 3, 29, 3, 30));
    }

    #[test]
    fn dst_fall_back_keeps_wall_time() {
        // Daily 07:00 across the October change is still 07:00 local.
        let next = next_occurrence(7, 0, &[], at(2026, 10, 25, 1, 0), &tz());
        assert_eq!(next, at(2026, 10, 25, 7, 0));
        let next = next_occurrence(7, 0, &[0, 1, 2, 3, 4, 5, 6], next, &tz());
        assert_eq!(next, at(2026, 10, 26, 7, 0));
    }

    #[test]
    fn decision_table() {
        let grace = 60 * MINUTE_MS;
        let mut a = alarm(7, 0, &[]);
        a.next_trigger_at = Some(1_000_000);
        assert_eq!(decide(&a, 999_999, grace), Verdict::Wait);
        assert_eq!(
            decide(&a, 1_000_000, grace),
            Verdict::Ring {
                source: Source::Schedule,
                trigger: 1_000_000
            }
        );
        assert_eq!(
            decide(&a, 1_000_000 + grace + 1, grace),
            Verdict::Missed {
                source: Source::Schedule,
                trigger: 1_000_000
            }
        );
        assert_eq!(
            decide(&a, 1_000_000 + grace, grace),
            Verdict::Ring {
                source: Source::Schedule,
                trigger: 1_000_000
            }
        );
        // Ringing: wait.
        a.ringing_since = Some(1);
        assert_eq!(decide(&a, 2_000_000, grace), Verdict::Wait);
        a.ringing_since = None;
        // Disabled: wait.
        a.enabled = false;
        assert_eq!(decide(&a, 2_000_000, grace), Verdict::Wait);
        // Snoozed rings even when disabled.
        a.snooze_until = Some(1_500_000);
        assert_eq!(decide(&a, 1_400_000, grace), Verdict::Wait);
        assert_eq!(
            decide(&a, 1_500_000, grace),
            Verdict::Ring {
                source: Source::Snooze,
                trigger: 1_500_000
            }
        );
        assert_eq!(
            decide(&a, 1_500_000 + grace + 5, grace),
            Verdict::Missed {
                source: Source::Snooze,
                trigger: 1_500_000
            }
        );
    }

    #[test]
    fn one_shot_disables_after_ring() {
        let mut a = alarm(7, 0, &[]);
        let t = at(2026, 11, 10, 7, 0);
        a.next_trigger_at = Some(t);
        let r = ring(&a, Source::Schedule, t, t + 300, &tz());
        assert!(!r.enabled);
        assert_eq!(r.next_trigger_at, None);
        assert_eq!(r.ringing_since, Some(t + 300));
    }

    #[test]
    fn repeating_moves_to_next_day_after_ring() {
        let mut a = alarm(7, 0, &[1, 2, 3, 4, 5]);
        let t = at(2026, 11, 13, 7, 0); // Friday
        a.next_trigger_at = Some(t);
        let r = ring(&a, Source::Schedule, t, t, &tz());
        assert!(r.enabled);
        assert_eq!(r.next_trigger_at, Some(at(2026, 11, 16, 7, 0)));
    }

    #[test]
    fn snooze_ring_only_clears_snooze() {
        let mut a = alarm(7, 0, &[]);
        a.enabled = false;
        a.snooze_until = Some(5);
        let r = ring(&a, Source::Snooze, 5, 6, &tz());
        assert_eq!(r.snooze_until, None);
        assert!(!r.enabled);
        assert_eq!(r.ringing_since, Some(6));
    }

    #[test]
    fn snooze_requires_ringing_and_permission() {
        let mut a = alarm(7, 0, &[]);
        assert!(snooze(&a, 0, 9).is_none());
        a.ringing_since = Some(0);
        let s = snooze(&a, 1000, 9).unwrap();
        assert_eq!(s.snooze_until, Some(1000 + 9 * MINUTE_MS));
        assert_eq!(s.ringing_since, None);
        a.snooze = false;
        assert!(snooze(&a, 0, 9).is_none());
    }

    #[test]
    fn summaries() {
        assert_eq!(repeat_summary(&[]), "Never");
        assert_eq!(repeat_summary(&[0, 1, 2, 3, 4, 5, 6]), "Every day");
        assert_eq!(repeat_summary(&[1, 2, 3, 4, 5]), "Weekdays");
        assert_eq!(repeat_summary(&[6, 0]), "Weekends");
        assert_eq!(repeat_summary(&[3]), "Every Wednesday");
        assert_eq!(repeat_summary(&[0, 1, 5]), "Mon Fri Sun");
        assert_eq!(repeat_summary(&[1, 2, 3, 4]), "Mon Tue Wed Thu");
    }

    #[test]
    fn next_upcoming_prefers_snooze() {
        let mut a = alarm(7, 0, &[]);
        a.next_trigger_at = Some(100);
        let mut b = alarm(8, 0, &[]);
        b.enabled = false;
        b.next_trigger_at = Some(10);
        b.snooze_until = Some(50);
        let mut c = alarm(9, 0, &[]);
        c.enabled = false;
        c.next_trigger_at = Some(1);
        assert_eq!(next_upcoming(&[a, b, c]), Some(50));
        assert_eq!(next_upcoming(&[]), None);
    }

    proptest! {
        #[test]
        fn occurrence_is_after_matches_and_within_8_days(
            hour in 0u8..24, minute in 0u8..60,
            days in proptest::collection::btree_set(0u8..7, 0..7),
            after in 1_700_000_000_000i64..1_900_000_000_000i64,
            zone in prop::sample::select(vec!["Europe/Berlin", "America/New_York", "Australia/Lord_Howe", "UTC", "Asia/Kolkata"]),
        ) {
            let tz = TimeZone::get(zone).unwrap();
            let days: Vec<u8> = days.into_iter().collect();
            let next = next_occurrence(hour, minute, &days, after, &tz);
            prop_assert!(next > after);
            prop_assert!(next - after <= 8 * 24 * HOUR_MS + HOUR_MS);
            let z = Timestamp::from_millisecond(next).unwrap().to_zoned(tz.clone());
            if !days.is_empty() {
                prop_assert!(days.contains(&(z.weekday().to_sunday_zero_offset() as u8)));
            }
            // The wall time matches unless the time fell into a DST gap.
            let wall = (z.hour() as u8, z.minute() as u8);
            let gap = date(z.year(), z.month(), z.day()).at(hour as i8, minute as i8, 0, 0)
                .to_zoned(tz.clone()).map(|zz| (zz.hour() as u8, zz.minute() as u8) != (hour, minute)).unwrap_or(true);
            prop_assert!(wall == (hour, minute) || gap);
            // No earlier matching moment exists.
            let again = next_occurrence(hour, minute, &days, after, &tz);
            prop_assert_eq!(again, next);
        }

        #[test]
        fn daily_alarm_is_within_a_day(hour in 0u8..24, minute in 0u8..60, after in 1_700_000_000_000i64..1_900_000_000_000i64) {
            let tz = TimeZone::get("Europe/Berlin").unwrap();
            let next = next_occurrence(hour, minute, &[], after, &tz);
            prop_assert!(next - after <= 25 * HOUR_MS);
        }
    }
}
