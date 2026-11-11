"""UiBridge: actor events → queued Qt signals in the main thread; UI commands → `tell`.

The bridge keeps the last value of each event so a freshly created window (and its
ViewModels) can render at once. It never asks: answers arrive as events.
"""

import logging
import time
from typing import assert_never

from PySide6.QtCore import QObject, Signal, Slot

from alarm.kernel import CallbackMailbox, registry, tell
from alarm.messages import system as sys_msg
from alarm.messages.alarms import AlarmsChanged, Ringing, RingingChanged, RingingStarted
from alarm.messages.audio import PreviewEnded
from alarm.messages.notify import PermissionChanged
from alarm.messages.settings import SettingsChanged
from alarm.messages.sounds import ImportFailed, SoundImported, SoundsChanged
from alarm.messages.stopwatch import StopwatchChanged
from alarm.messages.system import CheckNow, ShowWindow, Tick
from alarm.messages.timer import TimerAlert, TimerChanged
from alarm.rules.models import Alarm, CustomSound, HourCycle, NotifyPermission, Settings, StopwatchState, TimerState

log = logging.getLogger("alarm.ui.bridge")

UI_EVENTS: tuple[type, ...] = (
    Tick,
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
    PreviewEnded,
    PermissionChanged,
)

UiMsg = (
    Tick
    | AlarmsChanged
    | RingingChanged
    | RingingStarted
    | SettingsChanged
    | TimerChanged
    | TimerAlert
    | StopwatchChanged
    | SoundsChanged
    | SoundImported
    | ImportFailed
    | PreviewEnded
    | PermissionChanged
    | ShowWindow
)


class UiBridge(QObject):
    _inbox = Signal(object)

    ticked = Signal()
    alarmsChanged = Signal()
    ringingChanged = Signal()
    ringingStarted = Signal(str)
    settingsChanged = Signal()
    timerChanged = Signal()
    timerAlert = Signal()
    stopwatchChanged = Signal()
    soundsChanged = Signal()
    soundImported = Signal(str, str, str)  # context, kind, id
    importFailed = Signal(str, str)  # context, text
    previewEnded = Signal(int)
    permissionChanged = Signal()
    showRequested = Signal()

    def __init__(self, system_cycle: HourCycle) -> None:
        super().__init__()
        self.alarms: tuple[Alarm, ...] = ()
        self.ringing: tuple[Ringing, ...] = ()
        self.settings = Settings()
        self.cycle: HourCycle = system_cycle
        self.timer = TimerState()
        self.stopwatch = StopwatchState()
        self.sounds: tuple[CustomSound, ...] = ()
        self.sounds_dir = ""
        self.permission: NotifyPermission = "unknown"
        self.offset_ms = 0.0  # actor clock − wall clock (non-zero under --fake-clock)
        self._inbox.connect(self._dispatch)

    def install(self) -> None:
        registry.register(sys_msg.UI, CallbackMailbox(self._inbox.emit))
        for ev in UI_EVENTS:
            registry.subscribe(ev, sys_msg.UI)

    # -- commands
    def send(self, to: str, message: object) -> None:
        tell(to, message)

    def now_ms(self) -> int:
        return int(time.time() * 1000 + self.offset_ms)

    def check_now(self) -> None:
        tell(sys_msg.ALARMS, CheckNow())

    # -- events (main thread)
    @Slot(object)
    def _dispatch(self, m: object) -> None:
        if not isinstance(m, UiMsg):
            log.warning("ui ignored %r", m)
            return
        match m:
            case Tick(now=now):
                self.offset_ms = now - time.time() * 1000
                self.ticked.emit()
            case AlarmsChanged(alarms=alarms):
                self.alarms = alarms
                self.alarmsChanged.emit()
            case RingingChanged(ringing=ringing):
                self.ringing = ringing
                self.ringingChanged.emit()
            case RingingStarted(alarm_id=alarm_id):
                self.ringingStarted.emit(alarm_id)
            case SettingsChanged(settings=s, cycle=c):
                self.settings, self.cycle = s, c
                self.settingsChanged.emit()
            case TimerChanged(state=state):
                self.timer = state
                self.timerChanged.emit()
            case TimerAlert(state=state):
                self.timer = state
                self.timerAlert.emit()
            case StopwatchChanged(state=state):
                self.stopwatch = state
                self.stopwatchChanged.emit()
            case SoundsChanged(sounds=sounds, directory=directory):
                self.sounds, self.sounds_dir = sounds, directory
                self.soundsChanged.emit()
            case SoundImported(sound=sound, context=context):
                self.soundImported.emit(context, "custom", sound.id)
            case ImportFailed(text=text, context=context):
                self.importFailed.emit(context, text)
            case PreviewEnded(token=token):
                self.previewEnded.emit(token)
            case PermissionChanged(status=status):
                self.permission = status
                self.permissionChanged.emit()
            case ShowWindow():
                self.showRequested.emit()
            case _:
                assert_never(m)
