#!/usr/bin/env python3
"""Режет rat.jpg на 20 прозрачных кадров и собирает контактный лист."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/zombie art/rat.jpg')
OUT = ROOT / 'games/zombie-blood/assets/rats'
CANVAS = 512
PADDING = 16


def label_components(mask: np.ndarray, min_area: int) -> tuple[np.ndarray, list[tuple[int, int, int, int, int, int]]]:
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    labels = np.zeros((h, w), dtype=np.int32)
    comps: list[tuple[int, int, int, int, int, int]] = []
    label_id = 0
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            label_id += 1
            stack = [(y, x)]
            seen[y, x] = True
            area = 0
            minx = maxx = x
            miny = maxy = y
            while stack:
                cy, cx = stack.pop()
                labels[cy, cx] = label_id
                area += 1
                minx = min(minx, cx)
                maxx = max(maxx, cx)
                miny = min(miny, cy)
                maxy = max(maxy, cy)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if area >= min_area:
                comps.append((area, minx, miny, maxx, maxy, label_id))
    return labels, comps


def remove_background(im: Image.Image) -> Image.Image:
    rgb = im.convert('RGB')
    a = np.asarray(rgb).astype(np.int16)
    span = a.max(axis=2) - a.min(axis=2)
    value = a.max(axis=2)
    # Шахматка и тени — низкая насыщенность и средняя яркость.
    near = (span <= 16) & (value >= 35) & (value <= 195)
    _, comps = label_components(near, 500)
    remove = np.zeros_like(near)
    h, w = near.shape
    for _area, minx, miny, maxx, maxy, _label in comps:
        touches_edge = minx == 0 or miny == 0 or maxx == w - 1 or maxy == h - 1
        if touches_edge or _area > 1000:
            remove[miny:maxy + 1, minx:maxx + 1] |= near[miny:maxy + 1, minx:maxx + 1]
    rgba = im.convert('RGBA')
    alpha = np.where(remove, 0, 255).astype('uint8')
    rgba.putalpha(Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(0.4)))
    return rgba


def fit_canvas(img: Image.Image) -> Image.Image:
    img.thumbnail((CANVAS - PADDING * 2, CANVAS - PADDING * 2), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((CANVAS - img.width) // 2, CANVAS - PADDING - img.height))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC).convert('RGB')
    arr = np.asarray(im).astype(np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    # Оранжевая шерсть крысы; фон серый.
    fg = (r > g * 1.08 + 2) & (r > b * 1.25 + 4) & (r > 45)
    mask = Image.fromarray((fg * 255).astype('uint8'), 'L').filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(3))
    labels, comps = label_components(np.asarray(mask) > 0, 1000)
    if len(comps) != 20:
        raise SystemExit(f'ожидалось 20 крыс, найдено {len(comps)}')

    cleaned = remove_background(im)
    comps.sort(key=lambda c: (int(((c[2] + c[4]) / 2) // 512), c[1]))
    frames = []
    for index, (_area, minx, miny, maxx, maxy, label_id) in enumerate(comps, 1):
        pad = 12
        box = (max(0, minx - pad), max(0, miny - pad), min(im.width, maxx + pad + 1), min(im.height, maxy + pad + 1))
        crop = cleaned.crop(box)
        # В перекрывающийся bbox может попасть хвост соседней крысы — оставляем
        # только пиксели своей компоненты и её белые глаза/зубы.
        alpha = np.asarray(crop.getchannel('A')).copy()
        sub_labels = labels[box[1]:box[3], box[0]:box[2]]
        alpha[(sub_labels != 0) & (sub_labels != label_id)] = 0
        crop.putalpha(Image.fromarray(alpha, 'L'))
        cut = fit_canvas(crop)
        name = f'rat-{index:02d}.png'
        cut.save(OUT / name, 'PNG', optimize=True)
        row = min(4, max(1, int(((miny + maxy) / 2) // 512) + 1))
        col = min(5, max(1, int(((minx + maxx) / 2) // 409.6) + 1))
        frames.append({'id': f'rat-{index:02d}', 'file': f'assets/rats/{name}', 'row': row, 'col': col})

    (OUT / 'rats.json').write_text(
        json.dumps({'source': 'pic_v2/zombie art/rat.jpg', 'grid': {'rows': 4, 'cols': 5}, 'canvas': [CANVAS, CANVAS], 'frames': frames}, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )

    sheet = Image.new('RGB', (5 * 240, 4 * 260), (18, 12, 5))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 16)
    except OSError:
        font = ImageFont.load_default()
    for index in range(20):
        img = Image.open(OUT / f'rat-{index + 1:02d}.png').convert('RGBA')
        img.thumbnail((210, 210), Image.Resampling.LANCZOS)
        x = (index % 5) * 240 + 15
        y = (index // 5) * 260 + 10
        sheet.paste(img, (x + (210 - img.width) // 2, y + 210 - img.height), img)
        draw.text((x + 4, y + 215), f'{index + 1:02d}', fill=(255, 190, 70), font=font)
    sheet.save(OUT / 'rats-contact-sheet.png', 'PNG', optimize=True)
    print('rats', len(frames))


if __name__ == '__main__':
    main()
