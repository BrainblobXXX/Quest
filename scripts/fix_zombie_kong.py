#!/usr/bin/env python3
"""Пересобирает кадры Конга под новые имена и выравнивает их."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from PIL.Image import Resampling

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/zombie art/zombie_kong.png')
OUT = ROOT / 'games/zombie-blood/assets/zombie-kong'
CANVAS = 512
BASELINE = 496
COLS = [0, 512, 1024, 1536, 2048]
ROWS = [0, 471, 837, 1220, 1630, 2048]
# Новые имена → клетки исходного листа (row, col), 0-based.
MAP = {
    'static': [(0, 0), (0, 1), (0, 2), (0, 3)],
    'attack': [(1, 0), (1, 1), (2, 0), (2, 1), (2, 2), (2, 3)],
    'die': [(3, 0), (3, 2), (3, 3)],
}

sys.path.insert(0, str(ROOT / 'scripts'))
from fix_zombie_axe import anchor_x, prepare, remove_detached, scale_around_baseline  # noqa: E402


def main_component(img: Image.Image) -> Image.Image:
    """Оставляет только тело Конга, убирая пыль, пол и обрывки соседних кадров."""
    alpha = np.asarray(img.getchannel('A')).copy()
    mask = alpha > 0
    h, w = mask.shape
    seen = np.zeros_like(mask)
    best: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            comp = []
            while stack:
                cy, cx = stack.pop()
                comp.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(comp) > len(best):
                best = comp
    keep = np.zeros_like(mask)
    for y, x in best:
        keep[y, x] = True
    out = img.copy()
    out.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype('uint8'), 'L'))
    box = out.getbbox()
    return out.crop(box) if box else out


def main() -> None:
    source = Image.open(SRC).convert('RGB')
    items: list[tuple[str, Image.Image]] = []
    for state, cells in MAP.items():
        for number, (row, col) in enumerate(cells, 1):
            cell = source.crop((COLS[col], ROWS[row], COLS[col + 1], ROWS[row + 1]))
            items.append((f'zombie-kong--{state}_{number}', main_component(remove_detached(prepare(cell)))))

    ref = items[0][1].getbbox()
    scale = 420 / max(1, ref[3] - ref[1])
    finals: list[tuple[str, Image.Image]] = []
    for name, cut in items:
        box = cut.getbbox()
        if not box:
            continue
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        x = round(CANVAS / 2 - anchor_x(cut))
        x = max(-box[0] + 12, min(x, CANVAS - 12 - box[2]))
        y = BASELINE - box[3]
        canvas.alpha_composite(cut, (x, y))
        canvas = scale_around_baseline(canvas, scale)

        # Пол и случайные обрывки фона у нижней кромки.
        pixels = np.asarray(canvas).copy()
        rgb = pixels[:, :, :3].astype(np.int16)
        alpha = pixels[:, :, 3]
        bottom = slice(BASELINE - 26, CANVAS)
        pale = (alpha[bottom] > 0) & (rgb[bottom].min(axis=2) > 130)
        alpha[bottom][pale] = 0
        # Серая линия пола и цветные пиксели-артефакты (зелёные/бирюзовые).
        sub = rgb[bottom]
        neutral = (sub.max(axis=2) - sub.min(axis=2) <= 18) & (sub.max(axis=2) > 80)
        alpha[bottom][neutral] = 0
        r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
        chroma = ((g > 120) & (g > r + 45) & (g > b + 45)) | ((b > 120) & (g > 120) & (r < 90))
        alpha[chroma] = 0
        # самая нижняя кромка: линия пола под лапами
        alpha[490:, :] = 0
        if name == 'zombie-kong--die_3':
            alpha[:30, :] = 0  # обрывок предыдущего ряда сверху
        pixels[:, :, 3] = alpha
        canvas = Image.fromarray(pixels, 'RGBA')
        canvas.save(OUT / f'{name}.png', 'PNG', optimize=True)
        finals.append((name, canvas))

    animations = {
        'passive': [f'zombie-kong--static_{i}.png' for i in range(1, 5)],
        'attack': [f'zombie-kong--attack_{i}.png' for i in range(1, 7)],
        'death': [f'zombie-kong--die_{i}.png' for i in range(1, 4)],
    }
    (OUT / 'zombie-kong.json').write_text(json.dumps({
        'source': 'pic_v2/zombie art/zombie_kong.png',
        'grid': {'rows': 5, 'cols': 4},
        'canvas': [CANVAS, CANVAS],
        'frames': [{'id': n, 'file': f'assets/zombie-kong/{n}.png'} for n, _ in finals],
        'animations': animations,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    sheet = Image.new('RGB', (7 * 250, 2 * 300), (18, 12, 5))
    draw = ImageDraw.Draw(sheet)
    for i, (name, cut) in enumerate(finals):
        x = (i % 7) * 250 + 10
        y = (i // 7) * 300 + 8
        thumb = cut.copy()
        thumb.thumbnail((230, 250), Resampling.LANCZOS)
        sheet.paste(thumb, (x + (230 - thumb.width) // 2, y + 250 - thumb.height), thumb)
        draw.text((x + 2, y + 260), name.replace('zombie-kong--', ''), fill=(255, 190, 70))
    sheet.save(OUT / 'zombie-kong-contact-sheet.png', 'PNG', optimize=True)


if __name__ == '__main__':
    main()
