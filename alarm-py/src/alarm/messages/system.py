"""Addresses, clock, window and store messages."""

from dataclasses import dataclass

from alarm.rules.models import Alarm, CustomSound, Settings, StopwatchState, TimerState

# Actor addresses (registry names)
CLOCK = "clock"
SETTINGS = "settings"
ALARMS = "alarms"
TIMER = "timer"
STOPWATCH = "stopwatch"
SOUNDS = "sounds"
STORE = "store"
AUDIO = "audio"
NOTIFIER = "notifier"
POWER = "power"
UI = "ui"


# --- clock
@dataclass(frozen=True, slots=True)
class Start:
    """Start ticking."""


@dataclass(frozen=True, slots=True)
class Tick:
    now: int


@dataclass(frozen=True, slots=True)
class Resumed:
    """The wall clock jumped by more than 2 s (sleep, clock change)."""

    now: int
    jump_ms: int


@dataclass(frozen=True, slots=True)
class CheckNow:
    """Re-evaluate at once (window activated)."""


# --- window
@dataclass(frozen=True, slots=True)
class ShowWindow:
    pass


@dataclass(frozen=True, slots=True)
class ResendPlayback:
    """The audio actor restarted: repeat Play for everything that should sound."""


# --- store (StoreActor is the only writer)
Record = Alarm | Settings | TimerState | StopwatchState | tuple[CustomSound, ...]


@dataclass(frozen=True, slots=True)
class LoadAlarms:
    pass


@dataclass(frozen=True, slots=True)
class LoadSettings:
    pass


@dataclass(frozen=True, slots=True)
class LoadTimer:
    pass


@dataclass(frozen=True, slots=True)
class LoadStopwatch:
    pass


@dataclass(frozen=True, slots=True)
class LoadSounds:
    pass


@dataclass(frozen=True, slots=True)
class Save:
    record: Record


@dataclass(frozen=True, slots=True)
class DeleteAlarmFile:
    alarm_id: str


@dataclass(frozen=True, slots=True)
class CopySound:
    """Copy a user file into the store; replies with the stored path."""

    source: str
    sound_id: str
    ext: str


@dataclass(frozen=True, slots=True)
class DeleteSound:
    sound_id: str
    ext: str


@dataclass(frozen=True, slots=True)
class SoundsDir:
    """Ask: the directory that holds imported sounds."""
