//! The on/off switch in the list (3.2).

use domain::schedule;

use crate::ports::{PortResult, Ports};

pub fn set_enabled(p: &Ports, id: &str, enabled: bool) -> PortResult<()> {
    if let Some(a) = p.alarms.get(id)? {
        p.alarms
            .put(&schedule::set_enabled(&a, enabled, p.clock.now(), &p.clock.time_zone()))?;
    }
    Ok(())
}
