"""A list model of dicts keyed by `id`: updates rows in place so QML delegates (and their animations) survive."""

from typing import Any

from PySide6.QtCore import QAbstractListModel, QByteArray, QModelIndex, QPersistentModelIndex, Qt, Signal

Index = QModelIndex | QPersistentModelIndex


class DictListModel(QAbstractListModel):
    countChanged = Signal()

    def __init__(self, roles: list[str], parent: Any = None) -> None:
        super().__init__(parent)
        self._roles = roles
        self._items: list[dict[str, Any]] = []

    def roleNames(self) -> dict[int, QByteArray]:
        return {Qt.ItemDataRole.UserRole + i: QByteArray(r.encode()) for i, r in enumerate(self._roles)}

    def rowCount(self, parent: Index | None = None) -> int:
        return 0 if parent is not None and parent.isValid() else len(self._items)

    def data(self, index: Index, role: int = Qt.ItemDataRole.DisplayRole) -> Any:
        if not index.isValid() or not 0 <= index.row() < len(self._items):
            return None
        i = role - Qt.ItemDataRole.UserRole
        if 0 <= i < len(self._roles):
            return self._items[index.row()].get(self._roles[i])
        return None

    @property
    def items(self) -> list[dict[str, Any]]:
        return self._items

    def set_items(self, items: list[dict[str, Any]]) -> None:
        old_ids = [x["id"] for x in self._items]
        new_ids = [x["id"] for x in items]
        if old_ids == new_ids:
            for row, (a, b) in enumerate(zip(self._items, items, strict=True)):
                if a != b:
                    self._items[row] = b
                    idx = self.index(row)
                    self.dataChanged.emit(idx, idx)
            return
        # Remove rows that are gone, then insert/move to match the new order.
        for row in range(len(self._items) - 1, -1, -1):
            if self._items[row]["id"] not in new_ids:
                self.beginRemoveRows(QModelIndex(), row, row)
                del self._items[row]
                self.endRemoveRows()
        for row, item in enumerate(items):
            ids = [x["id"] for x in self._items]
            if item["id"] in ids:
                cur = ids.index(item["id"])
                if cur != row:
                    self.beginMoveRows(QModelIndex(), cur, cur, QModelIndex(), row if row < cur else row + 1)
                    self._items.insert(row, self._items.pop(cur))
                    self.endMoveRows()
                if self._items[row] != item:
                    self._items[row] = item
                    idx = self.index(row)
                    self.dataChanged.emit(idx, idx)
            else:
                self.beginInsertRows(QModelIndex(), row, row)
                self._items.insert(row, item)
                self.endInsertRows()
        self.countChanged.emit()
