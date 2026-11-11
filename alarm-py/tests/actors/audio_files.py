"""Make small audio files in every supported container with PyAV (test fixtures)."""

from fractions import Fraction
from pathlib import Path

import av
import numpy as np

FORMATS: dict[str, tuple[str, str, str]] = {
    # ext: (container, codec, sample format)
    "wav": ("wav", "pcm_s16le", "s16"),
    "mp3": ("mp3", "libmp3lame", "fltp"),
    "m4a": ("ipod", "aac", "fltp"),
    "aac": ("adts", "aac", "fltp"),
    "ogg": ("ogg", "libopus", "flt"),
    "oga": ("ogg", "flac", "s16"),
    "opus": ("opus", "libopus", "flt"),
    "flac": ("flac", "flac", "s16"),
    "webm": ("webm", "libopus", "flt"),
}


def tone(seconds: float, rate: int = 48_000, freq: float = 440.0) -> np.ndarray:
    t = np.arange(int(seconds * rate)) / rate
    return (0.5 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def write(path: Path, seconds: float = 0.5, rate: int = 48_000) -> Path:
    container, codec, fmt = FORMATS[path.suffix[1:]]
    mono = tone(seconds, rate)
    with av.open(str(path), "w", format=container) as out:
        stream = out.add_stream(codec, rate=rate)
        stream.layout = "stereo"  # type: ignore[attr-defined]
        stream.time_base = Fraction(1, rate)  # type: ignore[attr-defined]
        frame_size = 960 if codec == "libopus" else 1024
        pts = 0
        for i in range(0, len(mono), frame_size):
            chunk = mono[i : i + frame_size]
            if len(chunk) < frame_size:
                chunk = np.pad(chunk, (0, frame_size - len(chunk)))
            stereo = np.stack([chunk, chunk])
            if fmt == "s16":
                data = (stereo * 32767).astype(np.int16).T.reshape(1, -1)
            elif fmt == "flt":
                data = stereo.T.reshape(1, -1)
            else:
                data = stereo
            frame = av.AudioFrame.from_ndarray(data, format=fmt, layout="stereo")
            frame.sample_rate = rate
            frame.pts = pts
            pts += frame_size
            for packet in stream.encode(frame):  # type: ignore[attr-defined]
                out.mux(packet)
        for packet in stream.encode(None):  # type: ignore[attr-defined]
            out.mux(packet)
    return path
