"""The mixer (TZ 6.1, spec 3.9): sums every sounding voice into one stereo block.

Runs inside the sounddevice callback. Scratch buffers are preallocated and all
maths writes into them (`out=`); the voice table is swapped atomically by the
actor thread, so the callback takes no locks.
"""

from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt

from alarm.actors.audio.decoder import StreamSource
from alarm.actors.audio.synth import SAMPLE_RATE
from alarm.rules.ramp import MIN_LEVEL

BLOCK = 1024
F32 = npt.NDArray[np.float32]


@dataclass(eq=False)
class Voice:
    key: str
    volume: float
    ramp_s: float
    loop: bool
    buffer: F32 | None = None  # built-in sound
    stream: StreamSource | None = None  # file
    pos: int = 0  # frames played from the source
    age: int = 0  # frames since start (drives the ramp)
    fade_total: int = 0  # >0 once stopping
    fade_left: int = 0
    finished: bool = False
    meta: dict[str, int] = field(default_factory=dict[str, int])

    def stop(self, fade_s: float) -> None:
        if self.fade_total == 0:
            self.fade_total = max(1, int(fade_s * SAMPLE_RATE))
            self.fade_left = self.fade_total


class Mixer:
    def __init__(self, block: int = BLOCK) -> None:
        self.voices: tuple[Voice, ...] = ()
        self.frames = 0
        self.block = block
        self._src = np.zeros((block, 2), dtype=np.float32)
        self._gain = np.zeros(block, dtype=np.float32)
        self._tmp = np.zeros(block, dtype=np.float32)
        self._idx = np.arange(block, dtype=np.float32)
        self.peak = 0.0

    # -- actor side (copy-on-write)
    def add(self, voice: Voice) -> None:
        self.voices = (*(v for v in self.voices if v.key != voice.key), voice)

    def remove_finished(self) -> list[Voice]:
        done = [v for v in self.voices if v.finished]
        if done:
            self.voices = tuple(v for v in self.voices if not v.finished)
        return done

    def get(self, key: str) -> Voice | None:
        return next((v for v in self.voices if v.key == key and not v.finished), None)

    # -- callback side
    def render(self, out: F32, frames: int) -> None:
        out[:frames] = 0.0
        for v in self.voices:
            if v.finished:
                continue
            self._mix_voice(v, out, frames)
        np.clip(out[:frames], -1.0, 1.0, out=out[:frames])
        self.frames += frames

    def _mix_voice(self, v: Voice, out: F32, frames: int) -> None:
        src = self._src[:frames]
        got = self._read(v, src, frames)
        g = self._gain[:frames]
        # gain(t) = volume × (0.015 + 0.985 × x²), x = clamp(t / ramp)
        if v.ramp_s > 0:
            ramp_frames = v.ramp_s * SAMPLE_RATE
            np.add(self._idx[:frames], float(v.age), out=g)
            np.multiply(g, 1.0 / ramp_frames, out=g)
            np.clip(g, 0.0, 1.0, out=g)
            np.multiply(g, g, out=g)
            np.multiply(g, (1 - MIN_LEVEL) * v.volume, out=g)
            np.add(g, MIN_LEVEL * v.volume, out=g)
        else:
            g.fill(v.volume)
        if v.fade_total:
            # linear fade from the current level to silence
            t = self._tmp[:frames]
            np.subtract(float(v.fade_left), self._idx[:frames], out=t)
            np.multiply(t, 1.0 / v.fade_total, out=t)
            np.clip(t, 0.0, 1.0, out=t)
            np.multiply(g, t, out=g)
            v.fade_left -= frames
            if v.fade_left <= 0:
                v.finished = True
        np.multiply(src, g[:, None], out=src)
        np.add(out[:frames], src, out=out[:frames])
        v.age += frames
        if got < frames and not v.loop and (v.stream is None or v.stream.finished):
            v.finished = True

    def _read(self, v: Voice, dst: F32, frames: int) -> int:
        if v.stream is not None:
            return v.stream.pull(dst, frames)
        buf = v.buffer
        if buf is None:
            dst[:] = 0.0
            return 0
        n = len(buf)
        filled = 0
        while filled < frames:
            if v.pos >= n:
                if not v.loop:
                    dst[filled:] = 0.0
                    return filled
                v.pos = 0
            take = min(frames - filled, n - v.pos)
            dst[filled : filled + take] = buf[v.pos : v.pos + take]
            v.pos += take
            filled += take
        return filled
