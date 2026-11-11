"""EditorViewModel (spec 3.3): the alarm draft, sub-pages, preview. Save sends and closes at once."""

import random
import uuid
from typing import Any

from PySide6.QtCore import Property, QObject, Signal, Slot

from alarm.messages import system as sys_msg
from alarm.messages.alarms import DeleteAlarm, SaveAlarm
from alarm.messages.audio import PreviewStop
from alarm.rules import strings
from alarm.rules.defaults import new_alarm, sound_name
from alarm.rules.format import duration_short
from alarm.rules.models import RAMP_OPTIONS, Alarm, DismissTask, SoundRef
from alarm.rules.schedule import DAY_LONG, WEEK_ORDER, repeat_summary
from alarm.rules.tasks import display_prompt, generate, task_summary, tasks_in_a_row
from alarm.ui.bridge import UiBridge
from alarm.ui.viewmodels.base import ViewModel, ro
from alarm.ui.viewmodels.sound_picker import SoundPickerViewModel, preview

TITLES = {
    "repeat": strings.REPEAT,
    "sound": strings.SOUND,
    "ramp": strings.GRADUAL_VOLUME,
    "task": strings.TURN_OFF_WITH,
}


class EditorViewModel(ViewModel):
    changed = Signal()
    open = ro(bool, "open", changed)
    isNew = ro(bool, "isNew", changed)
    page = ro(str, "page", changed)
    title = ro(str, "title", changed)
    hour = ro(int, "hour", changed)
    minute = ro(int, "minute", changed)
    label = ro(str, "label", changed)
    days = ro(list, "days", changed)
    repeatSummary = ro(str, "repeatSummary", changed)
    soundName = ro(str, "soundName", changed)
    snooze = ro(bool, "snooze", changed)
    volume = ro(float, "volume", changed)
    rampSeconds = ro(int, "rampSeconds", changed)
    rampText = ro(str, "rampText", changed)
    rampOptions = ro(list, "rampOptions", changed)
    repeatOptions = ro(list, "repeatOptions", changed)
    taskType = ro(str, "taskType", changed)
    difficulty = ro(str, "difficulty", changed)
    count = ro(int, "count", changed)
    countText = ro(str, "countText", changed)
    taskSummary = ro(str, "taskSummary", changed)
    example = ro(str, "example", changed)
    previewing = ro(bool, "previewing", changed)
    twelveHour = ro(bool, "twelveHour", changed)

    def __init__(self, bridge: UiBridge, rng: random.Random | None = None) -> None:
        super().__init__(
            open=False,
            isNew=True,
            page="main",
            title=strings.ADD_ALARM,
            rampOptions=[{"value": s, "label": duration_short(s)} for s in RAMP_OPTIONS],
            repeatOptions=[{"day": d, "label": strings.every_day_name(DAY_LONG[d])} for d in WEEK_ORDER],
            previewing=False,
            twelveHour=False,
            example="",
        )
        self.bridge = bridge
        self.rng = rng or random.Random()
        self.draft: Alarm = new_alarm(bridge.settings, bridge.now_ms(), "draft")
        self._picker = SoundPickerViewModel(bridge, "editor", lambda: self.draft.volume, self._sound_chosen)
        self.preview_token: int | None = None
        bridge.previewEnded.connect(self._preview_ended)
        bridge.soundsChanged.connect(self._sync)
        bridge.settingsChanged.connect(self._sync)
        self._sync()

    def _get_picker(self) -> QObject:
        return self._picker

    picker = Property(QObject, _get_picker, constant=True)  # pyright: ignore[reportArgumentType]

    # ------------------------------------------------------------- draft --
    def _set(self, **update: Any) -> None:
        self.draft = self.draft.model_copy(update=update)
        self._sync()

    def _sync(self) -> None:
        a = self.draft
        self._picker.set_value(a.sound)
        self.put(
            hour=a.hour,
            minute=a.minute,
            label=a.label,
            days=list(a.days),
            repeatSummary=repeat_summary(a.days),
            soundName=sound_name(a.sound, self.bridge.sounds),
            snooze=a.snooze,
            volume=a.volume,
            rampSeconds=a.ramp_seconds,
            rampText=duration_short(a.ramp_seconds),
            taskType=a.task.type,
            difficulty=a.task.difficulty,
            count=a.task.count,
            countText=tasks_in_a_row(a.task.count),
            taskSummary=task_summary(a.task),
            twelveHour=self.bridge.cycle == "12h",
        )

    def _new_example(self) -> None:
        p = generate(self.draft.task, self.rng.random)
        self.put(example=display_prompt(p, example=True) if p else "")

    def _sound_chosen(self, ref: SoundRef) -> None:
        self._set(sound=ref)

    # -------------------------------------------------------------- open --
    @Slot()
    def openNew(self) -> None:
        self.draft = new_alarm(self.bridge.settings, self.bridge.now_ms(), uuid.uuid4().hex)
        self.put(open=True, isNew=True, page="main", title=strings.ADD_ALARM)
        self._sync()

    @Slot(str)
    def openExisting(self, alarm_id: str) -> None:
        a = next((x for x in self.bridge.alarms if x.id == alarm_id), None)
        if a is None:
            return
        self.draft = a
        self.put(open=True, isNew=False, page="main", title=strings.EDIT_ALARM)
        self._sync()

    @Slot()
    def cancel(self) -> None:
        self._stop_all()
        self.put(open=False)

    @Slot()
    def save(self) -> None:
        self._stop_all()
        self.bridge.send(sys_msg.ALARMS, SaveAlarm(self.draft.model_copy(update={"enabled": True})))
        self.put(open=False)

    @Slot()
    def deleteAlarm(self) -> None:
        self._stop_all()
        self.bridge.send(sys_msg.ALARMS, DeleteAlarm(self.draft.id))
        self.put(open=False)

    @Slot(str)
    def push(self, page: str) -> None:
        self._stop_preview()
        if page == "task":
            self._new_example()
        self.put(page=page, title=TITLES.get(page, self.get("title")))

    @Slot()
    def back(self) -> None:
        self._picker.stopPreview()
        self.put(page="main", title=strings.ADD_ALARM if self.get("isNew") else strings.EDIT_ALARM)

    # ------------------------------------------------------------ fields --
    @Slot(int, int)
    def setTime(self, hour: int, minute: int) -> None:
        self._set(hour=hour % 24, minute=minute % 60)

    @Slot(str)
    def setLabel(self, text: str) -> None:
        self._set(label=text[:60])

    @Slot(int)
    def toggleDay(self, day: int) -> None:
        days = set(self.draft.days)
        days.symmetric_difference_update({day})
        self._set(days=tuple(sorted(days)))

    @Slot(bool)
    def setSnooze(self, on: bool) -> None:
        self._set(snooze=on)

    @Slot(float)
    def setVolume(self, v: float) -> None:
        self._set(volume=round(min(1.0, max(0.05, round(v / 0.05) * 0.05)), 2))

    @Slot(int)
    def setRamp(self, seconds: int) -> None:
        self._set(ramp_seconds=seconds)

    def _task(self, **kw: Any) -> None:
        self._set(task=DismissTask.model_validate({**self.draft.task.model_dump(), **kw}))
        self._new_example()

    @Slot(str)
    def setTaskType(self, t: str) -> None:
        self._task(type=t)

    @Slot(str)
    def setDifficulty(self, d: str) -> None:
        self._task(difficulty=d)

    @Slot(int)
    def setCount(self, n: int) -> None:
        self._task(count=max(1, min(5, n)))

    # ----------------------------------------------------------- preview --
    @Slot()
    def togglePreview(self) -> None:
        if self.preview_token is not None:
            self._stop_preview()
            return
        a = self.draft
        self.preview_token = preview(self.bridge, a.sound, a.volume, a.ramp_seconds, loop=True)
        self.put(previewing=True)

    def _stop_preview(self) -> None:
        if self.preview_token is not None:
            self.bridge.send(sys_msg.AUDIO, PreviewStop(self.preview_token))
            self.preview_token = None
        self.put(previewing=False)

    def _stop_all(self) -> None:
        self._stop_preview()
        self._picker.stopPreview()

    def _preview_ended(self, token: int) -> None:
        if token == self.preview_token:
            self.preview_token = None
            self.put(previewing=False)
