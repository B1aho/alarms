//! `protocol`: messages between `alarmd` and the client (TZ_RUST 5.2).
//! One JSON object per line; enums are tagged with `"type"`.
#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};

pub use domain::model::{
    Alarm, AlarmDraft, BuiltinSound, CustomSound, Difficulty, DismissTask, HourCycle, HourCyclePref, Ms, NotifyStatus,
    Platform, Recent, Settings, SoundRef, Stopwatch, TaskType, Theme, Timer, TimerStatus,
};
pub use domain::tasks::ProblemKind;

/// Bumped on every incompatible change. A client that meets an older daemon replaces it.
pub const PROTOCOL_VERSION: u32 = 1;

/// File name of the daemon's socket inside the data directory (`alarm-<user>`, TZ_RUST 5.1).
pub fn socket_file_name(user: &str) -> String {
    let user: String = user
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    format!("alarm-{user}.sock")
}

/// Where the daemon listens: `<data dir>/alarm-<user>.sock`; if that path is too long for a Unix
/// socket (104 bytes on macOS), a per-data-dir name in the temp directory is used instead.
pub fn socket_path(data_dir: &std::path::Path, user: &str, temp_dir: &std::path::Path) -> std::path::PathBuf {
    let preferred = data_dir.join(socket_file_name(user));
    if preferred.as_os_str().len() < 100 {
        return preferred;
    }
    // FNV-1a of the data directory keeps different data dirs apart.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in data_dir.as_os_str().as_encoded_bytes() {
        h = (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3);
    }
    temp_dir.join(format!(
        "alarm-{}-{:012x}.sock",
        socket_file_name(user)
            .trim_start_matches("alarm-")
            .trim_end_matches(".sock"),
        h & 0xffff_ffff_ffff
    ))
}

/// Client → daemon.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum Command {
    Hello {
        protocol: u32,
        version: String,
    },
    SaveAlarm {
        alarm: AlarmDraft,
    },
    DeleteAlarm {
        id: String,
    },
    SetAlarmEnabled {
        id: String,
        enabled: bool,
    },
    CancelSnooze {
        id: String,
    },
    Snooze {
        id: String,
    },
    Stop {
        id: String,
    },
    SubmitAnswer {
        id: String,
        answer: String,
    },
    BackFromTask {
        id: String,
    },
    UpdateSettings {
        settings: Settings,
    },
    ImportSound {
        path: String,
    },
    RemoveSound {
        id: String,
    },
    PreviewPlay {
        sound: SoundRef,
        volume: f32,
        ramp_seconds: u32,
        looped: bool,
    },
    PreviewStop,
    RequestNotificationPermission,
    SetTimerDuration {
        duration_ms: i64,
    },
    SetTimerLabel {
        label: String,
    },
    SetTimerSound {
        sound: SoundRef,
    },
    StartTimer {
        duration_ms: i64,
        label: Option<String>,
    },
    PauseTimer,
    ResumeTimer,
    CancelTimer,
    StopTimerAlert,
    RepeatTimer,
    RemoveRecent {
        duration_ms: i64,
    },
    StopwatchStart,
    StopwatchStop,
    StopwatchLap,
    StopwatchReset,
    WindowFocused,
    Shutdown,
}

/// Daemon → client.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum Event {
    /// The daemon's answer to `Hello`.
    Hello {
        protocol: u32,
        version: String,
    },
    Snapshot(Box<Snapshot>),
    Focus,
    ShowRinging,
    ShowTimerAlert,
    ImportResult {
        ok: Option<String>,
        error: Option<String>,
    },
    PreviewEnded,
    AlreadyOpen,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskView {
    pub kind: ProblemKind,
    pub prompt: String,
    pub solved: u8,
    pub total: u8,
    pub wrong: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ringing {
    pub alarm: Alarm,
    pub task: Option<TaskView>,
}

/// The whole state, sent on connect and after every change.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub version: String,
    pub platform: Platform,
    /// The daemon's clock at the time of the snapshot.
    pub now: Ms,
    pub alarms: Vec<Alarm>,
    pub settings: Settings,
    pub hour_cycle: HourCycle,
    pub timer: Timer,
    pub stopwatch: Stopwatch,
    pub sounds: Vec<CustomSound>,
    pub ringing: Vec<Ringing>,
    pub notifications: NotifyStatus,
    pub next_alarm_at: Option<Ms>,
    pub new_alarm: AlarmDraft,
    pub preview_playing: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot() -> Snapshot {
        let settings = domain::defaults::settings();
        Snapshot {
            version: "1.0.0".into(),
            platform: Platform::Macos,
            now: 1_762_768_800_000,
            alarms: vec![Alarm {
                id: "a1".into(),
                hour: 6,
                minute: 30,
                label: "Work".into(),
                enabled: true,
                days: vec![1, 2, 3, 4, 5],
                sound: SoundRef::Builtin(BuiltinSound::Sunrise),
                volume: 0.9,
                ramp_seconds: 60,
                snooze: true,
                task: domain::defaults::DEFAULT_TASK,
                created_at: 1,
                next_trigger_at: Some(1_762_839_000_000),
                snooze_until: None,
                ringing_since: None,
            }],
            new_alarm: domain::defaults::new_alarm_draft(&settings, 11, 51),
            settings,
            hour_cycle: HourCycle::H24,
            timer: domain::defaults::timer(),
            stopwatch: Stopwatch::default(),
            sounds: vec![],
            ringing: vec![],
            notifications: NotifyStatus::On,
            next_alarm_at: Some(1_762_839_000_000),
            preview_playing: false,
        }
    }

    #[test]
    fn commands_round_trip() {
        let cmds = vec![
            Command::Hello {
                protocol: PROTOCOL_VERSION,
                version: "1.0.0".into(),
            },
            Command::SaveAlarm {
                alarm: domain::defaults::new_alarm_draft(&domain::defaults::settings(), 7, 0),
            },
            Command::SubmitAnswer {
                id: "a".into(),
                answer: "42".into(),
            },
            Command::PreviewPlay {
                sound: SoundRef::Custom("x".into()),
                volume: 0.5,
                ramp_seconds: 0,
                looped: false,
            },
            Command::StartTimer {
                duration_ms: 1000,
                label: None,
            },
            Command::StopwatchLap,
            Command::Shutdown,
        ];
        for c in cmds {
            let line = serde_json::to_string(&c).unwrap();
            assert!(!line.contains('\n'));
            assert_eq!(serde_json::from_str::<Command>(&line).unwrap(), c);
        }
    }

    #[test]
    fn events_round_trip() {
        let events = vec![
            Event::Hello {
                protocol: 1,
                version: "1.0.0".into(),
            },
            Event::Snapshot(Box::new(snapshot())),
            Event::ImportResult {
                ok: None,
                error: Some("That file is not an audio file.".into()),
            },
            Event::AlreadyOpen,
        ];
        for e in events {
            let line = serde_json::to_string(&e).unwrap();
            assert_eq!(serde_json::from_str::<Event>(&line).unwrap(), e);
        }
    }

    #[test]
    fn wire_format() {
        insta::assert_snapshot!(
            serde_json::to_string(&Command::SetAlarmEnabled { id: "a1".into(), enabled: false }).unwrap(),
            @r#"{"type":"SetAlarmEnabled","id":"a1","enabled":false}"#
        );
        insta::assert_snapshot!(
            serde_json::to_string(&Command::RemoveRecent { duration_ms: 300000 }).unwrap(),
            @r#"{"type":"RemoveRecent","durationMs":300000}"#
        );
        insta::assert_json_snapshot!("snapshot", Event::Snapshot(Box::new(snapshot())));
    }
}
