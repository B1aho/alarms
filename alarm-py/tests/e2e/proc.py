"""Run the real app as a separate process (TZ 8: e2e) and talk to its control socket."""

import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from alarm.rules.defaults import new_alarm
from alarm.rules.models import Settings


def alarm_json(alarm_id: str, trigger_ms: int, **kw: Any) -> str:
    from datetime import datetime

    t = datetime.fromtimestamp(trigger_ms / 1000)
    a = new_alarm(Settings(), trigger_ms - 3_600_000, alarm_id).model_copy(
        update={"hour": t.hour, "minute": t.minute, "label": alarm_id.title(), "next_trigger_at": trigger_ms, **kw}
    )
    return a.model_dump_json()


class App:
    def __init__(self, root: Path, *, server: str | None = None, env: dict[str, str] | None = None) -> None:
        self.root = root
        self.data = root / "data"
        self.logs = root / "logs"
        (self.data / "alarms").mkdir(parents=True, exist_ok=True)
        self.server = server or f"alarm-e2e-{uuid.uuid4().hex[:8]}"
        self.env = {
            **os.environ,
            "ALARM_DATA_DIR": str(self.data),
            "ALARM_LOG_DIR": str(self.logs),
            "ALARM_SERVER_NAME": self.server,
            "ALARM_AUDIO": "null",
            "ALARM_TEST_CONTROL": "1",
            "ALARM_LOG_STDERR": "0",
            "QT_QPA_PLATFORM": "offscreen",  # invisible: never steals focus or shows a window
            **(env or {}),
        }
        self.proc: subprocess.Popen[bytes] | None = None

    def write_alarm(self, alarm_id: str, trigger_ms: int, **kw: Any) -> None:
        (self.data / "alarms" / f"{alarm_id}.json").write_text(alarm_json(alarm_id, trigger_ms, **kw))

    def write(self, name: str, data: object) -> None:
        (self.data / name).write_text(data if isinstance(data, str) else json.dumps(data))

    def start(self, *args: str) -> "App":
        self.proc = subprocess.Popen([sys.executable, "-m", "alarm", *args], env=self.env)
        self.wait_for(lambda: self.command("ping") == "pong", 20)
        return self

    @property
    def log(self) -> str:
        path = self.logs / "alarm.log"
        return path.read_text() if path.exists() else ""

    def wait_log(self, pattern: str, timeout: float = 10, count: int = 1) -> list[re.Match[str]]:
        found: list[re.Match[str]] = []

        def ok() -> bool:
            nonlocal found
            found = list(re.finditer(pattern, self.log))
            return len(found) >= count

        self.wait_for(ok, timeout, f"log /{pattern}/ x{count}")
        return found

    def wait_for(self, cond: Any, timeout: float, what: str = "condition") -> None:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                if cond():
                    return
            except OSError:
                pass
            time.sleep(0.05)
        raise AssertionError(f"timed out waiting for {what}\n--- log ---\n{self.log[-4000:]}")

    def command(self, line: str, timeout: float = 5) -> str:
        path = os.path.join(tempfile.gettempdir(), self.server)
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect(path)
            s.sendall(f"{line}\n".encode())
            data = b""
            while not data.endswith(b"\n"):
                chunk = s.recv(1024)
                if not chunk:
                    break
                data += chunk
        return data.decode().strip()

    def alarm_file(self, alarm_id: str) -> dict[str, Any]:
        return json.loads((self.data / "alarms" / f"{alarm_id}.json").read_text())

    def stop(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            try:
                self.command("quit")
                self.proc.wait(10)
            except (OSError, subprocess.TimeoutExpired):
                self.proc.kill()
                self.proc.wait(5)
