#!/usr/bin/env python3
"""Пересобирает кадры Юрра под новые имена и выравнивает их."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from PIL.Image import Resampling

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/zombie art/Zombie_Yourg.png')
OUT = ROOT / 'games/zombie-blood/assets/yurr'
CANVAS = 512
BASELINE = 496
COLS = [0, 512, 1024, 1536, 2048]
ROWS = [0, 438, 858, 1254, 1640, 2048]
MAP = {
    'static': [(0, 0), (0, 1), (0, 2), (0, 3)],
    'attack': [(2, 0), (2, 2), (2, 3)],
    'die': [(3, 1), (3, 2), (3, 3)],
}

sys.path.insert(0, str(ROOT / 'scripts'))
from fix_zombie_axe import anchor_x, prepare, remove_detached  # noqa: E402
from fix_zombie_kong import main_component  # noqa: E402


def main() -> None:
    source = Image.open(SRC).convert('RGB')
    finals: list[tuple[str, Image.Image]] = []
    for state, cells in MAP.items():
        for number, (row, col) in enumerate(cells, 1):
            cell = source.crop((COLS[col], ROWS[row], COLS[col + 1], ROWS[row + 1]))
            cut = remove_detached(prepare(cell))
            if state == 'die':
                cut = main_component(cut)
            box = cut.getbbox()
            if not box:
                continue
            canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
            x = round(CANVAS / 2 - anchor_x(cut))
            x = max(-box[0] + 12, min(x, CANVAS - 12 - box[2]))
            y = BASELINE - box[3]
            canvas.alpha_composite(cut, (x, y))

            pixels = np.asarray(canvas).copy()
            rgb = pixels[:, :, :3].astype(np.int16)
            alpha = pixels[:, :, 3]
            bottom = slice(BASELINE - 26, CANVAS)
            pale = (alpha[bottom] > 0) & (rgb[bottom].min(axis=2) > 150)
            alpha[bottom][pale] = 0
            # серые/цветные артефакты по нижней кромке
            sub = rgb[bottom]
            neutral = (sub.max(axis=2) - sub.min(axis=2) <= 18) & (sub.max(axis=2) > 90)
            alpha[bottom][neutral] = 0
            alpha[490:, :] = 0
            if state == 'die':
                floor = slice(450, CANVAS)
                bright = rgb[floor].min(axis=2) > 105
                alpha[floor][bright] = 0
            if state == 'die' and number == 3:
                alpha[:30, :] = 0
            pixels[:, :, 3] = alpha
            canvas = Image.fromarray(pixels, 'RGBA')
            name = f'yurr-{state}_{number}'
            canvas.save(OUT / f'{name}.png', 'PNG', optimize=True)
            finals.append((name, canvas))

    animations = {
        'passive': [f'yurr-static_{i}.png' for i in range(1, 5)],
        'attack': [f'yurr-attack_{i}.png' for i in range(1, 4)],
        'death': [f'yurr-die_{i}.png' for i in range(1, 4)],
    }
    (OUT / 'yurr.json').write_text(json.dumps({
        'source': 'pic_v2/zombie art/Zombie_Yourg.png',
        'grid': {'rows': 5, 'cols': 4},
        'canvas': [CANVAS, CANVAS],
        'frames': [{'id': n, 'file': f'assets/yurr/{n}.png'} for n, _ in finals],
        'animations': animations,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    sheet = Image.new('RGB', (5 * 250, 2 * 300), (18, 12, 5))
    draw = ImageDraw.Draw(sheet)
    for i, (name, cut) in enumerate(finals):
        x = (i % 5) * 250 + 10
        y = (i // 5) * 300 + 8
        thumb = cut.copy()
        thumb.thumbnail((230, 250), Resampling.LANCZOS)
        sheet.paste(thumb, (x + (230 - thumb.width) // 2, y + 250 - thumb.height), thumb)
        draw.text((x + 2, y + 260), name, fill=(255, 190, 70))
    sheet.save(OUT / 'yurr-contact-sheet.png', 'PNG', optimize=True)


if __name__ == '__main__':
    main()
