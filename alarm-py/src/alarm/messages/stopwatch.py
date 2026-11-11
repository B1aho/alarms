"""StopwatchActor protocol."""

from dataclasses import dataclass

from alarm.rules.models import StopwatchState


@dataclass(frozen=True, slots=True)
class Start:
    pass


@dataclass(frozen=True, slots=True)
class Stop:
    pass


@dataclass(frozen=True, slots=True)
class Lap:
    pass


@dataclass(frozen=True, slots=True)
class Reset:
    pass


@dataclass(frozen=True, slots=True)
class StopwatchChanged:
    state: StopwatchState
