"""AppViewModel: navigation, toolbar clock, theme, window title, notification status."""

import importlib.metadata
from datetime import datetime

from PySide6.QtCore import QEvent, QObject, Qt, QTimer, Signal, Slot
from PySide6.QtGui import QGuiApplication

from alarm.rules import strings
from alarm.rules.format import clock_parts
from alarm.rules.schedule import local_dt
from alarm.rules.strings import Platform
from alarm.ui.bridge import UiBridge
from alarm.ui.viewmodels.base import ViewModel, ro


def app_version() -> str:
    try:
        return importlib.metadata.version("alarm")
    except importlib.metadata.PackageNotFoundError:
        return "1.0.0"


class AppViewModel(ViewModel):
    changed = Signal()
    closing = Signal()
    page = ro(int, "page", changed)
    clock = ro(str, "clock", changed)
    clockPeriod = ro(str, "clockPeriod", changed)
    theme = ro(str, "theme", changed)
    title = ro(str, "title", changed)
    platform = ro(str, "platform", changed)
    reducedMotion = ro(bool, "reducedMotion", changed)
    version = ro(str, "version", changed)
    permission = ro(str, "permission", changed)
    blockedText = ro(str, "blockedText", changed)
    ringing = ro(bool, "ringing", changed)
    keyboardNav = ro(bool, "keyboardNav", changed)

    def __init__(self, bridge: UiBridge, platform: Platform, reduced_motion: bool) -> None:
        super().__init__(
            page=0,
            clock="",
            clockPeriod="",
            theme="system",
            title=strings.APP_NAME,
            platform=platform,
            reducedMotion=reduced_motion,
            version=app_version(),
            permission="unknown",
            blockedText=strings.blocked_text(platform),
            ringing=False,
            keyboardNav=False,
        )
        self.bridge = bridge
        bridge.ticked.connect(self.refresh)
        bridge.settingsChanged.connect(self.refresh)
        bridge.ringingChanged.connect(self.refresh)
        bridge.permissionChanged.connect(self.refresh)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh)
        self.timer.start(1000)
        self.refresh()
        app = QGuiApplication.instance()
        if app is not None:
            app.installEventFilter(self)

    def eventFilter(self, watched: QObject, event: QEvent) -> bool:
        """Focus rings only after keyboard navigation (spec 4.6)."""
        t = event.type()
        if t == QEvent.Type.KeyPress:
            key = getattr(event, "key", lambda: 0)()
            if key in (Qt.Key.Key_Tab, Qt.Key.Key_Backtab):
                self.put(keyboardNav=True)
        elif t == QEvent.Type.MouseButtonPress:
            self.put(keyboardNav=False)
        return False

    def refresh(self) -> None:
        b = self.bridge
        d: datetime = local_dt(b.now_ms())
        time, period = clock_parts(d.hour, d.minute, b.cycle)
        ringing = b.ringing[0] if b.ringing else None
        self.put(
            clock=time,
            clockPeriod=period,
            theme=b.settings.theme,
            title=strings.window_title_ringing(ringing.label) if ringing else strings.APP_NAME,
            permission=b.permission,
            ringing=ringing is not None,
        )

    @Slot()
    def windowClosing(self) -> None:
        self.closing.emit()

    @Slot(int)
    def setPage(self, index: int) -> None:
        self.put(page=max(0, min(3, index)))
