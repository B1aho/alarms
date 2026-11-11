//! One playing sound: loops a clip, multiplies every sample by the ramp gain (3.9)
//! and fades out linearly when asked to stop.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::Duration;

use domain::ramp;
use rodio::Source;

use crate::clip::SharedClip;

/// Shared between a voice (audio thread) and the engine.
#[derive(Debug, Default)]
pub struct Control {
    /// 0 = keep playing; otherwise `fade_ms + 1`.
    stop: AtomicU32,
    /// Drop at once without a fade (device switch).
    detached: AtomicBool,
    finished: AtomicBool,
    played_frames: AtomicU64,
}

impl Control {
    pub fn request_stop(&self, fade_ms: u32) {
        let _ = self
            .stop
            .compare_exchange(0, fade_ms.saturating_add(1), Ordering::AcqRel, Ordering::Acquire);
    }
    pub fn detach(&self) {
        self.detached.store(true, Ordering::Release);
    }
    pub fn is_finished(&self) -> bool {
        self.finished.load(Ordering::Acquire)
    }
    pub fn is_stopping(&self) -> bool {
        self.stop.load(Ordering::Acquire) != 0
    }
    pub fn played_frames(&self) -> u64 {
        self.played_frames.load(Ordering::Acquire)
    }
}

/// Parameters of a voice.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VoiceParams {
    pub volume: f32,
    pub ramp_seconds: f64,
    pub looped: bool,
    /// Seconds already elapsed on the ramp when this voice starts.
    pub start_seconds: f64,
    /// Frame of the clip to start from.
    pub start_frame: u64,
}

pub struct Voice {
    clip: SharedClip,
    params: VoiceParams,
    ctrl: Arc<Control>,
    pos: usize,
    channel: u16,
    frames: u64,
    gain: f32,
    fade: Option<(u64, u64, f64)>,
    done: bool,
}

impl Voice {
    pub fn new(clip: SharedClip, params: VoiceParams, ctrl: Arc<Control>) -> Self {
        let ch = usize::from(clip.channels.max(1));
        let frames_in_clip = clip.frames().max(1) as u64;
        let start = if params.looped {
            params.start_frame % frames_in_clip
        } else {
            params.start_frame
        };
        let pos = (start as usize).saturating_mul(ch);
        let done = clip.samples.is_empty() || pos >= clip.samples.len();
        Voice {
            clip,
            params,
            ctrl,
            pos,
            channel: 0,
            frames: 0,
            gain: 0.0,
            fade: None,
            done,
        }
    }

    fn finish(&mut self) -> Option<f32> {
        self.done = true;
        self.ctrl.finished.store(true, Ordering::Release);
        None
    }
}

impl Iterator for Voice {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        if self.done {
            return None;
        }
        if self.ctrl.detached.load(Ordering::Relaxed) {
            return self.finish();
        }
        let rate = f64::from(self.clip.rate.max(1));
        if self.channel == 0 {
            if self.fade.is_none() {
                let stop = self.ctrl.stop.load(Ordering::Relaxed);
                if stop != 0 {
                    let fade_ms = f64::from(stop - 1);
                    let len = (fade_ms * rate / 1000.0).round() as u64;
                    self.fade = Some((self.frames, len, fade_ms));
                }
            }
            if self.pos >= self.clip.samples.len() {
                if self.params.looped {
                    self.pos = 0;
                } else {
                    return self.finish();
                }
            }
            let t = self.params.start_seconds + self.frames as f64 / rate;
            let mut g = ramp::gain(t, self.params.volume, self.params.ramp_seconds);
            if let Some((start, len, fade_ms)) = self.fade {
                let into = self.frames - start;
                if into >= len {
                    return self.finish();
                }
                g *= ramp::fade_out(into as f64 * 1000.0 / rate, fade_ms);
            }
            self.gain = g;
        }
        let s = self.clip.samples[self.pos] * self.gain;
        self.pos += 1;
        self.channel += 1;
        if self.channel >= self.clip.channels.max(1) {
            self.channel = 0;
            self.frames += 1;
            self.ctrl.played_frames.store(self.frames, Ordering::Relaxed);
        }
        Some(s)
    }
}

impl Source for Voice {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        self.clip.channels.max(1)
    }
    fn sample_rate(&self) -> u32 {
        self.clip.rate.max(1)
    }
    fn total_duration(&self) -> Option<Duration> {
        None
    }
}
