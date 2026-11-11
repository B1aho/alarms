"""ViewModel base: a dict of values behind read-only Qt properties sharing one `changed` signal."""

from typing import Any

from PySide6.QtCore import Property, QObject


class ViewModel(QObject):
    """Subclasses declare their own `changed = Signal()` (PySide needs the notify signal on the same class)."""

    changed: Any

    def __init__(self, **initial: Any) -> None:
        super().__init__()
        self._v: dict[str, Any] = dict(initial)

    def put(self, **values: Any) -> None:
        dirty = False
        for k, v in values.items():
            if self._v.get(k, _MISSING) != v:
                self._v[k] = v
                dirty = True
        if dirty:
            self.changed.emit()

    def get(self, key: str) -> Any:
        return self._v[key]


_MISSING = object()


def ro(qt_type: Any, key: str, notify: Any) -> Any:
    """A read-only property reading `self._v[key]`; `notify` must be the class's own `changed`."""

    def getter(self: ViewModel) -> Any:
        return self._v[key]

    return Property(qt_type, getter, notify=notify)  # pyright: ignore[reportArgumentType]
