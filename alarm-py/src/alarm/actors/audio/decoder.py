"""Streaming decoder (TZ 6.1): PyAV fills a ring buffer ~2 s ahead; loops at end of file.

Files are never decoded whole into memory. One producer thread per stream; the
audio callback is the only consumer and never blocks.
"""

import logging
import threading

import av
import numpy as np
import numpy.typing as npt

from alarm.actors.audio.synth import SAMPLE_RATE

log = logging.getLogger("alarm.audio.decoder")

AHEAD_FRAMES = 2 * SAMPLE_RATE


def _resampler() -> av.AudioResampler:
    return av.AudioResampler(format="flt", layout="stereo", rate=SAMPLE_RATE)


def _frames(path: str, resampler: av.AudioResampler):  # type: ignore[no-untyped-def]
    with av.open(path) as container:
        stream = next(s for s in container.streams if s.type == "audio")
        for packet in container.demux(stream):
            for frame in packet.decode():
                for out in resampler.resample(frame):  # type: ignore[arg-type]
                    yield out.to_ndarray().reshape(-1, 2)
        for out in resampler.resample(None):
            yield out.to_ndarray().reshape(-1, 2)


def probe(path: str) -> bool:
    """Can PyAV decode audio from this file? Decodes a little, not the whole file."""
    try:
        got = 0
        for chunk in _frames(path, _resampler()):
            got += len(chunk)
            if got >= SAMPLE_RATE // 10:
                break
        return got > 0
    except Exception:
        log.info("probe failed for %s", path, exc_info=True)
        return False


class StreamSource:
    """Single-producer / single-consumer ring buffer fed by a decoder thread."""

    def __init__(self, path: str, loop: bool, capacity: int = AHEAD_FRAMES) -> None:
        self.path = path
        self.loop = loop
        self.cap = capacity
        self.ring: npt.NDArray[np.float32] = np.zeros((capacity, 2), dtype=np.float32)
        self.written = 0  # frames ever written (producer only)
        self.read = 0  # frames ever read (consumer only)
        self.eof = False  # producer reached the end and will not loop
        self.failed = False
        self._stop = threading.Event()
        self._space = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"decoder:{path}", daemon=True)
        self._thread.start()

    @property
    def finished(self) -> bool:
        return (self.eof or self.failed) and self.read >= self.written

    def close(self) -> None:
        self._stop.set()
        self._space.set()

    def _put(self, chunk: npt.NDArray[np.float32]) -> bool:
        i = 0
        n = len(chunk)
        while i < n:
            if self._stop.is_set():
                return False
            free = self.cap - (self.written - self.read)
            if free <= 0:
                self._space.clear()
                self._space.wait(0.05)
                continue
            take = min(free, n - i)
            start = self.written % self.cap
            first = min(take, self.cap - start)
            self.ring[start : start + first] = chunk[i : i + first]
            if take > first:
                self.ring[0 : take - first] = chunk[i + first : i + take]
            self.written += take
            i += take
        return True

    def _run(self) -> None:
        try:
            while not self._stop.is_set():
                produced = 0
                for chunk in _frames(self.path, _resampler()):
                    produced += len(chunk)
                    if not self._put(np.ascontiguousarray(chunk, dtype=np.float32)):
                        return
                if not self.loop or produced == 0:
                    break
        except Exception:
            log.exception("decoding failed: %s", self.path)
            self.failed = True
        self.eof = True

    def pull(self, out: npt.NDArray[np.float32], frames: int) -> int:
        """Copy up to `frames` into out[:frames]; zero the rest. Returns frames copied."""
        avail = min(frames, self.written - self.read)
        if avail > 0:
            start = self.read % self.cap
            first = min(avail, self.cap - start)
            out[:first] = self.ring[start : start + first]
            if avail > first:
                out[first:avail] = self.ring[0 : avail - first]
            self.read += avail
            self._space.set()
        else:
            avail = 0
        out[avail:frames] = 0.0
        return avail
