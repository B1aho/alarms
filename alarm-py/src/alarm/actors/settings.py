"""SettingsActor: owns the settings; publishes SettingsChanged."""

from typing import Any, assert_never

from alarm.kernel import Actor
from alarm.messages import system as sys_msg
from alarm.messages.settings import GetSettings, SettingsChanged, UpdateSettings
from alarm.messages.system import LoadSettings, Save
from alarm.rules.format import resolve_cycle
from alarm.rules.models import HourCycle, Settings

Msg = GetSettings | UpdateSettings


class SettingsActor(Actor):
    name = sys_msg.SETTINGS

    def __init__(self, system_cycle: HourCycle, *, restarted: bool = False) -> None:
        super().__init__(restarted=restarted)
        self.system_cycle: HourCycle = system_cycle
        self.settings = Settings()

    def setup(self) -> None:
        self.settings = self.ask(sys_msg.STORE, LoadSettings())
        self.publish(self.changed())

    def changed(self) -> SettingsChanged:
        return SettingsChanged(self.settings, resolve_cycle(self.settings.hour_cycle, self.system_cycle))

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> Any:
        match m:
            case GetSettings():
                return self.changed()
            case UpdateSettings(settings=new):
                if new != self.settings:
                    self.settings = new
                    self.tell(sys_msg.STORE, Save(new))
                    self.publish(self.changed())
                return None
            case _:
                assert_never(m)
