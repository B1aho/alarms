//! Client state: the latest `Snapshot`, the clock offset and view-only state.

use leptos::prelude::*;
use protocol::{Command, Event, Snapshot};

use crate::{bridge, fake};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Page {
    Alarms,
    Stopwatch,
    Timer,
    Settings,
}

impl Page {
    pub const ALL: [Page; 4] = [Page::Alarms, Page::Stopwatch, Page::Timer, Page::Settings];

    pub fn from_str(s: &str) -> Option<Page> {
        Some(match s {
            "alarms" => Page::Alarms,
            "stopwatch" => Page::Stopwatch,
            "timer" => Page::Timer,
            "settings" => Page::Settings,
            _ => return None,
        })
    }
}

/// Progress of `ImportSound`, owned by the picker that started it.
#[derive(Clone, Debug, PartialEq)]
pub enum Import {
    Idle,
    Adding { owner: u32 },
    Done { owner: u32, id: String },
    Failed { owner: u32, message: String },
}

/// What the URL asks to open at start (fake daemon and screenshots).
#[derive(Clone, Debug, Default)]
pub struct Opening {
    pub open: Option<String>,
    pub example: Option<String>,
    pub answer: Option<String>,
}

#[derive(Clone, Copy)]
pub struct Store {
    pub snap: RwSignal<Option<Snapshot>>,
    pub page: RwSignal<Page>,
    pub import: RwSignal<Import>,
    pub preview_ended: RwSignal<u32>,
    offset: StoredValue<f64>,
    frozen: StoredValue<Option<f64>>,
    pub opening: StoredValue<Opening>,
    pub fake: bool,
}

impl Store {
    pub fn new(fake: bool, frozen: Option<f64>, opening: Opening) -> Self {
        Store {
            snap: RwSignal::new(None),
            page: RwSignal::new(Page::Alarms),
            import: RwSignal::new(Import::Idle),
            preview_ended: RwSignal::new(0),
            offset: StoredValue::new(0.0),
            frozen: StoredValue::new(frozen),
            opening: StoredValue::new(opening),
            fake,
        }
    }

    /// The daemon's clock as seen from here: own clock + offset measured at the last snapshot.
    pub fn now(&self) -> f64 {
        self.frozen
            .get_value()
            .unwrap_or_else(|| js_sys::Date::now() + self.offset.get_value())
    }

    pub fn is_frozen(&self) -> bool {
        self.frozen.get_value().is_some()
    }

    pub fn send(&self, cmd: Command) {
        if self.fake {
            fake::apply(self, cmd);
        } else if let Ok(line) = serde_json::to_string(&cmd) {
            bridge::send_line(line);
        }
    }

    pub fn set_snapshot(&self, s: Snapshot) {
        if !self.is_frozen() {
            self.offset.set_value(s.now as f64 - js_sys::Date::now());
        }
        self.snap.set(Some(s));
    }

    pub fn on_event(&self, e: Event) {
        match e {
            Event::Snapshot(s) => self.set_snapshot(*s),
            Event::ImportResult { ok, error } => {
                let owner = match self.import.get_untracked() {
                    Import::Adding { owner } => owner,
                    _ => 0,
                };
                self.import.set(match (ok, error) {
                    (Some(id), _) => Import::Done { owner, id },
                    (None, e) => Import::Failed {
                        owner,
                        message: e.unwrap_or_default(),
                    },
                });
            }
            Event::PreviewEnded => self.preview_ended.update(|n| *n += 1),
            Event::Hello { .. } | Event::Focus | Event::ShowRinging | Event::ShowTimerAlert | Event::AlreadyOpen => {}
        }
    }

    /// Read from the snapshot (tracked).
    pub fn with<R>(&self, f: impl FnOnce(&Snapshot) -> R) -> Option<R> {
        self.snap.with(|s| s.as_ref().map(f))
    }
}

pub fn use_store() -> Store {
    expect_context::<Store>()
}

/// A clock that updates every `ms` (never, when frozen).
pub fn use_ticker(store: Store, ms: u32) -> ReadSignal<f64> {
    let (now, set_now) = signal(store.now());
    if !store.is_frozen() {
        let handle = set_interval_with_handle(
            move || set_now.set(store.now()),
            std::time::Duration::from_millis(u64::from(ms)),
        );
        if let Ok(h) = handle {
            on_cleanup(move || h.clear());
        }
    }
    now
}

/// Unique ids for import owners.
pub fn next_owner() -> u32 {
    thread_local!(static N: std::cell::Cell<u32> = const { std::cell::Cell::new(1) });
    N.with(|n| {
        let v = n.get();
        n.set(v + 1);
        v
    })
}

/// The local time zone of this computer.
pub fn tz() -> jiff::tz::TimeZone {
    jiff::tz::TimeZone::system()
}

/// Local hour and minute of a timestamp.
pub fn local_hm(ms: f64) -> (u8, u8) {
    domain::format::local_hm(ms as i64, &tz())
}
