"""AlarmsViewModel (spec 3.2): the list, edit mode, delete confirmation, header subtitle, banner."""

from typing import Any

from PySide6.QtCore import Property, QObject, QTimer, Signal, Slot

from alarm.messages import system as sys_msg
from alarm.messages.alarms import CancelSnooze, DeleteAlarm, SetAlarmEnabled
from alarm.messages.notify import RequestPermission
from alarm.rules import strings
from alarm.rules.format import clock_parts, relative, timestamp_string
from alarm.rules.models import Alarm, HourCycle
from alarm.rules.schedule import alarm_subtitle, display_label, is_active, next_upcoming
from alarm.ui.bridge import UiBridge
from alarm.ui.listmodel import DictListModel
from alarm.ui.viewmodels.base import ViewModel, ro

ROLES = [
    "id",
    "alarmId",
    "time",
    "period",
    "subtitle",
    "active",
    "isOn",
    "snoozed",
    "snoozeText",
    "label",
    "switchName",
]


def row(a: Alarm, cycle: HourCycle) -> dict[str, Any]:
    time, period = clock_parts(a.hour, a.minute, cycle)
    return {
        "id": a.id,
        "alarmId": a.id,
        "time": time,
        "period": period,
        "subtitle": alarm_subtitle(a),
        "active": is_active(a),
        "isOn": a.enabled,
        "snoozed": a.snooze_until is not None,
        "snoozeText": strings.snoozed_until(timestamp_string(a.snooze_until, cycle)) if a.snooze_until else "",
        "label": display_label(a.label),
        "switchName": f"{display_label(a.label)} {time}{period}",
    }


class AlarmsViewModel(ViewModel):
    changed = Signal()
    editMode = ro(bool, "editMode", changed)
    confirming = ro(str, "confirming", changed)
    subtitle = ro(str, "subtitle", changed)
    count = ro(int, "count", changed)
    banner = ro(str, "banner", changed)  # "" | "ask" | "blocked"

    def __init__(self, bridge: UiBridge) -> None:
        super().__init__(editMode=False, confirming="", subtitle="", count=0, banner="")
        self.bridge = bridge
        self._model = DictListModel(ROLES, self)
        bridge.alarmsChanged.connect(self.refresh)
        bridge.settingsChanged.connect(self.refresh)
        bridge.permissionChanged.connect(self.refresh)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh)
        self.timer.start(15_000)
        self.refresh()

    def _get_model(self) -> QObject:
        return self._model

    model = Property(QObject, _get_model, constant=True)  # pyright: ignore[reportArgumentType]

    def refresh(self) -> None:
        b = self.bridge
        self._model.set_items([row(a, b.cycle) for a in b.alarms])
        nxt = next_upcoming(b.alarms)
        subtitle = strings.next_alarm_in(relative(nxt[1] - b.now_ms())) if nxt else strings.NO_ALARMS_ON
        banner = {"unknown": "ask", "denied": "blocked"}.get(b.permission, "")
        count = len(b.alarms)
        self.put(subtitle=subtitle, count=count, banner=banner)
        if count == 0:
            self.put(editMode=False, confirming="")

    @Slot(str, bool)
    def toggle(self, alarm_id: str, on: bool) -> None:
        self.bridge.send(sys_msg.ALARMS, SetAlarmEnabled(alarm_id, on))

    @Slot(str)
    def cancelSnooze(self, alarm_id: str) -> None:
        self.bridge.send(sys_msg.ALARMS, CancelSnooze(alarm_id))

    @Slot(str)
    def remove(self, alarm_id: str) -> None:
        self.put(confirming="")
        self.bridge.send(sys_msg.ALARMS, DeleteAlarm(alarm_id))

    @Slot()
    def toggleEditMode(self) -> None:
        self.put(editMode=not self.get("editMode"), confirming="")

    @Slot(str)
    def toggleConfirm(self, alarm_id: str) -> None:
        self.put(confirming="" if self.get("confirming") == alarm_id else alarm_id)

    @Slot()
    def requestPermission(self) -> None:
        self.bridge.send(sys_msg.NOTIFIER, RequestPermission())

    @Slot(str, result=str)
    def deleteName(self, label: str) -> str:
        return strings.delete_named(label)
