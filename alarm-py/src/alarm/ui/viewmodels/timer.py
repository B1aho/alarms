"""TimerViewModel (spec 3.10): wheels, countdown ring, label, sound sheet, recents, the alert."""

import math

from PySide6.QtCore import Property, QObject, QTimer, Signal, Slot

from alarm.messages import system as sys_msg
from alarm.messages.timer import (
    CancelTimer,
    PauseTimer,
    RemoveRecent,
    RepeatTimer,
    ResumeTimer,
    SetTimerDuration,
    SetTimerLabel,
    SetTimerSound,
    StartTimer,
    StopTimerRinging,
)
from alarm.rules import strings
from alarm.rules.defaults import sound_name
from alarm.rules.format import countdown, duration_words, timestamp_string
from alarm.rules.models import SoundRef, TimerState
from alarm.rules.ramp import PREVIEW_TIMER_VOLUME
from alarm.ui.bridge import UiBridge
from alarm.ui.listmodel import DictListModel
from alarm.ui.viewmodels.base import ViewModel, ro
from alarm.ui.viewmodels.sound_picker import SoundPickerViewModel


def remaining_at(s: TimerState, now: int) -> int:
    if s.status == "running" and s.ends_at is not None:
        return max(0, s.ends_at - now)
    if s.status == "paused":
        return s.remaining_ms
    return 0 if s.status == "ringing" else s.duration_ms


class TimerViewModel(ViewModel):
    changed = Signal()
    status = ro(str, "status", changed)
    hours = ro(int, "hours", changed)
    minutes = ro(int, "minutes", changed)
    seconds = ro(int, "seconds", changed)
    countdown = ro(str, "countdown", changed)
    progress = ro(float, "progress", changed)
    endsText = ro(str, "endsText", changed)
    label = ro(str, "label", changed)
    displayLabel = ro(str, "displayLabel", changed)
    soundName = ro(str, "soundName", changed)
    soundOpen = ro(bool, "soundOpen", changed)
    alertVisible = ro(bool, "alertVisible", changed)
    alertText = ro(str, "alertText", changed)
    recentCount = ro(int, "recentCount", changed)

    def __init__(self, bridge: UiBridge) -> None:
        super().__init__(
            status="idle", hours=0, minutes=5, seconds=0, countdown="05:00", progress=1.0, endsText="",
            label="", displayLabel="Timer", soundName="Chimes", soundOpen=False, alertVisible=False,
            alertText="", recentCount=0,
        )  # fmt: skip
        self.bridge = bridge
        self._recents = DictListModel(["id", "duration", "time", "subtitle", "label", "startName"], self)
        self._picker = SoundPickerViewModel(bridge, "timer", lambda: PREVIEW_TIMER_VOLUME, self._chosen)
        bridge.timerChanged.connect(self.refresh)
        bridge.timerAlert.connect(self.refresh)
        bridge.soundsChanged.connect(self.refresh)
        bridge.settingsChanged.connect(self.refresh)
        self.ticker = QTimer(self)
        self.ticker.timeout.connect(self.tick)
        self.ticker.start(250)
        self.refresh()

    def _get_recents(self) -> QObject:
        return self._recents

    def _get_picker(self) -> QObject:
        return self._picker

    recents = Property(QObject, _get_recents, constant=True)  # pyright: ignore[reportArgumentType]
    picker = Property(QObject, _get_picker, constant=True)  # pyright: ignore[reportArgumentType]

    def refresh(self) -> None:
        s = self.bridge.timer
        total = round(s.duration_ms / 1000)
        self._picker.set_value(s.sound)
        self._recents.set_items(
            [
                {
                    "id": str(r.duration_ms),
                    "duration": r.duration_ms,
                    "time": countdown(r.duration_ms),
                    "subtitle": r.label.strip() or duration_words(r.duration_ms),
                    "label": r.label,
                    "startName": strings.start_timer_named(duration_words(r.duration_ms)),
                }
                for r in s.recents
            ]
        )
        self.put(
            status=s.status,
            hours=total // 3600,
            minutes=(total % 3600) // 60,
            seconds=total % 60,
            label=s.label,
            displayLabel=s.label.strip() or strings.TIMER_PLACEHOLDER,
            soundName=sound_name(s.sound, self.bridge.sounds),
            alertVisible=s.status == "ringing",
            alertText=strings.timer_is_up(countdown(s.duration_ms)),
            recentCount=len(s.recents),
        )
        self.tick()

    def tick(self) -> None:
        s = self.bridge.timer
        now = self.bridge.now_ms()
        rem = remaining_at(s, now)
        ends = s.ends_at if s.status == "running" and s.ends_at is not None else now + rem
        # The ring moves in whole 250 ms steps (spec 4.5) and starts full.
        progress = rem / s.duration_ms if s.duration_ms > 0 else 0.0
        self.put(
            countdown=countdown(rem),
            progress=max(0.0, min(1.0, math.ceil(progress * 4000) / 4000)),
            endsText=timestamp_string(ends, self.bridge.cycle),
        )

    def _chosen(self, ref: SoundRef) -> None:
        self.bridge.send(sys_msg.TIMER, SetTimerSound(ref))

    @Slot()
    def start(self) -> None:
        self.bridge.send(sys_msg.TIMER, StartTimer(self.bridge.timer.duration_ms))

    @Slot()
    def pause(self) -> None:
        self.bridge.send(sys_msg.TIMER, PauseTimer())

    @Slot()
    def resume(self) -> None:
        self.bridge.send(sys_msg.TIMER, ResumeTimer())

    @Slot()
    def cancel(self) -> None:
        self.bridge.send(sys_msg.TIMER, CancelTimer())

    @Slot(int, int, int)
    def setDuration(self, h: int, m: int, s: int) -> None:
        self.put(hours=h, minutes=m, seconds=s)
        self.bridge.send(sys_msg.TIMER, SetTimerDuration(max(1, h * 3600 + m * 60 + s) * 1000))

    @Slot(str)
    def setLabel(self, text: str) -> None:
        self.bridge.send(sys_msg.TIMER, SetTimerLabel(text[:60]))

    @Slot(int, str)
    def startRecent(self, duration_ms: int, label: str) -> None:
        self.bridge.send(sys_msg.TIMER, StartTimer(duration_ms, label))

    @Slot(int)
    def removeRecent(self, duration_ms: int) -> None:
        self.bridge.send(sys_msg.TIMER, RemoveRecent(duration_ms))

    @Slot()
    def stopAlert(self) -> None:
        self.bridge.send(sys_msg.TIMER, StopTimerRinging())

    @Slot()
    def repeatAlert(self) -> None:
        self.bridge.send(sys_msg.TIMER, RepeatTimer())

    @Slot()
    def openSound(self) -> None:
        self.put(soundOpen=True)

    @Slot()
    def closeSound(self) -> None:
        self._picker.stopPreview()
        self.put(soundOpen=False)
