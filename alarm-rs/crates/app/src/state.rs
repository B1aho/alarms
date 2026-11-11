//! In-memory state of the daemon that is not persisted.

use std::collections::{BTreeMap, BTreeSet};

use domain::tasks::Problem;

use crate::ports::{PlaybackId, Rng};
use crate::view::AppView;

/// A task card in progress for a ringing alarm.
#[derive(Clone, Debug, PartialEq)]
pub struct TaskSession {
    pub problem: Problem,
    pub solved: u8,
    pub wrong: u32,
}

pub struct Runtime {
    pub rng: Rng,
    pub tasks: BTreeMap<String, TaskSession>,
    /// Sounds currently started through `AudioOut` (alarms and the timer).
    pub playing: BTreeSet<PlaybackId>,
    pub preview: bool,
    pub keep_awake: Option<bool>,
    pub wake_at: Option<Option<i64>>,
    pub tray_snooze: Option<Option<String>>,
    /// Last view sent to the client (with `now` zeroed): unchanged state is not re-sent.
    pub last_view: Option<AppView>,
}

impl Runtime {
    pub fn new(rng: Rng) -> Self {
        Runtime {
            rng,
            tasks: BTreeMap::new(),
            playing: BTreeSet::new(),
            preview: false,
            keep_awake: None,
            wake_at: None,
            tray_snooze: None,
            last_view: None,
        }
    }
}
