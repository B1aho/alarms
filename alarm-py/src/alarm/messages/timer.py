"""TimerActor protocol."""

from dataclasses import dataclass

from alarm.rules.models import SoundRef, TimerState


@dataclass(frozen=True, slots=True)
class StartTimer:
    duration_ms: int
    label: str | None = None  # None = keep the current label


@dataclass(frozen=True, slots=True)
class PauseTimer:
    pass


@dataclass(frozen=True, slots=True)
class ResumeTimer:
    pass


@dataclass(frozen=True, slots=True)
class CancelTimer:
    pass


@dataclass(frozen=True, slots=True)
class StopTimerRinging:
    pass


@dataclass(frozen=True, slots=True)
class RepeatTimer:
    pass


@dataclass(frozen=True, slots=True)
class SetTimerDuration:
    duration_ms: int


@dataclass(frozen=True, slots=True)
class SetTimerLabel:
    label: str


@dataclass(frozen=True, slots=True)
class SetTimerSound:
    sound: SoundRef


@dataclass(frozen=True, slots=True)
class RemoveRecent:
    duration_ms: int


@dataclass(frozen=True, slots=True)
class TimerChanged:
    state: TimerState


@dataclass(frozen=True, slots=True)
class TimerAlert:
    state: TimerState
