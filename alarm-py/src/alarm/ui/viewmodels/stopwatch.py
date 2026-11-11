"""StopwatchViewModel (spec 3.11). QML's FrameAnimation calls `frame()` every frame."""

from typing import Any

from PySide6.QtCore import Property, QObject, Signal, Slot

from alarm.messages import system as sys_msg
from alarm.messages.stopwatch import Lap, Reset, Start, Stop
from alarm.rules import strings
from alarm.rules.format import stopwatch as fmt
from alarm.rules.models import StopwatchState
from alarm.ui.bridge import UiBridge
from alarm.ui.listmodel import DictListModel
from alarm.ui.viewmodels.base import ViewModel, ro


def elapsed_at(s: StopwatchState, now: int) -> int:
    return s.accumulated_ms + (now - s.started_at if s.started_at is not None else 0)


def lap_rows(s: StopwatchState, now: int) -> list[dict[str, Any]]:
    """Current lap first, then completed laps newest first; best/worst once there are 2+."""
    splits = [t - (s.laps[i - 1] if i else 0) for i, t in enumerate(s.laps)]
    best = min(splits) if len(splits) >= 2 else None
    worst = max(splits) if len(splits) >= 2 else None
    current = elapsed_at(s, now) - (s.laps[-1] if s.laps else 0)
    rows: list[dict[str, Any]] = [
        {"id": "current", "name": strings.lap_n(len(s.laps) + 1), "time": fmt(current), "tone": ""}
    ]
    for i in range(len(splits) - 1, -1, -1):
        ms = splits[i]
        tone = "best" if ms == best else "worst" if ms == worst else ""
        rows.append({"id": str(i + 1), "name": strings.lap_n(i + 1), "time": fmt(ms), "tone": tone})
    return rows


class StopwatchViewModel(ViewModel):
    changed = Signal()
    running = ro(bool, "running", changed)
    display = ro(str, "display", changed)
    hasTime = ro(bool, "hasTime", changed)
    showLaps = ro(bool, "showLaps", changed)

    def __init__(self, bridge: UiBridge) -> None:
        super().__init__(running=False, display="00:00.00", hasTime=False, showLaps=False)
        self.bridge = bridge
        self._laps = DictListModel(["id", "name", "time", "tone"], self)
        bridge.stopwatchChanged.connect(self.frame)
        self.frame()

    def _get_laps(self) -> QObject:
        return self._laps

    laps = Property(QObject, _get_laps, constant=True)  # pyright: ignore[reportArgumentType]

    @Slot()
    def frame(self) -> None:
        s = self.bridge.stopwatch
        now = self.bridge.now_ms()
        elapsed = elapsed_at(s, now)
        self.put(
            running=s.started_at is not None,
            display=fmt(elapsed),
            hasTime=elapsed > 0,
            showLaps=elapsed > 0 or bool(s.laps),
        )
        self._laps.set_items(lap_rows(s, now) if elapsed > 0 or s.laps else [])

    @Slot()
    def startStop(self) -> None:
        self.bridge.send(sys_msg.STOPWATCH, Stop() if self.get("running") else Start())

    @Slot()
    def lapReset(self) -> None:
        if self.get("running"):
            self.bridge.send(sys_msg.STOPWATCH, Lap())
        elif self.get("hasTime"):
            self.bridge.send(sys_msg.STOPWATCH, Reset())
