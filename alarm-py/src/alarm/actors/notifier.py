"""NotifierActor: system notifications through desktop-notifier (spec 3.14, TZ 3.8, 3.11).

desktop-notifier is asynchronous: this actor runs its own asyncio loop in a
helper thread and waits for each call. User actions arrive on other threads and
are turned into messages: the Snooze button → AlarmActor, a click → the window.
"""

import asyncio
import logging
import sys
import threading
from collections.abc import Coroutine
from dataclasses import dataclass
from typing import Any, assert_never

from alarm.kernel import Actor, tell
from alarm.messages import system as sys_msg
from alarm.messages.alarms import Snooze
from alarm.messages.notify import CloseNotification, Notify, PermissionChanged, RequestPermission
from alarm.messages.system import ShowWindow
from alarm.rules.models import NotifyPermission

log = logging.getLogger("alarm.notifier")

CALL_TIMEOUT_S = 10.0
RECHECK_S = 30.0


@dataclass(frozen=True, slots=True)
class _Recheck:
    pass


Msg = Notify | CloseNotification | RequestPermission | _Recheck


def _patch_windows_alarm_scenario() -> None:
    """Windows toasts with scenario="alarm" stay on screen until dismissed (TZ 6, 3.14)."""
    if sys.platform != "win32":
        return
    try:
        from desktop_notifier.backends import winrt  # pyright: ignore[reportMissingImports]

        original = winrt.Element

        def element(tag: str, attrib: dict[str, str] | None = None, **extra: str) -> Any:
            if tag == "toast":
                attrib = {**(attrib or {}), "scenario": "alarm"}
            return original(tag, attrib or {}, **extra)

        winrt.Element = element
    except Exception:
        log.warning("could not enable the alarm scenario for Windows toasts", exc_info=True)


class NotifierActor(Actor):
    name = sys_msg.NOTIFIER

    def __init__(self, *, restarted: bool = False, backend: Any = None) -> None:
        super().__init__(restarted=restarted)
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, name="notifier-loop", daemon=True)
        self.notifier: Any = backend
        self.ids: dict[str, str] = {}  # tag → notification identifier
        self.status: NotifyPermission = "unknown"
        self.timer: threading.Timer | None = None

    def setup(self) -> None:
        self.thread.start()
        if self.notifier is None:
            _patch_windows_alarm_scenario()
            from desktop_notifier import DesktopNotifier

            self.notifier = self.call_sync(_make(DesktopNotifier))
        self.refresh_status()
        self.schedule_recheck()

    def teardown(self) -> None:
        if self.timer is not None:
            self.timer.cancel()
        self.loop.call_soon_threadsafe(self.loop.stop)

    def schedule_recheck(self) -> None:
        self.timer = threading.Timer(RECHECK_S, self.tell, args=(self.name, _Recheck()))
        self.timer.daemon = True
        self.timer.start()

    def call(self, coro: Coroutine[Any, Any, Any]) -> Any:
        try:
            return self.call_sync(coro)
        except Exception:
            log.warning("notification backend call failed", exc_info=True)
            return None

    def call_sync(self, coro: Coroutine[Any, Any, Any]) -> Any:
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(CALL_TIMEOUT_S)

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> None:
        match m:
            case Notify():
                self.send(m)
            case CloseNotification(tag=tag):
                ident = self.ids.pop(tag, None)
                if ident is not None:
                    self.call(self.notifier.clear(ident))
            case RequestPermission():
                self.call(self.notifier.request_authorisation())
                self.refresh_status()
            case _Recheck():
                self.refresh_status()
                self.schedule_recheck()
            case _:
                assert_never(m)

    def send(self, m: Notify) -> None:
        from desktop_notifier import Button, Notification, Urgency

        old = self.ids.pop(m.tag, None)
        if old is not None:
            self.call(self.notifier.clear(old))
        buttons: tuple[Any, ...] = ()
        if m.snooze_label and m.alarm_id:
            alarm_id = m.alarm_id
            buttons = (Button(title=m.snooze_label, on_pressed=lambda: tell(sys_msg.ALARMS, Snooze(alarm_id))),)
        note = Notification(
            title=m.title,
            message=m.body,
            urgency=Urgency.Critical if m.sticky else Urgency.Normal,
            buttons=buttons,
            on_clicked=lambda: tell(sys_msg.UI, ShowWindow()),
            timeout=0 if m.sticky else -1,
        )
        ident = self.call(self.notifier.send_notification(note))
        if isinstance(ident, str):
            self.ids[m.tag] = ident
        log.info("notify %s: %s", m.tag, m.title)

    def refresh_status(self) -> None:
        status = self.query_status()
        if status != self.status or not hasattr(self, "_published"):
            self.status = status
            self._published = True
            self.publish(PermissionChanged(status))

    def query_status(self) -> NotifyPermission:
        if sys.platform != "darwin":
            return "granted"  # TZ 3.8: Windows and Linux do not ask
        backend = getattr(self.notifier, "_backend", None)
        center = getattr(backend, "nc", None)
        if center is None:  # not an app bundle: desktop-notifier has no macOS backend
            return "granted" if getattr(self.notifier, "_did_request_authorisation", False) else "unknown"
        return _macos_status(center)


async def _make(cls: Any) -> Any:
    return cls(app_name="Alarm")


def _macos_status(center: Any) -> NotifyPermission:
    from rubicon.objc import py_from_ns  # pyright: ignore[reportMissingImports]
    from rubicon.objc.runtime import objc_id  # pyright: ignore[reportMissingImports]

    done = threading.Event()
    result: list[int] = []

    def handler(settings: objc_id) -> None:  # pyright: ignore[reportUnknownParameterType]
        result.append(int(py_from_ns(settings).authorizationStatus))
        done.set()

    center.getNotificationSettingsWithCompletionHandler(handler)
    if not done.wait(5):
        return "unknown"
    code = result[0]
    if code == 0:
        return "unknown"  # not determined: show "Turn On"
    if code == 1:
        return "denied"
    return "granted"
