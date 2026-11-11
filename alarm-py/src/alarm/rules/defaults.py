"""Defaults and catalogues (spec 2.1–2.6, 3.8)."""

from alarm.rules.models import DEFAULT_SOUND, Alarm, CustomSound, Settings, SoundRef
from alarm.rules.schedule import local_dt

BUILTIN_SOUNDS: tuple[tuple[str, str], ...] = (
    ("sunrise", "Sunrise"),
    ("harp", "Harp"),
    ("chimes", "Chimes"),
    ("beacon", "Beacon"),
    ("pulse", "Pulse"),
    ("classic", "Classic Bell"),
)
BUILTIN_IDS = frozenset(i for i, _ in BUILTIN_SOUNDS)

MAX_SOUND_BYTES = 80 * 1024 * 1024
AUDIO_EXTENSIONS = frozenset({"mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "webm"})
TIMER_LATE_LIMIT_MS = 10 * 60_000
RECENTS_MAX = 6


def new_alarm(settings: Settings, now: int, alarm_id: str) -> Alarm:
    d = local_dt(now)
    return Alarm(
        id=alarm_id,
        hour=d.hour,
        minute=d.minute,
        label="",
        enabled=True,
        days=(),
        sound=settings.default_sound,
        volume=settings.volume,
        ramp_seconds=settings.ramp_seconds,
        snooze=True,
        task=settings.default_task,
        created_at=now,
    )


def sound_name(ref: SoundRef, customs: tuple[CustomSound, ...] | list[CustomSound]) -> str:
    if ref.kind == "builtin":
        return dict(BUILTIN_SOUNDS).get(ref.id, "Sunrise")
    for c in customs:
        if c.id == ref.id:
            return c.name
    return "Missing file"


def playable(ref: SoundRef, customs: tuple[CustomSound, ...] | list[CustomSound]) -> SoundRef:
    """A missing custom file rings `Sunrise` instead (spec 3.8)."""
    if ref.kind == "builtin":
        return ref if ref.id in BUILTIN_IDS else DEFAULT_SOUND
    return ref if any(c.id == ref.id for c in customs) else DEFAULT_SOUND


def sort_sounds(sounds: list[CustomSound] | tuple[CustomSound, ...]) -> list[CustomSound]:
    return sorted(sounds, key=lambda s: (s.name.casefold(), s.name))


def file_stem(filename: str) -> str:
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    return base.rsplit(".", 1)[0] if "." in base else base


def file_ext(filename: str) -> str:
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    return base.rsplit(".", 1)[1].lower() if "." in base else ""
