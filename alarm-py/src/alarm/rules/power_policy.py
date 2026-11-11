"""Keep-awake policy (TZ 3.7): hold while the setting is on and some alarm is on, snoozed or ringing."""

from alarm.rules.models import Alarm


def should_keep_awake(keep_awake: bool, alarms: tuple[Alarm, ...] | list[Alarm]) -> bool:
    if not keep_awake:
        return False
    return any(a.enabled or a.snooze_until is not None or a.ringing_since is not None for a in alarms)


def next_wake(alarms: tuple[Alarm, ...] | list[Alarm]) -> int | None:
    """Soonest ring time for a wake timer (Windows only, TZ 3.17)."""
    times = [t for a in alarms for t in (a.snooze_until, a.next_trigger_at if a.enabled else None) if t is not None]
    return min(times) if times else None
