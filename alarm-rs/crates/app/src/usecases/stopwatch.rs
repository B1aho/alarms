//! Stopwatch commands (3.11).

use domain::stopwatch as rules;

use crate::ports::{PortResult, Ports};

fn update(p: &Ports, f: impl FnOnce(&domain::model::Stopwatch) -> Option<domain::model::Stopwatch>) -> PortResult<()> {
    let s = p.stopwatch.load()?;
    if let Some(next) = f(&s) {
        p.stopwatch.save(&next)?;
    }
    Ok(())
}

pub fn start(p: &Ports) -> PortResult<()> {
    let now = p.clock.now();
    update(p, |s| rules::start(s, now))
}

pub fn stop(p: &Ports) -> PortResult<()> {
    let now = p.clock.now();
    update(p, |s| rules::stop(s, now))
}

pub fn lap(p: &Ports) -> PortResult<()> {
    let now = p.clock.now();
    update(p, |s| rules::lap(s, now))
}

pub fn reset(p: &Ports) -> PortResult<()> {
    update(p, |_| Some(rules::reset()))
}
