import json
import random
from pathlib import Path

import pytest

from alarm.actors.alarms import AlarmActor
from alarm.actors.settings import SettingsActor
from alarm.actors.store import StoreActor
from alarm.kernel import registry, tell
from alarm.messages import system as sys_msg
from alarm.messages.alarms import (
    AlarmsChanged,
    BackFromTask,
    CancelSnooze,
    DeleteAlarm,
    RingingChanged,
    SaveAlarm,
    SetAlarmEnabled,
    Snooze,
    Stop,
    SubmitAnswer,
)
from alarm.messages.audio import Play, StopSound
from alarm.messages.notify import CloseNotification, Notify
from alarm.messages.settings import SettingsChanged, UpdateSettings
from alarm.rules.defaults import new_alarm
from alarm.rules.models import Alarm, DismissTask, Settings
from tests.actors.world import World, local_ms, wait_for

NOON = local_ms(2026, 11, 2, 12, 0)  # Monday


def build(tmp_path: Path, start: int = NOON, rng_seed: int = 1) -> World:
    w = World(tmp_path, start)
    w.add(sys_msg.STORE, lambda r: StoreActor(tmp_path, restarted=r))
    w.add(sys_msg.SETTINGS, lambda r: SettingsActor("24h", restarted=r))
    w.add(
        sys_msg.ALARMS,
        lambda r: AlarmActor(restarted=r, rng=random.Random(rng_seed)),
        subscribe=(SettingsChanged,),
    )
    return w.start()


def make(hour: int, minute: int, **kw: object) -> Alarm:
    a = new_alarm(Settings(), NOON, kw.pop("id", "a1"))  # type: ignore[arg-type]
    return a.model_copy(update={"hour": hour, "minute": minute, **kw})


def last_alarms(w: World) -> tuple[Alarm, ...]:
    return w.events.of(AlarmsChanged)[-1].alarms


def on_disk(tmp_path: Path, alarm_id: str) -> dict[str, object]:
    return json.loads((tmp_path / "alarms" / f"{alarm_id}.json").read_text())


@pytest.fixture
def world(tmp_path: Path):  # type: ignore[no-untyped-def]
    w = build(tmp_path)
    yield w
    w.stop()


def test_rings_once_at_trigger_with_notification(world: World, tmp_path: Path) -> None:
    world.send(SaveAlarm(make(12, 1, label="Work")))
    world.tick()
    assert world.audio.of(Play) == []
    world.set_time(local_ms(2026, 11, 2, 12, 1, 0))
    world.tick()
    world.tick()  # a second tick must not ring again
    plays = world.audio.of(Play)
    assert len(plays) == 1 and plays[0].key == "alarm:a1" and plays[0].builtin == "sunrise"
    assert plays[0].volume == 0.9 and plays[0].ramp_s == 60
    note = world.notifier.of(Notify)[-1]
    assert note.title == "⏰ Work" and note.body == "12:01\nOpen the app to turn it off."
    assert note.snooze_label == "Snooze 9 min" and note.sticky
    world.sync(sys_msg.STORE)
    assert on_disk(tmp_path, "a1")["ringing_since"] == world.now()
    one_shot = on_disk(tmp_path, "a1")
    assert one_shot["enabled"] is False and one_shot["next_trigger_at"] is None
    ringing = world.events.of(RingingChanged)[-1].ringing
    assert [r.alarm_id for r in ringing] == ["a1"] and ringing[0].label == "Work"


def test_repeat_moves_to_next_day(world: World) -> None:
    world.send(SaveAlarm(make(12, 1, days=(0, 1, 2, 3, 4, 5, 6))))
    world.set_time(local_ms(2026, 11, 2, 12, 1, 0))
    world.tick()
    a = last_alarms(world)[0]
    assert a.enabled and a.next_trigger_at == local_ms(2026, 11, 3, 12, 1)


def test_missed_beyond_grace(world: World) -> None:
    world.send(SaveAlarm(make(12, 1, label="Gym")))
    world.set_time(local_ms(2026, 11, 2, 13, 2))  # 61 min late, grace 60
    world.tick(resumed=True)
    assert world.audio.of(Play) == []
    note = world.notifier.of(Notify)[-1]
    assert note.title == "Missed alarm: Gym"
    assert note.body == "It was set for 12:01, while the computer was asleep or the app was closed."
    assert not last_alarms(world)[0].enabled


def test_late_within_grace_rings(world: World) -> None:
    world.send(SaveAlarm(make(12, 1)))
    world.set_time(local_ms(2026, 11, 2, 12, 50))
    world.tick(resumed=True)
    assert len(world.audio.of(Play)) == 1


def test_missed_over_12h_is_silent(world: World) -> None:
    world.send(SaveAlarm(make(12, 1, days=(1,))))
    world.set_time(local_ms(2026, 11, 3, 1, 0))
    world.tick()
    world.set_time(local_ms(2026, 11, 9, 14, 0))  # missed the Monday 12:01 by ~2 h → notify
    world.tick()
    assert [n.title for n in world.notifier.of(Notify)] == ["Missed alarm: Alarm"]


def test_snooze_and_ring_again(world: World) -> None:
    world.send(SaveAlarm(make(12, 1)))
    world.set_time(local_ms(2026, 11, 2, 12, 1))
    world.tick()
    world.send(Snooze())
    stop = world.audio.of(StopSound)[-1]
    assert stop.key == "alarm:a1" and stop.fade_s == pytest.approx(0.12)
    assert CloseNotification("alarm-a1") in world.notifier.items
    a = last_alarms(world)[0]
    assert a.ringing_since is None and a.snooze_until == world.now() + 9 * 60_000
    assert world.events.of(RingingChanged)[-1].ringing == ()
    assert a.snooze_until is not None
    world.set_time(a.snooze_until)
    world.tick()
    assert len(world.audio.of(Play)) == 2
    # Snooze again, then cancel from the list.
    world.send(Snooze("a1"))
    world.send(CancelSnooze("a1"))
    assert last_alarms(world)[0].snooze_until is None


def test_snooze_ignored_when_disabled_for_alarm(world: World) -> None:
    world.send(SaveAlarm(make(12, 1, snooze=False)))
    world.set_time(local_ms(2026, 11, 2, 12, 1))
    world.tick()
    world.send(Snooze())
    assert world.events.of(RingingChanged)[-1].ringing[0].snooze is False
    assert world.audio.of(StopSound) == []
    assert world.notifier.of(Notify)[-1].snooze_label is None


def answer_of(prompt: str) -> str:
    expr = prompt.rstrip(" =").replace("×", "*").replace("−", "-")
    return str(eval(expr))


def test_task_flow(world: World) -> None:
    task = DismissTask(type="math", difficulty="hard", count=2)
    world.send(SaveAlarm(make(12, 1, task=task)))
    world.set_time(local_ms(2026, 11, 2, 12, 1))
    world.tick()
    world.send(Stop("a1"))
    r = world.events.of(RingingChanged)[-1].ringing[0]
    assert r.stage == "task" and r.prompt.endswith(" =") and (r.solved, r.total) == (0, 2)
    assert world.audio.of(StopSound) == []  # keeps ringing during the task
    world.send(SubmitAnswer("a1", "nonsense"))
    r2 = world.events.of(RingingChanged)[-1].ringing[0]
    assert r2.wrong == 1 and r2.solved == 0
    world.send(SubmitAnswer("a1", answer_of(r2.prompt)))
    r3 = world.events.of(RingingChanged)[-1].ringing[0]
    assert r3.solved == 1 and r3.wrong == 1
    world.send(BackFromTask("a1"))
    assert world.events.of(RingingChanged)[-1].ringing[0].stage == "buttons"
    world.send(Stop("a1"))
    for _ in range(2):
        r = world.events.of(RingingChanged)[-1].ringing[0]
        world.send(SubmitAnswer("a1", answer_of(r.prompt)))
    assert world.events.of(RingingChanged)[-1].ringing == ()
    assert world.audio.of(StopSound)[-1].fade_s == pytest.approx(0.25)
    a = last_alarms(world)[0]
    assert a.ringing_since is None and a.snooze_until is None


def test_stop_without_task_dismisses(world: World) -> None:
    world.send(SaveAlarm(make(12, 1, task=DismissTask(type="none", difficulty="easy", count=1))))
    world.set_time(local_ms(2026, 11, 2, 12, 1))
    world.tick()
    world.send(Stop("a1"))
    assert world.events.of(RingingChanged)[-1].ringing == ()


def test_several_ringing_show_first_by_time(world: World) -> None:
    world.set_time(local_ms(2026, 11, 2, 12, 2))  # both next ring tomorrow
    world.send(SaveAlarm(make(12, 1, id="late", label="B")))
    world.send(SaveAlarm(make(12, 0, id="early", label="A")))
    world.set_time(local_ms(2026, 11, 3, 12, 1))
    world.tick()
    assert [r.alarm_id for r in world.events.of(RingingChanged)[-1].ringing] == ["early", "late"]
    assert {p.key for p in world.audio.of(Play)} == {"alarm:early", "alarm:late"}


def test_toggle_delete_and_settings(world: World, tmp_path: Path) -> None:
    world.send(SaveAlarm(make(7, 30)))
    world.send(SetAlarmEnabled("a1", False))
    assert last_alarms(world)[0].next_trigger_at is None
    world.send(UpdateSettings(Settings(snooze_minutes=5, hour_cycle="12h")), sys_msg.SETTINGS)
    world.send(DeleteAlarm("a1"))
    assert last_alarms(world) == ()
    world.sync(sys_msg.STORE)
    assert not (tmp_path / "alarms" / "a1.json").exists()
    assert json.loads((tmp_path / "settings.json").read_text())["snooze_minutes"] == 5


def test_ringing_survives_process_restart(tmp_path: Path) -> None:
    w = build(tmp_path)
    w.send(SaveAlarm(make(12, 1)))
    w.set_time(local_ms(2026, 11, 2, 12, 1))
    w.tick()
    w.stop()
    w2 = build(tmp_path, start=local_ms(2026, 11, 2, 12, 3))
    wait_for(lambda: w2.events.of(RingingChanged))
    w2.sync(sys_msg.ALARMS)
    assert [r.alarm_id for r in w2.events.of(RingingChanged)[-1].ringing] == ["a1"]
    assert len(w2.audio.of(Play)) == 1
    w2.stop()


def test_crash_restart_reloads_state_and_keeps_ringing(world: World) -> None:
    world.send(SaveAlarm(make(12, 1)))
    world.set_time(local_ms(2026, 11, 2, 12, 1))
    world.tick()
    world.audio.clear()
    tell(sys_msg.ALARMS, "not-a-message-but-handled")  # unknown messages are ignored, no crash
    world.sync(sys_msg.ALARMS)
    assert world.sup.restarts(sys_msg.ALARMS) == 0
    tell(sys_msg.ALARMS, DeleteAlarm(["unhashable"]))  # type: ignore[arg-type]  # crashes the actor
    wait_for(lambda: world.sup.restarts(sys_msg.ALARMS) == 1)
    world.sync(sys_msg.ALARMS)
    assert registry.address(sys_msg.ALARMS).alive
    assert [r.alarm_id for r in world.events.of(RingingChanged)[-1].ringing] == ["a1"]
    # The restarted actor took over the sound: it tells audio to play what rings.
    assert [p.key for p in world.audio.of(Play)] == ["alarm:a1"]
