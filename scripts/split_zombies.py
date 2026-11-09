#!/usr/bin/env python3
"""Разрезает лист zombies на отдельные прозрачные PNG для боевых сцен."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "games/zombie-blood/1.png"
OUT = ROOT / "games/zombie-blood/assets/zombies"
CANVAS = 512
PADDING = 16
MARGIN = 8


def bands(mask: np.ndarray, axis: int, min_gap: int = 5) -> list[tuple[int, int]]:
    projection = mask.sum(axis=axis)
    on = projection > 1
    spans: list[tuple[int, int]] = []
    start: int | None = None
    for i, value in enumerate(on):
        if value and start is None:
            start = i
        elif not value and start is not None:
            spans.append((start, i - 1))
            start = None
    if start is not None:
        spans.append((start, len(on) - 1))
    merged: list[tuple[int, int]] = []
    for start, end in spans:
        if merged and start - merged[-1][1] - 1 < min_gap:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))
    return merged


def remove_white(cell: Image.Image) -> Image.Image:
    rgba = cell.convert("RGBA")
    rgb = np.asarray(cell.convert("RGB")).astype(np.int16)
    # мягкая маска фона: почти белые пиксели
    near_white = ((255 - rgb).max(axis=2) <= 20).astype(np.uint8) * 255
    matte = Image.fromarray(near_white, "L").copy()
    # заливаем только белый фон, связанный с краями; глаза/блики внутри фигуры остаются
    for seed in ((0, 0), (matte.width - 1, 0), (0, matte.height - 1), (matte.width - 1, matte.height - 1)):
        if matte.getpixel(seed) == 255:
            ImageDraw.floodfill(matte, seed, 128, thresh=0)
    alpha = np.asarray(matte, dtype=np.uint8).copy()
    # 128 — внешний белый фон, 255 — внутренние белые пятна.
    # Крупные пятна — это просветы в одежде; убираем их. Мелкие (глаза, зубы) оставляем.
    internal = alpha == 255
    h, w = internal.shape
    seen = np.zeros_like(internal, dtype=bool)
    for y in range(h):
        for x in range(w):
            if not internal[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            component: list[tuple[int, int]] = []
            while stack:
                cy, cx = stack.pop()
                component.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and internal[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(component) > 80:
                for cy, cx in component:
                    alpha[cy, cx] = 128
    alpha = np.where(alpha == 128, 0, 255).astype(np.uint8)
    rgba.putalpha(Image.fromarray(alpha, "L"))
    # лёгкое сглаживание края, чтобы не было белой каймы
    a = rgba.getchannel("A").filter(ImageFilter.GaussianBlur(0.55))
    rgba.putalpha(a)
    bbox = rgba.getbbox()
    if bbox is None:
        return rgba
    x0, y0, x1, y1 = bbox
    return rgba.crop((max(0, x0 - MARGIN), max(0, y0 - MARGIN), x1 + MARGIN, y1 + MARGIN))


def fit_on_canvas(img: Image.Image) -> Image.Image:
    img.thumbnail((CANVAS - PADDING * 2, CANVAS - PADDING * 2), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - img.width) // 2
    y = CANVAS - PADDING - img.height
    canvas.alpha_composite(img, (x, y))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SOURCE).convert("RGB")
    pixels = np.asarray(src).astype(np.int16)
    mask = (255 - pixels).max(axis=2) > 10
    col_bands = bands(mask, axis=0)
    row_bands = bands(mask, axis=1)
    assert len(col_bands) == 5, f"ожидалось 5 колонок, получено {len(col_bands)}: {col_bands}"
    assert len(row_bands) == 4, f"ожидалось 4 ряда, получено {len(row_bands)}: {row_bands}"

    images: list[Image.Image] = []
    manifest = []
    index = 0
    for row, (y0, y1) in enumerate(row_bands):
        for col, (x0, x1) in enumerate(col_bands):
            index += 1
            pad = 10
            cell = src.crop((max(0, x0 - pad), max(0, y0 - pad), min(src.width, x1 + pad), min(src.height, y1 + pad)))
            cut = fit_on_canvas(remove_white(cell))
            name = f"zombie-{index:02d}.png"
            cut.save(OUT / name, "PNG", optimize=True)
            images.append(cut)
            manifest.append({
                "id": f"zombie-{index:02d}",
                "file": f"assets/zombies/{name}",
                "source_cell": {"row": row + 1, "col": col + 1, "x": [x0, x1], "y": [y0, y1]},
                "size": [CANVAS, CANVAS],
            })

    (OUT / "zombies.json").write_text(
        json.dumps({"source": "1.png", "count": index, "canvas": [CANVAS, CANVAS], "items": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # контактный лист на тёмном фоне — проверка альфы и масштаба
    sheet = Image.new("RGB", (5 * 300, 4 * 320), (18, 12, 5))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for i, img in enumerate(images):
        x = (i % 5) * 300 + 20
        y = (i // 5) * 320 + 10
        thumb = img.copy()
        thumb.thumbnail((260, 260), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x + (260 - thumb.width) // 2, y + 260 - thumb.height), thumb)
        draw.text((x + 5, y + 285), f"{i + 1:02d}", fill=(255, 190, 70), font=font)
    sheet.save(OUT / "zombies-contact-sheet.png", "PNG", optimize=True)
    print(f"готово: {index} файлов -> {OUT}")


if __name__ == "__main__":
    main()
