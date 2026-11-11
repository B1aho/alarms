//! Timer commands (3.10).

use domain::{defaults, timer as rules};

use super::sync::TIMER_TAG;
use crate::ports::{PortResult, Ports};

fn update(p: &Ports, f: impl FnOnce(&domain::model::Timer) -> Option<domain::model::Timer>) -> PortResult<()> {
    let t = p.timer.load()?;
    if let Some(next) = f(&t) {
        p.timer.save(&next)?;
    }
    Ok(())
}

pub fn set_duration(p: &Ports, ms: i64) -> PortResult<()> {
    update(p, |t| Some(rules::set_duration(t, ms)))
}

pub fn set_label(p: &Ports, label: &str) -> PortResult<()> {
    update(p, |t| {
        Some(domain::model::Timer {
            label: defaults::sanitize_label(label),
            ..t.clone()
        })
    })
}

pub fn set_sound(p: &Ports, sound: domain::model::SoundRef) -> PortResult<()> {
    update(p, |t| Some(domain::model::Timer { sound, ..t.clone() }))
}

pub fn start(p: &Ports, duration_ms: i64, label: Option<String>) -> PortResult<()> {
    let now = p.clock.now();
    update(p, |t| {
        Some(rules::start(
            t,
            duration_ms,
            label.map(|l| defaults::sanitize_label(&l)),
            now,
        ))
    })?;
    p.notifier.close(TIMER_TAG);
    Ok(())
}

pub fn pause(p: &Ports) -> PortResult<()> {
    let now = p.clock.now();
    update(p, |t| rules::pause(t, now))
}

pub fn resume(p: &Ports) -> PortResult<()> {
    let now = p.clock.now();
    update(p, |t| rules::resume(t, now))
}

/// Cancel, or `Stop` on the alert.
pub fn reset(p: &Ports) -> PortResult<()> {
    update(p, |t| Some(rules::reset(t)))?;
    p.notifier.close(TIMER_TAG);
    Ok(())
}

/// `Repeat` on the alert: the same duration again.
pub fn repeat(p: &Ports) -> PortResult<()> {
    let t = p.timer.load()?;
    start(p, t.duration_ms, None)
}

pub fn remove_recent(p: &Ports, ms: i64) -> PortResult<()> {
    update(p, |t| Some(rules::remove_recent(t, ms)))
}
