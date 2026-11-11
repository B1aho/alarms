"""NotifierActor protocol."""

from dataclasses import dataclass

from alarm.rules.models import NotifyPermission


@dataclass(frozen=True, slots=True)
class Notify:
    tag: str  # "alarm-<id>" or "timer"
    title: str
    body: str
    sticky: bool  # stays until dismissed
    snooze_label: str | None = None  # button text, only for ringing alarms with snooze
    alarm_id: str | None = None


@dataclass(frozen=True, slots=True)
class CloseNotification:
    tag: str


@dataclass(frozen=True, slots=True)
class RequestPermission:
    pass


@dataclass(frozen=True, slots=True)
class PermissionChanged:
    status: NotifyPermission
