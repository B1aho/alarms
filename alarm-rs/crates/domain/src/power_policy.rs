//! When to keep the computer awake (TZ_RUST 3.7).

use crate::model::{Alarm, Settings};

/// The setting is on and some alarm is enabled, snoozed or ringing.
pub fn keep_awake(settings: &Settings, alarms: &[Alarm]) -> bool {
    settings.keep_awake
        && alarms
            .iter()
            .any(|a| a.enabled || a.snooze_until.is_some() || a.ringing_since.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::defaults;
    use crate::model::*;

    fn alarm(enabled: bool) -> Alarm {
        Alarm {
            id: "a".into(),
            hour: 7,
            minute: 0,
            label: String::new(),
            enabled,
            days: vec![],
            sound: defaults::DEFAULT_SOUND,
            volume: 0.9,
            ramp_seconds: 0,
            snooze: true,
            task: defaults::DEFAULT_TASK,
            created_at: 0,
            next_trigger_at: None,
            snooze_until: None,
            ringing_since: None,
        }
    }

    #[test]
    fn policy() {
        let mut s = defaults::settings();
        assert!(!keep_awake(&s, &[alarm(true)]));
        s.keep_awake = true;
        assert!(keep_awake(&s, &[alarm(true)]));
        assert!(!keep_awake(&s, &[alarm(false)]));
        let mut snoozed = alarm(false);
        snoozed.snooze_until = Some(1);
        assert!(keep_awake(&s, &[snoozed]));
        let mut ringing = alarm(false);
        ringing.ringing_since = Some(1);
        assert!(keep_awake(&s, &[ringing]));
        assert!(!keep_awake(&s, &[]));
    }
}
