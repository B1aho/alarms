//! Built-in sounds, ported from `alarm/src/shared/audio/tones.ts` (ALARM_SPEC 3.8):
//! oscillators with Web Audio envelopes (linear attack, exponential decay to 0.0001),
//! rendered once at 48 kHz into loopable clips.

use std::collections::HashMap;
use std::f64::consts::PI;
use std::sync::{Arc, Mutex, OnceLock};

use domain::model::BuiltinSound;

use crate::clip::{Clip, SharedClip};

pub const SAMPLE_RATE: u32 = 48_000;
const MASTER_GAIN: f64 = 0.9;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Wave {
    Sine,
    Triangle,
    Square,
}

#[derive(Clone, Copy, Debug)]
struct Note {
    freq: f64,
    start: f64,
    dur: f64,
    wave: Wave,
    gain: f64,
    attack: f64,
}

fn note(freq: f64, start: f64, dur: f64) -> Note {
    Note {
        freq,
        start,
        dur,
        wave: Wave::Sine,
        gain: 0.3,
        attack: 0.01,
    }
}

/// Bell: partials ×1, ×2, ×2.76, ×5.4, amplitudes 1, .5, .35, .15, decays 100/70/50/30 %.
fn bell(out: &mut Vec<Note>, freq: f64, start: f64, dur: f64, gain: f64) {
    for (ratio, amp, decay) in [(1.0, 1.0, 1.0), (2.0, 0.5, 0.7), (2.76, 0.35, 0.5), (5.4, 0.15, 0.3)] {
        out.push(Note {
            gain: gain * amp,
            attack: 0.005,
            ..note(freq * ratio, start, dur * decay)
        });
    }
}

fn hz(midi: i32) -> f64 {
    440.0 * 2f64.powf(f64::from(midi - 69) / 12.0)
}

/// Loop length in milliseconds and the notes of a pattern.
fn pattern(sound: BuiltinSound) -> (u32, Vec<Note>) {
    let mut n = Vec::new();
    let len = match sound {
        BuiltinSound::Sunrise => {
            for (i, m) in [72, 76, 79, 84, 79, 76].into_iter().enumerate() {
                bell(&mut n, hz(m), i as f64 * 0.4, 2.2, 0.22);
            }
            for (i, m) in [67, 71, 74].into_iter().enumerate() {
                bell(&mut n, hz(m + 12), 2.6 + i as f64 * 0.35, 1.8, 0.16);
            }
            4800
        }
        BuiltinSound::Harp => {
            for (i, m) in [60, 64, 67, 71, 72, 76, 79, 83].into_iter().enumerate() {
                n.push(Note {
                    wave: Wave::Triangle,
                    gain: 0.22,
                    ..note(hz(m), i as f64 * 0.11, 1.9)
                });
            }
            for (i, m) in [84, 79, 76].into_iter().enumerate() {
                n.push(Note {
                    wave: Wave::Triangle,
                    gain: 0.18,
                    ..note(hz(m), 1.5 + i as f64 * 0.18, 1.4)
                });
            }
            3200
        }
        BuiltinSound::Chimes => {
            for (m, t) in [(79, 0.0), (76, 0.45), (72, 0.9), (74, 1.35), (81, 1.95), (79, 2.4)] {
                bell(&mut n, hz(m), t, 1.1, 0.2);
            }
            3600
        }
        BuiltinSound::Beacon => {
            for i in 0..4 {
                let t = f64::from(i) * 0.16;
                n.push(Note {
                    gain: 0.32,
                    attack: 0.004,
                    ..note(1046.5, t, 0.12)
                });
                n.push(Note {
                    gain: 0.08,
                    attack: 0.004,
                    ..note(1568.0, t, 0.1)
                });
            }
            2000
        }
        BuiltinSound::Pulse => {
            for i in 0..3 {
                n.push(Note {
                    wave: Wave::Square,
                    gain: 0.12,
                    attack: 0.002,
                    ..note(1000.0, f64::from(i) * 0.2, 0.12)
                });
            }
            1600
        }
        BuiltinSound::Classic => {
            for i in 0..24 {
                let f = if i % 2 == 1 { 1760.0 } else { 1975.5 };
                bell(&mut n, f, f64::from(i) * 0.05, 0.18, 0.12);
            }
            2000
        }
    };
    (len, n)
}

/// Web Audio envelope: 0 at `start`, linear to `gain` at `start + attack`,
/// exponential to 0.0001 at `start + dur`, then held; the oscillator stops at `start + dur + 0.05`.
fn envelope(n: &Note, t: f64) -> f64 {
    let t0 = n.start + n.attack;
    let t1 = n.start + n.dur;
    if t < n.start || t > t1 + 0.05 {
        0.0
    } else if t < t0 {
        n.gain * (t - n.start) / n.attack
    } else if t < t1 {
        n.gain * (0.0001 / n.gain).powf((t - t0) / (t1 - t0))
    } else {
        0.0001
    }
}

/// Band-limited oscillators (like Web Audio's periodic waves): harmonics below Nyquist only.
fn osc(wave: Wave, freq: f64, phase_t: f64) -> f64 {
    let x = 2.0 * PI * freq * phase_t;
    let nyquist = f64::from(SAMPLE_RATE) / 2.0;
    match wave {
        Wave::Sine => x.sin(),
        Wave::Square => {
            let mut s = 0.0;
            let mut k = 1.0;
            while k * freq < nyquist {
                s += (k * x).sin() / k;
                k += 2.0;
            }
            s * 4.0 / PI
        }
        Wave::Triangle => {
            let mut s = 0.0;
            let mut k = 1.0;
            let mut sign = 1.0;
            while k * freq < nyquist {
                s += sign * (k * x).sin() / (k * k);
                sign = -sign;
                k += 2.0;
            }
            s * 8.0 / (PI * PI)
        }
    }
}

/// Render a pattern into a mono clip of exactly the loop length.
pub fn render(sound: BuiltinSound) -> Clip {
    let (len_ms, notes) = pattern(sound);
    let frames = (len_ms as usize) * (SAMPLE_RATE as usize) / 1000;
    let mut buf = vec![0f64; frames];
    let rate = f64::from(SAMPLE_RATE);
    for n in &notes {
        let first = ((n.start * rate).floor() as usize).min(frames);
        let last = (((n.start + n.dur + 0.05) * rate).ceil() as usize).min(frames);
        for (i, s) in buf.iter_mut().enumerate().take(last).skip(first) {
            let t = i as f64 / rate;
            *s += osc(n.wave, n.freq, t - n.start) * envelope(n, t);
        }
    }
    Clip {
        rate: SAMPLE_RATE,
        channels: 1,
        samples: buf.into_iter().map(|s| (s * MASTER_GAIN) as f32).collect(),
    }
}

/// Rendered once per process.
pub fn builtin(sound: BuiltinSound) -> SharedClip {
    static CACHE: OnceLock<Mutex<HashMap<BuiltinSound, SharedClip>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some(c) = cache.lock().unwrap_or_else(|p| p.into_inner()).get(&sound) {
        return c.clone();
    }
    let clip = Arc::new(render(sound));
    cache
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(sound, clip.clone());
    clip
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_matches_web_audio() {
        let n = Note {
            freq: 440.0,
            start: 1.0,
            dur: 2.0,
            wave: Wave::Sine,
            gain: 0.5,
            attack: 0.01,
        };
        assert_eq!(envelope(&n, 0.5), 0.0);
        assert!((envelope(&n, 1.005) - 0.25).abs() < 1e-9);
        assert!((envelope(&n, 1.01) - 0.5).abs() < 1e-9);
        assert!((envelope(&n, 3.0) - 0.0001).abs() < 1e-9);
        assert_eq!(envelope(&n, 3.2), 0.0);
    }

    #[test]
    fn band_limited_square_is_close_to_square() {
        // Mid-period samples of a 1 kHz square are ±1 (Gibbs ripple aside).
        assert!((osc(Wave::Square, 1000.0, 0.00025) - 1.0).abs() < 0.1);
        assert!((osc(Wave::Square, 1000.0, 0.00075) + 1.0).abs() < 0.1);
        assert!((osc(Wave::Triangle, 100.0, 0.0025) - 1.0).abs() < 0.01);
    }
}
