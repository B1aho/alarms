//! User music files (2.6, 3.8).

use domain::model::CustomSound;
use domain::sounds::{self, ImportError};

use crate::ports::{PortResult, Ports, UiEvent};
use crate::state::Runtime;

pub fn import(p: &Ports, rt: &mut Runtime, path: &str) -> PortResult<()> {
    let result = try_import(p, rt, path);
    p.sink
        .emit(UiEvent::ImportResult(result.map_err(|e| e.message().to_string())));
    Ok(())
}

fn try_import(p: &Ports, rt: &mut Runtime, path: &str) -> Result<String, ImportError> {
    let info = p.sounds.inspect(path).map_err(|_| ImportError::NotAudio)?;
    let ext = sounds::validate(&info.file_name, info.size)?;
    if !p.audio.probe(path) {
        return Err(ImportError::CannotPlay);
    }
    let now = p.clock.now();
    let sound = CustomSound {
        id: super::save_alarm::new_id(now, rt),
        name: sounds::display_name(&info.file_name),
        size: info.size,
        added_at: now,
        ext,
    };
    p.sounds.add(path, &sound).map_err(|_| ImportError::NotAudio)?;
    Ok(sound.id)
}

pub fn remove(p: &Ports, id: &str) -> PortResult<()> {
    p.sounds.remove(id)
}
