//! Settings (3.12): saved at once; `Open at Login` goes to the `LoginItem` port.

use domain::defaults;
use domain::model::Settings;

use crate::ports::{PortResult, Ports};

pub fn update(p: &Ports, next: Settings) -> PortResult<()> {
    let next = defaults::sanitize_settings(next);
    let prev = p.settings.load()?;
    p.settings.save(&next)?;
    if prev.open_at_login != next.open_at_login {
        p.login.set_enabled(next.open_at_login)?;
    }
    Ok(())
}
