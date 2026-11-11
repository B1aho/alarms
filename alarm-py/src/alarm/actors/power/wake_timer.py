"""Wake from sleep for the next alarm (TZ 3.17): Windows waitable timer with fResume = TRUE.

macOS and Linux: not used. Requires no admin rights; if Windows refuses, nothing happens.
"""

import logging
import sys
from typing import Any

log = logging.getLogger("alarm.wake")


class WakeTimer:
    def __init__(self) -> None:
        self.handle: Any = None
        self.at: int | None = None
        self.enabled = sys.platform == "win32"
        if self.enabled:
            try:
                import ctypes

                self.k32: Any = ctypes.windll.kernel32  # type: ignore[attr-defined]
                self.handle = self.k32.CreateWaitableTimerW(None, True, "Local\\AlarmWake")
            except Exception:
                log.warning("waitable timer unavailable", exc_info=True)
                self.enabled = False

    def set(self, at_ms: int | None) -> None:
        if not self.enabled or at_ms == self.at:
            return
        import ctypes

        self.at = at_ms
        if at_ms is None:
            self.k32.CancelWaitableTimer(self.handle)
            return
        # FILETIME: 100 ns since 1601-01-01 UTC; absolute times are positive.
        due = ctypes.c_longlong((at_ms + 11_644_473_600_000) * 10_000)
        ok = self.k32.SetWaitableTimer(self.handle, ctypes.byref(due), 0, None, None, True)
        if not ok:
            log.info("SetWaitableTimer(fResume) refused (error %s)", self.k32.GetLastError())

    def close(self) -> None:
        if self.enabled and self.handle:
            self.k32.CancelWaitableTimer(self.handle)
            self.k32.CloseHandle(self.handle)
