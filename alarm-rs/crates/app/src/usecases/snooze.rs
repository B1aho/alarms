//! Snooze (3.7): from the ringing screen, the notification button and the tray.

use domain::ramp::FADE_STOP_MS;
use domain::schedule;

use super::sync::{self, alarm_tag};
use crate::ports::{PlaybackId, PortResult, Ports};
use crate::state::Runtime;

pub fn snooze(p: &Ports, rt: &mut Runtime, id: &str) -> PortResult<()> {
    let Some(a) = p.alarms.get(id)? else { return Ok(()) };
    let minutes = p.settings.load()?.snooze_minutes;
    if let Some(next) = schedule::snooze(&a, p.clock.now(), minutes) {
        p.alarms.put(&next)?;
        rt.tasks.remove(id);
        sync::stop_sound(p, rt, PlaybackId::Alarm(id.to_string()), FADE_STOP_MS);
        p.notifier.close(&alarm_tag(id));
    }
    Ok(())
}

pub fn snooze_all(p: &Ports, rt: &mut Runtime) -> PortResult<()> {
    for a in p.alarms.list()? {
        if a.ringing_since.is_some() && a.snooze {
            snooze(p, rt, &a.id)?;
        }
    }
    Ok(())
}

/// `Stop` in a list row: cancel the snooze without ringing.
pub fn cancel(p: &Ports, id: &str) -> PortResult<()> {
    if let Some(a) = p.alarms.get(id)? {
        p.alarms.put(&schedule::cancel_snooze(&a))?;
    }
    Ok(())
}
