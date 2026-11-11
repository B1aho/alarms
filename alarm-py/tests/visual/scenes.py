"""The 36 screens of docs/screens as reproducible scenes: fixtures + UI actions, frozen at 11:51."""

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PySide6.QtGui import QImage

from alarm.kernel import tell
from alarm.messages import system as sys_msg
from alarm.messages.alarms import Stop, SubmitAnswer
from alarm.rules.defaults import new_alarm
from alarm.rules.models import (
    Alarm,
    DismissTask,
    RecentTimer,
    Settings,
    StopwatchState,
    TimerState,
)
from tests.visual.harness import Harness, ms

NOW = ms(2026, 11, 10, 11, 51, 0)  # Tuesday, November 10
DAY = 86_400_000


def alarm(i: str, h: int, m: int, label: str, days: tuple[int, ...], enabled: bool, created: int, **kw: Any) -> Alarm:
    a = new_alarm(Settings(), NOW - DAY * 3 + created, i)
    nxt = None
    if enabled:
        from alarm.rules.schedule import next_occurrence

        nxt = next_occurrence(h, m, days, NOW)
    return a.model_copy(update={"hour": h, "minute": m, "label": label, "days": days, "enabled": enabled,
                                 "next_trigger_at": nxt, **kw})  # fmt: skip


def list_alarms() -> list[Alarm]:
    return [
        alarm("work", 6, 30, "Work", (1, 2, 3, 4, 5), True, 1),
        alarm("gym", 7, 15, "Gym", (), False, 2, snooze_until=NOW + 6 * 60_000),
        alarm("weekend", 9, 0, "Weekend", (0, 6), False, 3),
        alarm("vitamins", 22, 45, "Take vitamins", (0, 1, 2, 3, 4, 5, 6), True, 4),
    ]


def ringing(snooze: bool = True, task: DismissTask | None = None) -> list[Alarm]:
    t = task or DismissTask(type="math", difficulty="medium", count=2)
    return [alarm("work", 11, 51, "Work", (), False, 1, ringing_since=NOW, snooze=snooze, task=t)]


@dataclass
class Scene:
    alarms: Callable[[], list[Alarm]] = list
    settings: Settings = field(default_factory=lambda: Settings(theme="dark", hour_cycle="24h"))
    timer: TimerState | None = None
    stopwatch: StopwatchState | None = None
    granted: bool = True
    height: int = 820
    act: Callable[[Harness], object] = lambda h: None
    # rectangles (css px) that show the live clock: excluded from comparisons
    live: list[tuple[int, int, int, int]] = field(default_factory=lambda: [(1000, 0, 100, 52)])


def page(n: int) -> Callable[[Harness], None]:
    return lambda h: h.vm("app").setPage(n)


def editor_new(h: Harness) -> None:
    h.vm("editor").openNew()


def editor_page(name: str, **setup: Any) -> Callable[[Harness], None]:
    def act(h: Harness) -> None:
        e = h.vm("editor")
        e.openNew()
        h.settle(400)
        for k, v in setup.items():
            getattr(e, k)(v)
        e.push(name)

    return act


def task_scene(kind: str) -> Callable[[Harness], None]:
    def act(h: Harness) -> None:
        e = h.vm("editor")
        e.openNew()
        h.settle(300)
        e.setTaskType(kind)
        e.push("task")

    return act


def edit_existing_bottom(h: Harness) -> None:
    e = h.vm("editor")
    e.openExisting("work")
    h.settle(500)
    h.qwindow.findChild  # noqa: B018 (window exists)
    from PySide6.QtQuick import QQuickItem

    for item in h.qwindow.contentItem().findChildren(QQuickItem):
        if item.objectName() == "sheetCard":
            flick = item.childItems()[0]
            flick.setProperty("contentY", 10_000)
    h.settle(200)


def stop_then(h: Harness, wrong: bool = False) -> None:
    tell(sys_msg.ALARMS, Stop("work"))
    h.sync(sys_msg.ALARMS)
    if wrong:
        tell(sys_msg.ALARMS, SubmitAnswer("work", "0"))
        h.sync(sys_msg.ALARMS)


def edit_mode(confirm: bool) -> Callable[[Harness], None]:
    def act(h: Harness) -> None:
        a = h.vm("alarms")
        a.toggleEditMode()
        if confirm:
            a.toggleConfirm("gym")

    return act


def laps_running() -> StopwatchState:
    return StopwatchState(started_at=NOW - 85_720, accumulated_ms=0, laps=(19_870, 41_150, 58_930))


def timer_with_recents(status: str = "idle") -> TimerState:
    recents = (RecentTimer(duration_ms=300_000), RecentTimer(duration_ms=1_500_000, label="Focus"),
               RecentTimer(duration_ms=630_000, label="Pasta"))  # fmt: skip
    if status == "running":
        return TimerState(status="running", duration_ms=630_000, ends_at=NOW + 370_000, remaining_ms=630_000,
                          label="Pasta", recents=recents)  # fmt: skip
    if status == "paused":
        return TimerState(status="paused", duration_ms=630_000, remaining_ms=370_000, label="Pasta", recents=recents)
    if status == "ringing":
        return TimerState(status="ringing", duration_ms=600_000, label="Pasta", recents=recents)
    return TimerState(recents=recents)


LIGHT = Settings(theme="light", hour_cycle="24h")
H12 = Settings(theme="dark", hour_cycle="12h")
NO_CLOCK: list[tuple[int, int, int, int]] = []

SCENES: dict[str, Scene] = {
    "01-alarms-empty": Scene(),
    "02-alarms-notifications-banner": Scene(granted=False),
    "03-alarms-list": Scene(alarms=list_alarms),
    "04-alarms-edit-mode": Scene(alarms=list_alarms, act=edit_mode(False)),
    "05-alarms-edit-delete-confirm": Scene(alarms=list_alarms, act=edit_mode(True)),
    "06-editor-add": Scene(alarms=list_alarms, act=editor_new),
    "07-editor-repeat": Scene(alarms=list_alarms, act=editor_page("repeat")),
    "08-editor-sound": Scene(alarms=list_alarms, act=editor_page("sound")),
    "09-editor-gradual-volume": Scene(alarms=list_alarms, act=editor_page("ramp")),
    "10-editor-turn-off-task": Scene(alarms=list_alarms, act=task_scene("math")),
    "11-editor-turn-off-retype": Scene(alarms=list_alarms, act=task_scene("retype")),
    "12-editor-turn-off-none": Scene(alarms=list_alarms, act=task_scene("none")),
    "13-editor-edit-existing-bottom": Scene(alarms=list_alarms, act=edit_existing_bottom),
    "14-alarms-list-12h": Scene(alarms=list_alarms, settings=H12),
    "15-editor-add-12h": Scene(alarms=list_alarms, settings=H12, act=editor_new),
    "16-ringing": Scene(alarms=ringing, live=NO_CLOCK),
    "17-ringing-task-math": Scene(alarms=ringing, act=stop_then, live=NO_CLOCK),
    "18-ringing-task-wrong-answer": Scene(alarms=ringing, act=lambda h: stop_then(h, True), live=NO_CLOCK),
    "19-ringing-no-snooze": Scene(alarms=lambda: ringing(snooze=False), live=NO_CLOCK),
    "20-ringing-task-retype": Scene(
        alarms=lambda: ringing(task=DismissTask(type="retype", difficulty="medium", count=1)),
        act=stop_then,
        live=NO_CLOCK,
    ),
    "21-stopwatch-idle": Scene(act=page(1)),
    "22-stopwatch-running-laps": Scene(stopwatch=laps_running(), act=page(1)),
    "23-stopwatch-stopped": Scene(
        stopwatch=StopwatchState(accumulated_ms=85_720, laps=(19_870, 41_150, 58_930)), act=page(1)
    ),
    "24-timer-idle": Scene(act=page(2)),
    "25-timer-idle-recents": Scene(timer=timer_with_recents(), act=page(2), height=1094),
    "26-timer-running": Scene(timer=timer_with_recents("running"), act=page(2)),
    "27-timer-paused": Scene(timer=timer_with_recents("paused"), act=page(2)),
    "28-timer-sound-sheet": Scene(timer=timer_with_recents(), act=lambda h: (page(2)(h), h.vm("timer").openSound())),
    "29-timer-done": Scene(timer=timer_with_recents("ringing"), act=page(2)),
    "30-settings": Scene(act=page(3), height=1520),
    "31-settings-default-sound": Scene(act=lambda h: (page(3)(h), h.vm("settings").openSound())),
    "32-light-alarms-list": Scene(alarms=list_alarms, settings=LIGHT),
    "33-light-editor": Scene(alarms=list_alarms, settings=LIGHT, act=editor_new),
    "34-light-timer": Scene(settings=LIGHT, timer=timer_with_recents("running"), act=page(2)),
    "35-light-stopwatch": Scene(settings=LIGHT, stopwatch=laps_running(), act=page(1)),
    "36-light-settings": Scene(settings=LIGHT, act=page(3), height=1520),
}


def run_scene(name: str, data_dir: Path) -> QImage:
    s = SCENES[name]
    h = Harness(
        data_dir,
        NOW,
        settings=s.settings,
        alarms=s.alarms(),
        timer=s.timer,
        stopwatch=s.stopwatch,
        granted=s.granted,
        cycle="24h",
    )
    try:
        h.qwindow.resize(1100, s.height)
        h.settle(200)
        s.act(h)
        h.settle(900)
        return h.grab()
    finally:
        h.close()
