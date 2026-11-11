//! Rendering without a device: ramp curve, loop lengths, fades, decoding of every format.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use app::ports::{AudioOut, PlayRequest, PlaybackId, SoundSource};
use audio_rodio::clip::Clip;
use audio_rodio::voice::{Control, Voice, VoiceParams};
use audio_rodio::{RodioAudio, decode, render, synth};
use domain::model::BuiltinSound;

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

fn constant(rate: u32, frames: usize) -> Arc<Clip> {
    Arc::new(Clip {
        rate,
        channels: 1,
        samples: vec![1.0; frames],
    })
}

fn params(volume: f32, ramp: f64, looped: bool) -> VoiceParams {
    VoiceParams {
        volume,
        ramp_seconds: ramp,
        looped,
        start_seconds: 0.0,
        start_frame: 0,
    }
}

#[test]
fn builtin_loop_lengths_match_spec() {
    let expected = [
        (BuiltinSound::Sunrise, 4.8),
        (BuiltinSound::Harp, 3.2),
        (BuiltinSound::Chimes, 3.6),
        (BuiltinSound::Beacon, 2.0),
        (BuiltinSound::Pulse, 1.6),
        (BuiltinSound::Classic, 2.0),
    ];
    for (sound, seconds) in expected {
        let clip = synth::builtin(sound);
        assert_eq!(clip.rate, 48_000);
        assert_eq!(clip.frames(), (seconds * 48_000.0_f64).round() as usize, "{sound:?}");
        let peak = clip.samples.iter().fold(0f32, |m, s| m.max(s.abs()));
        assert!(peak > 0.05 && peak <= 1.0, "{sound:?} peak {peak}");
    }
}

#[test]
fn patterns_have_sound_where_the_spec_says() {
    let rms = |clip: &Clip, from: f64, to: f64| {
        let a = (from * 48_000.0) as usize;
        let b = (to * 48_000.0) as usize;
        let s = &clip.samples[a..b];
        (s.iter().map(|x| x * x).sum::<f32>() / s.len() as f32).sqrt()
    };
    // Beacon: 4 beeps within 0.6 s, then silence until 2.0 s.
    let beacon = synth::builtin(BuiltinSound::Beacon);
    assert!(rms(&beacon, 0.0, 0.1) > 0.05);
    assert!(rms(&beacon, 0.8, 2.0) < 1e-3);
    // Pulse: beeps at 0, 0.2, 0.4 s, silent gaps between.
    let pulse = synth::builtin(BuiltinSound::Pulse);
    assert!(rms(&pulse, 0.002, 0.02) > 0.02);
    assert!(rms(&pulse, 0.202, 0.22) > 0.02);
    assert!(rms(&pulse, 0.18, 0.199) < 1e-3);
    assert!(rms(&pulse, 0.7, 1.6) < 1e-3);
}

#[test]
fn ramp_follows_the_curve() {
    let rate = 1000;
    let voice = Voice::new(
        constant(rate, 100),
        params(0.8, 10.0, true),
        Arc::new(Control::default()),
    );
    let out = render(voice, 12 * rate as usize);
    for t in [0.0, 1.0, 2.5, 5.0, 7.5, 9.999, 11.0] {
        let i = (t * f64::from(rate)) as usize;
        let expected = domain::ramp::gain(i as f64 / f64::from(rate), 0.8, 10.0);
        assert!((out[i] - expected).abs() < 1e-5, "t={t}: {} vs {expected}", out[i]);
    }
    assert!((out[0] - 0.8 * 0.015).abs() < 1e-6);
    assert!((out[11 * rate as usize] - 0.8).abs() < 1e-6);
}

#[test]
fn ramp_off_is_full_volume_at_once() {
    let out = render(
        Voice::new(constant(1000, 10), params(0.6, 0.0, true), Arc::new(Control::default())),
        5,
    );
    assert!(out.iter().all(|s| (s - 0.6).abs() < 1e-6));
}

#[test]
fn restored_ring_continues_the_ramp() {
    let mut p = params(1.0, 60.0, true);
    p.start_seconds = 30.0;
    let out = render(Voice::new(constant(1000, 10), p, Arc::new(Control::default())), 1);
    assert!((out[0] - domain::ramp::gain(30.0, 1.0, 60.0)).abs() < 1e-6);
}

fn fade_frames(fade_ms: u32) -> usize {
    let ctrl = Arc::new(Control::default());
    let mut voice = Voice::new(constant(48_000, 4800), params(1.0, 0.0, true), ctrl.clone());
    for _ in 0..10_000 {
        voice.next();
    }
    ctrl.request_stop(fade_ms);
    let rest: Vec<f32> = voice.collect();
    assert!(ctrl.is_finished());
    // Linear: starts at full volume, halfway at half.
    assert!((rest[0] - 1.0).abs() < 1e-3);
    assert!((rest[rest.len() / 2] - 0.5).abs() < 0.01);
    rest.len()
}

#[test]
fn stop_fades_out_in_120_and_250_ms() {
    assert_eq!(fade_frames(domain::ramp::FADE_STOP_MS), 5760);
    assert_eq!(fade_frames(domain::ramp::FADE_DISMISS_MS), 12_000);
}

#[test]
fn loops_until_stopped_and_one_shot_ends() {
    let looped = render(
        Voice::new(constant(1000, 10), params(1.0, 0.0, true), Arc::new(Control::default())),
        1000,
    );
    assert_eq!(looped.len(), 1000);
    let ctrl = Arc::new(Control::default());
    let once = render(
        Voice::new(constant(1000, 10), params(1.0, 0.0, false), ctrl.clone()),
        1000,
    );
    assert_eq!(once.len(), 10);
    assert!(ctrl.is_finished());
}

/// Frequency from zero crossings in the middle of the clip (first channel).
fn frequency(clip: &Clip) -> f64 {
    let ch = usize::from(clip.channels);
    let mono: Vec<f32> = clip.samples.iter().step_by(ch).copied().collect();
    let (a, b) = (mono.len() / 4, mono.len() * 3 / 4);
    let crossings = mono[a..b].windows(2).filter(|w| w[0] <= 0.0 && w[1] > 0.0).count();
    crossings as f64 / ((b - a) as f64 / f64::from(clip.rate))
}

#[test]
fn every_format_decodes() {
    for (file, seconds) in [
        ("tone.wav", 0.25),
        ("tone.mp3", 1.0),
        ("tone.m4a", 1.0),
        ("tone.aac", 1.0),
        ("tone.ogg", 1.0),
        ("tone.oga", 1.0),
        ("tone.flac", 1.0),
        ("tone.mkv", 1.0),
        ("tone.opus", 1.0),
        ("tone-opus-in-ogg.oga", 1.0),
        ("tone.webm", 1.0),
    ] {
        let path = fixture(file);
        let clip = decode::decode(&path, None).unwrap_or_else(|e| panic!("{file}: {e}"));
        assert!((clip.seconds() - seconds).abs() < 0.1, "{file}: {} s", clip.seconds());
        let peak = clip.samples.iter().fold(0f32, |m, s| m.max(s.abs()));
        let f = frequency(&clip);
        eprintln!(
            "{file}: {} Hz, {} ch, {} s, peak {peak}",
            clip.rate,
            clip.channels,
            clip.seconds()
        );
        assert!((f - 440.0).abs() < 10.0, "{file}: {f} Hz");
        assert!(decode::probe(&path), "{file}");
    }
}

#[test]
fn non_audio_fails_the_probe() {
    assert!(!decode::probe(&fixture("notes.mp3")));
    assert!(!decode::probe(Path::new("/nonexistent/file.mp3")));
}

#[test]
fn silent_engine_reports_the_end_of_a_one_shot_preview() {
    let ended = Arc::new(AtomicUsize::new(0));
    let e = ended.clone();
    let audio = RodioAudio::silent(Box::new(move || {
        e.fetch_add(1, Ordering::SeqCst);
    }));
    let request = |path: &Path, looped: bool| PlayRequest {
        source: SoundSource::File(path.to_string_lossy().into_owned()),
        volume: 0.9,
        ramp_seconds: 0,
        looped,
        elapsed_seconds: 0.0,
    };
    audio.play(PlaybackId::Preview, request(&fixture("tone.wav"), false));
    // A looping alarm does not end by itself; stopping it is not a "preview ended".
    audio.play(PlaybackId::Alarm("a".into()), request(&fixture("tone.wav"), true));
    let deadline = Instant::now() + Duration::from_secs(3);
    while ended.load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(ended.load(Ordering::SeqCst), 1);
    audio.stop(&PlaybackId::Alarm("a".into()), 120);
    audio.play(PlaybackId::Preview, request(&fixture("tone.wav"), true));
    audio.stop(&PlaybackId::Preview, 120);
    std::thread::sleep(Duration::from_millis(500));
    assert_eq!(ended.load(Ordering::SeqCst), 1);
    assert!(audio.probe(fixture("tone.flac").to_str().unwrap()));
}
