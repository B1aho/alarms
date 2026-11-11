"""PowerActor: keep the system awake while alarms are on (TZ 3.7), wake timer (3.17), Open at Login (3.4)."""

import logging
from collections.abc import Callable
from typing import Any, Protocol, assert_never

from alarm.actors.power import autostart
from alarm.actors.power.wake_timer import WakeTimer
from alarm.kernel import Actor
from alarm.messages import system as sys_msg
from alarm.messages.alarms import AlarmsChanged
from alarm.messages.settings import SettingsChanged
from alarm.rules.models import Alarm, Settings
from alarm.rules.power_policy import next_wake, should_keep_awake

log = logging.getLogger("alarm.power")

Msg = AlarmsChanged | SettingsChanged


class Hold(Protocol):
    def __enter__(self) -> Any: ...
    def __exit__(self, *exc: object) -> Any: ...


def _wakepy_hold() -> Hold:
    from wakepy import keep

    return keep.running(on_fail="warn")  # type: ignore[return-value]


class PowerActor(Actor):
    name = sys_msg.POWER

    def __init__(
        self,
        *,
        restarted: bool = False,
        hold_factory: Callable[[], Hold] = _wakepy_hold,
        apply_autostart: Callable[[bool], None] = autostart.apply,
    ) -> None:
        super().__init__(restarted=restarted)
        self.alarms: tuple[Alarm, ...] = ()
        self.settings: Settings | None = None
        self.hold: Hold | None = None
        self.hold_factory = hold_factory
        self.apply_autostart = apply_autostart
        self.login: bool | None = None
        self.wake = WakeTimer()

    def teardown(self) -> None:
        self.release()
        self.wake.close()

    @property
    def holding(self) -> bool:
        return self.hold is not None

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> None:
        match m:
            case AlarmsChanged(alarms=alarms):
                self.alarms = alarms
            case SettingsChanged(settings=s):
                self.settings = s
                if s.open_at_login != self.login:
                    self.login = s.open_at_login
                    self.apply_autostart(s.open_at_login)
            case _:
                assert_never(m)
        self.sync()

    def sync(self) -> None:
        want = self.settings is not None and should_keep_awake(self.settings.keep_awake, self.alarms)
        if want and self.hold is None:
            hold = self.hold_factory()
            hold.__enter__()
            self.hold = hold
            log.info("keeping the system awake")
        elif not want:
            self.release()
        self.wake.set(next_wake(self.alarms))

    def release(self) -> None:
        if self.hold is not None:
            self.hold.__exit__(None, None, None)
            self.hold = None
            log.info("system may sleep again")
