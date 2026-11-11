"""The process time source. Tests and the `--fake-clock` flag replace it."""

import threading
import time
from collections.abc import Callable

_lock = threading.Lock()
_source: Callable[[], int] = lambda: int(time.time() * 1000)  # noqa: E731


def now_ms() -> int:
    with _lock:
        source = _source
    return source()


def install(source: Callable[[], int]) -> None:
    global _source
    with _lock:
        _source = source


def reset() -> None:
    install(lambda: int(time.time() * 1000))


class FakeClock:
    """Starts at `start_ms` and runs at `speed` × real time (manual when speed = 0)."""

    def __init__(self, start_ms: int, speed: float = 1.0) -> None:
        self._lock = threading.Lock()
        self._base = start_ms
        self._real0 = time.monotonic()
        self._speed = speed

    def __call__(self) -> int:
        with self._lock:
            return self._base + int((time.monotonic() - self._real0) * 1000 * self._speed)

    def set(self, ms: int) -> None:
        with self._lock:
            self._base = ms
            self._real0 = time.monotonic()

    def advance(self, ms: int) -> None:
        self.set(self() + ms)
