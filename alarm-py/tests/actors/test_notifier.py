from pathlib import Path
from typing import Any

from alarm.actors.notifier import NotifierActor
from alarm.messages import system as sys_msg
from alarm.messages.alarms import Snooze
from alarm.messages.notify import CloseNotification, Notify, PermissionChanged, RequestPermission
from alarm.messages.system import ShowWindow
from tests.actors.world import World, wait_for


class FakeBackend:
    def __init__(self) -> None:
        self.sent: list[Any] = []
        self.cleared: list[str] = []
        self._did_request_authorisation = False
        self.n = 0

    async def send_notification(self, note: Any) -> str:
        self.sent.append(note)
        self.n += 1
        return f"id{self.n}"

    async def clear(self, ident: str) -> None:
        self.cleared.append(ident)

    async def request_authorisation(self) -> bool:
        self._did_request_authorisation = True
        return True


def test_notify_snooze_button_click_and_close(tmp_path: Path) -> None:
    backend = FakeBackend()
    w = World(tmp_path, 0, stubs=(sys_msg.ALARMS, sys_msg.UI))
    w.add(sys_msg.NOTIFIER, lambda r: NotifierActor(restarted=r, backend=backend))
    w.start()
    w.send(
        Notify("alarm-a", "⏰ Work", "06:30\nOpen the app to turn it off.", True, "Snooze 9 min", "a"), sys_msg.NOTIFIER
    )
    note = backend.sent[-1]
    assert note.title == "⏰ Work" and [b.title for b in note.buttons] == ["Snooze 9 min"]
    assert note.urgency.name == "Critical"
    note.buttons[0].on_pressed()
    note.on_clicked()
    assert w.stubs[sys_msg.ALARMS].of(Snooze) == [Snooze("a")]
    assert w.stubs[sys_msg.UI].of(ShowWindow)
    w.send(CloseNotification("alarm-a"), sys_msg.NOTIFIER)
    assert backend.cleared == ["id1"]
    w.send(Notify("timer", "⏱ Timer", "01:00 timer is done.", True), sys_msg.NOTIFIER)
    assert backend.sent[-1].buttons == ()
    w.stop()


def test_permission_status_is_published(tmp_path: Path) -> None:
    backend = FakeBackend()
    w = World(tmp_path, 0, stubs=())
    w.add(sys_msg.NOTIFIER, lambda r: NotifierActor(restarted=r, backend=backend))
    from alarm.kernel import registry

    registry.subscribe(PermissionChanged, "probe")
    w.start()
    wait_for(lambda: w.events.of(PermissionChanged))
    w.send(RequestPermission(), sys_msg.NOTIFIER)
    assert w.events.of(PermissionChanged)[-1].status == "granted"
    w.stop()
