from pathlib import Path
from typing import Any

from alarm.actors.audio.actor import AudioActor
from alarm.actors.power.actor import PowerActor
from alarm.actors.sounds import SoundsActor
from alarm.actors.store import StoreActor
from alarm.messages import system as sys_msg
from alarm.messages.alarms import AlarmsChanged
from alarm.messages.settings import SettingsChanged
from alarm.messages.sounds import ImportFailed, ImportSound, RemoveSound, SoundImported, SoundsChanged
from alarm.rules.defaults import new_alarm
from alarm.rules.models import Settings
from tests.actors.audio_files import write
from tests.actors.world import World


def test_import_validate_and_remove(tmp_path: Path) -> None:
    data = tmp_path / "data"
    w = World(data, 0, stubs=())
    w.add(sys_msg.STORE, lambda r: StoreActor(data, restarted=r))
    w.add(sys_msg.AUDIO, lambda r: AudioActor(restarted=r, null_output=True))
    w.add(sys_msg.SOUNDS, lambda r: SoundsActor(restarted=r))
    w.start()
    song = write(tmp_path / "My Song.flac")
    w.send(ImportSound(str(song), "picker"), sys_msg.SOUNDS)
    imported = w.events.of(SoundImported)[-1]
    assert imported.context == "picker" and imported.sound.name == "My Song" and imported.sound.ext == "flac"
    assert (data / "sounds" / f"{imported.sound.id}.flac").exists()
    text = tmp_path / "notes.txt"
    text.write_text("hello")
    w.send(ImportSound(str(text)), sys_msg.SOUNDS)
    fake = tmp_path / "fake.mp3"
    fake.write_bytes(b"\0" * 5000)
    w.send(ImportSound(str(fake)), sys_msg.SOUNDS)
    big = tmp_path / "big.wav"
    with big.open("wb") as f:
        f.truncate(80 * 1024 * 1024 + 1)
    w.send(ImportSound(str(big)), sys_msg.SOUNDS)
    assert [e.text for e in w.events.of(ImportFailed)] == [
        "That file is not an audio file.",
        "This audio format cannot be played on this computer.",
        "That file is larger than 80 MB.",
    ]
    w.send(RemoveSound(imported.sound.id), sys_msg.SOUNDS)
    w.sync(sys_msg.STORE)
    assert w.events.of(SoundsChanged)[-1].sounds == ()
    assert not (data / "sounds" / f"{imported.sound.id}.flac").exists()
    w.stop()


class FakeHold:
    def __init__(self, log: list[str]) -> None:
        self.log = log

    def __enter__(self) -> Any:
        self.log.append("enter")

    def __exit__(self, *exc: object) -> Any:
        self.log.append("exit")


def test_keep_awake_follows_setting_and_alarms(tmp_path: Path) -> None:
    holds: list[str] = []
    logins: list[bool] = []
    w = World(tmp_path, 0, stubs=())
    w.add(
        sys_msg.POWER,
        lambda r: PowerActor(restarted=r, hold_factory=lambda: FakeHold(holds), apply_autostart=logins.append),
    )
    w.start()
    a = new_alarm(Settings(), 0, "a")
    w.send(SettingsChanged(Settings(), "24h"), sys_msg.POWER)
    w.send(AlarmsChanged((a,)), sys_msg.POWER)
    assert holds == [] and logins == [True]  # Open at Login is on by default
    w.send(SettingsChanged(Settings(keep_awake=True), "24h"), sys_msg.POWER)
    assert holds == ["enter"]
    w.send(AlarmsChanged((a.model_copy(update={"enabled": False}),)), sys_msg.POWER)
    assert holds == ["enter", "exit"]
    w.send(AlarmsChanged((a.model_copy(update={"enabled": False, "ringing_since": 1}),)), sys_msg.POWER)
    assert holds == ["enter", "exit", "enter"]
    w.send(SettingsChanged(Settings(keep_awake=True, open_at_login=False), "24h"), sys_msg.POWER)
    assert logins == [True, False]
    w.stop()
