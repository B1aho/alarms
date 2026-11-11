"""AlarmActor: alarms, what is ringing and the dismissal tasks (spec 3.2–3.7)."""

import logging
import random
from dataclasses import dataclass, replace
from typing import Any, assert_never

from alarm.kernel import Actor, clock
from alarm.messages import system as sys_msg
from alarm.messages.alarms import (
    AlarmsChanged,
    BackFromTask,
    CancelSnooze,
    DeleteAlarm,
    Ringing,
    RingingChanged,
    RingingStarted,
    SaveAlarm,
    SetAlarmEnabled,
    Snooze,
    Stop,
    SubmitAnswer,
)
from alarm.messages.audio import Play, StopSound
from alarm.messages.notify import CloseNotification, Notify
from alarm.messages.settings import GetSettings, SettingsChanged
from alarm.messages.sounds import SoundsChanged
from alarm.messages.system import (
    CheckNow,
    DeleteAlarmFile,
    LoadAlarms,
    LoadSounds,
    ResendPlayback,
    Resumed,
    Save,
    SoundsDir,
    Tick,
)
from alarm.rules import strings
from alarm.rules.defaults import playable
from alarm.rules.format import clock_string, timestamp_string
from alarm.rules.models import Alarm, CustomSound, HourCycle, Problem, Settings
from alarm.rules.ramp import FADE_DEFAULT_S, FADE_DISMISS_S
from alarm.rules.schedule import (
    MISSED_NOTIFY_LIMIT_MS,
    Missed,
    Ring,
    Wait,
    advance,
    decide,
    display_label,
    for_save,
    repair,
    sort_alarms,
    with_enabled,
)
from alarm.rules.tasks import check_answer, display_prompt, generate

log = logging.getLogger("alarm.alarms")

Msg = (
    Tick
    | Resumed
    | CheckNow
    | SaveAlarm
    | DeleteAlarm
    | SetAlarmEnabled
    | CancelSnooze
    | Snooze
    | Stop
    | SubmitAnswer
    | BackFromTask
    | ResendPlayback
    | SettingsChanged
    | SoundsChanged
)


@dataclass(frozen=True, slots=True)
class TaskState:
    stage: str  # "buttons" | "task"
    problem: Problem | None
    solved: int
    wrong: int


def tag(alarm_id: str) -> str:
    return f"alarm-{alarm_id}"


def key(alarm_id: str) -> str:
    return f"alarm:{alarm_id}"


class AlarmActor(Actor):
    name = sys_msg.ALARMS

    def __init__(self, *, restarted: bool = False, rng: random.Random | None = None) -> None:
        super().__init__(restarted=restarted)
        self.alarms: dict[str, Alarm] = {}
        self.settings = Settings()
        self.cycle: HourCycle = "24h"
        self.customs: tuple[CustomSound, ...] = ()
        self.sounds_dir = ""
        self.tasks: dict[str, TaskState] = {}
        self.playing: set[str] = set()
        self.rng = rng or random.Random()

    # ------------------------------------------------------------ lifecycle --
    def setup(self) -> None:
        changed: SettingsChanged = self.ask(sys_msg.SETTINGS, GetSettings())
        self.settings, self.cycle = changed.settings, changed.cycle
        self.customs = self.ask(sys_msg.STORE, LoadSounds())
        self.sounds_dir = self.ask(sys_msg.STORE, SoundsDir())
        now = clock.now_ms()
        for a in self.ask(sys_msg.STORE, LoadAlarms()):
            fixed = repair(a, now)
            if fixed != a:
                self.tell(sys_msg.STORE, Save(fixed))
            self.alarms[a.id] = fixed
        self.publish_alarms()
        # Ringing survives restarts: the state on disk says what must sound.
        for a in self.sorted():
            if a.ringing_since is not None:
                self.tasks[a.id] = TaskState("buttons", None, 0, 0)
                if not self.restarted:
                    self.announce(a)
        self.sync_sounds()
        self.publish_ringing()
        self.evaluate(now)

    # ------------------------------------------------------------- messages --
    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> None:
        now = clock.now_ms()
        match m:
            case Tick(now=t) | Resumed(now=t):
                self.evaluate(t)
            case CheckNow():
                self.evaluate(now)
            case SaveAlarm(alarm=a):
                self.write(for_save(a, now))
                self.tasks.pop(a.id, None)
                self.after_change()
                self.tell(sys_msg.NOTIFIER, CloseNotification(tag(a.id)))
            case DeleteAlarm(alarm_id=i):
                if self.alarms.pop(i, None) is not None:
                    self.tell(sys_msg.STORE, DeleteAlarmFile(i))
                    self.tasks.pop(i, None)
                    self.tell(sys_msg.NOTIFIER, CloseNotification(tag(i)))
                    self.after_change()
            case SetAlarmEnabled(alarm_id=i, enabled=on):
                if (a := self.alarms.get(i)) is not None:
                    self.write(with_enabled(a, on, now))
                    self.after_change()
            case CancelSnooze(alarm_id=i):
                if (a := self.alarms.get(i)) is not None and a.snooze_until is not None:
                    self.write(a.model_copy(update={"snooze_until": None}))
                    self.after_change()
            case Snooze(alarm_id=i):
                self.snooze(i, now)
            case Stop(alarm_id=i):
                self.stop_ringing(i)
            case SubmitAnswer(alarm_id=i, text=text):
                self.submit(i, text)
            case BackFromTask(alarm_id=i):
                if i in self.tasks:
                    self.tasks[i] = TaskState("buttons", None, 0, 0)
                    self.publish_ringing()
            case ResendPlayback():
                self.playing.clear()
                self.sync_sounds()
            case SettingsChanged(settings=s, cycle=c):
                self.settings, self.cycle = s, c
                self.publish_ringing()
            case SoundsChanged(sounds=sounds, directory=d):
                self.customs, self.sounds_dir = sounds, d
            case _:
                assert_never(m)

    # ------------------------------------------------------------- schedule --
    def evaluate(self, now: int) -> None:
        grace_ms = self.settings.missed_grace_minutes * 60_000
        changed = False
        for a in self.sorted():
            match decide(a, now, grace_ms):
                case Wait():
                    continue
                case Ring(source=source, trigger=trigger):
                    rung = advance(a, source, trigger, now).model_copy(update={"ringing_since": now})
                    # Write first, then the effect: a crash never loses or repeats a ring.
                    self.alarms[a.id] = rung
                    self.ask(sys_msg.STORE, Save(rung))
                    self.tasks[a.id] = TaskState("buttons", None, 0, 0)
                    log.info("ringing %s (%s) at %d", a.id, source, now)
                    self.sync_sounds()
                    self.announce(rung)
                    self.publish(RingingStarted(a.id))
                    changed = True
                case Missed(source=source, trigger=trigger):
                    moved = advance(a, source, trigger, now)
                    self.write(moved)
                    log.info("missed %s (%s), late by %d ms", a.id, source, now - trigger)
                    if now - trigger < MISSED_NOTIFY_LIMIT_MS:
                        title, body = strings.notify_missed(
                            display_label(a.label), timestamp_string(trigger, self.cycle)
                        )
                        self.tell(sys_msg.NOTIFIER, Notify(tag(a.id), title, body, sticky=False))
                    changed = True
        if changed:
            self.publish_alarms()
            self.publish_ringing()

    def announce(self, a: Alarm) -> None:
        title, body = strings.notify_alarm(display_label(a.label), clock_string(a.hour, a.minute, self.cycle))
        snooze = strings.snooze_action(self.settings.snooze_minutes) if a.snooze else None
        self.tell(sys_msg.NOTIFIER, Notify(tag(a.id), title, body, sticky=True, snooze_label=snooze, alarm_id=a.id))

    # -------------------------------------------------------------- ringing --
    def ringing(self) -> list[Alarm]:
        return [a for a in self.sorted() if a.ringing_since is not None]

    def snooze(self, alarm_id: str | None, now: int) -> None:
        ring = self.ringing()
        target = next((a for a in ring if a.id == alarm_id), None) if alarm_id else (ring[0] if ring else None)
        if target is None or not target.snooze:
            return
        until = now + self.settings.snooze_minutes * 60_000
        self.write(target.model_copy(update={"ringing_since": None, "snooze_until": until}))
        self.tasks.pop(target.id, None)
        self.sync_sounds(fade_s=FADE_DEFAULT_S)
        self.tell(sys_msg.NOTIFIER, CloseNotification(tag(target.id)))
        self.publish_alarms()
        self.publish_ringing()

    def dismiss(self, alarm_id: str) -> None:
        a = self.alarms.get(alarm_id)
        if a is None:
            return
        self.write(a.model_copy(update={"ringing_since": None, "snooze_until": None}))
        self.tasks.pop(alarm_id, None)
        self.sync_sounds(fade_s=FADE_DISMISS_S)
        self.tell(sys_msg.NOTIFIER, CloseNotification(tag(alarm_id)))
        self.publish_alarms()
        self.publish_ringing()

    def stop_ringing(self, alarm_id: str) -> None:
        a = self.alarms.get(alarm_id)
        if a is None or a.ringing_since is None:
            return
        problem = generate(a.task, self.rng.random)
        if problem is None:
            self.dismiss(alarm_id)
            return
        self.tasks[alarm_id] = TaskState("task", problem, 0, 0)
        self.publish_ringing()

    def submit(self, alarm_id: str, text: str) -> None:
        a = self.alarms.get(alarm_id)
        st = self.tasks.get(alarm_id)
        if a is None or st is None or st.problem is None or not text.strip():
            return
        if check_answer(st.problem, text):
            solved = st.solved + 1
            if solved >= a.task.count:
                self.dismiss(alarm_id)
                return
            self.tasks[alarm_id] = replace(st, problem=generate(a.task, self.rng.random), solved=solved)
        else:
            self.tasks[alarm_id] = replace(st, problem=generate(a.task, self.rng.random), wrong=st.wrong + 1)
        self.publish_ringing()

    def sync_sounds(self, fade_s: float = FADE_DISMISS_S) -> None:
        """Make what the audio actor plays match the alarms that are ringing."""
        ringing = {a.id: a for a in self.alarms.values() if a.ringing_since is not None}
        for i in list(self.playing):
            if i not in ringing:
                self.tell(sys_msg.AUDIO, StopSound(key(i), fade_s))
                self.playing.discard(i)
        for i, a in ringing.items():
            if i not in self.playing:
                ref = playable(a.sound, self.customs)
                file = self.custom_path(ref.id) if ref.kind == "custom" else None
                builtin = ref.id if ref.kind == "builtin" else "sunrise"
                self.tell(sys_msg.AUDIO, Play(key(i), builtin, file, a.volume, a.ramp_seconds, loop=True))
                self.playing.add(i)

    def custom_path(self, sound_id: str) -> str | None:
        for c in self.customs:
            if c.id == sound_id:
                return f"{self.sounds_dir}/{c.id}.{c.ext}"
        return None

    # -------------------------------------------------------------- helpers --
    def sorted(self) -> list[Alarm]:
        return sort_alarms(list(self.alarms.values()))

    def write(self, a: Alarm) -> None:
        self.alarms[a.id] = a
        self.tell(sys_msg.STORE, Save(a))

    def after_change(self) -> None:
        self.sync_sounds()
        self.publish_alarms()
        self.publish_ringing()

    def publish_alarms(self) -> None:
        self.publish(AlarmsChanged(tuple(self.sorted())))

    def publish_ringing(self) -> None:
        views: list[Ringing] = []
        for a in self.ringing():
            st = self.tasks.get(a.id) or TaskState("buttons", None, 0, 0)
            p = st.problem
            views.append(
                Ringing(
                    alarm_id=a.id,
                    label=display_label(a.label),
                    snooze=a.snooze,
                    stage="task" if st.stage == "task" and p is not None else "buttons",
                    task_kind=a.task.type,
                    prompt=display_prompt(p, example=False) if p is not None else "",
                    solved=st.solved,
                    total=a.task.count,
                    wrong=st.wrong,
                )
            )
        self.publish(RingingChanged(tuple(views)))
