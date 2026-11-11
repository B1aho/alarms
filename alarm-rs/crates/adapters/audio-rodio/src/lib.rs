//! `audio-rodio`: the `AudioOut` port (TZ_RUST 5.3) over rodio.
//!
//! Public API:
//! - [`RodioAudio::new`]`(on_preview_ended)` opens the default output device on its own
//!   thread ("alarm-audio"), which owns the `OutputStream`; `play`/`stop` are commands over a channel.
//!   Files are decoded on worker threads; a file that cannot be played falls back to `Sunrise`.
//!   The thread polls the default device every second and, when it changes or disappears,
//!   reopens it and re-attaches the playing sounds at their ramp position.
//! - [`RodioAudio::silent`]`(on_preview_ended)`: the same pipeline mixed into a mixer that is
//!   consumed in real time and discarded — no device is opened, nothing is audible (e2e tests).
//! - `on_preview_ended` is called (on the audio thread) when a one-shot `PlaybackId::Preview` ends.
//! - [`synth`]: built-in sounds (48 kHz), [`decode`]: user files, [`voice::Voice`]: loop, ramp, fade.
//! - [`render`]: pull a voice into a buffer without a device (tests).
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

pub mod clip;
pub mod decode;
mod engine;
pub mod synth;
pub mod voice;

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, mpsc};

use app::ports::{AudioOut, PlayRequest, PlaybackId};

use crate::engine::{Cmd, Engine};

pub struct RodioAudio {
    tx: Mutex<mpsc::Sender<Cmd>>,
}

impl RodioAudio {
    /// Plays through the default output device.
    pub fn new(on_preview_ended: Box<dyn Fn() + Send + Sync>) -> Self {
        Self::start(false, on_preview_ended)
    }

    /// Runs the whole pipeline but opens no device: nothing is audible.
    pub fn silent(on_preview_ended: Box<dyn Fn() + Send + Sync>) -> Self {
        Self::start(true, on_preview_ended)
    }

    fn start(silent: bool, on_preview_ended: Box<dyn Fn() + Send + Sync>) -> Self {
        let (tx, rx) = mpsc::channel();
        let engine = Engine::new(
            tx.clone(),
            rx,
            silent,
            on_preview_ended,
            Arc::new(AtomicBool::new(false)),
        );
        std::thread::Builder::new()
            .name("alarm-audio".into())
            .spawn(move || engine.run())
            .expect("audio thread");
        RodioAudio { tx: Mutex::new(tx) }
    }

    fn send(&self, cmd: Cmd) {
        let _ = self.tx.lock().unwrap_or_else(|p| p.into_inner()).send(cmd);
    }

    /// Fade everything out and close the device.
    pub fn shutdown(&self) {
        self.send(Cmd::Shutdown);
    }
}

impl Drop for RodioAudio {
    fn drop(&mut self) {
        self.send(Cmd::Shutdown);
    }
}

impl AudioOut for RodioAudio {
    fn play(&self, id: PlaybackId, request: PlayRequest) {
        self.send(Cmd::Play(id, request));
    }

    fn stop(&self, id: &PlaybackId, fade_ms: u32) {
        self.send(Cmd::Stop(id.clone(), fade_ms));
    }

    fn probe(&self, path: &str) -> bool {
        decode::probe(Path::new(path))
    }
}

/// Pull up to `max_samples` interleaved samples from a voice (no device).
pub fn render(voice: voice::Voice, max_samples: usize) -> Vec<f32> {
    voice.take(max_samples).collect()
}
