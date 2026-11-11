//! Every text of the interface, the tray and the notifications (ALARM_SPEC 6, TZ_RUST 3).

use crate::model::{Alarm, BuiltinSound, CustomSound, Difficulty, DismissTask, Platform, SoundRef, TaskType, Timer};

pub const APP_NAME: &str = "Alarm";
pub const ALARMS: &str = "Alarms";
pub const STOPWATCH: &str = "Stopwatch";
pub const TIMER: &str = "Timer";
pub const SETTINGS: &str = "Settings";

// Alarms page.
pub const EDIT: &str = "Edit";
pub const DONE: &str = "Done";
pub const NO_ALARMS_ON: &str = "No alarms on";
pub const SECTION_ALARMS: &str = "ALARMS";
pub const NO_ALARMS: &str = "No Alarms";
pub const NO_ALARMS_HINT: &str = "Add an alarm to wake up on time.";
pub const ADD_ALARM: &str = "Add Alarm";
pub const ADD_ALARM_ARIA: &str = "Add alarm";
pub const STOP: &str = "Stop";
pub const DELETE: &str = "Delete";
pub const ALLOW_NOTIFICATIONS: &str = "Allow Notifications";
pub const ALLOW_NOTIFICATIONS_HINT: &str =
    "So alarms reach you even when the app is minimised or behind other windows.";
pub const TURN_ON: &str = "Turn On";
pub const NOTIFICATIONS_BLOCKED: &str = "Notifications are blocked";
pub const NOTIFICATIONS_BLOCKED_HINT: &str =
    "Alarms still ring while the app is open, but you will not see them when the window is hidden.";

// Editor.
pub const EDIT_ALARM: &str = "Edit Alarm";
pub const CANCEL: &str = "Cancel";
pub const SAVE: &str = "Save";
pub const BACK: &str = "Back";
pub const REPEAT: &str = "Repeat";
pub const LABEL: &str = "Label";
pub const SOUND: &str = "Sound";
pub const SNOOZE: &str = "Snooze";
pub const SECTION_VOLUME: &str = "VOLUME";
pub const GRADUAL_VOLUME: &str = "Gradual Volume";
pub const PREVIEW_WAKE_UP: &str = "Preview Wake-up";
pub const STOP_PREVIEW: &str = "Stop Preview";
pub const VOLUME_FOOTER: &str = "Starts almost silent and rises smoothly to the set volume.";
pub const SECTION_TURN_OFF: &str = "TURN OFF";
pub const TURN_OFF_WITH: &str = "Turn Off With";
pub const TURN_OFF_FOOTER: &str = "The alarm keeps ringing until the task is solved. Snooze never needs a task.";
pub const DELETE_ALARM: &str = "Delete Alarm";
pub const RAMP_FOOTER: &str = "How long it takes to reach full volume.";
pub const SECTION_DIFFICULTY: &str = "DIFFICULTY";
pub const SECTION_EXAMPLE: &str = "EXAMPLE";
pub const NONE: &str = "None";
pub const MATH: &str = "Math";
pub const RETYPE_CODE: &str = "Retype Code";
pub const CODE: &str = "Code";
pub const EASY: &str = "Easy";
pub const MEDIUM: &str = "Medium";
pub const HARD: &str = "Hard";

// Sounds.
pub const SECTION_YOUR_MUSIC: &str = "YOUR MUSIC";
pub const CHOOSE_A_FILE: &str = "Choose a File…";
pub const ADDING: &str = "Adding…";
pub const SECTION_BUILT_IN: &str = "BUILT-IN SOUNDS";
pub const MISSING_FILE: &str = "Missing file";
pub const MUSIC_FOOTER: &str = "Music files stay on this computer. MP3, M4A, WAV, OGG and FLAC are supported.";
pub const IMPORT_NOT_AUDIO: &str = "That file is not an audio file.";
pub const IMPORT_TOO_LARGE: &str = "That file is larger than 80 MB.";
pub const IMPORT_CANNOT_PLAY: &str = "This audio format cannot be played on this computer.";

// Ringing screen.
pub const SOLVE_TO_TURN_OFF: &str = "Solve to turn off";
pub const TYPE_CODE_TO_TURN_OFF: &str = "Type the code to turn off";
pub const ANSWER: &str = "Answer";

// Timer.
pub const START: &str = "Start";
pub const PAUSE: &str = "Pause";
pub const RESUME: &str = "Resume";
pub const WHEN_TIMER_ENDS: &str = "When Timer Ends";
pub const SECTION_RECENTS: &str = "RECENTS";
pub const REMOVE: &str = "Remove";
pub const HOURS_UNIT: &str = "hours";
pub const MIN_UNIT: &str = "min";
pub const SEC_UNIT: &str = "sec";
pub const REPEAT_TIMER: &str = "Repeat";

// Stopwatch.
pub const LAP: &str = "Lap";
pub const RESET: &str = "Reset";

// Settings.
pub const SECTION_APPEARANCE: &str = "APPEARANCE";
pub const THEME: &str = "Theme";
pub const AUTO: &str = "Auto";
pub const LIGHT: &str = "Light";
pub const DARK: &str = "Dark";
pub const TIME_FORMAT: &str = "Time Format";
pub const HOUR_12: &str = "12-hour";
pub const HOUR_24: &str = "24-hour";
pub const SECTION_NEW_ALARM_DEFAULTS: &str = "NEW ALARM DEFAULTS";
pub const DIFFICULTY: &str = "Difficulty";
pub const DEFAULTS_FOOTER: &str =
    "Applied to alarms you create from now on. Each alarm can still be changed individually.";
pub const DEFAULT_SOUND_SHEET: &str = "Default Sound";
pub const SECTION_SNOOZE: &str = "SNOOZE";
pub const SECTION_RELIABILITY: &str = "RELIABILITY";
pub const NOTIFICATIONS: &str = "Notifications";
pub const ON: &str = "On";
pub const BLOCKED: &str = "Blocked";
pub const OPEN_AT_LOGIN: &str = "Open at Login";
pub const KEEP_COMPUTER_AWAKE: &str = "Keep Computer Awake";
pub const RING_LATE_ALARMS_FOR: &str = "Ring Late Alarms For";
pub const RELIABILITY_FOOTER: &str =
    "Alarm keeps running in the menu bar / tray and rings even when its window is closed.";
pub const ADD_MUSIC_FILE: &str = "Add Music File…";
pub const MUSIC_LIBRARY_FOOTER: &str =
    "Imported files are copied into the app’s local storage, so alarms keep working if the original is moved.";
pub const SECTION_ABOUT: &str = "ABOUT";
pub const VERSION: &str = "Version";
pub const STORAGE: &str = "Storage";
pub const THIS_COMPUTER_ONLY: &str = "This computer only";

// Tray.
pub const TRAY_TOOLTIP: &str = "Alarm";
pub const TRAY_OPEN: &str = "Open Alarm";
pub const TRAY_QUIT: &str = "Quit";

/// `Alarm` when the label is empty.
pub fn alarm_label(label: &str) -> String {
    let t = label.trim();
    if t.is_empty() {
        APP_NAME.to_string()
    } else {
        t.to_string()
    }
}

pub fn timer_label(label: &str) -> String {
    let t = label.trim();
    if t.is_empty() { TIMER.to_string() } else { t.to_string() }
}

/// List row subtitle: `Work, weekdays`.
pub fn alarm_subtitle(label: &str, repeat_summary: &str) -> String {
    if repeat_summary == "Never" {
        alarm_label(label)
    } else {
        format!("{}, {}", alarm_label(label), repeat_summary.to_lowercase())
    }
}

pub fn next_alarm_in(relative: &str) -> String {
    format!("Next alarm in {relative}")
}

pub fn snoozed_until(time: &str) -> String {
    format!("Snoozed until {time}")
}

pub fn delete_aria(label: &str) -> String {
    format!("Delete {label}")
}

pub fn every_day_name(day_long: &str) -> String {
    format!("Every {day_long}")
}

pub fn tasks_in_a_row(count: u8) -> String {
    format!("{count} {} in a row", if count == 1 { "task" } else { "tasks" })
}

pub fn difficulty(d: Difficulty) -> &'static str {
    match d {
        Difficulty::Easy => EASY,
        Difficulty::Medium => MEDIUM,
        Difficulty::Hard => HARD,
    }
}

/// `None`, `Math · Medium · 2×`, `Retype Code · Hard · 1×`.
pub fn task_summary(t: &DismissTask) -> String {
    let kind = match t.kind {
        TaskType::None => return NONE.to_string(),
        TaskType::Math => MATH,
        TaskType::Retype => RETYPE_CODE,
    };
    format!("{kind} · {} · {}×", difficulty(t.difficulty), t.count)
}

pub fn sound_name(sound: &SoundRef, library: &[CustomSound]) -> String {
    match sound {
        SoundRef::Builtin(b) => b.name().to_string(),
        SoundRef::Custom(id) => library
            .iter()
            .find(|s| &s.id == id)
            .map(|s| s.name.clone())
            .unwrap_or_else(|| MISSING_FILE.into()),
    }
}

pub fn builtin_name(b: BuiltinSound) -> &'static str {
    b.name()
}

pub fn snooze_button(minutes: u8) -> String {
    format!("Snooze · {minutes} min")
}

/// Notification button and tray item.
pub fn snooze_action(minutes: u8) -> String {
    format!("Snooze {minutes} min")
}

pub fn snooze_length(minutes: u8) -> String {
    format!("Snooze Length · {minutes} min")
}

pub fn timer_is_up(countdown: &str) -> String {
    format!("{countdown} is up")
}

pub fn start_timer_aria(words: &str) -> String {
    format!("Start {words} timer")
}

pub fn lap_n(n: usize) -> String {
    format!("Lap {n}")
}

/// Second sentence of the `Notifications are blocked` banner (TZ_RUST 3.9).
pub fn notifications_blocked_fix(platform: Platform) -> &'static str {
    match platform {
        Platform::Macos => "Allow notifications in System Settings → Notifications.",
        Platform::Windows => "Allow notifications in Settings → System → Notifications.",
        Platform::Linux => "Allow notifications in your desktop settings.",
    }
}

pub fn notifications_blocked_text(platform: Platform) -> String {
    format!("{NOTIFICATIONS_BLOCKED_HINT} {}", notifications_blocked_fix(platform))
}

/// Title of the window while an alarm rings.
pub fn ringing_title(alarm: &Alarm) -> String {
    format!("⏰ {}", alarm_label(&alarm.label))
}

// ------------------------------------------------------------ notifications --

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotificationText {
    pub title: String,
    pub body: String,
}

pub fn alarm_notification(alarm: &Alarm, time: &str) -> NotificationText {
    NotificationText {
        title: ringing_title(alarm),
        body: format!("{time}\nOpen the app to turn it off."),
    }
}

pub fn missed_notification(alarm: &Alarm, time: &str) -> NotificationText {
    NotificationText {
        title: format!("Missed alarm: {}", alarm_label(&alarm.label)),
        body: format!("It was set for {time}, while the computer was asleep or the app was closed."),
    }
}

pub fn timer_notification(timer: &Timer, countdown: &str) -> NotificationText {
    NotificationText {
        title: format!("⏱ {}", timer_label(&timer.label)),
        body: format!("{countdown} timer is done."),
    }
}

pub fn timer_late_notification(timer: &Timer, countdown: &str) -> NotificationText {
    NotificationText {
        title: format!("{} ended", timer_label(&timer.label)),
        body: format!("Your {countdown} timer finished while the computer was asleep."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::defaults;

    #[test]
    fn labels_and_summaries() {
        assert_eq!(alarm_label("  "), "Alarm");
        assert_eq!(alarm_subtitle("Work", "Weekdays"), "Work, weekdays");
        assert_eq!(alarm_subtitle("Gym", "Never"), "Gym");
        assert_eq!(alarm_subtitle("Take vitamins", "Every day"), "Take vitamins, every day");
        assert_eq!(task_summary(&defaults::DEFAULT_TASK), "Math · Medium · 2×");
        let t = DismissTask {
            kind: TaskType::Retype,
            difficulty: Difficulty::Hard,
            count: 1,
        };
        assert_eq!(task_summary(&t), "Retype Code · Hard · 1×");
        assert_eq!(tasks_in_a_row(1), "1 task in a row");
        assert_eq!(tasks_in_a_row(3), "3 tasks in a row");
        assert_eq!(sound_name(&SoundRef::Custom("gone".into()), &[]), "Missing file");
        assert_eq!(
            sound_name(&SoundRef::Builtin(BuiltinSound::Classic), &[]),
            "Classic Bell"
        );
    }

    #[test]
    fn notification_texts() {
        let mut t = defaults::timer();
        t.label = String::new();
        assert_eq!(timer_notification(&t, "05:00").title, "⏱ Timer");
        assert_eq!(
            timer_late_notification(&t, "05:00").body,
            "Your 05:00 timer finished while the computer was asleep."
        );
        assert_eq!(snooze_action(9), "Snooze 9 min");
        assert_eq!(snooze_button(9), "Snooze · 9 min");
    }
}
