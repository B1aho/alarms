"""SoundsActor protocol."""

from dataclasses import dataclass

from alarm.rules.models import CustomSound


@dataclass(frozen=True, slots=True)
class ImportSound:
    path: str
    context: str = ""  # who asked (the picker selects the new sound)


@dataclass(frozen=True, slots=True)
class RemoveSound:
    sound_id: str


@dataclass(frozen=True, slots=True)
class SoundsChanged:
    sounds: tuple[CustomSound, ...]  # sorted by name
    directory: str


@dataclass(frozen=True, slots=True)
class SoundImported:
    sound: CustomSound
    context: str


@dataclass(frozen=True, slots=True)
class ImportFailed:
    text: str
    context: str
