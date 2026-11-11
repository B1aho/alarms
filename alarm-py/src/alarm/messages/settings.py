"""SettingsActor protocol."""

from dataclasses import dataclass

from alarm.rules.models import HourCycle, Settings


@dataclass(frozen=True, slots=True)
class GetSettings:
    pass


@dataclass(frozen=True, slots=True)
class UpdateSettings:
    settings: Settings  # the whole new value (validated by the model)


@dataclass(frozen=True, slots=True)
class SettingsChanged:
    settings: Settings
    cycle: HourCycle  # `auto` resolved against the OS locale
