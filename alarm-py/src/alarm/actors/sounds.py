"""SoundsActor: the user's own music files (spec 2.6, 3.8)."""

import logging
import os
import uuid
from typing import Any, assert_never

from alarm.kernel import Actor, clock
from alarm.messages import system as sys_msg
from alarm.messages.audio import Probe
from alarm.messages.sounds import ImportFailed, ImportSound, RemoveSound, SoundImported, SoundsChanged
from alarm.messages.system import CopySound, DeleteSound, LoadSounds, Save, SoundsDir
from alarm.rules import strings
from alarm.rules.defaults import AUDIO_EXTENSIONS, MAX_SOUND_BYTES, file_ext, file_stem, sort_sounds
from alarm.rules.models import CustomSound

log = logging.getLogger("alarm.sounds")

Msg = ImportSound | RemoveSound


class SoundsActor(Actor):
    name = sys_msg.SOUNDS

    def __init__(self, *, restarted: bool = False) -> None:
        super().__init__(restarted=restarted)
        self.sounds: list[CustomSound] = []
        self.directory = ""

    def setup(self) -> None:
        self.sounds = sort_sounds(self.ask(sys_msg.STORE, LoadSounds()))
        self.directory = self.ask(sys_msg.STORE, SoundsDir())
        self.changed()

    def changed(self) -> None:
        self.publish(SoundsChanged(tuple(self.sounds), self.directory))

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> None:
        match m:
            case ImportSound(path=path, context=context):
                result = self.import_file(path)
                if isinstance(result, str):
                    self.publish(ImportFailed(result, context))
                else:
                    self.publish(SoundImported(result, context))
            case RemoveSound(sound_id=sound_id):
                gone = [s for s in self.sounds if s.id == sound_id]
                if gone:
                    self.sounds = [s for s in self.sounds if s.id != sound_id]
                    self.tell(sys_msg.STORE, Save(tuple(self.sounds)))
                    self.tell(sys_msg.STORE, DeleteSound(sound_id, gone[0].ext))
                    self.changed()
            case _:
                assert_never(m)

    def import_file(self, path: str) -> CustomSound | str:
        ext = file_ext(path)
        if ext not in AUDIO_EXTENSIONS or not os.path.isfile(path):
            return strings.ERR_NOT_AUDIO
        size = os.path.getsize(path)
        if size > MAX_SOUND_BYTES:
            return strings.ERR_TOO_LARGE
        if not self.ask(sys_msg.AUDIO, Probe(path), timeout=30):
            return strings.ERR_CANNOT_PLAY
        sound_id = uuid.uuid4().hex
        self.ask(sys_msg.STORE, CopySound(path, sound_id, ext), timeout=60)
        sound = CustomSound(id=sound_id, name=file_stem(path), size=size, added_at=clock.now_ms(), ext=ext)
        self.sounds = sort_sounds([*self.sounds, sound])
        self.ask(sys_msg.STORE, Save(tuple(self.sounds)))
        self.changed()
        log.info("imported %s as %s", path, sound_id)
        return sound
