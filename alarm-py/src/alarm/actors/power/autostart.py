"""Open at Login (TZ 3.4, 9): LaunchAgent on macOS, systemd --user (or XDG autostart) on Linux,
Task Scheduler (or HKCU Run) on Windows. The agent restarts the process only after a crash.

The agent starts the app with `--agent`: hidden in the tray. In development
(`uv run alarm`) nothing is registered unless ALARM_DEV_AUTOSTART=1, so a dev
checkout never installs itself as a login item by accident.
"""

import contextlib
import logging
import os
import plistlib
import shlex
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger("alarm.autostart")

DEFAULT_LABEL = "org.alarmclock.alarm"
PASS_ENV = (
    "ALARM_DATA_DIR",
    "ALARM_LOG_DIR",
    "ALARM_AGENT_LABEL",
    "ALARM_AUDIO",
    "ALARM_FAKE_CLOCK",
    "ALARM_DEV_AUTOSTART",
)


def label() -> str:
    return os.environ.get("ALARM_AGENT_LABEL", DEFAULT_LABEL)


def is_packaged() -> bool:
    exe = sys.executable.replace("\\", "/")
    return ".app/Contents/" in exe or getattr(sys, "frozen", False) or "/briefcase/" in exe.lower()


def allowed() -> bool:
    return is_packaged() or os.environ.get("ALARM_DEV_AUTOSTART") == "1"


def launched_by_agent() -> bool:
    return "--agent" in sys.argv


def command() -> list[str]:
    """How the login agent starts this app (hidden)."""
    if is_packaged():
        return [sys.executable, "--agent"]
    return [sys.executable, "-m", "alarm", "--agent"]


@dataclass
class Spec:
    label: str
    program: list[str]
    env: dict[str, str] = field(default_factory=dict[str, str])


def spec() -> Spec:
    env = {k: os.environ[k] for k in PASS_ENV if k in os.environ}
    return Spec(label(), command(), env)


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, check=False, timeout=15)


# ------------------------------------------------------------------ macOS --
class MacAgent:
    def __init__(self, s: Spec) -> None:
        self.spec = s
        self.path = Path.home() / "Library" / "LaunchAgents" / f"{s.label}.plist"
        self.domain = f"gui/{os.getuid()}"
        self.target = f"{self.domain}/{s.label}"

    def plist(self) -> bytes:
        body: dict[str, object] = {
            "Label": self.spec.label,
            "ProgramArguments": self.spec.program,
            "RunAtLoad": True,
            "KeepAlive": {"SuccessfulExit": False},
            "ProcessType": "Interactive",
            "LimitLoadToSessionType": "Aqua",
            "ThrottleInterval": 1,
        }
        if self.spec.env:
            body["EnvironmentVariables"] = self.spec.env
        return plistlib.dumps(body)

    def registered(self) -> bool:
        return self.path.exists() and self.path.read_bytes() == self.plist()

    def loaded(self) -> bool:
        return _run("launchctl", "print", self.target).returncode == 0

    def enable(self, start_now: bool) -> bool:
        """Write the plist and load it. `start_now` = let launchd start it (RunAtLoad)."""
        changed = not self.registered()
        if changed:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_bytes(self.plist())
        _run("launchctl", "enable", self.target)
        if self.loaded():
            if not changed:
                return True
            if not start_now:
                return True  # picked up at next login; never kill a running agent
            _run("launchctl", "bootout", self.target)
        if not start_now:
            # Loading would start a second instance (RunAtLoad). It exits at once, which is fine.
            pass
        r = _run("launchctl", "bootstrap", self.domain, str(self.path))
        if r.returncode != 0:
            log.warning("launchctl bootstrap failed: %s", r.stderr.strip())
            return False
        return True

    def kickstart(self) -> bool:
        return _run("launchctl", "kickstart", self.target).returncode == 0

    def disable(self) -> None:
        # Never `bootout` here: that would kill this process if launchd started it.
        _run("launchctl", "disable", self.target)
        self.path.unlink(missing_ok=True)

    def remove(self) -> None:
        """Unload and delete (tests and uninstall only)."""
        _run("launchctl", "bootout", self.target)
        self.path.unlink(missing_ok=True)


# ------------------------------------------------------------------ Linux --
class LinuxAgent:
    unit_name = "alarm.service"

    def __init__(self, s: Spec) -> None:
        self.spec = s
        config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
        self.unit = config / "systemd" / "user" / self.unit_name
        self.desktop = config / "autostart" / "alarm.desktop"
        self.systemd = _run("systemctl", "--user", "show-environment").returncode == 0 if _has("systemctl") else False

    def unit_text(self) -> str:
        env = "".join(f"Environment={k}={v}\n" for k, v in self.spec.env.items())
        return (
            "[Unit]\nDescription=Alarm\nPartOf=graphical-session.target\nAfter=graphical-session.target\n\n"
            f"[Service]\nExecStart={shlex.join(self.spec.program)}\n{env}Restart=on-failure\nRestartSec=1\n\n"
            "[Install]\nWantedBy=graphical-session.target\n"
        )

    def desktop_text(self) -> str:
        return (
            "[Desktop Entry]\nType=Application\nName=Alarm\n"
            f"Exec={shlex.join(self.spec.program)}\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n"
        )

    def enable(self, start_now: bool) -> bool:
        if self.systemd:
            self.unit.parent.mkdir(parents=True, exist_ok=True)
            self.unit.write_text(self.unit_text())
            _run("systemctl", "--user", "daemon-reload")
            return _run("systemctl", "--user", "enable", self.unit_name).returncode == 0
        self.desktop.parent.mkdir(parents=True, exist_ok=True)
        self.desktop.write_text(self.desktop_text())
        return True

    def kickstart(self) -> bool:
        return self.systemd and _run("systemctl", "--user", "start", self.unit_name).returncode == 0

    def disable(self) -> None:
        if self.systemd:
            _run("systemctl", "--user", "disable", self.unit_name)
            self.unit.unlink(missing_ok=True)
        self.desktop.unlink(missing_ok=True)

    def registered(self) -> bool:
        return self.unit.exists() or self.desktop.exists()


# ---------------------------------------------------------------- Windows --
class WindowsAgent:
    task = "Alarm"

    def __init__(self, s: Spec) -> None:
        self.spec = s

    def task_xml(self) -> str:
        exe, *args = self.spec.program
        user = os.environ.get("USERNAME", "")
        return f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId></LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec><Command>{exe}</Command><Arguments>{subprocess.list2cmdline(args)}</Arguments></Exec>
  </Actions>
</Task>"""

    def enable(self, start_now: bool) -> bool:
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False, encoding="utf-16") as f:
            f.write(self.task_xml())
            path = f.name
        try:
            ok = _run("schtasks", "/Create", "/F", "/TN", self.task, "/XML", path).returncode == 0
        finally:
            Path(path).unlink(missing_ok=True)
        if not ok:
            ok = self._run_key(True)
        return ok

    def _run_key(self, on: bool) -> bool:
        try:
            import winreg  # pyright: ignore[reportMissingModuleSource]

            key = winreg.OpenKey(  # type: ignore[attr-defined]
                winreg.HKEY_CURRENT_USER,  # type: ignore[attr-defined]
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0,
                winreg.KEY_SET_VALUE,  # type: ignore[attr-defined]
            )
            if on:
                winreg.SetValueEx(key, "Alarm", 0, winreg.REG_SZ, subprocess.list2cmdline(self.spec.program))  # type: ignore[attr-defined]
            else:
                with contextlib.suppress(OSError):
                    winreg.DeleteValue(key, "Alarm")  # type: ignore[attr-defined]
            return True
        except Exception:
            log.warning("HKCU Run update failed", exc_info=True)
            return False

    def kickstart(self) -> bool:
        return False

    def disable(self) -> None:
        _run("schtasks", "/Delete", "/F", "/TN", self.task)
        self._run_key(False)

    def registered(self) -> bool:
        return _run("schtasks", "/Query", "/TN", self.task).returncode == 0


def _has(cmd: str) -> bool:
    from shutil import which

    return which(cmd) is not None


Agent = MacAgent | LinuxAgent | WindowsAgent


def agent() -> Agent:
    s = spec()
    if sys.platform == "darwin":
        return MacAgent(s)
    if sys.platform == "win32":
        return WindowsAgent(s)
    return LinuxAgent(s)


def apply(enabled: bool) -> None:
    """Make the login item match the setting (idempotent)."""
    if not allowed():
        log.info("autostart skipped in development (set ALARM_DEV_AUTOSTART=1)")
        return
    a = agent()
    if enabled:
        a.enable(start_now=False)
    else:
        a.disable()
