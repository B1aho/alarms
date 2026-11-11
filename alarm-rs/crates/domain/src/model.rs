//! Data model (ALARM_SPEC 2.1–2.6). Times are Unix epoch milliseconds (`Ms`).

use serde::{Deserialize, Serialize};

/// Unix epoch milliseconds.
pub type Ms = i64;

pub const MINUTE_MS: Ms = 60_000;
pub const HOUR_MS: Ms = 60 * MINUTE_MS;

// ------------------------------------------------------------------ sounds --

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuiltinSound {
    Sunrise,
    Harp,
    Chimes,
    Beacon,
    Pulse,
    Classic,
}

impl BuiltinSound {
    /// The order of the `BUILT-IN SOUNDS` section.
    pub const ALL: [BuiltinSound; 6] = [
        BuiltinSound::Sunrise,
        BuiltinSound::Harp,
        BuiltinSound::Chimes,
        BuiltinSound::Beacon,
        BuiltinSound::Pulse,
        BuiltinSound::Classic,
    ];

    pub fn name(self) -> &'static str {
        match self {
            BuiltinSound::Sunrise => "Sunrise",
            BuiltinSound::Harp => "Harp",
            BuiltinSound::Chimes => "Chimes",
            BuiltinSound::Beacon => "Beacon",
            BuiltinSound::Pulse => "Pulse",
            BuiltinSound::Classic => "Classic Bell",
        }
    }
}

/// Which sound to play: built-in or a user file (by its id).
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "lowercase")]
pub enum SoundRef {
    Builtin(BuiltinSound),
    Custom(String),
}

/// A user's music file (2.6). The file itself lives in `data_dir/sounds/<id>.<ext>`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomSound {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub added_at: Ms,
    pub ext: String,
}

// ------------------------------------------------------------------- tasks --

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskType {
    None,
    Math,
    Retype,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

/// Turn Off With (2.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct DismissTask {
    #[serde(rename = "type")]
    pub kind: TaskType,
    pub difficulty: Difficulty,
    /// 1–5 tasks in a row.
    pub count: u8,
}

// ------------------------------------------------------------------ alarms --

/// An alarm (2.1).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alarm {
    pub id: String,
    pub hour: u8,
    pub minute: u8,
    pub label: String,
    pub enabled: bool,
    /// Repeat days, 0 = Sunday … 6 = Saturday, sorted. Empty = one-shot.
    pub days: Vec<u8>,
    pub sound: SoundRef,
    pub volume: f32,
    pub ramp_seconds: u32,
    pub snooze: bool,
    pub task: DismissTask,
    pub created_at: Ms,
    pub next_trigger_at: Option<Ms>,
    pub snooze_until: Option<Ms>,
    pub ringing_since: Option<Ms>,
}

/// What the editor sends on `Save`: the user-editable fields. `id = None` for a new alarm.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmDraft {
    pub id: Option<String>,
    pub hour: u8,
    pub minute: u8,
    pub label: String,
    pub days: Vec<u8>,
    pub sound: SoundRef,
    pub volume: f32,
    pub ramp_seconds: u32,
    pub snooze: bool,
    pub task: DismissTask,
}

impl AlarmDraft {
    pub fn from_alarm(a: &Alarm) -> Self {
        AlarmDraft {
            id: Some(a.id.clone()),
            hour: a.hour,
            minute: a.minute,
            label: a.label.clone(),
            days: a.days.clone(),
            sound: a.sound.clone(),
            volume: a.volume,
            ramp_seconds: a.ramp_seconds,
            snooze: a.snooze,
            task: a.task,
        }
    }
}

// ---------------------------------------------------------------- settings --

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

/// The `Time Format` setting.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum HourCyclePref {
    #[serde(rename = "auto")]
    Auto,
    #[serde(rename = "12h")]
    H12,
    #[serde(rename = "24h")]
    H24,
}

/// A resolved hour cycle.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum HourCycle {
    #[serde(rename = "12h")]
    H12,
    #[serde(rename = "24h")]
    H24,
}

/// Settings (2.3 plus `openAtLogin`, TZ_RUST 3.4).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: Theme,
    pub hour_cycle: HourCyclePref,
    pub snooze_minutes: u8,
    pub ramp_seconds: u32,
    pub volume: f32,
    pub default_sound: SoundRef,
    pub default_task: DismissTask,
    pub keep_awake: bool,
    pub missed_grace_minutes: u32,
    pub open_at_login: bool,
}

// ------------------------------------------------------------------- timer --

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerStatus {
    Idle,
    Running,
    Paused,
    Ringing,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recent {
    pub duration_ms: i64,
    pub label: String,
}

/// The single timer (2.4).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timer {
    pub status: TimerStatus,
    pub duration_ms: i64,
    pub ends_at: Option<Ms>,
    pub remaining_ms: i64,
    pub label: String,
    pub sound: SoundRef,
    pub recents: Vec<Recent>,
}

// --------------------------------------------------------------- stopwatch --

/// The stopwatch (2.5). `laps` holds the total elapsed time at each Lap press.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stopwatch {
    pub started_at: Option<Ms>,
    pub accumulated_ms: i64,
    pub laps: Vec<i64>,
}

// --------------------------------------------------------------- platform --

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Macos,
    Windows,
    Linux,
}

/// State of the OS notification permission (TZ_RUST 3.8).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NotifyStatus {
    /// Allowed: `On`.
    On,
    /// Denied in the OS: `Blocked`.
    Blocked,
    /// macOS only, not asked yet: `Turn On`.
    NotDetermined,
}
