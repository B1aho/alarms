"""Pixel comparison with docs/screens (TZ 8): share of differing pixels outside live-clock zones."""

from pathlib import Path

import numpy as np
from PIL import Image

SCREENS = Path(__file__).resolve().parents[3] / "docs" / "screens"
CHANNEL_TOLERANCE = 48  # anti-aliasing and font hinting noise


def qimage_to_pil(img) -> Image.Image:  # type: ignore[no-untyped-def]
    from PySide6.QtCore import QBuffer, QIODevice

    buf = QBuffer()
    buf.open(QIODevice.OpenModeFlag.WriteOnly)
    img.save(buf, "PNG")
    import io

    return Image.open(io.BytesIO(bytes(buf.data().data()))).convert("RGB")


def diff_ratio(ours: Image.Image, ref: Image.Image, live: list[tuple[int, int, int, int]]) -> float:
    """Fraction of pixels whose max channel difference exceeds the tolerance (2× scale, overlap only)."""
    w = min(ours.width, ref.width)
    h = min(ours.height, ref.height)
    a = np.asarray(ours.crop((0, 0, w, h)), dtype=np.int16)
    b = np.asarray(ref.convert("RGB").crop((0, 0, w, h)), dtype=np.int16)
    mask = np.ones((h, w), dtype=bool)
    for x, y, ww, hh in live:
        mask[y * 2 : (y + hh) * 2, x * 2 : (x + ww) * 2] = False
    bad = (np.abs(a - b).max(axis=2) > CHANNEL_TOLERANCE) & mask
    return float(bad.sum() / mask.sum())
