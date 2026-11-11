//! Keep-awake (TZ_RUST 3.7) and scheduled wake (3.17).

use domain::model::{Alarm, Settings};
use domain::{power_policy, schedule};

use crate::ports::Ports;
use crate::state::Runtime;

pub fn sync(p: &Ports, rt: &mut Runtime, settings: &Settings, alarms: &[Alarm]) {
    let on = power_policy::keep_awake(settings, alarms);
    if rt.keep_awake != Some(on) {
        p.power.set_keep_awake(on);
        rt.keep_awake = Some(on);
    }
    let wake = schedule::next_due(alarms);
    if rt.wake_at != Some(wake) {
        p.power.schedule_wake(wake);
        rt.wake_at = Some(wake);
    }
}
