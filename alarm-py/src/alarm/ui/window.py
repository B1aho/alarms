"""The window: created on demand, destroyed on close (TZ 3.14, 5.1). Rings full screen on top (3.5, 3.16)."""

import logging
from pathlib import Path
from typing import Any, cast

from PySide6.QtCore import QObject, Qt, QTimer, QUrl
from PySide6.QtGui import QGuiApplication, QWindow
from PySide6.QtQml import QQmlApplicationEngine

from alarm.rules import strings
from alarm.rules.strings import Platform
from alarm.ui import platform_info
from alarm.ui.bridge import UiBridge
from alarm.ui.viewmodels.alarms import AlarmsViewModel
from alarm.ui.viewmodels.app import AppViewModel
from alarm.ui.viewmodels.editor import EditorViewModel
from alarm.ui.viewmodels.ringing import RingingViewModel
from alarm.ui.viewmodels.settings import SettingsViewModel
from alarm.ui.viewmodels.stopwatch import StopwatchViewModel
from alarm.ui.viewmodels.timer import TimerViewModel

log = logging.getLogger("alarm.ui.window")

QML = Path(__file__).parent / "qml"
WIDTH, HEIGHT = 1100, 820


def strings_map() -> dict[str, str]:
    return {k: v for k, v in vars(strings).items() if k.isupper() and isinstance(v, str)}


class WindowController(QObject):
    def __init__(self, bridge: UiBridge) -> None:
        super().__init__()
        self.bridge = bridge
        self.engine: QQmlApplicationEngine | None = None
        self.window: QWindow | None = None
        self.vms: dict[str, QObject] = {}
        self.ringing_mode = False
        self.fullscreen_ringing = True  # visual tests keep the window size
        self.platform: Platform = platform_info.platform()
        self.reduced_motion = platform_info.reduced_motion()
        bridge.ringingChanged.connect(self._ringing_changed)
        bridge.ringingStarted.connect(lambda _id: self._ringing_changed())
        bridge.timerAlert.connect(self.show)
        bridge.showRequested.connect(self.show)

    # ------------------------------------------------------------ lifecycle --
    @property
    def is_open(self) -> bool:
        return self.window is not None

    def _create(self) -> None:
        b = self.bridge
        app = AppViewModel(b, self.platform, self.reduced_motion)
        self.vms = {
            "app": app,
            "alarms": AlarmsViewModel(b),
            "editor": EditorViewModel(b),
            "ringing": RingingViewModel(b),
            "timer": TimerViewModel(b),
            "stopwatch": StopwatchViewModel(b),
            "settings": SettingsViewModel(b),
        }
        engine = QQmlApplicationEngine()
        for vm in self.vms.values():
            vm.setParent(engine)  # destroyed with the engine, after the QML that uses them
        engine.addImportPath(str(QML))
        ctx = engine.rootContext()
        ctx.setContextProperty("Strings", strings_map())
        for name, vm in self.vms.items():
            ctx.setContextProperty(f"{name}Vm", vm)
        engine.load(QUrl.fromLocalFile(str(QML / "Main.qml")))
        roots = engine.rootObjects()
        if not roots:
            raise RuntimeError("Main.qml failed to load")
        window = cast(QWindow, roots[0])
        window.setMinimumWidth(400)
        window.setMinimumHeight(560)
        window.resize(WIDTH, HEIGHT)
        g = QGuiApplication.primaryScreen().availableGeometry()
        window.setPosition(g.x() + (g.width() - WIDTH) // 2, g.y() + (g.height() - HEIGHT) // 2)
        window.activeChanged.connect(self._activated)
        window.destroyed.connect(self._destroyed)
        app.closing.connect(self._closing)
        self.engine = engine
        self.window = window

    def show(self) -> None:
        if self.window is None:
            self._create()
        platform_info.set_dock_icon_visible(True)
        assert self.window is not None
        log.info("window shown")
        if self.bridge.ringing:
            self._ring_mode(True)
        else:
            self.window.show()
            self.window.raise_()
            self.window.requestActivate()

    def state(self) -> str:
        if self.window is None:
            return "closed"
        return "ringing" if self.ringing_mode else "open"

    def close(self) -> None:
        if self.window is not None:
            self.window.close()

    def _closing(self) -> None:
        # Stop previews and drop the QML window and ViewModels; actors and tray keep running.
        for vm in self.vms.values():
            if isinstance(vm, TimerViewModel | SettingsViewModel):
                vm.closeSound()
        editor = self.vms.get("editor")
        if isinstance(editor, EditorViewModel) and editor.get("open"):
            editor.cancel()
        QTimer.singleShot(0, self._destroy)

    def _destroy(self) -> None:
        engine, self.engine = self.engine, None
        self.window = None
        self.ringing_mode = False
        self.vms = {}
        if engine is not None:
            engine.deleteLater()
        platform_info.set_dock_icon_visible(False)
        log.info("window closed; still running in the tray")

    def _destroyed(self, *_: Any) -> None:
        self.window = None

    def _activated(self) -> None:
        if self.window is not None and self.window.isActive():
            self.bridge.check_now()

    # -------------------------------------------------------------- ringing --
    def _ringing_changed(self) -> None:
        if self.bridge.ringing:
            if self.window is None:
                self._create()
                platform_info.set_dock_icon_visible(True)
            self._ring_mode(True)
        elif self.ringing_mode:
            self._ring_mode(False)

    def _ring_mode(self, on: bool) -> None:
        w = self.window
        if w is None:
            return
        if on:
            log.info("ringing: window full screen on top")
            self.ringing_mode = True
            w.setFlag(Qt.WindowType.WindowStaysOnTopHint, True)
            if self.fullscreen_ringing:
                w.showFullScreen()
            else:
                w.show()
            w.raise_()
            w.requestActivate()
        else:
            self.ringing_mode = False
            w.setFlag(Qt.WindowType.WindowStaysOnTopHint, False)
            w.showNormal()
