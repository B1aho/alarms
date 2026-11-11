from pathlib import Path

import pytest

from alarm.actors.stopwatch import StopwatchActor
from alarm.actors.store import StoreActor
from alarm.actors.timer import TimerActor
from alarm.messages import system as sys_msg
from alarm.messages.audio import Play, StopSound
from alarm.messages.notify import CloseNotification, Notify
from alarm.messages.stopwatch import Lap, Reset, Start, Stop, StopwatchChanged
from alarm.messages.timer import (
    CancelTimer,
    PauseTimer,
    RemoveRecent,
    RepeatTimer,
    ResumeTimer,
    SetTimerDuration,
    StartTimer,
    StopTimerRinging,
    TimerAlert,
    TimerChanged,
)
from tests.actors.world import World, local_ms

T0 = local_ms(2026, 11, 2, 12, 0)


def build(tmp_path: Path, start: int = T0) -> World:
    w = World(tmp_path, start)
    w.add(sys_msg.STORE, lambda r: StoreActor(tmp_path, restarted=r))
    w.add(sys_msg.TIMER, lambda r: TimerActor(restarted=r))
    w.add(sys_msg.STOPWATCH, lambda r: StopwatchActor(restarted=r))
    return w.start()


@pytest.fixture
def world(tmp_path: Path):  # type: ignore[no-untyped-def]
    w = build(tmp_path)
    yield w
    w.stop()


def state(w: World):  # type: ignore[no-untyped-def]
    return w.events.of(TimerChanged)[-1].state


def test_timer_runs_pauses_resumes_and_rings(world: World) -> None:
    world.send(SetTimerDuration(500), sys_msg.TIMER)
    assert state(world).duration_ms == 1000  # minimum 1 s
    world.send(StartTimer(90_000, "Tea"), sys_msg.TIMER)
    s = state(world)
    assert (s.status, s.ends_at, s.label) == ("running", T0 + 90_000, "Tea")
    world.set_time(T0 + 30_000)
    world.send(PauseTimer(), sys_msg.TIMER)
    assert (state(world).status, state(world).remaining_ms) == ("paused", 60_000)
    world.set_time(T0 + 100_000)
    world.send(ResumeTimer(), sys_msg.TIMER)
    assert state(world).ends_at == T0 + 160_000
    world.set_time(T0 + 160_000)
    world.tick(sys_msg.TIMER)
    assert state(world).status == "ringing"
    play = world.audio.of(Play)[-1]
    assert (play.key, play.builtin, play.volume, play.ramp_s, play.loop) == ("timer", "chimes", 0.9, 3, True)
    note = world.notifier.of(Notify)[-1]
    assert (note.title, note.body, note.sticky) == ("⏱ Tea", "01:30 timer is done.", True)
    assert world.events.of(TimerAlert)
    world.send(StopTimerRinging(), sys_msg.TIMER)
    assert state(world).status == "idle"
    assert world.audio.of(StopSound)[-1].key == "timer"
    assert CloseNotification("timer") in world.notifier.items


def test_repeat_and_recents(world: World) -> None:
    for d in (60_000, 120_000, 60_000, 3_000, 4_000, 5_000, 6_000, 7_000):
        world.send(StartTimer(d), sys_msg.TIMER)
    recents = [r.duration_ms for r in state(world).recents]
    assert recents == [7_000, 6_000, 5_000, 4_000, 3_000, 60_000]
    world.send(RemoveRecent(3_000), sys_msg.TIMER)
    assert 3_000 not in [r.duration_ms for r in state(world).recents]
    world.set_time(T0 + 7_000)
    world.tick(sys_msg.TIMER)
    world.send(RepeatTimer(), sys_msg.TIMER)
    assert state(world).status == "running" and state(world).ends_at == T0 + 14_000
    world.send(CancelTimer(), sys_msg.TIMER)
    assert state(world).status == "idle"


def test_timer_late_more_than_10_min_only_notifies(world: World) -> None:
    world.send(StartTimer(60_000), sys_msg.TIMER)
    world.set_time(T0 + 60_000 + 10 * 60_000 + 1)
    world.tick(sys_msg.TIMER, resumed=True)
    assert state(world).status == "idle"
    assert world.audio.of(Play) == []
    note = world.notifier.of(Notify)[-1]
    assert (note.title, note.body) == ("Timer ended", "Your 01:00 timer finished while the computer was asleep.")


def test_timer_and_stopwatch_continue_after_restart(tmp_path: Path) -> None:
    w = build(tmp_path)
    w.send(StartTimer(60_000), sys_msg.TIMER)
    w.send(Start(), sys_msg.STOPWATCH)
    w.set_time(T0 + 1_000)
    w.send(Lap(), sys_msg.STOPWATCH)
    w.sync(sys_msg.STORE)
    w.stop()
    w2 = build(tmp_path, start=T0 + 5_000)
    w2.sync(sys_msg.TIMER)
    w2.sync(sys_msg.STOPWATCH)
    assert w2.events.of(TimerChanged)[-1].state.ends_at == T0 + 60_000
    sw = w2.events.of(StopwatchChanged)[-1].state
    assert sw.started_at == T0 and sw.laps == (1_000,)
    w2.send(Stop(), sys_msg.STOPWATCH)
    assert w2.events.of(StopwatchChanged)[-1].state.accumulated_ms == 5_000
    w2.send(Reset(), sys_msg.STOPWATCH)
    assert w2.events.of(StopwatchChanged)[-1].state.laps == ()
    w2.stop()
