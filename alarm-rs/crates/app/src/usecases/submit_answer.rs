//! Answers on the task card (3.5, 3.6): checked by the daemon, never by the client.

use domain::tasks;

use super::stop::dismiss;
use crate::ports::{PortResult, Ports};
use crate::state::Runtime;

pub fn submit(p: &Ports, rt: &mut Runtime, id: &str, answer: &str) -> PortResult<()> {
    let Some(a) = p.alarms.get(id)? else { return Ok(()) };
    let Some(session) = rt.tasks.get_mut(id) else {
        return Ok(());
    };
    if answer.trim().is_empty() {
        return Ok(());
    }
    if tasks::check_answer(&session.problem, answer) {
        session.solved += 1;
        if session.solved >= a.task.count {
            return dismiss(p, rt, id);
        }
    } else {
        session.wrong += 1;
    }
    // Right or wrong, a new task replaces the old one; progress is kept.
    if let Some(next) = tasks::generate(&a.task, rt.rng.as_mut())
        && let Some(session) = rt.tasks.get_mut(id)
    {
        session.problem = next;
    }
    Ok(())
}
