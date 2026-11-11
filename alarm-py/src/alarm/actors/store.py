"""StoreActor: the only writer of files on disk (TZ 6, 2.7).

Layout under the data directory: alarms/<id>.json, settings.json, timer.json,
stopwatch.json, sounds.json, sounds/<id>.<ext>. Writes go to a temporary file
in the same directory and are moved into place with os.replace.
"""

import json
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, assert_never

from pydantic import ValidationError

from alarm.kernel import Actor
from alarm.messages import system as sys_msg
from alarm.messages.system import (
    CopySound,
    DeleteAlarmFile,
    DeleteSound,
    LoadAlarms,
    LoadSettings,
    LoadSounds,
    LoadStopwatch,
    LoadTimer,
    Save,
    SoundsDir,
)
from alarm.rules.models import (
    Alarm,
    CustomSound,
    Settings,
    StopwatchState,
    TimerState,
    parse_settings,
    parse_stopwatch,
    parse_timer,
)

log = logging.getLogger("alarm.store")

Msg = (
    LoadAlarms
    | LoadSettings
    | LoadTimer
    | LoadStopwatch
    | LoadSounds
    | Save
    | DeleteAlarmFile
    | CopySound
    | DeleteSound
    | SoundsDir
)


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text("utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        log.warning("unreadable %s: using defaults", path)
        return None


def _dump(obj: Any) -> bytes:
    return json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")


class StoreActor(Actor):
    name = sys_msg.STORE

    def __init__(self, data_dir: Path, *, restarted: bool = False) -> None:
        super().__init__(restarted=restarted)
        self.root = data_dir
        self.alarms_dir = data_dir / "alarms"
        self.sounds_dir = data_dir / "sounds"

    def setup(self) -> None:
        self.alarms_dir.mkdir(parents=True, exist_ok=True)
        self.sounds_dir.mkdir(parents=True, exist_ok=True)

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> Any:
        match m:
            case LoadAlarms():
                return self.load_alarms()
            case LoadSettings():
                return parse_settings(_read_json(self.root / "settings.json"))
            case LoadTimer():
                return parse_timer(_read_json(self.root / "timer.json"))
            case LoadStopwatch():
                return parse_stopwatch(_read_json(self.root / "stopwatch.json"))
            case LoadSounds():
                return self.load_sounds()
            case Save(record=record):
                self.save(record)
                return True
            case DeleteAlarmFile(alarm_id=alarm_id):
                (self.alarms_dir / f"{_safe(alarm_id)}.json").unlink(missing_ok=True)
                return True
            case CopySound(source=source, sound_id=sound_id, ext=ext):
                return str(self.copy_sound(Path(source), sound_id, ext))
            case DeleteSound(sound_id=sound_id, ext=ext):
                (self.sounds_dir / f"{_safe(sound_id)}.{_safe(ext)}").unlink(missing_ok=True)
                return True
            case SoundsDir():
                return str(self.sounds_dir)
            case _:
                assert_never(m)

    def load_alarms(self) -> tuple[Alarm, ...]:
        out: list[Alarm] = []
        for path in sorted(self.alarms_dir.glob("*.json")):
            raw = _read_json(path)
            try:
                out.append(Alarm.model_validate(raw))
            except ValidationError:
                log.warning("skipping broken alarm file %s", path.name)
        return tuple(out)

    def load_sounds(self) -> tuple[CustomSound, ...]:
        raw = _read_json(self.root / "sounds.json")
        out: list[CustomSound] = []
        if isinstance(raw, list):
            for item in raw:  # pyright: ignore[reportUnknownVariableType]
                try:
                    out.append(CustomSound.model_validate(item))
                except ValidationError:
                    log.warning("skipping broken sound entry")
        return tuple(out)

    def save(self, record: sys_msg.Record) -> None:
        match record:
            case Alarm():
                atomic_write(self.alarms_dir / f"{_safe(record.id)}.json", _dump(record.model_dump(mode="json")))
            case Settings():
                atomic_write(self.root / "settings.json", _dump(record.model_dump(mode="json")))
            case TimerState():
                atomic_write(self.root / "timer.json", _dump(record.model_dump(mode="json")))
            case StopwatchState():
                atomic_write(self.root / "stopwatch.json", _dump(record.model_dump(mode="json")))
            case tuple():
                atomic_write(self.root / "sounds.json", _dump([s.model_dump(mode="json") for s in record]))
            case _:
                assert_never(record)

    def copy_sound(self, source: Path, sound_id: str, ext: str) -> Path:
        target = self.sounds_dir / f"{_safe(sound_id)}.{_safe(ext)}"
        fd, tmp = tempfile.mkstemp(prefix=".import.", dir=self.sounds_dir)
        os.close(fd)
        try:
            shutil.copyfile(source, tmp)
            os.replace(tmp, target)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        return target


def _safe(part: str) -> str:
    return "".join(c for c in part if c.isalnum() or c in "-_")
