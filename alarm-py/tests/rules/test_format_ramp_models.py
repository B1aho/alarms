import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from alarm.rules import format as fmt
from alarm.rules.defaults import file_ext, file_stem, playable, sound_name
from alarm.rules.models import CustomSound, Settings, SoundRef, parse_settings, parse_stopwatch, parse_timer
from alarm.rules.power_policy import should_keep_awake
from alarm.rules.ramp import gain


def test_clock() -> None:
    assert fmt.clock_parts(6, 30, "24h") == ("06:30", "")
    assert fmt.clock_parts(0, 5, "12h") == ("12:05", "AM")
    assert fmt.clock_parts(12, 0, "12h") == ("12:00", "PM")
    assert fmt.clock_parts(23, 59, "12h") == ("11:59", "PM")
    assert fmt.clock_string(7, 15, "12h") == "7:15 AM"


@pytest.mark.parametrize(
    ("ms", "text"),
    [
        (59_999, "less than a minute"),
        (45 * 60_000, "45 min"),
        ((7 * 60 + 12) * 60_000, "7 hr 12 min"),
        ((27 * 60 + 5) * 60_000, "1 day 3 hr"),
        (2 * 1440 * 60_000, "2 days"),
        (90_000, "2 min"),
    ],
)
def test_relative(ms: int, text: str) -> None:
    assert fmt.relative(ms) == text


def test_countdown_and_stopwatch() -> None:
    assert fmt.countdown(5 * 60_000) == "05:00"
    assert fmt.countdown(299_001) == "05:00"
    assert fmt.countdown(3_600_000 + 61_000) == "1:01:01"
    assert fmt.countdown(-5) == "00:00"
    assert fmt.stopwatch(0) == "00:00.00"
    assert fmt.stopwatch(61_234) == "01:01.23"
    assert fmt.stopwatch(3_600_000 + 1_010) == "1:00:01.01"


def test_durations() -> None:
    assert [fmt.duration_short(s) for s in (0, 15, 60, 90, 600)] == ["Off", "15 sec", "1 min", "1 min 30 sec", "10 min"]
    assert fmt.duration_words(5 * 60_000) == "5 min"
    assert fmt.duration_words(630_000) == "10 min 30 sec"
    assert fmt.duration_words(3_720_000) == "1 hr 2 min"
    assert [fmt.grace_label(m) for m in (5, 60, 240)] == ["5 min", "1 hr", "4 hr"]
    assert fmt.megabytes(3_355_443) == "3.2 MB"


def test_ringing_date_and_cycle() -> None:
    tz = ZoneInfo("Europe/Berlin")
    ms = int(datetime(2026, 11, 10, 7, 0, tzinfo=tz).timestamp() * 1000)
    assert fmt.ringing_date(ms, tz) == "Tuesday, November 10"
    assert fmt.system_cycle_from_pattern("h:mm AP") == "12h"
    assert fmt.system_cycle_from_pattern("HH:mm") == "24h"
    assert fmt.resolve_cycle("auto", "12h") == "12h" and fmt.resolve_cycle("24h", "12h") == "24h"


def test_ramp_curve() -> None:
    assert gain(0, 0.8, 60) == pytest.approx(0.8 * 0.015)
    assert gain(30, 1.0, 60) == pytest.approx(0.015 + 0.985 * 0.25)
    assert gain(60, 0.8, 60) == pytest.approx(0.8)
    assert gain(600, 0.8, 60) == pytest.approx(0.8)
    assert gain(0, 0.7, 0) == 0.7
    values = [gain(t, 1.0, 10) for t in range(11)]
    assert values == sorted(values)


def test_settings_bad_key_gets_default_others_survive() -> None:
    raw = json.loads('{"theme": "neon", "snooze_minutes": 12, "volume": 7, "keep_awake": true, "open_at_login": "x"}')
    s = parse_settings(raw)
    assert s.theme == "system" and s.snooze_minutes == 12 and s.volume == 0.9 and s.keep_awake
    assert s.open_at_login is True
    assert parse_settings("garbage") == Settings()
    assert Settings().default_sound == SoundRef(kind="builtin", id="sunrise")
    assert Settings().missed_grace_minutes == 60 and Settings().ramp_seconds == 60


def test_timer_and_stopwatch_parse() -> None:
    t = parse_timer({"status": "bogus", "duration_ms": 500, "label": "Tea"})
    assert t.status == "idle" and t.duration_ms == 300_000 and t.label == "Tea"
    assert t.sound.id == "chimes"
    assert parse_stopwatch({"started_at": "x"}).accumulated_ms == 0


def test_sounds() -> None:
    customs = [CustomSound(id="c1", name="Song", size=1, added_at=0, ext="mp3")]
    assert sound_name(SoundRef(kind="custom", id="c1"), customs) == "Song"
    assert sound_name(SoundRef(kind="custom", id="gone"), customs) == "Missing file"
    assert sound_name(SoundRef(kind="builtin", id="classic"), customs) == "Classic Bell"
    assert playable(SoundRef(kind="custom", id="gone"), customs).id == "sunrise"
    assert file_stem("/a/b/My Song.final.mp3") == "My Song.final" and file_ext("x.FLAC") == "flac"


def test_keep_awake_policy() -> None:
    from alarm.rules.defaults import new_alarm

    a = new_alarm(Settings(), 0, "a")
    assert should_keep_awake(True, [a])
    assert not should_keep_awake(False, [a])
    off = a.model_copy(update={"enabled": False})
    assert not should_keep_awake(True, [off])
    assert should_keep_awake(True, [off.model_copy(update={"snooze_until": 5})])
    assert should_keep_awake(True, [off.model_copy(update={"ringing_since": 5})])
