//! Decoding user files into memory: symphonia for MP3, AAC/M4A, WAV, OGG Vorbis, FLAC,
//! WEBM/MKV; libopus (`audiopus`) for Opus in Ogg and WebM/Matroska (ALARM_SPEC 3.8).

use std::fs::File;
use std::path::Path;

use audiopus::coder::Decoder as OpusDecoder;
use audiopus::{Channels, SampleRate};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{CODEC_TYPE_NULL, CODEC_TYPE_OPUS, DecoderOptions};
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::clip::Clip;

/// Opus always decodes at 48 kHz.
const OPUS_RATE: u32 = 48_000;
/// Largest Opus frame: 120 ms at 48 kHz.
const OPUS_MAX_FRAME: usize = 5760;

#[derive(Debug)]
pub struct DecodeError(pub String);

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

fn e(x: impl std::fmt::Display) -> DecodeError {
    DecodeError(x.to_string())
}

fn open(path: &Path) -> Result<(Box<dyn FormatReader>, u32), DecodeError> {
    let file = File::open(path).map_err(e)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|x| x.to_str()) {
        hint.with_extension(&ext.to_ascii_lowercase());
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions {
                enable_gapless: true,
                ..Default::default()
            },
            &MetadataOptions::default(),
        )
        .map_err(e)?;
    let format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| {
            let c = &t.codec_params;
            (c.codec != CODEC_TYPE_NULL && c.sample_rate.is_some()) || c.codec == CODEC_TYPE_OPUS
        })
        .ok_or_else(|| DecodeError("no audio track".into()))?;
    let id = track.id;
    Ok((format, id))
}

/// Decode up to `max_frames` frames (`None` = the whole file). Stereo at most.
pub fn decode(path: &Path, max_frames: Option<usize>) -> Result<Clip, DecodeError> {
    let (mut format, track_id) = open(path)?;
    let params = format
        .tracks()
        .iter()
        .find(|t| t.id == track_id)
        .map(|t| t.codec_params.clone())
        .ok_or_else(|| e("track"))?;
    if params.codec == CODEC_TYPE_OPUS {
        return decode_opus(format, track_id, &params, max_frames);
    }
    let mut decoder = symphonia::default::get_codecs()
        .make(&params, &DecoderOptions::default())
        .map_err(e)?;
    let mut rate = params.sample_rate.unwrap_or(44_100);
    let mut out: Vec<f32> = Vec::new();
    let mut out_channels: u16 = 0;
    let mut frames = 0usize;
    let mut errors = 0;
    loop {
        if max_frames.is_some_and(|m| frames >= m) {
            break;
        }
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymError::IoError(err)) if err.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymError::ResetRequired) => break,
            Err(err) => return finish(out, rate, out_channels, frames, Some(err.to_string())),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(SymError::DecodeError(err)) => {
                errors += 1;
                if errors > 50 {
                    return Err(e(err));
                }
                continue;
            }
            Err(err) => return finish(out, rate, out_channels, frames, Some(err.to_string())),
        };
        let spec = *decoded.spec();
        rate = spec.rate;
        let src_channels = spec.channels.count();
        if decoded.frames() == 0 {
            continue;
        }
        let mut buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buf.copy_interleaved_ref(decoded);
        let keep = src_channels.clamp(1, 2);
        out_channels = keep as u16;
        for frame in buf.samples().chunks(src_channels.max(1)) {
            out.extend_from_slice(&frame[..keep.min(frame.len())]);
            frames += 1;
        }
    }
    finish(out, rate, out_channels, frames, None)
}

fn finish(out: Vec<f32>, rate: u32, channels: u16, frames: usize, err: Option<String>) -> Result<Clip, DecodeError> {
    if frames == 0 || channels == 0 {
        return Err(DecodeError(err.unwrap_or_else(|| "no audio decoded".into())));
    }
    Ok(Clip {
        rate,
        channels,
        samples: out,
    })
}

/// `OpusHead`: channel count (byte 9) and pre-skip (bytes 10–11, little endian).
fn opus_head(extra: Option<&[u8]>) -> (Option<usize>, Option<u32>) {
    match extra {
        Some(b) if b.len() >= 12 && &b[..8] == b"OpusHead" => (
            Some(usize::from(b[9])),
            Some(u32::from(u16::from_le_bytes([b[10], b[11]]))),
        ),
        _ => (None, None),
    }
}

fn decode_opus(
    mut format: Box<dyn FormatReader>,
    track_id: u32,
    params: &symphonia::core::codecs::CodecParameters,
    max_frames: Option<usize>,
) -> Result<Clip, DecodeError> {
    let (head_channels, head_skip) = opus_head(params.extra_data.as_deref());
    let channels = params
        .channels
        .map(|c| c.count())
        .or(head_channels)
        .unwrap_or(2)
        .clamp(1, 2);
    let mut skip = params.delay.or(head_skip).unwrap_or(0) as usize;
    let mut decoder = OpusDecoder::new(
        SampleRate::Hz48000,
        if channels == 1 {
            Channels::Mono
        } else {
            Channels::Stereo
        },
    )
    .map_err(e)?;
    let mut buf = vec![0f32; OPUS_MAX_FRAME * channels];
    let mut out = Vec::new();
    let mut frames = 0usize;
    let mut errors = 0;
    loop {
        if max_frames.is_some_and(|m| frames >= m) {
            break;
        }
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymError::IoError(err)) if err.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(_) => break,
        };
        if packet.track_id() != track_id || packet.data.is_empty() {
            continue;
        }
        let n = match decoder.decode_float(Some(&packet.data[..]), &mut buf[..], false) {
            Ok(n) => n,
            Err(err) => {
                errors += 1;
                if errors > 50 {
                    return Err(e(err));
                }
                continue;
            }
        };
        let drop = skip.min(n);
        skip -= drop;
        out.extend_from_slice(&buf[drop * channels..n * channels]);
        frames += n - drop;
    }
    finish(out, OPUS_RATE, channels as u16, frames, None)
}

/// Trial decode of the first ~0.5 s.
pub fn probe(path: &Path) -> bool {
    match decode(path, Some(24_000)) {
        Ok(c) => c.frames() > 0,
        Err(err) => {
            log::info!("probe failed for {}: {err}", path.display());
            false
        }
    }
}
