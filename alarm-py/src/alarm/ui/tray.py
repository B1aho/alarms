"""Tray / menu bar icon (TZ 3.13): Open Alarm; Snooze N min while a snoozable alarm rings; Quit."""

import sys
from collections.abc import Callable
from pathlib import Path

from PySide6.QtGui import QAction, QIcon
from PySide6.QtWidgets import QMenu, QSystemTrayIcon

from alarm.messages import system as sys_msg
from alarm.messages.alarms import Snooze
from alarm.rules import strings
from alarm.ui.bridge import UiBridge

ICONS = Path(__file__).parent / "qml" / "icons"


class Tray:
    def __init__(self, bridge: UiBridge, open_window: Callable[[], None], quit_app: Callable[[], None]) -> None:
        self.bridge = bridge
        icon = QIcon(str(ICONS / ("tray-template.svg" if sys.platform == "darwin" else "tray.svg")))
        icon.setIsMask(sys.platform == "darwin")  # template image: follows the menu bar colour
        self.icon = QSystemTrayIcon(icon)
        self.icon.setToolTip(strings.APP_NAME)
        self.menu = QMenu()
        self.open_action = QAction(strings.OPEN_ALARM, self.menu)
        self.open_action.triggered.connect(open_window)
        self.snooze_action = QAction("", self.menu)
        self.snooze_action.triggered.connect(lambda: bridge.send(sys_msg.ALARMS, Snooze()))
        self.quit_action = QAction(strings.QUIT, self.menu)
        self.quit_action.triggered.connect(quit_app)
        self.menu.addAction(self.open_action)
        self.menu.addAction(self.snooze_action)
        self.menu.addSeparator()
        self.menu.addAction(self.quit_action)
        self.icon.setContextMenu(self.menu)
        if sys.platform != "darwin":
            self.icon.activated.connect(
                lambda reason: open_window() if reason == QSystemTrayIcon.ActivationReason.Trigger else None
            )
        bridge.ringingChanged.connect(self.refresh)
        bridge.settingsChanged.connect(self.refresh)
        self.refresh()
        self.icon.show()

    def refresh(self) -> None:
        ringing = self.bridge.ringing[0] if self.bridge.ringing else None
        self.snooze_action.setText(strings.snooze_action(self.bridge.settings.snooze_minutes))
        self.snooze_action.setVisible(ringing is not None and ringing.snooze)

    @property
    def snooze_visible(self) -> bool:
        return self.snooze_action.isVisible()
