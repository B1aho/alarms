//! Time formats (3.13) and other number formats shown in the UI.

use jiff::Timestamp;
use jiff::tz::TimeZone;

use crate::model::{HourCycle, HourCyclePref, Ms};

pub fn pad2(n: i64) -> String {
    format!("{n:02}")
}

pub fn resolve_hour_cycle(pref: HourCyclePref, system: HourCycle) -> HourCycle {
    match pref {
        HourCyclePref::Auto => system,
        HourCyclePref::H12 => HourCycle::H12,
        HourCyclePref::H24 => HourCycle::H24,
    }
}

/// `06:30` in 24h; `6:30` + `AM` in 12h (0 h → 12 AM, 12 h → 12 PM).
pub fn clock(hour: u8, minute: u8, cycle: HourCycle) -> (String, Option<&'static str>) {
    match cycle {
        HourCycle::H24 => (format!("{:02}:{:02}", hour, minute), None),
        HourCycle::H12 => {
            let h = if hour.is_multiple_of(12) { 12 } else { hour % 12 };
            (format!("{h}:{minute:02}"), Some(if hour < 12 { "AM" } else { "PM" }))
        }
    }
}

pub fn clock_string(hour: u8, minute: u8, cycle: HourCycle) -> String {
    match clock(hour, minute, cycle) {
        (t, Some(p)) => format!("{t} {p}"),
        (t, None) => t,
    }
}

/// Local hour and minute of a timestamp.
pub fn local_hm(ms: Ms, tz: &TimeZone) -> (u8, u8) {
    let z = Timestamp::from_millisecond(ms)
        .unwrap_or(Timestamp::UNIX_EPOCH)
        .to_zoned(tz.clone());
    (z.hour() as u8, z.minute() as u8)
}

pub fn timestamp(ms: Ms, tz: &TimeZone, cycle: HourCycle) -> String {
    let (h, m) = local_hm(ms, tz);
    clock_string(h, m, cycle)
}

const WEEKDAYS: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// `Tuesday, November 10` (ringing screen).
pub fn long_date(ms: Ms, tz: &TimeZone) -> String {
    let z = Timestamp::from_millisecond(ms)
        .unwrap_or(Timestamp::UNIX_EPOCH)
        .to_zoned(tz.clone());
    format!(
        "{}, {} {}",
        WEEKDAYS[z.weekday().to_sunday_zero_offset() as usize],
        MONTHS[(z.month() - 1) as usize],
        z.day()
    )
}

/// `less than a minute`, `45 min`, `7 hr 12 min`, `1 day 3 hr`, `2 days`.
pub fn relative(ms: i64) -> String {
    if ms < 60_000 {
        return "less than a minute".into();
    }
    let total_min = (ms as f64 / 60_000.0).round() as i64;
    let days = total_min / 1440;
    let hours = (total_min % 1440) / 60;
    let minutes = total_min % 60;
    let mut parts = Vec::new();
    if days > 0 {
        parts.push(format!("{days} {}", if days == 1 { "day" } else { "days" }));
    }
    if hours > 0 {
        parts.push(format!("{hours} hr"));
    }
    if minutes > 0 && days == 0 {
        parts.push(format!("{minutes} min"));
    }
    parts.join(" ")
}

/// Timer countdown: `MM:SS` or `H:MM:SS`, seconds rounded up.
pub fn countdown(ms: i64) -> String {
    let total = (ms.max(0) + 999) / 1000;
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

/// Stopwatch: `MM:SS.cc` or `H:MM:SS.cc`.
pub fn stopwatch(ms: i64) -> String {
    let total = ms.max(0) / 10;
    let cs = total % 100;
    let s = (total / 100) % 60;
    let m = (total / 6000) % 60;
    let h = total / 360_000;
    let base = format!("{m:02}:{s:02}.{cs:02}");
    if h > 0 { format!("{h}:{base}") } else { base }
}

/// Ramp length: `Off`, `15 sec`, `1 min`, `1 min 30 sec`.
pub fn duration_short(seconds: u32) -> String {
    if seconds == 0 {
        return "Off".into();
    }
    if seconds < 60 {
        return format!("{seconds} sec");
    }
    let (m, s) = (seconds / 60, seconds % 60);
    if s > 0 {
        format!("{m} min {s} sec")
    } else {
        format!("{m} min")
    }
}

/// Recents subtitle: `5 min`, `10 min 30 sec`, `1 hr 2 min`.
pub fn duration_words(ms: i64) -> String {
    let s = (ms as f64 / 1000.0).round() as i64;
    let (h, m, sec) = (s / 3600, (s % 3600) / 60, s % 60);
    let mut parts = Vec::new();
    if h > 0 {
        parts.push(format!("{h} hr"));
    }
    if m > 0 {
        parts.push(format!("{m} min"));
    }
    if sec > 0 {
        parts.push(format!("{sec} sec"));
    }
    parts.join(" ")
}

/// `Ring Late Alarms For` options: `5 min` … `1 hr`, `4 hr`.
pub fn grace(minutes: u32) -> String {
    if minutes < 60 {
        format!("{minutes} min")
    } else {
        format!("{} hr", minutes / 60)
    }
}

/// `X.X MB`.
pub fn megabytes(bytes: u64) -> String {
    format!("{:.1} MB", bytes as f64 / 1024.0 / 1024.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clocks() {
        assert_eq!(clock(6, 30, HourCycle::H24), ("06:30".into(), None));
        assert_eq!(clock(0, 5, HourCycle::H12), ("12:05".into(), Some("AM")));
        assert_eq!(clock(12, 0, HourCycle::H12), ("12:00".into(), Some("PM")));
        assert_eq!(clock(23, 45, HourCycle::H12), ("11:45".into(), Some("PM")));
        assert_eq!(clock_string(7, 15, HourCycle::H12), "7:15 AM");
    }

    #[test]
    fn relatives() {
        assert_eq!(relative(59_999), "less than a minute");
        assert_eq!(relative(45 * 60_000), "45 min");
        assert_eq!(relative((7 * 60 + 12) * 60_000), "7 hr 12 min");
        assert_eq!(relative((27 * 60 + 10) * 60_000), "1 day 3 hr");
        assert_eq!(relative(2 * 1440 * 60_000), "2 days");
        assert_eq!(relative(6 * 60_000 - 20_000), "6 min");
    }

    #[test]
    fn countdowns() {
        assert_eq!(countdown(300_000), "05:00");
        assert_eq!(countdown(299_001), "05:00");
        assert_eq!(countdown(3_723_000), "1:02:03");
        assert_eq!(countdown(0), "00:00");
    }

    #[test]
    fn stopwatches() {
        assert_eq!(stopwatch(0), "00:00.00");
        assert_eq!(stopwatch(83_456), "01:23.45");
        assert_eq!(stopwatch(3_723_450), "1:02:03.45");
    }

    #[test]
    fn durations() {
        assert_eq!(duration_short(0), "Off");
        assert_eq!(duration_short(15), "15 sec");
        assert_eq!(duration_short(60), "1 min");
        assert_eq!(duration_short(90), "1 min 30 sec");
        assert_eq!(duration_words(300_000), "5 min");
        assert_eq!(duration_words(630_000), "10 min 30 sec");
        assert_eq!(duration_words(3_720_000), "1 hr 2 min");
        assert_eq!(grace(5), "5 min");
        assert_eq!(grace(240), "4 hr");
        assert_eq!(megabytes(3_250_000), "3.1 MB");
    }

    #[test]
    fn dates() {
        let tz = TimeZone::get("Europe/Berlin").unwrap();
        let ms = jiff::civil::date(2026, 11, 10)
            .at(9, 0, 0, 0)
            .to_zoned(tz.clone())
            .unwrap()
            .timestamp()
            .as_millisecond();
        assert_eq!(long_date(ms, &tz), "Tuesday, November 10");
        assert_eq!(timestamp(ms, &tz, HourCycle::H24), "09:00");
    }
}
