"""AlarmActor protocol."""

from dataclasses import dataclass
from typing import Literal

from alarm.rules.models import Alarm


@dataclass(frozen=True, slots=True)
class SaveAlarm:
    alarm: Alarm


@dataclass(frozen=True, slots=True)
class DeleteAlarm:
    alarm_id: str


@dataclass(frozen=True, slots=True)
class SetAlarmEnabled:
    alarm_id: str
    enabled: bool


@dataclass(frozen=True, slots=True)
class CancelSnooze:
    alarm_id: str


@dataclass(frozen=True, slots=True)
class Snooze:
    alarm_id: str | None = None  # None = the alarm on the ringing screen


@dataclass(frozen=True, slots=True)
class Stop:
    alarm_id: str


@dataclass(frozen=True, slots=True)
class SubmitAnswer:
    alarm_id: str
    text: str


@dataclass(frozen=True, slots=True)
class BackFromTask:
    alarm_id: str


@dataclass(frozen=True, slots=True)
class AlarmsChanged:
    alarms: tuple[Alarm, ...]  # sorted by time of day


@dataclass(frozen=True, slots=True)
class RingingStarted:
    alarm_id: str


@dataclass(frozen=True, slots=True)
class Ringing:
    alarm_id: str
    label: str
    snooze: bool
    stage: Literal["buttons", "task"]
    task_kind: Literal["math", "retype", "none"]
    prompt: str
    solved: int
    total: int
    wrong: int  # bumps on each wrong answer: the screen shakes


@dataclass(frozen=True, slots=True)
class RingingChanged:
    ringing: tuple[Ringing, ...]  # first = shown on the ringing screen
