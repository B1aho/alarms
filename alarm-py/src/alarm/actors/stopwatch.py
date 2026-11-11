"""StopwatchActor (spec 3.11)."""

from typing import Any, assert_never

from alarm.kernel import Actor, clock
from alarm.messages import system as sys_msg
from alarm.messages.stopwatch import Lap, Reset, Start, Stop, StopwatchChanged
from alarm.messages.system import LoadStopwatch, Save
from alarm.rules.models import StopwatchState

Msg = Start | Stop | Lap | Reset


def elapsed_at(s: StopwatchState, now: int) -> int:
    return s.accumulated_ms + (now - s.started_at if s.started_at is not None else 0)


class StopwatchActor(Actor):
    name = sys_msg.STOPWATCH

    def __init__(self, *, restarted: bool = False) -> None:
        super().__init__(restarted=restarted)
        self.state = StopwatchState()

    def setup(self) -> None:
        self.state = self.ask(sys_msg.STORE, LoadStopwatch())
        self.publish(StopwatchChanged(self.state))

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> None:
        s = self.state
        now = clock.now_ms()
        match m:
            case Start():
                if s.started_at is None:
                    self.update(s.model_copy(update={"started_at": now}))
            case Stop():
                if s.started_at is not None:
                    self.update(s.model_copy(update={"accumulated_ms": elapsed_at(s, now), "started_at": None}))
            case Lap():
                if s.started_at is not None:
                    self.update(s.model_copy(update={"laps": (*s.laps, elapsed_at(s, now))}))
            case Reset():
                self.update(StopwatchState())
            case _:
                assert_never(m)

    def update(self, state: StopwatchState) -> None:
        self.state = state
        self.tell(sys_msg.STORE, Save(state))
        self.publish(StopwatchChanged(state))
