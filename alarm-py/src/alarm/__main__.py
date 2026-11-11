"""Bootstrap: one process — single instance, QApplication, supervisor with actors, subscriptions, tray, window.

Flags:
  --agent            started by the login agent: stay hidden in the tray
  --hidden           start hidden
  --data-dir DIR     data directory (default: platformdirs.user_data_dir("Alarm"))
  --fake-clock SPEC  test clock: epoch ms or ISO time, optional "@speed" (e2e tests)
  --test-control     accept fault-injection commands on the local socket (e2e tests)
"""

import argparse
import contextlib
import getpass
import logging
import logging.handlers
import os
import sys
from datetime import datetime
from pathlib import Path

import platformdirs
from PySide6.QtCore import QLockFile, QTimer
from PySide6.QtNetwork import QLocalServer, QLocalSocket
from PySide6.QtWidgets import QApplication

from alarm.actors.alarms import AlarmActor
from alarm.actors.audio.actor import AudioActor
from alarm.actors.clock import ClockActor
from alarm.actors.notifier import NotifierActor
from alarm.actors.power import autostart
from alarm.actors.power.actor import PowerActor
from alarm.actors.settings import SettingsActor
from alarm.actors.sounds import SoundsActor
from alarm.actors.stopwatch import StopwatchActor
from alarm.actors.store import StoreActor
from alarm.actors.timer import TimerActor
from alarm.kernel import Barrier, Poison, clock, registry, tell
from alarm.kernel.supervisor import Supervisor
from alarm.messages import system as sys_msg
from alarm.messages.alarms import AlarmsChanged
from alarm.messages.settings import SettingsChanged
from alarm.messages.sounds import SoundsChanged
from alarm.messages.system import Resumed, Start, Tick
from alarm.rules.models import parse_settings
from alarm.ui import platform_info
from alarm.ui.bridge import UiBridge
from alarm.ui.tray import Tray
from alarm.ui.window import WindowController

log = logging.getLogger("alarm")

HANDOVER_WAIT_MS = 15_000


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="alarm", description="Desktop alarm clock")
    p.add_argument("--agent", action="store_true")
    p.add_argument("--hidden", action="store_true")
    p.add_argument("--data-dir", default=os.environ.get("ALARM_DATA_DIR"))
    p.add_argument("--fake-clock", default=os.environ.get("ALARM_FAKE_CLOCK"))
    p.add_argument("--test-control", action="store_true", default=os.environ.get("ALARM_TEST_CONTROL") == "1")
    p.add_argument("--no-handover", action="store_true")
    args, _qt = p.parse_known_args(argv)
    return args


def server_name() -> str:
    return os.environ.get("ALARM_SERVER_NAME") or f"alarm-{getpass.getuser()}"


def setup_logging() -> Path:
    log_dir = Path(os.environ.get("ALARM_LOG_DIR") or platformdirs.user_log_dir("Alarm", appauthor=False))
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / "alarm.log"
    handler = logging.handlers.RotatingFileHandler(path, maxBytes=1_000_000, backupCount=5, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s [%(threadName)s] %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    if sys.stderr is not None and os.environ.get("ALARM_LOG_STDERR", "1") == "1":
        root.addHandler(logging.StreamHandler())
    return path


def install_fake_clock(spec: str) -> None:
    value, _, speed = spec.partition("@")
    start = int(value) if value.isdigit() else int(datetime.fromisoformat(value).timestamp() * 1000)
    clock.install(clock.FakeClock(start, float(speed) if speed else 1.0))
    log.warning("fake clock from %s at %sx", value, speed or "1")


def notify_running_instance(command: str, wait_ms: int = 500) -> bool:
    sock = QLocalSocket()
    sock.connectToServer(server_name())
    if not sock.waitForConnected(wait_ms):
        return False
    sock.write(f"{command}\n".encode())
    sock.flush()
    sock.waitForBytesWritten(1000)
    sock.waitForReadyRead(1000)
    sock.disconnectFromServer()
    return True


def hand_over_to_agent(data_dir: Path) -> bool:
    """Run under the login agent so a crash restarts us (TZ 5.1, 7). True = the agent took over."""
    if sys.platform == "win32" or not autostart.allowed():
        return False
    settings = parse_settings(_read_json(data_dir / "settings.json"))
    if not settings.open_at_login:
        return False
    a = autostart.agent()
    if not a.enable(start_now=True):
        return False
    a.kickstart()
    import time

    deadline = time.monotonic() + HANDOVER_WAIT_MS / 1000
    while time.monotonic() < deadline:
        if notify_running_instance("show", 200):
            log.info("handed over to the login agent")
            return True
        time.sleep(0.1)
    log.warning("login agent did not start in time: running in this process")
    return False


def _read_json(path: Path) -> object:
    import json

    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return None


def build_supervisor(
    data_dir: Path,
    *,
    notifier_backend: object = None,
    null_audio: bool | None = None,
    system_cycle: str | None = None,
) -> Supervisor:
    def fatal(name: str) -> None:
        log.critical("too many crashes in %s: exiting so the login agent restarts us", name)
        logging.shutdown()
        os._exit(70)

    cycle = system_cycle if system_cycle in ("12h", "24h") else platform_info.system_hour_cycle()
    sup = Supervisor(on_fatal=fatal)
    sup.add(sys_msg.STORE, lambda r: StoreActor(data_dir, restarted=r))
    sup.add(sys_msg.SETTINGS, lambda r: SettingsActor(cycle, restarted=r))  # type: ignore[arg-type]
    sup.add(sys_msg.SOUNDS, lambda r: SoundsActor(restarted=r))
    sup.add(sys_msg.AUDIO, lambda r: AudioActor(restarted=r, null_output=null_audio))
    sup.add(sys_msg.NOTIFIER, lambda r: NotifierActor(restarted=r, backend=notifier_backend))
    sup.add(sys_msg.ALARMS, lambda r: AlarmActor(restarted=r))
    sup.add(sys_msg.TIMER, lambda r: TimerActor(restarted=r))
    sup.add(sys_msg.STOPWATCH, lambda r: StopwatchActor(restarted=r))
    sup.add(sys_msg.POWER, lambda r: PowerActor(restarted=r))
    sup.add(sys_msg.CLOCK, lambda r: ClockActor(restarted=r))

    subscriptions: dict[type, tuple[str, ...]] = {
        Tick: (sys_msg.ALARMS, sys_msg.TIMER),
        Resumed: (sys_msg.ALARMS, sys_msg.TIMER),
        SettingsChanged: (sys_msg.ALARMS, sys_msg.POWER),
        SoundsChanged: (sys_msg.ALARMS, sys_msg.TIMER),
        AlarmsChanged: (sys_msg.POWER,),
    }
    for event, names in subscriptions.items():
        for name in names:
            registry.subscribe(event, name)
    return sup


class ControlServer:
    """Single-instance server: `show` from a second launch; fault injection with --test-control."""

    def __init__(self, on_show: object, test_control: bool, window_state: object = None) -> None:
        self.window_state = window_state
        self.server = QLocalServer()
        self.server.setSocketOptions(QLocalServer.SocketOption.UserAccessOption)
        QLocalServer.removeServer(server_name())
        if not self.server.listen(server_name()):
            raise RuntimeError(f"cannot listen on {server_name()}: {self.server.errorString()}")
        self.on_show = on_show
        self.test_control = test_control
        self.server.newConnection.connect(self._accept)

    def _accept(self) -> None:
        while self.server.hasPendingConnections():
            sock = self.server.nextPendingConnection()
            sock.readyRead.connect(lambda s=sock: self._read(s))

    def _read(self, sock: QLocalSocket) -> None:
        while sock.canReadLine():
            line = bytes(sock.readLine().data()).decode().strip()
            reply = self.command(line)
            sock.write(f"{reply}\n".encode())
            sock.flush()

    def command(self, line: str) -> str:
        cmd, _, arg = line.partition(" ")
        if cmd == "show":
            QTimer.singleShot(0, self.on_show)  # type: ignore[arg-type]
            return "ok"
        if cmd == "ping":
            return "pong"
        if not self.test_control:
            return "denied"
        if cmd == "crash":
            tell(arg, Poison())
            return "ok"
        if cmd == "sync":
            registry.address(arg).ask(Barrier(), timeout=5)
            return "ok"
        if cmd == "quit":
            QTimer.singleShot(0, QApplication.quit)
            return "ok"
        if cmd == "window":
            return self.window_state()  # type: ignore[attr-defined]
        if cmd == "advance":
            source = clock._source  # pyright: ignore[reportPrivateUsage]
            if isinstance(source, clock.FakeClock):
                source.advance(int(arg))
                return "ok"
            return "no fake clock"
        return "unknown"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    data_dir = Path(args.data_dir or platformdirs.user_data_dir("Alarm", appauthor=False))
    data_dir.mkdir(parents=True, exist_ok=True)
    log_path = setup_logging()
    hidden = args.agent or args.hidden

    QApplication.setApplicationName("Alarm")
    QApplication.setOrganizationName("Alarm")
    app = QApplication(sys.argv[:1])
    app.setQuitOnLastWindowClosed(False)

    # Second launch: wake the first one and leave (TZ 5.1).
    if notify_running_instance("ping" if hidden else "show"):
        log.info("already running: %s", "staying quiet" if hidden else "asked it to show its window")
        return 0
    lock = QLockFile(str(data_dir / "alarm.lock"))
    lock.setStaleLockTime(0)
    if not lock.tryLock(2000):
        lock.removeStaleLockFile()
        if not lock.tryLock(1000):
            log.error("another instance holds %s", data_dir / "alarm.lock")
            return 0

    if not args.agent and not args.no_handover and args.fake_clock is None:
        lock.unlock()
        if hand_over_to_agent(data_dir):
            return 0
        if not lock.tryLock(2000):
            return 0

    log.info("starting (pid %d, data %s, log %s)", os.getpid(), data_dir, log_path)
    if args.fake_clock:
        install_fake_clock(args.fake_clock)

    bridge = UiBridge(platform_info.system_hour_cycle())
    bridge.install()
    window = WindowController(bridge)
    quitting = {"value": False}

    def quit_app() -> None:
        quitting["value"] = True
        app.quit()

    tray = Tray(bridge, window.show, quit_app)
    control = ControlServer(window.show, args.test_control, window.state)
    sup = build_supervisor(data_dir)
    sup.start()
    tell(sys_msg.CLOCK, Start())
    if not hidden:
        window.show()
    else:
        platform_info.set_dock_icon_visible(False)

    code = app.exec()
    log.info("quitting (%s)", "tray Quit" if quitting["value"] else f"code {code}")
    window.close()
    sup.stop()
    del tray, control
    with contextlib.suppress(Exception):
        lock.unlock()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
