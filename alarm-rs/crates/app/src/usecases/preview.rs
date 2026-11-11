//! Sound previews (3.3 `Preview Wake-up`, 3.8 a click in the sound list). The daemon plays them.

use domain::model::SoundRef;
use domain::ramp::FADE_STOP_MS;

use super::sync::sound_source;
use crate::ports::{PlayRequest, PlaybackId, PortResult, Ports};
use crate::state::Runtime;

pub fn play(
    p: &Ports,
    rt: &mut Runtime,
    sound: &SoundRef,
    volume: f32,
    ramp_seconds: u32,
    looped: bool,
) -> PortResult<()> {
    let library = p.sounds.list()?;
    if rt.preview {
        p.audio.stop(&PlaybackId::Preview, FADE_STOP_MS);
    }
    p.audio.play(
        PlaybackId::Preview,
        PlayRequest {
            source: sound_source(p, sound, &library),
            volume: volume.clamp(0.0, 1.0),
            ramp_seconds,
            looped,
            elapsed_seconds: 0.0,
        },
    );
    rt.preview = true;
    Ok(())
}

pub fn stop(p: &Ports, rt: &mut Runtime) {
    if rt.preview {
        p.audio.stop(&PlaybackId::Preview, FADE_STOP_MS);
        rt.preview = false;
    }
}
