"""Built-in sounds (spec 3.8): a numpy port of alarm/src/shared/audio/tones.ts at 48 kHz.

Each note follows the Web Audio envelope of the reference: silence → linear
attack to `gain` → exponential decay to 0.0001 at `start + dur`, held until the
oscillator stops 50 ms later. Square and triangle waves are band-limited
(additive), like Web Audio oscillators. Rendered once, then cached.
"""

import math
from collections.abc import Callable
from typing import Literal

import numpy as np
import numpy.typing as npt

SAMPLE_RATE = 48_000
MASTER = 0.9
Wave = Literal["sine", "triangle", "square"]
Buffer = npt.NDArray[np.float32]  # (frames, 2)


def hz(midi: int) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def _wave(kind: Wave, freq: float, t: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    phase = 2 * math.pi * freq * t
    if kind == "sine":
        return np.sin(phase)
    out = np.zeros_like(t)
    nyquist = SAMPLE_RATE / 2
    n = 1
    while n * freq < nyquist:
        if kind == "square":
            out += np.sin(n * phase) * (4 / (math.pi * n))
        else:  # triangle
            sign = -1.0 if (n // 2) % 2 else 1.0
            out += sign * np.sin(n * phase) * (8 / (math.pi**2 * n * n))
        n += 2
    return out


def _note(
    mono: npt.NDArray[np.float64],
    freq: float,
    start: float,
    dur: float,
    kind: Wave = "sine",
    gain: float = 0.3,
    attack: float = 0.01,
) -> None:
    stop = start + dur + 0.05
    i0 = round(start * SAMPLE_RATE)
    i1 = min(len(mono), round(stop * SAMPLE_RATE))
    if i0 >= i1:
        return
    t = np.arange(i0, i1, dtype=np.float64) / SAMPLE_RATE
    env = np.empty_like(t)
    rel = t - start
    a = rel < attack
    env[a] = gain * rel[a] / attack
    d = (rel >= attack) & (rel < dur)
    span = max(1e-9, dur - attack)
    env[d] = gain * (0.0001 / gain) ** ((rel[d] - attack) / span)
    env[rel >= dur] = 0.0001
    mono[i0:i1] += _wave(kind, freq, t) * env


def _bell(mono: npt.NDArray[np.float64], freq: float, start: float, dur: float, gain: float = 0.25) -> None:
    for ratio, amp, decay in ((1, 1, 1), (2, 0.5, 0.7), (2.76, 0.35, 0.5), (5.4, 0.15, 0.3)):
        _note(mono, freq * ratio, start, dur * decay, gain=gain * amp, attack=0.005)


def _sunrise(m: npt.NDArray[np.float64]) -> None:
    for i, midi in enumerate((72, 76, 79, 84, 79, 76)):
        _bell(m, hz(midi), i * 0.4, 2.2, 0.22)
    for i, midi in enumerate((67, 71, 74)):
        _bell(m, hz(midi + 12), 2.6 + i * 0.35, 1.8, 0.16)


def _harp(m: npt.NDArray[np.float64]) -> None:
    for i, midi in enumerate((60, 64, 67, 71, 72, 76, 79, 83)):
        _note(m, hz(midi), i * 0.11, 1.9, "triangle", 0.22)
    for i, midi in enumerate((84, 79, 76)):
        _note(m, hz(midi), 1.5 + i * 0.18, 1.4, "triangle", 0.18)


def _chimes(m: npt.NDArray[np.float64]) -> None:
    for midi, t in ((79, 0), (76, 0.45), (72, 0.9), (74, 1.35), (81, 1.95), (79, 2.4)):
        _bell(m, hz(midi), t, 1.1, 0.2)


def _beacon(m: npt.NDArray[np.float64]) -> None:
    for i in range(4):
        _note(m, 1046.5, i * 0.16, 0.12, gain=0.32, attack=0.004)
        _note(m, 1568, i * 0.16, 0.1, gain=0.08, attack=0.004)


def _pulse(m: npt.NDArray[np.float64]) -> None:
    for i in range(3):
        _note(m, 1000, i * 0.2, 0.12, "square", 0.12, 0.002)


def _classic(m: npt.NDArray[np.float64]) -> None:
    for i in range(24):
        _bell(m, 1760 if i % 2 else 1975.5, i * 0.05, 0.18, 0.12)


PATTERNS: dict[str, tuple[float, Callable[[npt.NDArray[np.float64]], None]]] = {
    "sunrise": (4.8, _sunrise),
    "harp": (3.2, _harp),
    "chimes": (3.6, _chimes),
    "beacon": (2.0, _beacon),
    "pulse": (1.6, _pulse),
    "classic": (2.0, _classic),
}

_cache: dict[str, Buffer] = {}


def render(sound_id: str) -> Buffer:
    """Stereo float32 loop buffer for a built-in sound (unknown ids → Sunrise)."""
    sid = sound_id if sound_id in PATTERNS else "sunrise"
    cached = _cache.get(sid)
    if cached is not None:
        return cached
    length, fn = PATTERNS[sid]
    mono = np.zeros(math.ceil(SAMPLE_RATE * length), dtype=np.float64)
    fn(mono)
    mono *= MASTER
    buf = np.ascontiguousarray(np.repeat(mono[:, None], 2, axis=1).astype(np.float32))
    buf.setflags(write=False)
    _cache[sid] = buf
    return buf


def render_all() -> dict[str, Buffer]:
    return {sid: render(sid) for sid in PATTERNS}
