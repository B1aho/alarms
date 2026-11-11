"""SoundPickerViewModel (spec 3.8): your music + built-in sounds, preview once on choose, import a file."""

import itertools
from collections.abc import Callable
from typing import Any

from PySide6.QtCore import Signal, Slot
from PySide6.QtWidgets import QFileDialog

from alarm.messages import system as sys_msg
from alarm.messages.audio import PreviewPlay, PreviewStop
from alarm.messages.sounds import ImportSound
from alarm.rules import strings
from alarm.rules.defaults import BUILTIN_SOUNDS, playable
from alarm.rules.models import SoundRef
from alarm.ui.bridge import UiBridge
from alarm.ui.viewmodels.base import ViewModel, ro

_tokens = itertools.count(1)

FILE_FILTER = "Audio files (*.mp3 *.m4a *.aac *.wav *.ogg *.oga *.opus *.flac *.webm)"


def preview(bridge: UiBridge, ref: SoundRef, volume: float, ramp_s: float, loop: bool) -> int:
    token = next(_tokens)
    p = playable(ref, bridge.sounds)
    file = None
    if p.kind == "custom":
        c = next(c for c in bridge.sounds if c.id == p.id)
        file = f"{sounds_dir(bridge)}/{c.id}.{c.ext}"
    builtin = p.id if p.kind == "builtin" else "sunrise"
    bridge.send(sys_msg.AUDIO, PreviewPlay(token, builtin, file, volume, ramp_s, loop))
    return token


def sounds_dir(bridge: UiBridge) -> str:
    return bridge.sounds_dir


class SoundPickerViewModel(ViewModel):
    changed = Signal()
    selected = ro(str, "selected", changed)
    customs = ro(list, "customs", changed)
    builtins = ro(list, "builtins", changed)
    busy = ro(bool, "busy", changed)
    footer = ro(str, "footer", changed)
    chosen = Signal(str, str)

    def __init__(
        self,
        bridge: UiBridge,
        context: str,
        volume: Callable[[], float],
        on_choose: Callable[[SoundRef], None],
    ) -> None:
        super().__init__(
            selected="",
            customs=[],
            builtins=[{"kind": "builtin", "id": i, "name": n} for i, n in BUILTIN_SOUNDS],
            busy=False,
            footer=strings.SOUNDS_FOOTER,
        )
        self.bridge = bridge
        self.context = context
        self.volume = volume
        self.on_choose = on_choose
        self.token: int | None = None
        bridge.soundsChanged.connect(self.refresh)
        bridge.soundImported.connect(self._imported)
        bridge.importFailed.connect(self._failed)
        self.refresh()

    def refresh(self) -> None:
        items: list[dict[str, Any]] = [{"kind": "custom", "id": c.id, "name": c.name} for c in self.bridge.sounds]
        self.put(customs=items)

    def set_value(self, ref: SoundRef) -> None:
        self.put(selected=f"{ref.kind}:{ref.id}")

    @Slot(str, str)
    def choose(self, kind: str, sound_id: str) -> None:
        ref = SoundRef(kind="custom" if kind == "custom" else "builtin", id=sound_id)
        self.set_value(ref)
        self.on_choose(ref)
        self.stopPreview()
        self.token = preview(self.bridge, ref, self.volume(), 0, loop=False)

    @Slot()
    def chooseFile(self) -> None:
        path, _ = QFileDialog.getOpenFileName(None, strings.CHOOSE_FILE.rstrip("…"), "", FILE_FILTER)
        if path:
            self.import_path(path)

    def import_path(self, path: str) -> None:
        self.put(busy=True, footer=strings.SOUNDS_FOOTER)
        self.bridge.send(sys_msg.SOUNDS, ImportSound(path, self.context))

    @Slot()
    def stopPreview(self) -> None:
        if self.token is not None:
            self.bridge.send(sys_msg.AUDIO, PreviewStop(self.token))
            self.token = None

    def _imported(self, context: str, kind: str, sound_id: str) -> None:
        if context != self.context:
            return
        self.put(busy=False)
        self.refresh()
        self.choose(kind, sound_id)

    def _failed(self, context: str, text: str) -> None:
        if context == self.context:
            self.put(busy=False, footer=text)
