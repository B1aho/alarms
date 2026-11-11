import json
import os
from pathlib import Path

from alarm.actors.store import StoreActor, atomic_write
from alarm.kernel import ask
from alarm.messages import system as sys_msg
from alarm.messages.system import CopySound, LoadAlarms, LoadSettings, LoadSounds, Save
from alarm.rules.defaults import new_alarm
from alarm.rules.models import CustomSound, Settings
from tests.actors.world import World


def start(tmp_path: Path) -> World:
    w = World(tmp_path, 0)
    w.add(sys_msg.STORE, lambda r: StoreActor(tmp_path, restarted=r))
    return w.start()


def test_broken_alarm_is_skipped_and_bad_setting_key_defaults(tmp_path: Path) -> None:
    (tmp_path / "alarms").mkdir()
    good = new_alarm(Settings(), 0, "good")
    (tmp_path / "alarms" / "good.json").write_text(good.model_dump_json())
    (tmp_path / "alarms" / "bad.json").write_text("{not json")
    (tmp_path / "alarms" / "worse.json").write_text(json.dumps({"id": "x", "hour": 99}))
    (tmp_path / "settings.json").write_text(json.dumps({"theme": "dark", "volume": "loud"}))
    w = start(tmp_path)
    assert [a.id for a in ask(sys_msg.STORE, LoadAlarms())] == ["good"]
    s = ask(sys_msg.STORE, LoadSettings())
    assert s.theme == "dark" and s.volume == 0.9
    w.stop()


def test_missing_files_give_defaults(tmp_path: Path) -> None:
    w = start(tmp_path)
    assert ask(sys_msg.STORE, LoadSettings()) == Settings()
    assert ask(sys_msg.STORE, LoadSounds()) == ()
    w.stop()


def test_atomic_write_leaves_no_temp_files(tmp_path: Path) -> None:
    target = tmp_path / "x.json"
    atomic_write(target, b"1")
    atomic_write(target, b"2")
    assert target.read_bytes() == b"2"
    assert os.listdir(tmp_path) == ["x.json"]


def test_save_and_copy_sound(tmp_path: Path) -> None:
    w = start(tmp_path)
    src = tmp_path / "song.mp3"
    src.write_bytes(b"abc")
    path = ask(sys_msg.STORE, CopySound(str(src), "s1", "mp3"))
    assert Path(path).read_bytes() == b"abc" and Path(path).parent == tmp_path / "sounds"
    sound = CustomSound(id="s1", name="song", size=3, added_at=1, ext="mp3")
    ask(sys_msg.STORE, Save((sound,)))
    assert ask(sys_msg.STORE, LoadSounds()) == (sound,)
    w.stop()
