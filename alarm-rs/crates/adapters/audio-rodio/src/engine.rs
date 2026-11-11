//! The audio thread: owns the output device, mixes voices, reopens the default device
//! when it changes or disappears and re-attaches the sounds that were playing.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use app::ports::{PlayRequest, PlaybackId, SoundSource};
use domain::model::BuiltinSound;
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::dynamic_mixer::{self, DynamicMixerController};
use rodio::{OutputStream, OutputStreamHandle, Source};

use crate::clip::SharedClip;
use crate::voice::{Control, Voice, VoiceParams};
use crate::{decode, synth};

pub enum Cmd {
    Play(PlaybackId, PlayRequest),
    Stop(PlaybackId, u32),
    Loaded {
        id: PlaybackId,
        generation: u64,
        request: PlayRequest,
        clip: Option<SharedClip>,
    },
    Shutdown,
}

struct Active {
    clip: SharedClip,
    params: VoiceParams,
    ctrl: Arc<Control>,
}

/// Where voices go: a real device or a silent mixer pumped in real time.
enum Output {
    Device {
        _stream: OutputStream,
        handle: OutputStreamHandle,
        name: Option<String>,
    },
    Silent {
        mixer: Arc<DynamicMixerController<f32>>,
    },
    Missing,
}

impl Output {
    fn add(&self, voice: Voice) -> bool {
        match self {
            Output::Device { handle, .. } => handle.play_raw(voice.convert_samples()).is_ok(),
            Output::Silent { mixer } => {
                mixer.add(voice);
                true
            }
            Output::Missing => false,
        }
    }
}

fn default_device_name() -> Option<String> {
    rodio::cpal::default_host()
        .default_output_device()
        .and_then(|d| d.name().ok())
}

fn open_device() -> Output {
    match OutputStream::try_default() {
        Ok((stream, handle)) => Output::Device {
            _stream: stream,
            handle,
            name: default_device_name(),
        },
        Err(err) => {
            log::warn!("no audio output device: {err}");
            Output::Missing
        }
    }
}

/// A mixer that is consumed at real-time pace and thrown away: nothing is audible.
fn open_silent(stop: Arc<AtomicBool>) -> Output {
    let (controller, mut mixer) = dynamic_mixer::mixer::<f32>(2, synth::SAMPLE_RATE);
    thread::Builder::new()
        .name("alarm-audio-silent".into())
        .spawn(move || {
            let chunk = (synth::SAMPLE_RATE as usize / 100) * 2; // 10 ms of stereo
            while !stop.load(Ordering::Acquire) {
                for _ in 0..chunk {
                    let _ = mixer.next();
                }
                thread::sleep(Duration::from_millis(10));
            }
        })
        .ok();
    Output::Silent { mixer: controller }
}

pub struct Engine {
    pub tx: Sender<Cmd>,
    rx: Receiver<Cmd>,
    silent: bool,
    on_preview_ended: Box<dyn Fn() + Send + Sync>,
    stop_flag: Arc<AtomicBool>,
}

impl Engine {
    pub fn new(
        tx: Sender<Cmd>,
        rx: Receiver<Cmd>,
        silent: bool,
        on_preview_ended: Box<dyn Fn() + Send + Sync>,
        stop_flag: Arc<AtomicBool>,
    ) -> Self {
        Engine {
            tx,
            rx,
            silent,
            on_preview_ended,
            stop_flag,
        }
    }

    fn load(&self, id: PlaybackId, generation: u64, request: PlayRequest) {
        let tx = self.tx.clone();
        let source = request.source.clone();
        thread::Builder::new()
            .name("alarm-audio-load".into())
            .spawn(move || {
                let clip = match &source {
                    SoundSource::Builtin(b) => Some(synth::builtin(*b)),
                    SoundSource::File(path) => match decode::decode(&PathBuf::from(path), None) {
                        Ok(c) => Some(Arc::new(c)),
                        Err(err) => {
                            log::warn!("cannot play {path}: {err}; falling back to Sunrise");
                            None
                        }
                    },
                };
                let _ = tx.send(Cmd::Loaded {
                    id,
                    generation,
                    request,
                    clip,
                });
            })
            .ok();
    }

    pub fn run(self) {
        let mut output = if self.silent {
            open_silent(self.stop_flag.clone())
        } else {
            open_device()
        };
        let mut active: BTreeMap<PlaybackId, Active> = BTreeMap::new();
        let mut pending: BTreeMap<PlaybackId, u64> = BTreeMap::new();
        let mut generation = 0u64;
        let mut last_poll = Instant::now();
        loop {
            match self.rx.recv_timeout(Duration::from_millis(50)) {
                Ok(Cmd::Play(id, request)) => {
                    generation += 1;
                    if let Some(a) = active.remove(&id) {
                        a.ctrl.request_stop(domain::ramp::FADE_STOP_MS);
                    }
                    pending.insert(id.clone(), generation);
                    self.load(id, generation, request);
                }
                Ok(Cmd::Loaded {
                    id,
                    generation: g,
                    request,
                    clip,
                }) => {
                    if pending.get(&id) != Some(&g) {
                        continue;
                    }
                    pending.remove(&id);
                    let clip = clip.unwrap_or_else(|| synth::builtin(BuiltinSound::Sunrise));
                    let params = VoiceParams {
                        volume: request.volume,
                        ramp_seconds: f64::from(request.ramp_seconds),
                        looped: request.looped,
                        start_seconds: request.elapsed_seconds,
                        start_frame: if request.looped {
                            (request.elapsed_seconds * f64::from(clip.rate)) as u64
                        } else {
                            0
                        },
                    };
                    let ctrl = Arc::new(Control::default());
                    if !output.add(Voice::new(clip.clone(), params, ctrl.clone())) {
                        log::warn!("no output device; {id:?} is silent until one appears");
                    }
                    active.insert(id, Active { clip, params, ctrl });
                }
                Ok(Cmd::Stop(id, fade)) => {
                    pending.remove(&id);
                    if let Some(a) = active.remove(&id) {
                        a.ctrl.request_stop(fade);
                    }
                }
                Ok(Cmd::Shutdown) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {}
            }

            // Sounds that ended on their own (one-shot previews).
            let ended: Vec<PlaybackId> = active
                .iter()
                .filter(|(_, a)| a.ctrl.is_finished())
                .map(|(id, _)| id.clone())
                .collect();
            for id in ended {
                active.remove(&id);
                if id == PlaybackId::Preview {
                    (self.on_preview_ended)();
                }
            }

            // Default device changed or disappeared: reopen and re-attach.
            if !self.silent && last_poll.elapsed() >= Duration::from_secs(1) {
                last_poll = Instant::now();
                let current = default_device_name();
                let stale = match &output {
                    Output::Device { name, .. } => *name != current,
                    Output::Missing => current.is_some(),
                    Output::Silent { .. } => false,
                };
                if stale {
                    log::info!("audio output changed to {current:?}; reopening");
                    for a in active.values_mut() {
                        let played = a.ctrl.played_frames();
                        a.ctrl.detach();
                        a.params.start_frame += played;
                        a.params.start_seconds += played as f64 / f64::from(a.clip.rate.max(1));
                        a.ctrl = Arc::new(Control::default());
                    }
                    drop(std::mem::replace(&mut output, Output::Missing));
                    output = open_device();
                    for a in active.values() {
                        output.add(Voice::new(a.clip.clone(), a.params, a.ctrl.clone()));
                    }
                }
            }
        }
        for a in active.values() {
            a.ctrl.request_stop(domain::ramp::FADE_STOP_MS);
        }
        // Let the fades finish before the device closes.
        thread::sleep(Duration::from_millis(u64::from(domain::ramp::FADE_STOP_MS) + 30));
        self.stop_flag.store(true, Ordering::Release);
    }
}
