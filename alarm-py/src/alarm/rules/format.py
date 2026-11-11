"""Time formats (spec 3.13)."""

import math
from datetime import tzinfo

from alarm.rules.models import HourCycle, HourCyclePref
from alarm.rules.schedule import local_dt

MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)  # fmt: skip
WEEKDAYS_MON0 = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def pad2(n: int) -> str:
    return f"{n:02d}"


def resolve_cycle(pref: HourCyclePref, system: HourCycle) -> HourCycle:
    return system if pref == "auto" else pref


def system_cycle_from_pattern(pattern: str) -> HourCycle:
    """`auto`: the OS short time format contains `AP`/`ap` → 12h (TZ 6, 3.13)."""
    return "12h" if "a" in pattern.lower() else "24h"


def clock_parts(hour: int, minute: int, cycle: HourCycle) -> tuple[str, str]:
    """('06:30', '') in 24h; ('6:30', 'AM') in 12h."""
    if cycle == "24h":
        return f"{pad2(hour)}:{pad2(minute)}", ""
    h = 12 if hour % 12 == 0 else hour % 12
    return f"{h}:{pad2(minute)}", "AM" if hour < 12 else "PM"


def clock_string(hour: int, minute: int, cycle: HourCycle) -> str:
    time, period = clock_parts(hour, minute, cycle)
    return f"{time} {period}" if period else time


def timestamp_string(ms: int, cycle: HourCycle, tz: tzinfo | None = None) -> str:
    d = local_dt(ms, tz)
    return clock_string(d.hour, d.minute, cycle)


def relative(ms: int) -> str:
    if ms < 60_000:
        return "less than a minute"
    total_min = math.floor(ms / 60_000 + 0.5)
    days, rest = divmod(total_min, 1440)
    hours, minutes = divmod(rest, 60)
    parts: list[str] = []
    if days:
        parts.append(f"{days} {'day' if days == 1 else 'days'}")
    if hours:
        parts.append(f"{hours} hr")
    if minutes and not days:
        parts.append(f"{minutes} min")
    return " ".join(parts)


def countdown(ms: int) -> str:
    total = max(0, math.ceil(ms / 1000))
    h, rest = divmod(total, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{pad2(m)}:{pad2(s)}" if h > 0 else f"{pad2(m)}:{pad2(s)}"


def stopwatch(ms: int) -> str:
    total = max(0, ms // 10)
    cs = total % 100
    s = (total // 100) % 60
    m = (total // 6000) % 60
    h = total // 360000
    base = f"{pad2(m)}:{pad2(s)}.{pad2(cs)}"
    return f"{h}:{base}" if h > 0 else base


def duration_short(seconds: int) -> str:
    """Gradual volume: `Off`, `15 sec`, `1 min`, `1 min 30 sec`."""
    if seconds <= 0:
        return "Off"
    if seconds < 60:
        return f"{seconds} sec"
    m, s = divmod(seconds, 60)
    return f"{m} min {s} sec" if s else f"{m} min"


def duration_words(ms: int) -> str:
    """Recents subtitle: `5 min`, `10 min 30 sec`, `1 hr 2 min`."""
    s = round(ms / 1000)
    h, rest = divmod(s, 3600)
    m, sec = divmod(rest, 60)
    parts = [p for p in (h and f"{h} hr", m and f"{m} min", sec and f"{sec} sec") if p]
    return " ".join(parts)


def grace_label(minutes: int) -> str:
    return f"{minutes} min" if minutes < 60 else f"{minutes // 60} hr"


def ringing_date(ms: int, tz: tzinfo | None = None) -> str:
    """`Tuesday, November 10`."""
    d = local_dt(ms, tz)
    return f"{WEEKDAYS_MON0[d.weekday()]}, {MONTHS[d.month - 1]} {d.day}"


def megabytes(size: int) -> str:
    return f"{size / 1024 / 1024:.1f} MB"
