"""Render the app icon (spec 4.1) with Pillow: rounded square #2C2C2E → #000, orange alarm clock.

Writes resources/icon/alarm-<size>.png, alarm.png and (on macOS) alarm.icns, plus alarm.ico.
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "resources" / "icon"


def gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom, strict=True)))
    return img


def icon(size: int) -> Image.Image:
    s = size * 4  # supersample
    bg = gradient(s, (0x2C, 0x2C, 0x2E), (0, 0, 0))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    # the alarm clock (24-unit grid of the line icon), orange gradient
    k = s / 24 * 0.62
    ox = oy = s * 0.19 - 0.5 * k
    lines = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(lines)
    w = max(1, int(1.8 * k))

    def p(x: float, y: float) -> tuple[float, float]:
        return (ox + x * k, oy + y * k)

    cx, cy = p(12, 13)
    r = 7.5 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=w)
    for seg in [[(12, 9), (12, 13.2), (14.6, 14.8)], [(4.5, 4.8), (7, 2.8)], [(19.5, 4.8), (17, 2.8)],
                [(7, 20.2), (5.6, 21.8)], [(17, 20.2), (18.4, 21.8)]]:  # fmt: skip
        d.line([p(*q) for q in seg], fill=255, width=w, joint="curve")
        for q in (seg[0], seg[-1]):
            x, y = p(*q)
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    orange = gradient(s, (0xFF, 0xB3, 0x40), (0xFF, 0x8A, 0x00)).convert("RGBA")
    out.paste(orange, (0, 0), lines)
    return out.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = [16, 32, 64, 128, 256, 512, 1024]
    for n in sizes:
        icon(n).save(OUT / f"alarm-{n}.png")
    icon(512).save(OUT / "alarm.png")
    icon(256).save(OUT / "alarm.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    if sys.platform == "darwin":
        iconset = OUT / "alarm.iconset"
        iconset.mkdir(exist_ok=True)
        for n in [16, 32, 128, 256, 512]:
            icon(n).save(iconset / f"icon_{n}x{n}.png")
            icon(n * 2).save(iconset / f"icon_{n}x{n}@2x.png")
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(OUT / "alarm.icns")], check=True)


if __name__ == "__main__":
    main()
