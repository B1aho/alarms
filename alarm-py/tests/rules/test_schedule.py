from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from alarm.rules.defaults import new_alarm
from alarm.rules.models import Alarm, Settings
from alarm.rules.schedule import (
    Missed,
    Ring,
    Wait,
    advance,
    alarm_subtitle,
    decide,
    for_save,
    next_occurrence,
    next_upcoming,
    repeat_summary,
    sort_alarms,
    with_enabled,
)

TZ = ZoneInfo("Europe/Berlin")
NY = ZoneInfo("America/New_York")


def at(y: int, mo: int, d: int, h: int = 0, mi: int = 0, tz: ZoneInfo = TZ) -> int:
    return int(datetime(y, mo, d, h, mi, tzinfo=tz).timestamp() * 1000)


def alarm(**patch: object) -> Alarm:
    base = new_alarm(Settings(), at(2026, 11, 2, 12), "a").model_copy(update={"hour": 7, "minute": 30})
    return base.model_copy(update=patch)


GRACE = 60 * 60_000


# 2026-11-02 is a Monday.
class TestNextOccurrence:
    def test_one_shot_later_today(self) -> None:
        assert next_occurrence(7, 30, (), at(2026, 11, 2, 6), TZ) == at(2026, 11, 2, 7, 30)

    def test_one_shot_tomorrow_when_passed(self) -> None:
        assert next_occurrence(7, 30, (), at(2026, 11, 2, 8), TZ) == at(2026, 11, 3, 7, 30)

    def test_strictly_after(self) -> None:
        assert next_occurrence(7, 30, (), at(2026, 11, 2, 7, 30), TZ) == at(2026, 11, 3, 7, 30)

    def test_weekdays_skip_weekend(self) -> None:
        assert next_occurrence(7, 30, (1, 2, 3, 4, 5), at(2026, 11, 6, 8), TZ) == at(2026, 11, 9, 7, 30)

    def test_single_weekday_a_week_later(self) -> None:
        assert next_occurrence(7, 30, (1,), at(2026, 11, 2, 8), TZ) == at(2026, 11, 9, 7, 30)

    def test_dst_spring_forward_keeps_wall_clock(self) -> None:
        # Berlin springs forward on 2026-03-29: 07:30 is still 07:30 local.
        got = next_occurrence(7, 30, (), at(2026, 3, 28, 8), TZ)
        assert datetime.fromtimestamp(got / 1000, TZ).strftime("%Y-%m-%d %H:%M") == "2026-03-29 07:30"

    def test_dst_fall_back_keeps_wall_clock(self) -> None:
        got = next_occurrence(7, 30, (), at(2026, 10, 24, 8), TZ)
        assert datetime.fromtimestamp(got / 1000, TZ).strftime("%Y-%m-%d %H:%M") == "2026-10-25 07:30"

    def test_skipped_hour_rings_after_the_gap(self) -> None:
        # 02:30 does not exist on 2026-03-08 in New York: it rings once the clocks move on.
        got = next_occurrence(2, 30, (), at(2026, 3, 8, 0, 0, NY), NY)
        assert at(2026, 3, 8, 0, 0, NY) < got <= at(2026, 3, 8, 4, 0, NY)


days_st = st.sets(st.integers(0, 6), max_size=7).map(lambda s: tuple(sorted(s)))
after_st = st.integers(at(2020, 1, 1), at(2035, 12, 31))
tz_st = st.sampled_from([TZ, NY, ZoneInfo("UTC"), ZoneInfo("Australia/Lord_Howe"), ZoneInfo("Asia/Kolkata")])


@settings(max_examples=400, deadline=None)
@given(st.integers(0, 23), st.integers(0, 59), days_st, after_st, tz_st)
def test_next_occurrence_properties(hour: int, minute: int, days: tuple[int, ...], after: int, tz: ZoneInfo) -> None:
    got = next_occurrence(hour, minute, days, after, tz)
    assert got > after
    assert got - after <= 8 * 86_400_000 + 3_600_000
    local = datetime.fromtimestamp(got / 1000, tz)
    if days:
        assert (local.weekday() + 1) % 7 in days
    # It rings at hour:minute local time unless that wall time does not exist (DST gap).
    wall = datetime(local.year, local.month, local.day, hour, minute, tzinfo=tz)
    exists = datetime.fromtimestamp(wall.timestamp(), tz).replace(tzinfo=None) == wall.replace(tzinfo=None)
    if exists:
        assert (local.hour, local.minute) == (hour, minute)


@pytest.mark.parametrize(
    ("days", "text"),
    [
        ((), "Never"),
        ((0, 1, 2, 3, 4, 5, 6), "Every day"),
        ((1, 2, 3, 4, 5), "Weekdays"),
        ((6, 0), "Weekends"),
        ((3,), "Every Wednesday"),
        ((0, 1, 5), "Mon Fri Sun"),
    ],
)
def test_repeat_summary(days: tuple[int, ...], text: str) -> None:
    assert repeat_summary(days) == text


def test_subtitles() -> None:
    assert alarm_subtitle(alarm(label="Work", days=(1, 2, 3, 4, 5))) == "Work, weekdays"
    assert alarm_subtitle(alarm(label="Gym")) == "Gym"
    assert alarm_subtitle(alarm(label="Take vitamins", days=tuple(range(7)))) == "Take vitamins, every day"
    assert alarm_subtitle(alarm(label="  ")) == "Alarm"


class TestDecide:
    trigger = at(2026, 11, 3, 7, 30)

    def test_waits_before(self) -> None:
        assert decide(alarm(next_trigger_at=self.trigger), self.trigger - 1000, GRACE) == Wait()

    def test_rings_at_trigger(self) -> None:
        assert decide(alarm(next_trigger_at=self.trigger), self.trigger, GRACE) == Ring("schedule", self.trigger)

    def test_rings_late_within_grace(self) -> None:
        assert isinstance(decide(alarm(next_trigger_at=self.trigger), self.trigger + 30 * 60_000, GRACE), Ring)

    def test_grace_boundary_is_inclusive(self) -> None:
        assert isinstance(decide(alarm(next_trigger_at=self.trigger), self.trigger + GRACE, GRACE), Ring)
        assert isinstance(decide(alarm(next_trigger_at=self.trigger), self.trigger + GRACE + 1, GRACE), Missed)

    def test_missed_beyond_grace(self) -> None:
        assert decide(alarm(next_trigger_at=self.trigger), self.trigger + 90 * 60_000, GRACE) == Missed(
            "schedule", self.trigger
        )

    def test_ignores_disabled(self) -> None:
        assert decide(alarm(enabled=False, next_trigger_at=self.trigger), self.trigger, GRACE) == Wait()

    def test_no_refire_while_ringing(self) -> None:
        a = alarm(next_trigger_at=self.trigger, ringing_since=self.trigger)
        assert decide(a, self.trigger + 5000, GRACE) == Wait()

    def test_snooze_rings_even_when_disabled(self) -> None:
        a = alarm(enabled=False, next_trigger_at=None, snooze_until=self.trigger)
        assert decide(a, self.trigger, GRACE) == Ring("snooze", self.trigger)

    def test_snooze_missed(self) -> None:
        a = alarm(enabled=False, snooze_until=self.trigger)
        assert decide(a, self.trigger + GRACE + 1, GRACE) == Missed("snooze", self.trigger)


class TestAdvance:
    trigger = at(2026, 11, 3, 7, 30)

    def test_one_shot_turns_off(self) -> None:
        a = advance(alarm(next_trigger_at=self.trigger), "schedule", self.trigger, self.trigger, TZ)
        assert (a.enabled, a.next_trigger_at, a.snooze_until) == (False, None, None)

    def test_repeat_moves_to_next_day(self) -> None:
        a = advance(alarm(days=tuple(range(7))), "schedule", self.trigger, self.trigger + 5000, TZ)
        assert a.next_trigger_at == at(2026, 11, 4, 7, 30)

    def test_snooze_only_clears_snooze(self) -> None:
        a = alarm(enabled=False, next_trigger_at=None, snooze_until=self.trigger)
        b = advance(a, "snooze", self.trigger, self.trigger, TZ)
        assert (b.enabled, b.next_trigger_at, b.snooze_until) == (False, None, None)


def test_next_upcoming_prefers_earliest_snooze_or_enabled() -> None:
    a = alarm(id="a", next_trigger_at=300)
    b = alarm(id="b", enabled=False, next_trigger_at=None, snooze_until=200)
    c = alarm(id="c", enabled=False, next_trigger_at=100)
    best = next_upcoming([a, b, c])
    assert best is not None and best[0].id == "b"
    assert next_upcoming([c]) is None


def test_toggle_and_save() -> None:
    now = at(2026, 11, 2, 12)
    on = with_enabled(alarm(enabled=False, snooze_until=5), True, now, TZ)
    assert on.next_trigger_at == at(2026, 11, 3, 7, 30) and on.snooze_until is None
    off = with_enabled(on, False, now, TZ)
    assert off.next_trigger_at is None and not off.enabled
    saved = for_save(alarm(enabled=False, ringing_since=1, snooze_until=2), now, TZ)
    assert saved.enabled and saved.ringing_since is None and saved.snooze_until is None
    assert saved.next_trigger_at == at(2026, 11, 3, 7, 30)


def test_sort_by_time_then_created() -> None:
    a = alarm(id="a", hour=9, minute=0, created_at=2)
    b = alarm(id="b", hour=6, minute=30, created_at=5)
    c = alarm(id="c", hour=9, minute=0, created_at=1)
    assert [x.id for x in sort_alarms([a, b, c])] == ["b", "c", "a"]
