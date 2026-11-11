"""TimerActor (spec 3.10): one timer, recents, the ringing state and its alert."""

from typing import Any, assert_never

from alarm.kernel import Actor, clock
from alarm.messages import system as sys_msg
from alarm.messages.audio import Play, StopSound
from alarm.messages.notify import CloseNotification, Notify
from alarm.messages.sounds import SoundsChanged
from alarm.messages.system import LoadSounds, LoadTimer, ResendPlayback, Resumed, Save, SoundsDir, Tick
from alarm.messages.timer import (
    CancelTimer,
    PauseTimer,
    RemoveRecent,
    RepeatTimer,
    ResumeTimer,
    SetTimerDuration,
    SetTimerLabel,
    SetTimerSound,
    StartTimer,
    StopTimerRinging,
    TimerAlert,
    TimerChanged,
)
from alarm.rules import strings
from alarm.rules.defaults import RECENTS_MAX, TIMER_LATE_LIMIT_MS, playable
from alarm.rules.format import countdown
from alarm.rules.models import LABEL_MAX, CustomSound, RecentTimer, TimerState
from alarm.rules.ramp import FADE_DEFAULT_S, TIMER_RAMP_S, TIMER_VOLUME

TAG = "timer"
KEY = "timer"

Msg = (
    Tick
    | Resumed
    | StartTimer
    | PauseTimer
    | ResumeTimer
    | CancelTimer
    | StopTimerRinging
    | RepeatTimer
    | SetTimerDuration
    | SetTimerLabel
    | SetTimerSound
    | RemoveRecent
    | ResendPlayback
    | SoundsChanged
)


def timer_label(s: TimerState) -> str:
    return s.label.strip() or "Timer"


class TimerActor(Actor):
    name = sys_msg.TIMER

    def __init__(self, *, restarted: bool = False) -> None:
        super().__init__(restarted=restarted)
        self.state = TimerState()
        self.customs: tuple[CustomSound, ...] = ()
        self.sounds_dir = ""
        self.playing = False

    def setup(self) -> None:
        self.customs = self.ask(sys_msg.STORE, LoadSounds())
        self.sounds_dir = self.ask(sys_msg.STORE, SoundsDir())
        self.state = self.ask(sys_msg.STORE, LoadTimer())
        self.publish(TimerChanged(self.state))
        if self.state.status == "ringing":
            self.sync_sound()
            if not self.restarted:
                self.publish(TimerAlert(self.state))

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> None:
        s = self.state
        now = clock.now_ms()
        match m:
            case Tick(now=t) | Resumed(now=t):
                self.check(t)
            case StartTimer(duration_ms=d, label=label):
                self.start_timer(max(1000, d), s.label if label is None else label, now)
            case PauseTimer():
                if s.status == "running" and s.ends_at is not None:
                    self.update(
                        s.model_copy(
                            update={"status": "paused", "remaining_ms": max(0, s.ends_at - now), "ends_at": None}
                        )
                    )
            case ResumeTimer():
                if s.status == "paused":
                    self.update(s.model_copy(update={"status": "running", "ends_at": now + s.remaining_ms}))
            case CancelTimer() | StopTimerRinging():
                self.update(s.model_copy(update={"status": "idle", "ends_at": None, "remaining_ms": 0}))
                self.tell(sys_msg.NOTIFIER, CloseNotification(TAG))
            case RepeatTimer():
                self.tell(sys_msg.NOTIFIER, CloseNotification(TAG))
                self.start_timer(s.duration_ms, s.label, now)
            case SetTimerDuration(duration_ms=d):
                if s.status == "idle" and max(1000, d) != s.duration_ms:
                    self.update(s.model_copy(update={"duration_ms": max(1000, d)}))
            case SetTimerLabel(label=label):
                if label[:LABEL_MAX] != s.label:
                    self.update(s.model_copy(update={"label": label[:LABEL_MAX]}))
            case SetTimerSound(sound=sound):
                self.update(s.model_copy(update={"sound": sound}))
            case RemoveRecent(duration_ms=d):
                self.update(s.model_copy(update={"recents": tuple(r for r in s.recents if r.duration_ms != d)}))
            case ResendPlayback():
                self.playing = False
                self.sync_sound()
            case SoundsChanged(sounds=sounds, directory=d):
                self.customs, self.sounds_dir = sounds, d
            case _:
                assert_never(m)

    def start_timer(self, duration: int, label: str, now: int) -> None:
        recents = (
            RecentTimer(duration_ms=duration, label=label),
            *tuple(r for r in self.state.recents if r.duration_ms != duration),
        )
        self.update(
            self.state.model_copy(
                update={
                    "status": "running",
                    "duration_ms": duration,
                    "label": label,
                    "ends_at": now + duration,
                    "remaining_ms": duration,
                    "recents": recents[:RECENTS_MAX],
                }
            )
        )

    def check(self, now: int) -> None:
        s = self.state
        if s.status != "running" or s.ends_at is None or now < s.ends_at:
            return
        if now - s.ends_at > TIMER_LATE_LIMIT_MS:
            self.update(s.model_copy(update={"status": "idle", "ends_at": None, "remaining_ms": 0}))
            title, body = strings.notify_timer_late(timer_label(s), countdown(s.duration_ms))
            self.tell(sys_msg.NOTIFIER, Notify(TAG, title, body, sticky=False))
            return
        rung = s.model_copy(update={"status": "ringing", "ends_at": None, "remaining_ms": 0})
        self.state = rung
        self.ask(sys_msg.STORE, Save(rung))  # write first, then the effect
        self.sync_sound()
        title, body = strings.notify_timer(timer_label(s), countdown(s.duration_ms))
        self.tell(sys_msg.NOTIFIER, Notify(TAG, title, body, sticky=True))
        self.publish(TimerChanged(rung))
        self.publish(TimerAlert(rung))

    def update(self, state: TimerState) -> None:
        self.state = state
        self.tell(sys_msg.STORE, Save(state))
        self.sync_sound()
        self.publish(TimerChanged(state))

    def sync_sound(self) -> None:
        ringing = self.state.status == "ringing"
        if ringing and not self.playing:
            ref = playable(self.state.sound, self.customs)
            file = None
            if ref.kind == "custom":
                c = next(c for c in self.customs if c.id == ref.id)
                file = f"{self.sounds_dir}/{c.id}.{c.ext}"
            builtin = ref.id if ref.kind == "builtin" else "chimes"
            self.tell(sys_msg.AUDIO, Play(KEY, builtin, file, TIMER_VOLUME, TIMER_RAMP_S, loop=True))
            self.playing = True
        elif not ringing and self.playing:
            self.tell(sys_msg.AUDIO, StopSound(KEY, FADE_DEFAULT_S))
            self.playing = False
