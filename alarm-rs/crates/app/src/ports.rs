//! Ports (TZ_RUST 5.3): everything the use cases need from the outside world.
//! Adapters implement them in `crates/adapters/*`; tests use fakes in memory.

use domain::TimeZone;
use domain::model::*;

use crate::view::AppView;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PortError(pub String);

impl std::fmt::Display for PortError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for PortError {}

pub type PortResult<T> = Result<T, PortError>;

/// Wall clock and the local time zone.
pub trait Clock: Send {
    fn now(&self) -> Ms;
    fn time_zone(&self) -> TimeZone;
}

pub trait AlarmRepo: Send {
    /// All alarms that could be read; broken rows are skipped (2.7).
    fn list(&self) -> PortResult<Vec<Alarm>>;
    fn get(&self, id: &str) -> PortResult<Option<Alarm>>;
    fn put(&self, alarm: &Alarm) -> PortResult<()>;
    fn delete(&self, id: &str) -> PortResult<()>;
    /// Store `alarm` (with `ringing_since` set) only if the stored row is not ringing yet.
    /// Returns `true` when this call won: an alarm rings exactly once.
    fn start_ringing(&self, alarm: &Alarm) -> PortResult<bool>;
}

pub trait SettingsRepo: Send {
    fn load(&self) -> PortResult<Settings>;
    fn save(&self, settings: &Settings) -> PortResult<()>;
}

pub trait TimerRepo: Send {
    fn load(&self) -> PortResult<Timer>;
    fn save(&self, timer: &Timer) -> PortResult<()>;
}

pub trait StopwatchRepo: Send {
    fn load(&self) -> PortResult<Stopwatch>;
    fn save(&self, stopwatch: &Stopwatch) -> PortResult<()>;
}

/// A file the user picked.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileInfo {
    pub file_name: String,
    pub size: u64,
}

/// User music files: metadata plus the copies in `data_dir/sounds/`.
pub trait SoundLibrary: Send {
    fn list(&self) -> PortResult<Vec<CustomSound>>;
    fn inspect(&self, path: &str) -> PortResult<FileInfo>;
    /// Copy the file at `path` into the library under `sound.id`.
    fn add(&self, path: &str, sound: &CustomSound) -> PortResult<()>;
    fn remove(&self, id: &str) -> PortResult<()>;
    /// Where the stored copy lives (for playback).
    fn file_path(&self, sound: &CustomSound) -> String;
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PlaybackId {
    Alarm(String),
    Timer,
    Preview,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SoundSource {
    Builtin(BuiltinSound),
    File(String),
}

#[derive(Clone, Debug, PartialEq)]
pub struct PlayRequest {
    pub source: SoundSource,
    pub volume: f32,
    pub ramp_seconds: u32,
    pub looped: bool,
    /// Seconds already elapsed on the ramp (a ringing alarm restored after a restart).
    pub elapsed_seconds: f64,
}

pub trait AudioOut: Send {
    fn play(&self, id: PlaybackId, request: PlayRequest);
    fn stop(&self, id: &PlaybackId, fade_ms: u32);
    /// Trial decode of a file.
    fn probe(&self, path: &str) -> bool;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Notification {
    pub tag: String,
    pub title: String,
    pub body: String,
    /// `Snooze N min` button.
    pub snooze_action: Option<String>,
    /// Stays until dismissed.
    pub persistent: bool,
    /// The alarm the button and the click act on.
    pub alarm_id: Option<String>,
}

pub trait Notifier: Send {
    fn status(&self) -> NotifyStatus;
    fn request_permission(&self);
    fn show(&self, notification: &Notification);
    fn close(&self, tag: &str);
}

pub trait PowerGuard: Send {
    fn set_keep_awake(&self, on: bool);
    /// Wake the computer for the next ring (Windows only; a no-op elsewhere).
    fn schedule_wake(&self, at: Option<Ms>);
}

pub trait LoginItem: Send {
    fn set_enabled(&self, on: bool) -> PortResult<()>;
}

pub trait SystemInfo: Send {
    fn hour_cycle(&self) -> HourCycle;
    fn platform(&self) -> Platform;
    fn app_version(&self) -> String;
}

/// Starts the client when it is not running.
pub trait UiLauncher: Send {
    fn show_window(&self);
    fn show_ringing(&self);
    fn show_timer_alert(&self);
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UiEvent {
    Focus,
    ShowRinging,
    ShowTimerAlert,
    ImportResult(Result<String, String>),
    PreviewEnded,
}

/// The connected client (at most one).
pub trait EventSink: Send {
    fn has_client(&self) -> bool;
    fn publish(&self, view: &AppView);
    fn emit(&self, event: UiEvent);
}

/// The tray menu shows `Snooze N min` only while a snoozable alarm rings (TZ_RUST 3.13).
pub trait TrayMenu: Send {
    fn set_snooze(&self, label: Option<String>);
}

/// Source of random numbers for the tasks.
pub type Rng = Box<dyn domain::tasks::RngCore + Send>;

/// All ports of the daemon.
pub struct Ports {
    pub clock: Box<dyn Clock>,
    pub alarms: Box<dyn AlarmRepo>,
    pub settings: Box<dyn SettingsRepo>,
    pub timer: Box<dyn TimerRepo>,
    pub stopwatch: Box<dyn StopwatchRepo>,
    pub sounds: Box<dyn SoundLibrary>,
    pub audio: Box<dyn AudioOut>,
    pub notifier: Box<dyn Notifier>,
    pub power: Box<dyn PowerGuard>,
    pub login: Box<dyn LoginItem>,
    pub system: Box<dyn SystemInfo>,
    pub launcher: Box<dyn UiLauncher>,
    pub sink: Box<dyn EventSink>,
    pub tray: Box<dyn TrayMenu>,
}
