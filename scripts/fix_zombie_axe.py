#!/usr/bin/env python3
"""Пересобирает кадры зомби с топором из исходного листа.

Кадры сохраняются под именами, которые уже используются в бою:
static_1..4, attack_1..3, die_1..3.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from PIL.Image import Resampling

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/zombie art/zombie_axe.png')
OUT = ROOT / 'games/zombie-blood/assets/zombie-axe'
CANVAS = 512
BASELINE = 496
TARGET_HEIGHT = 447
COLS = [0, 512, 1024, 1536, 2048]
# Начала/концы рядов, чтобы не зацепить соседние кадры.
ROWS = [0, 467, 861, 1246, 1638, 2048]
# (row, col) в исходной сетке 4×5, индексы с нуля.
MAP = {
    'static': [(0, 0), (0, 1), (0, 2), (0, 3)],
    'attack': [(2, 0), (2, 2), (2, 3)],
    'die': [(3, 1), (3, 2), (3, 3)],
}

sys.path.insert(0, str(ROOT / 'scripts'))
from prepare_zombie_art import clean_frame, defringe  # noqa: E402
from split_zombies import remove_white  # noqa: E402


def prepare(cell: Image.Image) -> Image.Image:
    img = clean_frame(defringe(remove_white(cell)))
    # Светлая обводка исходного фона: убираем только по контуру силуэта,
    # чтобы не стереть белые глаза/зубы внутри фигуры.
    arr = np.asarray(img).copy()
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3].astype(np.int16)
    solid = alpha > 0
    edge = solid.copy()
    edge[1:, :] &= solid[:-1, :]
    edge[:-1, :] &= solid[1:, :]
    edge[:, 1:] &= solid[:, :-1]
    edge[:, :-1] &= solid[:, 1:]
    # edge сейчас — пиксели, у которых все соседи непрозрачны; для контура
    # инвертируем: нужен непрозрачный пиксель рядом с прозрачным.
    boundary = solid & ~edge
    pale = (rgb.min(axis=2) > 165) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 45)
    alpha[boundary & pale] = 0
    arr[:, :, 3] = alpha
    out = Image.fromarray(arr, 'RGBA')
    box = out.getbbox()
    return out.crop(box) if box else out


def anchor_x(img: Image.Image) -> int:
    """Центр корпуса, а не центр всего bounding box с топором."""
    alpha = np.asarray(img.getchannel('A'))
    box = img.getbbox()
    if not box:
        return CANVAS // 2
    left, top, right, bottom = box
    height = bottom - top
    band = alpha[top + int(height * 0.25):top + int(height * 0.65), left:right]
    xs = np.where(band > 0)[1]
    return int(np.median(xs)) + left if len(xs) else (left + right) // 2


def remove_detached(img: Image.Image) -> Image.Image:
    """Отрезает мелкие куски от соседних кадров/фона."""
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
        if area == largest:
            keep[np.array(ys), np.array(xs)] = True
            continue
        if bh <= 10 and bw > 24:
            continue
        if area < max(80, int(largest * 0.02)):
            continue
        keep[np.array(ys), np.array(xs)] = True
    out = img.copy()
    out.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype('uint8'), 'L'))
    box = out.getbbox()
    return out.crop(box) if box else out


def scale_around_baseline(canvas: Image.Image, scale: float) -> Image.Image:
    scaled = canvas.resize(
        (max(1, round(CANVAS * scale)), max(1, round(CANVAS * scale))),
        Resampling.LANCZOS,
    )
    out = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    out.alpha_composite(scaled, (round(CANVAS / 2 - CANVAS / 2 * scale), round(BASELINE - BASELINE * scale)))
    return out


def main() -> None:
    source = Image.open(SRC).convert('RGB')
    images: list[Image.Image] = []
    names: list[str] = []
    for state, cells in MAP.items():
        for number, (row, col) in enumerate(cells, 1):
            cell = source.crop((COLS[col], ROWS[row], COLS[col + 1], ROWS[row + 1]))
            cut = remove_detached(prepare(cell))
            images.append(cut)
            names.append(f'zombie-axe-{state}_{number}.png')

    # Общий масштаб на все кадры: масштаб не должен «прыгать» между позами.
    boxes = [im.getbbox() for im in images]
    max_w = max(b[2] - b[0] for b in boxes if b)
    max_h = max(b[3] - b[1] for b in boxes if b)
    scale = min(1.0, 440 / max_w, 440 / max_h)
    if scale < 1.0:
        images = [
            im.resize((round(im.width * scale), round(im.height * scale)), Resampling.LANCZOS)
            for im in images
        ]

    ref_box = images[0].getbbox()
    char_scale = TARGET_HEIGHT / max(1, ref_box[3] - ref_box[1]) if ref_box else 1.0
    finals: list[Image.Image] = []
    for name, cut in zip(names, images):
        box = cut.getbbox()
        if not box:
            continue
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        x = round(CANVAS / 2 - anchor_x(cut))
        # не даём топору/телу выйти за холст
        x = max(-box[0] + 12, min(x, CANVAS - 12 - box[2]))
        y = BASELINE - box[3]
        canvas.alpha_composite(cut, (x, y))
        # Remove the bright floor-shadow line under the feet.
        pixels = np.asarray(canvas).copy()
        rgb = pixels[:, :, :3].astype(np.int16)
        alpha = pixels[:, :, 3]
        bottom = slice(max(0, BASELINE - 20), CANVAS)
        pale = (alpha[bottom] > 0) & (rgb[bottom].min(axis=2) > 170)
        alpha[bottom][pale] = 0
        # die_2: обломок топора справа внизу; die_3: лежащий топор.
        if name == 'zombie-axe-die_2.png':
            alpha[400:, 430:] = 0
        elif name == 'zombie-axe-die_3.png':
            clip = Image.new('L', (CANVAS, CANVAS), 0)
            ImageDraw.Draw(clip).polygon(
                [(315, 462), (405, 442), (505, 442), (512, 480), (470, 512), (340, 512), (305, 490)],
                fill=255,
            )
            alpha[np.asarray(clip) > 0] = 0
            # остатки рукоятки/лезвия у правого края
            alpha[430:, 430:] = 0
        pixels[:, :, 3] = alpha
        canvas = Image.fromarray(pixels, 'RGBA')
        if name == 'zombie-axe-die_3.png':
            # после удаления топора тело должно снова лечь на общий baseline
            box = canvas.getbbox()
            if box and box[3] < BASELINE:
                shifted = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
                shifted.alpha_composite(canvas, (0, BASELINE - box[3]))
                canvas = shifted
        canvas = scale_around_baseline(canvas, char_scale)
        canvas.save(OUT / name, 'PNG', optimize=True)
        finals.append(canvas)
        print(name, canvas.getbbox())

    animations = {
        'passive': [f'zombie-axe-static_{i}.png' for i in range(1, 5)],
        'attack': [f'zombie-axe-attack_{i}.png' for i in range(1, 4)],
        'death': [f'zombie-axe-die_{i}.png' for i in range(1, 4)],
    }
    manifest = {
        'source': 'pic_v2/zombie art/zombie_axe.png',
        'grid': {'rows': 5, 'cols': 4},
        'canvas': [CANVAS, CANVAS],
        'frames': [
            {'id': name[:-4], 'file': f'assets/zombie-axe/{name}', **{k: v for k, v in zip(('state', 'number'), (state, number))}}
            for state, names_for_state in (
                ('static', animations['passive']),
                ('attack', animations['attack']),
                ('die', animations['death']),
            )
            for number, name in enumerate(names_for_state, 1)
        ],
        'animations': animations,
    }
    (OUT / 'zombie-axe.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # Контактный лист с подписями.
    sheet = Image.new('RGB', (5 * 220, 2 * 300), (18, 12, 5))
    draw = ImageDraw.Draw(sheet)
    for i, (name, cut) in enumerate(zip(names, finals)):
        x = (i % 5) * 220 + 10
        y = (i // 5) * 300 + 8
        thumb = cut.copy()
        thumb.thumbnail((200, 250), Resampling.LANCZOS)
        sheet.paste(thumb, (x + (200 - thumb.width) // 2, y + 250 - thumb.height), thumb)
        draw.text((x + 2, y + 262), name.replace('zombie-axe-', '').replace('.png', ''), fill=(255, 190, 70))
    sheet.save(OUT / 'zombie-axe-contact-sheet.png', 'PNG', optimize=True)


if __name__ == '__main__':
    main()
