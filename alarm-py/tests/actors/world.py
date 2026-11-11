"""Test harness: real actors under a supervisor, recording stubs for the rest, a manual clock."""

import threading
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any, TypeVar

from alarm.kernel import Actor, CallbackMailbox, clock, registry, tell
from alarm.kernel.actor import Barrier
from alarm.kernel.clock import FakeClock
from alarm.kernel.supervisor import Supervisor
from alarm.messages import system as sys_msg
from alarm.messages.alarms import AlarmsChanged, RingingChanged, RingingStarted
from alarm.messages.settings import SettingsChanged
from alarm.messages.sounds import ImportFailed, SoundImported, SoundsChanged
from alarm.messages.stopwatch import StopwatchChanged
from alarm.messages.system import ResendPlayback, Resumed, Tick
from alarm.messages.timer import TimerAlert, TimerChanged

T = TypeVar("T")

EVENTS: tuple[type, ...] = (
    AlarmsChanged,
    RingingChanged,
    RingingStarted,
    SettingsChanged,
    TimerChanged,
    TimerAlert,
    StopwatchChanged,
    SoundsChanged,
    SoundImported,
    ImportFailed,
)


def local_ms(y: int, mo: int, d: int, h: int = 0, mi: int = 0, s: int = 0) -> int:
    return int(datetime(y, mo, d, h, mi, s).timestamp() * 1000)


class Recorder:
    def __init__(self) -> None:
        self.items: list[object] = []
        self.lock = threading.Lock()

    def __call__(self, message: object) -> None:
        with self.lock:
            self.items.append(message)

    def of(self, kind: type[T]) -> list[T]:
        with self.lock:
            return [m for m in self.items if isinstance(m, kind)]

    def clear(self) -> None:
        with self.lock:
            self.items.clear()


def wait_for(cond: Callable[[], Any], timeout: float = 5.0) -> Any:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = cond()
        if value:
            return value
        time.sleep(0.01)
    raise AssertionError("condition not met in time")


class World:
    def __init__(
        self, data_dir: Path, start_ms: int, stubs: tuple[str, ...] = (sys_msg.AUDIO, sys_msg.NOTIFIER)
    ) -> None:
        self.dir = data_dir
        self.clock = FakeClock(start_ms, speed=0)
        clock.install(self.clock)
        self.stubs: dict[str, Recorder] = {}
        for name in stubs:
            rec = Recorder()
            self.stubs[name] = rec
            registry.register(name, CallbackMailbox(rec))
        self.events = Recorder()
        registry.register("probe", CallbackMailbox(self.events))
        for ev in EVENTS:
            registry.subscribe(ev, "probe")
        self.sup = Supervisor(backoff=(0.05, 0.05, 0.05, 0.05), on_fatal=lambda name: None)

    def add(self, name: str, factory: Callable[[bool], Actor], subscribe: tuple[type, ...] = ()) -> None:
        self.sup.add(name, factory)
        for ev in subscribe:
            registry.subscribe(ev, name)

    def start(self) -> "World":
        self.sup.start()
        return self

    def stop(self) -> None:
        self.sup.stop()

    @property
    def audio(self) -> Recorder:
        return self.stubs[sys_msg.AUDIO]

    @property
    def notifier(self) -> Recorder:
        return self.stubs[sys_msg.NOTIFIER]

    def now(self) -> int:
        return self.clock()

    def set_time(self, ms: int) -> None:
        self.clock.set(ms)

    def tick(self, name: str = sys_msg.ALARMS, *, resumed: bool = False) -> None:
        msg = Resumed(self.now(), 0) if resumed else Tick(self.now())
        tell(name, msg)
        self.sync(name)

    def sync(self, name: str) -> None:
        """Wait until `name` has handled everything sent so far."""
        _drain(name)

    def send(self, message: object, name: str = sys_msg.ALARMS) -> None:
        tell(name, message)
        _drain(name)

    def resend(self, name: str) -> None:
        tell(name, ResendPlayback())
        _drain(name)


def _drain(name: str) -> None:
    registry.address(name).ask(Barrier(), timeout=5)
