"""RingingViewModel (spec 3.5): the first ringing alarm, its buttons and its task card."""

from PySide6.QtCore import QTimer, Signal, Slot

from alarm.messages import system as sys_msg
from alarm.messages.alarms import BackFromTask, Snooze, Stop, SubmitAnswer
from alarm.rules import strings
from alarm.rules.format import clock_parts, ringing_date
from alarm.rules.schedule import local_dt
from alarm.ui.bridge import UiBridge
from alarm.ui.viewmodels.base import ViewModel, ro


class RingingViewModel(ViewModel):
    changed = Signal()
    active = ro(bool, "active", changed)
    alarmId = ro(str, "alarmId", changed)
    label = ro(str, "label", changed)
    snooze = ro(bool, "snooze", changed)
    snoozeText = ro(str, "snoozeText", changed)
    stage = ro(str, "stage", changed)
    kind = ro(str, "kind", changed)
    prompt = ro(str, "prompt", changed)
    heading = ro(str, "heading", changed)
    placeholder = ro(str, "placeholder", changed)
    solved = ro(int, "solved", changed)
    total = ro(int, "total", changed)
    wrong = ro(int, "wrong", changed)
    time = ro(str, "time", changed)
    period = ro(str, "period", changed)
    date = ro(str, "date", changed)

    def __init__(self, bridge: UiBridge) -> None:
        super().__init__(
            active=False, alarmId="", label="", snooze=False, snoozeText="", stage="buttons", kind="none",
            prompt="", heading="", placeholder="", solved=0, total=0, wrong=0, time="", period="", date="",
        )  # fmt: skip
        self.bridge = bridge
        bridge.ringingChanged.connect(self.refresh)
        bridge.settingsChanged.connect(self.refresh)
        bridge.ticked.connect(self.refresh)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh)
        self.timer.start(1000)
        self.refresh()

    def refresh(self) -> None:
        b = self.bridge
        now = b.now_ms()
        d = local_dt(now)
        time, period = clock_parts(d.hour, d.minute, b.cycle)
        self.put(time=time, period=period, date=ringing_date(now))
        r = b.ringing[0] if b.ringing else None
        if r is None:
            self.put(active=False)
            return
        math = r.task_kind == "math"
        self.put(
            active=True,
            alarmId=r.alarm_id,
            label=r.label,
            snooze=r.snooze,
            snoozeText=strings.snooze_button(b.settings.snooze_minutes),
            stage=r.stage,
            kind=r.task_kind,
            prompt=r.prompt,
            heading=strings.SOLVE_TO_TURN_OFF if math else strings.TYPE_CODE_TO_TURN_OFF,
            placeholder=strings.ANSWER if math else strings.CODE,
            solved=r.solved,
            total=r.total,
            wrong=r.wrong,
        )

    @Slot()
    def snoozeNow(self) -> None:
        self.bridge.send(sys_msg.ALARMS, Snooze(self.get("alarmId") or None))

    @Slot()
    def stop(self) -> None:
        self.bridge.send(sys_msg.ALARMS, Stop(self.get("alarmId")))

    @Slot(str)
    def submit(self, text: str) -> None:
        if text.strip():
            self.bridge.send(sys_msg.ALARMS, SubmitAnswer(self.get("alarmId"), text))

    @Slot()
    def back(self) -> None:
        self.bridge.send(sys_msg.ALARMS, BackFromTask(self.get("alarmId")))
