"""SettingsViewModel (spec 3.12 with TZ 3.3–3.5). Every change is sent at once; no Save button."""

from typing import Any

from PySide6.QtCore import Property, QObject, Signal, Slot

from alarm.messages import system as sys_msg
from alarm.messages.notify import RequestPermission
from alarm.messages.settings import UpdateSettings
from alarm.messages.sounds import RemoveSound
from alarm.rules import strings
from alarm.rules.defaults import sound_name
from alarm.rules.format import duration_short, grace_label, megabytes
from alarm.rules.models import GRACE_OPTIONS, RAMP_OPTIONS, DismissTask, Settings, SoundRef
from alarm.ui.bridge import UiBridge
from alarm.ui.viewmodels.app import app_version
from alarm.ui.viewmodels.base import ViewModel, ro
from alarm.ui.viewmodels.sound_picker import SoundPickerViewModel


class SettingsViewModel(ViewModel):
    changed = Signal()
    theme = ro(str, "theme", changed)
    hourCycle = ro(str, "hourCycle", changed)
    soundName = ro(str, "soundName", changed)
    volume = ro(float, "volume", changed)
    rampSeconds = ro(int, "rampSeconds", changed)
    rampOptions = ro(list, "rampOptions", changed)
    taskType = ro(str, "taskType", changed)
    difficulty = ro(str, "difficulty", changed)
    count = ro(int, "count", changed)
    countText = ro(str, "countText", changed)
    snoozeMinutes = ro(int, "snoozeMinutes", changed)
    snoozeText = ro(str, "snoozeText", changed)
    permission = ro(str, "permission", changed)
    openAtLogin = ro(bool, "openAtLogin", changed)
    keepAwake = ro(bool, "keepAwake", changed)
    grace = ro(int, "grace", changed)
    graceOptions = ro(list, "graceOptions", changed)
    music = ro(list, "music", changed)
    musicBusy = ro(bool, "musicBusy", changed)
    musicFooter = ro(str, "musicFooter", changed)
    version = ro(str, "version", changed)
    soundOpen = ro(bool, "soundOpen", changed)

    def __init__(self, bridge: UiBridge) -> None:
        super().__init__(
            rampOptions=[{"value": s, "label": duration_short(s)} for s in RAMP_OPTIONS],
            graceOptions=[{"value": m, "label": grace_label(m)} for m in GRACE_OPTIONS],
            musicBusy=False,
            musicFooter=strings.MUSIC_FOOTER,
            version=app_version(),
            soundOpen=False,
        )
        self.bridge = bridge
        self.s: Settings = bridge.settings
        self._picker = SoundPickerViewModel(bridge, "default", lambda: self.s.volume, self._chosen)
        bridge.settingsChanged.connect(self._from_actor)
        bridge.soundsChanged.connect(self.refresh)
        bridge.permissionChanged.connect(self.refresh)
        bridge.soundImported.connect(self._imported)
        bridge.importFailed.connect(self._failed)
        self.refresh()

    def _get_picker(self) -> QObject:
        return self._picker

    picker = Property(QObject, _get_picker, constant=True)  # pyright: ignore[reportArgumentType]

    def _from_actor(self) -> None:
        self.s = self.bridge.settings
        self.refresh()

    def refresh(self) -> None:
        s = self.s
        self._picker.set_value(s.default_sound)
        music: list[dict[str, Any]] = [
            {"id": c.id, "name": c.name, "size": megabytes(c.size), "deleteName": strings.delete_named(c.name)}
            for c in self.bridge.sounds
        ]
        self.put(
            theme=s.theme,
            hourCycle=s.hour_cycle,
            soundName=sound_name(s.default_sound, self.bridge.sounds),
            volume=s.volume,
            rampSeconds=s.ramp_seconds,
            taskType=s.default_task.type,
            difficulty=s.default_task.difficulty,
            count=s.default_task.count,
            countText=f"{s.default_task.count} {'task' if s.default_task.count == 1 else 'tasks'} in a row",
            snoozeMinutes=s.snooze_minutes,
            snoozeText=strings.snooze_length(s.snooze_minutes),
            permission=self.bridge.permission,
            openAtLogin=s.open_at_login,
            keepAwake=s.keep_awake,
            grace=s.missed_grace_minutes,
            music=music,
        )

    def _update(self, **kw: Any) -> None:
        new = Settings.model_validate({**self.s.model_dump(), **kw})
        if new != self.s:
            self.s = new
            self.refresh()
            self.bridge.send(sys_msg.SETTINGS, UpdateSettings(new))

    def _task(self, **kw: Any) -> None:
        self._update(default_task=DismissTask.model_validate({**self.s.default_task.model_dump(), **kw}))

    def _chosen(self, ref: SoundRef) -> None:
        self._update(default_sound=ref)

    @Slot(str)
    def setTheme(self, v: str) -> None:
        self._update(theme=v)

    @Slot(str)
    def setHourCycle(self, v: str) -> None:
        self._update(hour_cycle=v)

    @Slot(float)
    def setVolume(self, v: float) -> None:
        self._update(volume=round(min(1.0, max(0.05, round(v / 0.05) * 0.05)), 2))

    @Slot(int)
    def setRamp(self, v: int) -> None:
        self._update(ramp_seconds=v)

    @Slot(str)
    def setTaskType(self, v: str) -> None:
        self._task(type=v)

    @Slot(str)
    def setDifficulty(self, v: str) -> None:
        self._task(difficulty=v)

    @Slot(int)
    def setCount(self, v: int) -> None:
        self._task(count=max(1, min(5, v)))

    @Slot(int)
    def setSnooze(self, v: int) -> None:
        self._update(snooze_minutes=max(1, min(30, v)))

    @Slot(bool)
    def setOpenAtLogin(self, v: bool) -> None:
        self._update(open_at_login=v)

    @Slot(bool)
    def setKeepAwake(self, v: bool) -> None:
        self._update(keep_awake=v)

    @Slot(int)
    def setGrace(self, v: int) -> None:
        self._update(missed_grace_minutes=v)

    @Slot()
    def requestPermission(self) -> None:
        self.bridge.send(sys_msg.NOTIFIER, RequestPermission())

    @Slot(str)
    def removeMusic(self, sound_id: str) -> None:
        self.bridge.send(sys_msg.SOUNDS, RemoveSound(sound_id))

    @Slot()
    def addMusic(self) -> None:
        from PySide6.QtWidgets import QFileDialog

        from alarm.ui.viewmodels.sound_picker import FILE_FILTER

        path, _ = QFileDialog.getOpenFileName(None, strings.ADD_MUSIC_FILE.rstrip("…"), "", FILE_FILTER)
        if path:
            self.import_path(path)

    def import_path(self, path: str) -> None:
        from alarm.messages.sounds import ImportSound

        self.put(musicBusy=True, musicFooter=strings.MUSIC_FOOTER)
        self.bridge.send(sys_msg.SOUNDS, ImportSound(path, "settings"))

    def _imported(self, context: str, kind: str, sound_id: str) -> None:
        if context == "settings":
            self.put(musicBusy=False)

    def _failed(self, context: str, text: str) -> None:
        if context == "settings":
            self.put(musicBusy=False, musicFooter=text)

    @Slot()
    def openSound(self) -> None:
        self.put(soundOpen=True)

    @Slot()
    def closeSound(self) -> None:
        self._picker.stopPreview()
        self.put(soundOpen=False)
