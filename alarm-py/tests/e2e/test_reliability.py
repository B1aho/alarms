"""Section 7 scenarios against the real process: window closed, sleep, crashes, second launch, bad files."""

import json
import re
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

from tests.e2e.proc import App

pytestmark = pytest.mark.e2e

T0 = (int(time.time()) // 60 + 120) * 60 * 1000  # a whole minute, two hours ahead


@pytest.fixture
def app(tmp_path: Path) -> Iterator[App]:
    a = App(tmp_path)
    yield a
    a.stop()


def rung_at(app: App, alarm_id: str) -> int:
    m = app.wait_log(rf"ringing {alarm_id} \((?:schedule|snooze)\) at (\d+)")[-1]
    return int(m.group(1))


def test_rings_with_window_closed_within_a_second(app: App) -> None:
    app.write_alarm("work", T0)
    app.start("--hidden", "--fake-clock", f"{T0 - 4000}")
    assert app.command("window") == "closed"
    late = rung_at(app, "work") - T0
    assert 0 <= late <= 1000
    app.wait_log(r"play alarm:work")
    app.wait_log(r"notify alarm-work: ⏰ Work")
    app.wait_for(lambda: app.command("window") == "ringing", 5, "ringing window")
    app.wait_log(r"ringing: window full screen on top")
    assert app.alarm_file("work")["ringing_since"] is not None


def test_after_sleep_within_grace_rings_beyond_grace_is_missed(app: App) -> None:
    app.write_alarm("soon", T0, days=(0, 1, 2, 3, 4, 5, 6))
    app.write_alarm("old", T0 - 3 * 3_600_000 + 60_000, label="Old")
    app.start("--hidden", "--fake-clock", f"{T0 - 60_000}")
    app.wait_log(r"missed old")  # 3 h late > 60 min grace
    app.wait_log(r"notify alarm-old: Missed alarm: Old")
    assert app.alarm_file("old")["enabled"] is False
    assert app.command("advance 1800000") == "ok"  # the computer "slept" 30 min past the trigger
    late = rung_at(app, "soon") - T0
    assert late <= 30 * 60_000 + 1000
    nxt = app.alarm_file("soon")["next_trigger_at"]
    assert nxt == T0 + 86_400_000 or abs(nxt - (T0 + 86_400_000)) == 3_600_000  # DST-safe


def test_audio_crash_resumes_sound_and_notifier_crash_is_harmless(app: App) -> None:
    app.write_alarm("work", T0)
    app.write_alarm("next", T0 + 120_000)
    app.start("--hidden", "--fake-clock", f"{T0 - 1000}")
    rung_at(app, "work")
    app.wait_log(r"play alarm:work")
    t = time.monotonic()
    assert app.command("crash audio") == "ok"
    app.wait_log(r"restarting actor audio", 3)
    app.wait_log(r"play alarm:work", 3, count=2)
    assert time.monotonic() - t <= 1.5
    assert app.command("crash notifier") == "ok"
    app.wait_log(r"restarting actor notifier", 3)
    assert app.command("advance 118000") == "ok"
    assert app.command("crash clock") == "ok"  # schedule keeps going after a clock restart
    app.wait_log(r"restarting actor clock", 3)
    rung_at(app, "next")


def test_second_launch_shows_first_window_and_exits(app: App) -> None:
    app.start("--hidden", "--fake-clock", f"{T0}")
    second = subprocess.run(
        [sys.executable, "-m", "alarm", "--fake-clock", f"{T0}"], env=app.env, timeout=30, check=False
    )
    assert second.returncode == 0
    app.wait_log(r"window shown")
    assert app.command("window") == "open"
    assert app.proc is not None and app.proc.poll() is None


def test_broken_files_do_not_crash(app: App) -> None:
    app.write_alarm("good", T0)
    (app.data / "alarms" / "bad.json").write_text("{oops")
    app.write("settings.json", json.dumps({"theme": "neon", "snooze_minutes": 3}))
    app.start("--hidden", "--fake-clock", f"{T0 - 1000}")
    app.wait_log(r"skipping broken alarm file bad.json")
    rung_at(app, "good")
    assert app.command("ping") == "pong"


def test_ringing_survives_restart_and_quit_is_clean(app: App) -> None:
    app.write_alarm("work", T0)
    app.start("--hidden", "--fake-clock", f"{T0 - 1000}")
    rung_at(app, "work")
    app.stop()
    assert app.proc is not None and app.proc.returncode == 0  # Quit: a normal exit
    app.start("--hidden", "--fake-clock", f"{T0 + 60_000}")
    app.wait_log(r"play alarm:work", count=2)
    app.wait_for(lambda: app.command("window") == "ringing", 5, "ringing window after restart")


@pytest.mark.skipif(
    sys.platform != "darwin" or __import__("os").environ.get("ALARM_E2E_LAUNCHD") != "1",
    reason="registers a temporary LaunchAgent: opt in with ALARM_E2E_LAUNCHD=1 on a machine nobody is using",
)
def test_kill_9_while_ringing_is_restarted_by_login_agent(tmp_path: Path) -> None:
    from alarm.actors.power.autostart import MacAgent, spec

    label = f"org.alarmclock.e2e.{int(time.time())}"
    app = App(tmp_path, env={"ALARM_DEV_AUTOSTART": "1", "ALARM_AGENT_LABEL": label, "QT_QPA_PLATFORM": "offscreen"})
    # Ringing state on disk, as if the process had been ringing.
    app.write_alarm("work", T0, ringing_since=int(time.time() * 1000))
    import os

    old = {k: os.environ.get(k) for k in ("ALARM_AGENT_LABEL", "ALARM_DEV_AUTOSTART", "ALARM_DATA_DIR")}
    os.environ.update({"ALARM_AGENT_LABEL": label, "ALARM_DEV_AUTOSTART": "1", "ALARM_DATA_DIR": str(app.data)})
    agent = MacAgent(spec())
    try:
        launcher = subprocess.run([sys.executable, "-m", "alarm", "--hidden"], env=app.env, timeout=60, check=False)
        assert launcher.returncode == 0  # handed over to the agent
        app.wait_log(r"starting \(pid (\d+)")
        pid = int(re.findall(r"starting \(pid (\d+)", app.log)[-1])
        app.wait_log(r"play alarm:work")
        subprocess.run(["kill", "-9", str(pid)], check=True)
        app.wait_log(r"starting \(pid (\d+)", 20, count=2)
        new_pid = int(re.findall(r"starting \(pid (\d+)", app.log)[-1])
        assert new_pid != pid
        app.wait_log(r"play alarm:work", 10, count=2)  # ringing continues
        assert app.command("quit") == "ok"
        time.sleep(3)
        assert len(re.findall(r"starting \(pid", app.log)) == 2  # a clean Quit is not restarted
    finally:
        agent.remove()
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
