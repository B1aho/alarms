"""Data model (spec section 2). Immutable pydantic models: safe to put in messages.

Times are integers: milliseconds since the Unix epoch, like the reference.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

SoundKind = Literal["builtin", "custom"]
TaskType = Literal["none", "math", "retype"]
Difficulty = Literal["easy", "medium", "hard"]
Theme = Literal["system", "light", "dark"]
HourCyclePref = Literal["auto", "12h", "24h"]
HourCycle = Literal["12h", "24h"]
TimerStatus = Literal["idle", "running", "paused", "ringing"]
NotifyPermission = Literal["unknown", "granted", "denied"]

LABEL_MAX = 60
RAMP_OPTIONS: tuple[int, ...] = (0, 15, 30, 60, 120, 300, 600)
GRACE_OPTIONS: tuple[int, ...] = (5, 15, 30, 60, 120, 240)


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")


class SoundRef(Frozen):
    kind: SoundKind
    id: str = Field(min_length=1)


class DismissTask(Frozen):
    type: TaskType
    difficulty: Difficulty
    count: int = Field(ge=1, le=5)


DEFAULT_SOUND = SoundRef(kind="builtin", id="sunrise")
DEFAULT_TIMER_SOUND = SoundRef(kind="builtin", id="chimes")
DEFAULT_TASK = DismissTask(type="math", difficulty="medium", count=2)


class Alarm(Frozen):
    id: str
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)
    label: str = ""
    enabled: bool
    days: tuple[int, ...] = ()
    sound: SoundRef
    volume: float = Field(ge=0.05, le=1.0)
    ramp_seconds: int = Field(ge=0, le=600)
    snooze: bool
    task: DismissTask
    created_at: int
    next_trigger_at: int | None = None
    snooze_until: int | None = None
    ringing_since: int | None = None

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, v: object) -> str:
        return v[:LABEL_MAX] if isinstance(v, str) else ""

    @field_validator("days", mode="before")
    @classmethod
    def _days(cls, v: object) -> tuple[int, ...]:
        if not isinstance(v, list | tuple):
            return ()
        out = {d for d in v if isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6}  # pyright: ignore[reportUnknownVariableType]
        return tuple(sorted(out))


class Settings(Frozen):
    theme: Theme = "system"
    hour_cycle: HourCyclePref = "auto"
    snooze_minutes: int = Field(default=9, ge=1, le=30)
    ramp_seconds: int = Field(default=60, ge=0, le=600)
    volume: float = Field(default=0.9, ge=0.05, le=1.0)
    default_sound: SoundRef = DEFAULT_SOUND
    default_task: DismissTask = DEFAULT_TASK
    keep_awake: bool = False
    missed_grace_minutes: int = Field(default=60, ge=1, le=240)
    open_at_login: bool = True


def parse_settings(raw: object) -> Settings:
    """Validate settings key by key: a bad key gets its default, the rest survive (TZ 6, 2.7)."""
    if not isinstance(raw, dict):
        return Settings()
    good: dict[str, Any] = {}
    for key in Settings.model_fields:
        if key not in raw:
            continue
        try:
            Settings.model_validate({key: raw[key]})
        except ValidationError:
            continue
        good[key] = raw[key]
    return Settings.model_validate(good)


class RecentTimer(Frozen):
    duration_ms: int
    label: str = ""


class TimerState(Frozen):
    status: TimerStatus = "idle"
    duration_ms: int = Field(default=5 * 60_000, ge=1000)
    ends_at: int | None = None
    remaining_ms: int = 0
    label: str = ""
    sound: SoundRef = DEFAULT_TIMER_SOUND
    recents: tuple[RecentTimer, ...] = ()

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, v: object) -> str:
        return v[:LABEL_MAX] if isinstance(v, str) else ""


def parse_timer(raw: object) -> TimerState:
    if not isinstance(raw, dict):
        return TimerState()
    good: dict[str, Any] = {}
    for key in TimerState.model_fields:
        if key in raw:
            try:
                TimerState.model_validate({key: raw[key]})
            except ValidationError:
                continue
            good[key] = raw[key]
    return TimerState.model_validate(good)


class StopwatchState(Frozen):
    started_at: int | None = None
    accumulated_ms: int = Field(default=0, ge=0)
    laps: tuple[int, ...] = ()


def parse_stopwatch(raw: object) -> StopwatchState:
    try:
        return StopwatchState.model_validate(raw)
    except ValidationError:
        return StopwatchState()


class CustomSound(Frozen):
    id: str
    name: str
    size: int
    added_at: int
    ext: str


class Problem(Frozen):
    kind: Literal["math", "retype"]
    prompt: str
    answer: str
