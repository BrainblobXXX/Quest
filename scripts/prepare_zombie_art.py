#!/usr/bin/env python3
"""Нарезает новые листы zombie art на кадры для боевых сцен."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/zombie art')
OUT = ROOT / 'games/zombie-blood/assets'
sys.path.insert(0, str(ROOT / 'scripts'))
from split_zombies import remove_white  # noqa: E402

# Листы 4×5; границы рядов совпадают с видимыми промежутками между рисунками.
SHEETS = {
    'zombie-kong': {'source': 'zombie_kong.png', 'rows': [0, 471, 837, 1220, 1630, 2048]},
    'yurr': {'source': 'Zombie_Yourg.png', 'rows': [0, 438, 858, 1254, 1640, 2048]},
}
COLS = [0, 512, 1024, 1536, 2048]
CANVAS = 512


def defringe(img: Image.Image) -> Image.Image:
    """Убирает белую кайму от исходного фона."""
    alpha = img.getchannel('A').filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.35))
    out = img.copy()
    out.putalpha(alpha)
    return out


def clean_frame(img: Image.Image) -> Image.Image:
    """Убирает пылинки, обрывки соседних кадров и белую линию пола."""
    alpha = np.asarray(img.getchannel('A')).copy()
    mask = alpha > 0
    h, w = mask.shape
    seen = np.zeros_like(mask)
    comps: list[list[tuple[int, int]]] = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            pixels = []
            while stack:
                cy, cx = stack.pop()
                pixels.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            comps.append(pixels)
    if not comps:
        return img
    largest = max(len(c) for c in comps)
    keep = np.zeros_like(mask)
    for comp in comps:
        ys = [p[0] for p in comp]
        xs = [p[1] for p in comp]
        bh = max(ys) - min(ys) + 1
        bw = max(xs) - min(xs) + 1
        area = len(comp)
        # тонкие горизонтальные полосы — остатки фона/пола
        if bh <= 10 and bw > 24:
            continue
        # обрывок предыдущего ряда, прилипший к верхнему краю
        if min(ys) <= 1 and bh < 50 and bw > 50 and area < largest * 0.05:
            continue
        # совсем мелкая пыль
        if area < max(40, int(largest * 0.002)):
            continue
        for y, x in comp:
            keep[y, x] = True
    out = img.copy()
    out.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype('uint8'), 'L'))
    box = out.getbbox()
    return out.crop(box) if box else out


def fit_group(frames: list[Image.Image], baseline: int = 496) -> list[Image.Image]:
    """Один масштаб и общий низ для всех кадров одной анимации."""
    boxes = [im.getbbox() for im in frames]
    sizes = [(b[2] - b[0], b[3] - b[1]) for b in boxes if b]
    if not sizes:
        return frames
    target_width = min(430.0, float(sorted(w for w, _ in sizes)[len(sizes) // 2]))
    target_width = min(target_width, *( (baseline - 20) * w / max(1, h) for w, h in sizes ))
    out: list[Image.Image] = []
    for im in frames:
        box = im.getbbox()
        if not box:
            out.append(im)
            continue
        bw = box[2] - box[0]
        scale = target_width / max(1, bw)
        if abs(scale - 1) > 0.01:
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.Resampling.LANCZOS)
        box = im.getbbox()
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.alpha_composite(im, (round(CANVAS / 2 - (box[0] + box[2]) / 2), baseline - box[3]))
        out.append(canvas)
    return out


def process(key: str, info: dict) -> None:
    out = OUT / key
    out.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC / info['source']).convert('RGB')
    frames: list[dict] = []
    raw: list[Image.Image] = []
    rows = info['rows']
    for row in range(5):
        for col in range(4):
            cell = src.crop((COLS[col], rows[row], COLS[col + 1], rows[row + 1]))
            raw.append(clean_frame(defringe(remove_white(cell))))
    # passive 1–8, attack 9–12, death 13–16; 17–20 — запасные/переходные.
    images: list[Image.Image] = list(raw)
    for indices in (range(0, 8), range(8, 12), range(12, 16), range(16, 20)):
        group = fit_group([raw[i] for i in indices])
        for i, im in zip(indices, group):
            images[i] = im
    for index, cut in enumerate(images, 1):
        # У Kong в смерти сверху остаётся обрывок пыли из предыдущего ряда.
        if key == 'zombie-kong' and 13 <= index <= 16:
            alpha = cut.getchannel('A')
            alpha.paste(0, (0, 0, cut.width, 30))
            cut.putalpha(alpha)
        name = f'{key}-{index:02d}.png'
        cut.save(out / name, 'PNG', optimize=True)
        frames.append({
            'id': f'{key}-{index:02d}',
            'file': f'assets/{key}/{name}',
            'row': (index - 1) // 4 + 1,
            'col': (index - 1) % 4 + 1,
        })
    animations = {
        'passive': [f'{key}-{i:02d}.png' for i in range(1, 9)],
        'attack': [f'{key}-{i:02d}.png' for i in range(9, 13)],
        'death': [f'{key}-{i:02d}.png' for i in range(13, 17)],
        'extra': [f'{key}-{i:02d}.png' for i in range(17, 21)],
    }
    (out / f'{key}.json').write_text(
        json.dumps({
            'source': f'pic_v2/zombie art/{info["source"]}',
            'grid': {'rows': 5, 'cols': 4},
            'canvas': [CANVAS, CANVAS],
            'frames': frames,
            'animations': animations,
        }, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    # контактный лист для проверки альфы и кадрирования
    sheet = Image.new('RGB', (4 * 260, 5 * 280), (18, 12, 5))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 15)
    except OSError:
        font = ImageFont.load_default()
    for i, im in enumerate(images):
        x = (i % 4) * 260 + 12
        y = (i // 4) * 280 + 8
        thumb = im.copy()
        thumb.thumbnail((230, 230), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x + (230 - thumb.width) // 2, y + 230 - thumb.height), thumb)
        draw.text((x + 4, y + 240), f'{i + 1:02d}', fill=(255, 190, 70), font=font)
    sheet.save(out / f'{key}-contact-sheet.png', 'PNG', optimize=True)
    print(f'{key}: {len(frames)} frames')


def main() -> None:
    for key, info in SHEETS.items():
        process(key, info)


if __name__ == '__main__':
    main()
