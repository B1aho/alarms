//! Save from the editor (3.3) and delete (3.2, 3.3).

use domain::{defaults, schedule};

use super::sync::{self, alarm_tag};
use crate::ports::{PlaybackId, PortResult, Ports};
use crate::state::Runtime;
use domain::model::{Alarm, AlarmDraft};
use domain::ramp::FADE_STOP_MS;

/// New ids: time-based plus random bits, never reused.
pub fn new_id(now: i64, rt: &mut Runtime) -> String {
    format!("{:x}{:08x}", now, rt.rng.next_u32())
}

pub fn save(p: &Ports, rt: &mut Runtime, draft: AlarmDraft) -> PortResult<()> {
    let draft = defaults::sanitize_draft(draft);
    let now = p.clock.now();
    let existing = match &draft.id {
        Some(id) => p.alarms.get(id)?,
        None => None,
    };
    let base = Alarm {
        id: match (&draft.id, &existing) {
            (Some(id), _) => id.clone(),
            (None, _) => new_id(now, rt),
        },
        hour: draft.hour,
        minute: draft.minute,
        label: draft.label,
        enabled: true,
        days: draft.days,
        sound: draft.sound,
        volume: draft.volume,
        ramp_seconds: draft.ramp_seconds,
        snooze: draft.snooze,
        task: draft.task,
        created_at: existing.as_ref().map(|a| a.created_at).unwrap_or(now),
        next_trigger_at: None,
        snooze_until: None,
        ringing_since: None,
    };
    let saved = schedule::on_save(&base, now, &p.clock.time_zone());
    p.alarms.put(&saved)?;
    if existing.is_some_and(|a| a.ringing_since.is_some()) {
        p.notifier.close(&alarm_tag(&saved.id));
    }
    Ok(())
}

pub fn delete(p: &Ports, rt: &mut Runtime, id: &str) -> PortResult<()> {
    p.alarms.delete(id)?;
    rt.tasks.remove(id);
    sync::stop_sound(p, rt, PlaybackId::Alarm(id.to_string()), FADE_STOP_MS);
    p.notifier.close(&alarm_tag(id));
    Ok(())
}
