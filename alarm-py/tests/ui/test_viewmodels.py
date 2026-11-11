"""ViewModels without a window (TZ 8: ui) and the text catalogue of spec section 6."""

from typing import Any

from alarm.kernel import CallbackMailbox, registry
from alarm.messages import system as sys_msg
from alarm.messages.alarms import AlarmsChanged, CancelSnooze, Ringing, RingingChanged, SaveAlarm, SetAlarmEnabled
from alarm.messages.notify import PermissionChanged
from alarm.messages.settings import SettingsChanged, UpdateSettings
from alarm.messages.stopwatch import StopwatchChanged
from alarm.messages.timer import StartTimer, TimerChanged
from alarm.rules import strings
from alarm.rules.defaults import new_alarm
from alarm.rules.models import Settings, StopwatchState, TimerState
from alarm.ui.bridge import UiBridge

SINGLE_WORDS = ["Alarm", "Alarms", "Stopwatch", "Timer", "Settings", "Edit", "Done"]
SPEC_TEXTS = """No alarms on|ALARMS|No Alarms|Add an alarm to wake up on time.
|Add Alarm|Stop|Delete|Allow Notifications|So alarms reach you even when the app is minimised or behind other windows.
|Turn On|Notifications are blocked|Edit Alarm|Cancel|Save|Back|Repeat|Label|Sound|Snooze|Gradual Volume|Preview Wake-up
|Stop Preview|Turn Off With|Delete Alarm|VOLUME|TURN OFF|DIFFICULTY|EXAMPLE|None|Math|Retype Code|Easy|Medium|Hard
|Starts almost silent and rises smoothly to the set volume.|How long it takes to reach full volume.
|The alarm keeps ringing until the task is solved. Snooze never needs a task.|YOUR MUSIC|Choose a File…|Adding…
|BUILT-IN SOUNDS|Missing file|Music files stay on this computer. MP3, M4A, WAV, OGG and FLAC are supported.
|Solve to turn off|Type the code to turn off|Answer|Code|Start|Pause|Resume|When Timer Ends|RECENTS|Remove|hours|min|sec
|Lap|Reset|APPEARANCE|Theme|Auto|Light|Dark|Time Format|12-hour|24-hour|NEW ALARM DEFAULTS|Difficulty
|Applied to alarms you create from now on. Each alarm can still be changed individually.|Default Sound|SNOOZE
|RELIABILITY|Notifications|On|Keep Computer Awake|Ring Late Alarms For|Add Music File…
|Imported files are copied into the app’s local storage, so alarms keep working if the original is moved.|ABOUT
|Version|Storage|This computer only|Open at Login|Open Alarm|Quit
|Alarm keeps running in the menu bar / tray and rings even when its window is closed."""


def test_every_spec_text_is_in_strings() -> None:
    values = {v for v in vars(strings).values() if isinstance(v, str)}
    wanted = [
        t.strip()
        for chunk in SPEC_TEXTS.split("|")
        for t in (
            [chunk]
            if " " in chunk.strip() and chunk.strip()[0].isupper() and not chunk.strip().startswith("Alarm Alarms")
            else chunk.split()
        )
    ]
    missing = [t for t in wanted if t and t not in values]
    assert missing == []
    assert strings.notify_alarm("Work", "06:30") == ("⏰ Work", "06:30\nOpen the app to turn it off.")
    assert strings.snooze_button(9) == "Snooze · 9 min" and strings.snooze_action(9) == "Snooze 9 min"
    assert strings.blocked_text("macos").endswith("Allow notifications in System Settings → Notifications.")


class Probe:
    def __init__(self) -> None:
        self.sent: list[tuple[str, Any]] = []


def make_bridge(qapp: Any) -> tuple[UiBridge, list[object]]:
    sent: list[object] = []
    for name in (sys_msg.ALARMS, sys_msg.SETTINGS, sys_msg.TIMER, sys_msg.STOPWATCH, sys_msg.NOTIFIER, sys_msg.AUDIO):
        registry.register(name, CallbackMailbox(sent.append))
    b = UiBridge("24h")
    return b, sent


def test_alarms_vm(qapp: Any) -> None:
    from alarm.ui.viewmodels.alarms import AlarmsViewModel

    b, sent = make_bridge(qapp)
    now = b.now_ms()
    a = new_alarm(Settings(), now, "a1").model_copy(
        update={"hour": 6, "minute": 30, "label": "Work", "days": (1, 2, 3, 4, 5)}
    )
    vm = AlarmsViewModel(b)
    assert vm.property("subtitle") == "No alarms on" and vm.property("count") == 0
    b._dispatch(AlarmsChanged((a.model_copy(update={"snooze_until": now + 6 * 60_000 + 1000}),)))
    assert vm.property("subtitle") == "Next alarm in 6 min"
    row = vm._model.items[0]
    assert (row["time"], row["subtitle"], row["snoozed"]) == ("06:30", "Work, weekdays", True)
    vm.toggle("a1", False)
    vm.cancelSnooze("a1")
    assert SetAlarmEnabled("a1", False) in sent and CancelSnooze("a1") in sent
    vm.toggleEditMode()
    vm.toggleConfirm("a1")
    assert vm.property("editMode") and vm.property("confirming") == "a1"
    b._dispatch(PermissionChanged("denied"))
    assert vm.property("banner") == "blocked"


def test_editor_vm_save_closes_at_once(qapp: Any) -> None:
    from alarm.ui.viewmodels.editor import EditorViewModel

    b, sent = make_bridge(qapp)
    vm = EditorViewModel(b)
    vm.openNew()
    assert vm.property("open") and vm.property("title") == "Add Alarm"
    vm.toggleDay(1)
    vm.toggleDay(2)
    assert vm.property("repeatSummary") == "Mon Tue"
    vm.setTaskType("retype")
    vm.push("task")
    assert vm.property("title") == "Turn Off With" and vm.property("taskSummary") == "Retype Code · Medium · 2×"
    assert len(vm.property("example").replace(" ", "")) == 10
    vm.back()
    vm.setLabel("Gym")
    vm.save()
    assert not vm.property("open")
    saved = [m for m in sent if isinstance(m, SaveAlarm)][-1].alarm
    assert saved.label == "Gym" and saved.days == (1, 2) and saved.enabled


def test_ringing_timer_stopwatch_settings_vms(qapp: Any) -> None:
    from alarm.ui.viewmodels.ringing import RingingViewModel
    from alarm.ui.viewmodels.settings import SettingsViewModel
    from alarm.ui.viewmodels.stopwatch import StopwatchViewModel
    from alarm.ui.viewmodels.timer import TimerViewModel

    b, sent = make_bridge(qapp)
    r = RingingViewModel(b)
    b._dispatch(RingingChanged((Ringing("a", "Work", True, "task", "math", "3 × 4 + 5 =", 1, 2, 0),)))
    assert (
        r.property("active")
        and r.property("heading") == "Solve to turn off"
        and r.property("snoozeText") == "Snooze · 9 min"
    )
    t = TimerViewModel(b)
    b._dispatch(TimerChanged(TimerState(status="running", duration_ms=600_000, ends_at=b.now_ms() + 370_000)))
    assert t.property("countdown") in ("06:10", "06:09")
    t.start()
    assert isinstance(sent[-1], StartTimer)
    sw = StopwatchViewModel(b)
    b._dispatch(StopwatchChanged(StopwatchState(accumulated_ms=85_720, laps=(19_870, 41_150, 58_930))))
    assert sw.property("display") == "01:25.72"
    assert [x["tone"] for x in sw._laps.items] == ["", "best", "worst", ""]
    s = SettingsViewModel(b)
    b._dispatch(SettingsChanged(Settings(), "24h"))
    s.setSnooze(12)
    assert [m for m in sent if isinstance(m, UpdateSettings)][-1].settings.snooze_minutes == 12
    assert s.property("snoozeText") == "Snooze Length · 12 min"
