"""AudioActor protocol."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Play:
    key: str  # e.g. "alarm:<id>", "timer"
    builtin: str  # builtin id; used when `file` is None or cannot play
    file: str | None
    volume: float
    ramp_s: float
    loop: bool = True


@dataclass(frozen=True, slots=True)
class StopSound:
    key: str
    fade_s: float = 0.120


@dataclass(frozen=True, slots=True)
class PreviewPlay:
    token: int
    builtin: str
    file: str | None
    volume: float
    ramp_s: float
    loop: bool


@dataclass(frozen=True, slots=True)
class PreviewStop:
    token: int | None = None  # None = any preview


@dataclass(frozen=True, slots=True)
class PreviewEnded:
    token: int


@dataclass(frozen=True, slots=True)
class Probe:
    """Ask: can this file be decoded? Replies True/False."""

    path: str
