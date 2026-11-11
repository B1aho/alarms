"""In-process app for UI tests and screenshots: real actors, null audio, fake notifications, frozen clock."""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from PySide6.QtCore import QCoreApplication, QEventLoop, QTimer
from PySide6.QtGui import QImage
from PySide6.QtQuick import QQuickWindow

from alarm.__main__ import build_supervisor
from alarm.kernel import Barrier, clock, registry, tell
from alarm.kernel.clock import FakeClock
from alarm.messages import system as sys_msg
from alarm.messages.system import Start
from alarm.rules.models import Alarm, Settings, StopwatchState, TimerState
from alarm.ui.bridge import UiBridge
from alarm.ui.window import WindowController


class FakeNotifier:
    def __init__(self, granted: bool = True) -> None:
        self._did_request_authorisation = granted
        self.sent: list[Any] = []

    async def send_notification(self, note: Any) -> str:
        self.sent.append(note)
        return str(len(self.sent))

    async def clear(self, ident: str) -> None:
        pass

    async def request_authorisation(self) -> bool:
        self._did_request_authorisation = True
        return True


def ms(y: int, mo: int, d: int, h: int = 0, mi: int = 0, s: int = 0) -> int:
    return int(datetime(y, mo, d, h, mi, s).timestamp() * 1000)


def wait(msec: int) -> None:
    loop = QEventLoop()
    QTimer.singleShot(msec, loop.quit)
    loop.exec()


class Harness:
    def __init__(
        self,
        data_dir: Path,
        now: int,
        *,
        settings: Settings | None = None,
        alarms: list[Alarm] | None = None,
        timer: TimerState | None = None,
        stopwatch: StopwatchState | None = None,
        granted: bool = True,
        cycle: str = "24h",
    ) -> None:
        os.environ["ALARM_AUDIO"] = "null"
        self.dir = data_dir
        (data_dir / "alarms").mkdir(parents=True, exist_ok=True)
        if settings is not None:
            (data_dir / "settings.json").write_text(settings.model_dump_json())
        for a in alarms or []:
            (data_dir / "alarms" / f"{a.id}.json").write_text(a.model_dump_json())
        if timer is not None:
            (data_dir / "timer.json").write_text(timer.model_dump_json())
        if stopwatch is not None:
            (data_dir / "stopwatch.json").write_text(json.dumps(stopwatch.model_dump(mode="json")))
        self.clock = FakeClock(now, speed=0)
        clock.install(self.clock)
        self.notifier = FakeNotifier(granted)
        self.bridge = UiBridge(cycle)  # type: ignore[arg-type]
        self.bridge.install()
        self.window = WindowController(self.bridge)
        self.window.fullscreen_ringing = False
        self.sup = build_supervisor(data_dir, notifier_backend=self.notifier, null_audio=True, system_cycle=cycle)
        self.sup.start()
        tell(sys_msg.CLOCK, Start())
        for name in (sys_msg.STORE, sys_msg.SETTINGS, sys_msg.SOUNDS, sys_msg.ALARMS, sys_msg.TIMER, sys_msg.STOPWATCH):
            registry.address(name).ask(Barrier(), timeout=10)
        wait(300)
        self.window.show()
        wait(400)

    def vm(self, name: str) -> Any:
        return self.window.vms[name]

    @property
    def qwindow(self) -> QQuickWindow:
        assert self.window.window is not None
        return self.window.window  # type: ignore[return-value]

    def settle(self, msec: int = 600) -> None:
        wait(msec)

    def sync(self, *names: str) -> None:
        for n in names:
            registry.address(n).ask(Barrier(), timeout=10)
        QCoreApplication.processEvents()
        wait(100)

    def grab(self) -> QImage:
        return self.qwindow.grabWindow()

    def close(self) -> None:
        self.window.close()
        wait(100)
        self.sup.stop()
        clock.reset()
