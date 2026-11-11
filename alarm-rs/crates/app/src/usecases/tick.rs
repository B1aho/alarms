//! The tick loop body (3.4, 3.10) and startup.

use domain::model::*;
use domain::schedule::{self, Verdict};
use domain::{format, strings, timer as timer_rules};

use super::sync::{self, TIMER_TAG, alarm_tag};
use crate::ports::{Notification, PortResult, Ports};
use crate::state::Runtime;

/// On start: enabled alarms without a next trigger are rescheduled, the login item follows the setting.
pub fn startup(p: &Ports) -> PortResult<()> {
    let now = p.clock.now();
    let tz = p.clock.time_zone();
    for a in p.alarms.list()? {
        if let Some(fixed) = schedule::repair(&a, now, &tz) {
            p.alarms.put(&fixed)?;
        }
    }
    let settings = p.settings.load()?;
    // A failure to register is not fatal: the daemon keeps running.
    let _ = p.login.set_enabled(settings.open_at_login);
    Ok(())
}

pub fn tick(p: &Ports, _rt: &mut Runtime) -> PortResult<()> {
    let now = p.clock.now();
    let tz = p.clock.time_zone();
    let settings = p.settings.load()?;
    let cycle = sync::hour_cycle(p, &settings);
    let grace_ms = i64::from(settings.missed_grace_minutes) * MINUTE_MS;

    let mut rang = Vec::new();
    for a in p.alarms.list()? {
        match schedule::decide(&a, now, grace_ms) {
            Verdict::Wait => {}
            Verdict::Ring { source, trigger } => {
                let next = schedule::ring(&a, source, trigger, now, &tz);
                // Write first; only the winner of the conditional update rings.
                if p.alarms.start_ringing(&next)? {
                    rang.push(next);
                }
            }
            Verdict::Missed { source, trigger } => {
                let next = schedule::after_trigger(&a, source, trigger, now, &tz);
                p.alarms.put(&next)?;
                if schedule::notify_missed(trigger, now) {
                    let text = strings::missed_notification(&a, &format::timestamp(trigger, &tz, cycle));
                    p.notifier.show(&Notification {
                        tag: alarm_tag(&a.id),
                        title: text.title,
                        body: text.body,
                        snooze_action: None,
                        persistent: false,
                        alarm_id: Some(a.id.clone()),
                    });
                }
            }
        }
    }
    for a in &rang {
        let text = strings::alarm_notification(a, &format::clock_string(a.hour, a.minute, cycle));
        p.notifier.show(&Notification {
            tag: alarm_tag(&a.id),
            title: text.title,
            body: text.body,
            snooze_action: a.snooze.then(|| strings::snooze_action(settings.snooze_minutes)),
            persistent: true,
            alarm_id: Some(a.id.clone()),
        });
    }
    if !rang.is_empty() {
        sync::present_ringing(p);
    }

    let timer = p.timer.load()?;
    match timer_rules::decide(&timer, now) {
        timer_rules::TimerVerdict::Wait => {}
        timer_rules::TimerVerdict::Ring => {
            p.timer.save(&timer_rules::ring(&timer))?;
            let text = strings::timer_notification(&timer, &format::countdown(timer.duration_ms));
            p.notifier.show(&Notification {
                tag: TIMER_TAG.into(),
                title: text.title,
                body: text.body,
                snooze_action: None,
                persistent: true,
                alarm_id: None,
            });
            sync::present_timer_alert(p);
        }
        timer_rules::TimerVerdict::Late => {
            p.timer.save(&timer_rules::late(&timer))?;
            let text = strings::timer_late_notification(&timer, &format::countdown(timer.duration_ms));
            p.notifier.show(&Notification {
                tag: TIMER_TAG.into(),
                title: text.title,
                body: text.body,
                snooze_action: None,
                persistent: false,
                alarm_id: None,
            });
        }
    }
    Ok(())
}

/// When the tick loop must wake up at the latest (it also wakes every 500 ms).
pub fn next_due(p: &Ports) -> PortResult<Option<Ms>> {
    let alarms = p.alarms.list()?;
    let timer = p.timer.load()?;
    let a = schedule::next_due(&alarms);
    let t = if timer.status == TimerStatus::Running {
        timer.ends_at
    } else {
        None
    };
    Ok(match (a, t) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (x, y) => x.or(y),
    })
}
