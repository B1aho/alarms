//! What the client sees: the full state sent in every `Snapshot` (TZ_RUST 5.2).

use domain::model::*;
use domain::tasks::ProblemKind;

#[derive(Clone, Debug, PartialEq)]
pub struct TaskView {
    pub kind: ProblemKind,
    pub prompt: String,
    pub solved: u8,
    pub total: u8,
    /// Wrong answers so far: the client shakes the task when it grows.
    pub wrong: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RingingView {
    pub alarm: Alarm,
    /// `Some` after `Stop` on an alarm with a task: the task card is shown.
    pub task: Option<TaskView>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AppView {
    pub version: String,
    pub platform: Platform,
    /// The daemon's clock when the view was made; the client corrects its clock by it.
    pub now: Ms,
    pub alarms: Vec<Alarm>,
    pub settings: Settings,
    pub hour_cycle: HourCycle,
    pub timer: Timer,
    pub stopwatch: Stopwatch,
    pub sounds: Vec<CustomSound>,
    /// Ringing alarms in list order; the screen shows the first.
    pub ringing: Vec<RingingView>,
    pub notifications: NotifyStatus,
    pub next_alarm_at: Option<Ms>,
    /// Template for `Add Alarm` (defaults from the settings).
    pub new_alarm: AlarmDraft,
    pub preview_playing: bool,
}
