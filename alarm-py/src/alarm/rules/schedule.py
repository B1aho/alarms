"""Scheduling rules (spec 3.4, 3.7): next occurrence, the per-tick decision, summaries."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, tzinfo
from typing import Literal

from alarm.rules.models import Alarm

WEEK_ORDER: tuple[int, ...] = (1, 2, 3, 4, 5, 6, 0)  # Monday first
DAY_SHORT: tuple[str, ...] = ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
DAY_LONG: tuple[str, ...] = ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

MISSED_NOTIFY_LIMIT_MS = 12 * 3600_000


def _js_weekday(d: date) -> int:
    """0 = Sunday … 6 = Saturday (Python: Monday = 0)."""
    return (d.weekday() + 1) % 7


def local_dt(ms: int, tz: tzinfo | None = None) -> datetime:
    """Epoch ms → wall-clock datetime in `tz` (None = the OS local zone)."""
    if tz is None:
        return datetime.fromtimestamp(ms / 1000)
    return datetime.fromtimestamp(ms / 1000, tz)


def _to_ms(day: date, hour: int, minute: int, tz: tzinfo | None) -> int:
    wall = datetime(day.year, day.month, day.day, hour, minute)
    if tz is not None:
        wall = wall.replace(tzinfo=tz)
    # Naive datetimes resolve through mktime, aware ones through the zone:
    # both normalise a time skipped by DST forward, like the local calendar does.
    return round(wall.timestamp() * 1000)


def next_occurrence(hour: int, minute: int, days: tuple[int, ...], after: int, tz: tzinfo | None = None) -> int:
    """First moment strictly after `after` (local time) at hour:minute on one of `days` (empty = any)."""
    base = local_dt(after, tz).date()
    for i in range(9):
        day = base + timedelta(days=i)
        at = _to_ms(day, hour, minute, tz)
        if at <= after:
            continue
        if not days or _js_weekday(day) in days:
            return at
    raise AssertionError("unreachable: an alarm always occurs within 8 days")


def alarm_next(a: Alarm, after: int, tz: tzinfo | None = None) -> int:
    return next_occurrence(a.hour, a.minute, a.days, after, tz)


def repeat_summary(days: tuple[int, ...] | list[int]) -> str:
    s = set(days)
    if not s:
        return "Never"
    if len(s) == 7:
        return "Every day"
    if s == {1, 2, 3, 4, 5}:
        return "Weekdays"
    if s == {0, 6}:
        return "Weekends"
    if len(s) == 1:
        return f"Every {DAY_LONG[next(iter(s))]}"
    return " ".join(DAY_SHORT[d] for d in WEEK_ORDER if d in s)


def alarm_subtitle(a: Alarm) -> str:
    """`Work, weekdays` or just `Gym` (spec 3.2)."""
    repeat = repeat_summary(a.days)
    label = display_label(a.label)
    return label if repeat == "Never" else f"{label}, {repeat.lower()}"


def display_label(label: str) -> str:
    return label.strip() or "Alarm"


Source = Literal["schedule", "snooze"]


@dataclass(frozen=True, slots=True)
class Wait:
    pass


@dataclass(frozen=True, slots=True)
class Ring:
    source: Source
    trigger: int


@dataclass(frozen=True, slots=True)
class Missed:
    source: Source
    trigger: int


Verdict = Wait | Ring | Missed


def decide(a: Alarm, now: int, grace_ms: int) -> Verdict:
    """The decision table of spec 3.4."""
    if a.ringing_since is not None:
        return Wait()
    if a.snooze_until is not None:
        if now < a.snooze_until:
            return Wait()
        late = now - a.snooze_until
        return Missed("snooze", a.snooze_until) if late > grace_ms else Ring("snooze", a.snooze_until)
    if not a.enabled or a.next_trigger_at is None:
        return Wait()
    trigger = a.next_trigger_at
    if now >= trigger:
        return Missed("schedule", trigger) if now - trigger > grace_ms else Ring("schedule", trigger)
    return Wait()


def advance(a: Alarm, source: Source, trigger: int, now: int, tz: tzinfo | None = None) -> Alarm:
    """Schedule after a ring or a miss: snooze only clears; one-shot turns off; repeat moves on."""
    if source == "snooze":
        return a.model_copy(update={"snooze_until": None})
    if not a.days:
        return a.model_copy(update={"enabled": False, "next_trigger_at": None, "snooze_until": None})
    return a.model_copy(update={"next_trigger_at": alarm_next(a, max(now, trigger), tz), "snooze_until": None})


def upcoming_at(a: Alarm) -> int | None:
    if a.snooze_until is not None:
        return a.snooze_until
    return a.next_trigger_at if a.enabled else None


def next_upcoming(alarms: tuple[Alarm, ...] | list[Alarm]) -> tuple[Alarm, int] | None:
    best: tuple[Alarm, int] | None = None
    for a in alarms:
        at = upcoming_at(a)
        if at is not None and (best is None or at < best[1]):
            best = (a, at)
    return best


def sort_key(a: Alarm) -> tuple[int, int]:
    return (a.hour * 60 + a.minute, a.created_at)


def sort_alarms(alarms: list[Alarm] | tuple[Alarm, ...]) -> list[Alarm]:
    return sorted(alarms, key=sort_key)


def is_active(a: Alarm) -> bool:
    return a.enabled or a.snooze_until is not None


def with_enabled(a: Alarm, enabled: bool, now: int, tz: tzinfo | None = None) -> Alarm:
    """Toggle (spec 3.2): on → reschedule from now; off → clear; both drop the snooze."""
    return a.model_copy(
        update={
            "enabled": enabled,
            "next_trigger_at": alarm_next(a, now, tz) if enabled else None,
            "snooze_until": None,
        }
    )


def for_save(a: Alarm, now: int, tz: tzinfo | None = None) -> Alarm:
    """Editor Save (spec 3.3): always enabled, rescheduled, no snooze, not ringing."""
    on = a.model_copy(update={"enabled": True})
    return on.model_copy(
        update={"next_trigger_at": alarm_next(on, now, tz), "snooze_until": None, "ringing_since": None}
    )


def repair(a: Alarm, now: int, tz: tzinfo | None = None) -> Alarm:
    """An enabled alarm without a trigger gets one (reference loadAlarms)."""
    if a.enabled and a.next_trigger_at is None:
        return a.model_copy(update={"next_trigger_at": alarm_next(a, now, tz)})
    return a
