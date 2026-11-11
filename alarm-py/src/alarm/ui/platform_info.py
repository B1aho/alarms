"""OS facts the UI needs: platform name, 12/24 h, reduced motion, dock icon (macOS)."""

import logging
import subprocess
import sys

from PySide6.QtCore import QLocale
from PySide6.QtGui import QGuiApplication

from alarm.rules.format import system_cycle_from_pattern
from alarm.rules.models import HourCycle
from alarm.rules.strings import Platform

log = logging.getLogger("alarm.platform")


def platform() -> Platform:
    if sys.platform == "darwin":
        return "macos"
    if sys.platform == "win32":
        return "windows"
    return "linux"


def system_hour_cycle() -> HourCycle:
    """`auto` (TZ 6, 3.13): the OS short time format contains AP → 12h."""
    return system_cycle_from_pattern(QLocale.system().timeFormat(QLocale.FormatType.ShortFormat))


def reduced_motion() -> bool:
    try:
        if sys.platform == "darwin":
            from AppKit import NSWorkspace  # pyright: ignore[reportMissingImports, reportAttributeAccessIssue]

            return bool(NSWorkspace.sharedWorkspace().accessibilityDisplayShouldReduceMotion())
        if sys.platform == "win32":
            import ctypes

            value = ctypes.c_bool(True)
            spi_getclientareaanimation = 0x1042
            ctypes.windll.user32.SystemParametersInfoW(spi_getclientareaanimation, 0, ctypes.byref(value), 0)  # type: ignore[attr-defined]
            return not value.value
        out = subprocess.run(
            ["gsettings", "get", "org.gnome.desktop.interface", "enable-animations"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        return out.stdout.strip() == "false"
    except Exception:
        log.debug("reduced-motion query failed", exc_info=True)
        return False


def set_dock_icon_visible(visible: bool) -> None:
    """macOS: hide the Dock icon while the window is closed (activation policy Accessory)."""
    if sys.platform != "darwin" or QGuiApplication.platformName() != "cocoa":
        return  # headless (tests): never touch the Dock or steal focus
    try:
        from AppKit import NSApplication  # pyright: ignore[reportMissingImports, reportAttributeAccessIssue]

        regular, accessory = 0, 1
        app = NSApplication.sharedApplication()
        app.setActivationPolicy_(regular if visible else accessory)
        if visible:
            app.activateIgnoringOtherApps_(True)
    except Exception:
        log.debug("activation policy change failed", exc_info=True)
