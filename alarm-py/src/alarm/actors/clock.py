"""ClockActor: Tick every 0.5 s; Resumed when the wall clock jumps by more than 2 s."""

import threading
import time
from dataclasses import dataclass
from typing import Any, assert_never

from alarm.kernel import Actor, clock
from alarm.messages import system as sys_msg
from alarm.messages.system import Resumed, Start, Tick

PERIOD_S = 0.5
JUMP_MS = 2000


@dataclass(frozen=True, slots=True)
class _Beat:
    pass


Msg = Start | _Beat


class ClockActor(Actor):
    name = sys_msg.CLOCK

    def __init__(self, *, restarted: bool = False, period_s: float = PERIOD_S) -> None:
        super().__init__(restarted=restarted)
        self.period_s = period_s
        self.running = False
        self.last_wall: int | None = None
        self.last_mono = 0.0
        self.timer: threading.Timer | None = None

    def setup(self) -> None:
        if self.restarted:  # a crashed clock keeps ticking after restart
            self.tell(self.name, Start())

    def teardown(self) -> None:
        if self.timer is not None:
            self.timer.cancel()

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> None:
        match m:
            case Start():
                if not self.running:
                    self.running = True
                    self.beat()
            case _Beat():
                self.beat()
            case _:
                assert_never(m)

    def beat(self) -> None:
        now = clock.now_ms()
        mono = time.monotonic()
        if self.last_wall is not None:
            drift = (now - self.last_wall) - (mono - self.last_mono) * 1000
            if abs(drift) > JUMP_MS:
                self.publish(Resumed(now, int(drift)))
        self.last_wall, self.last_mono = now, mono
        self.publish(Tick(now))
        self.timer = threading.Timer(self.period_s, self.tell, args=(self.name, _Beat()))
        self.timer.daemon = True
        self.timer.start()
