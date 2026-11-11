//! `Stop` on the ringing screen (3.5): turn off, or show the task card.

use domain::model::TaskType;
use domain::ramp::FADE_DISMISS_MS;
use domain::{schedule, tasks};

use super::sync::{self, alarm_tag};
use crate::ports::{PlaybackId, PortResult, Ports};
use crate::state::{Runtime, TaskSession};

pub fn stop(p: &Ports, rt: &mut Runtime, id: &str) -> PortResult<()> {
    let Some(a) = p.alarms.get(id)? else { return Ok(()) };
    if a.ringing_since.is_none() {
        return Ok(());
    }
    if a.task.kind == TaskType::None {
        return dismiss(p, rt, id);
    }
    if !rt.tasks.contains_key(id)
        && let Some(problem) = tasks::generate(&a.task, rt.rng.as_mut())
    {
        rt.tasks.insert(
            id.to_string(),
            TaskSession {
                problem,
                solved: 0,
                wrong: 0,
            },
        );
    }
    Ok(())
}

/// Turn the alarm off: not ringing, not snoozed, sound fades in 250 ms, notification closed.
pub fn dismiss(p: &Ports, rt: &mut Runtime, id: &str) -> PortResult<()> {
    if let Some(a) = p.alarms.get(id)? {
        p.alarms.put(&schedule::dismiss(&a))?;
    }
    rt.tasks.remove(id);
    sync::stop_sound(p, rt, PlaybackId::Alarm(id.to_string()), FADE_DISMISS_MS);
    p.notifier.close(&alarm_tag(id));
    Ok(())
}
