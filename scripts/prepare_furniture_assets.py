#!/usr/bin/env python3
"""Нарезает мебель из pic_v2/furniture в отдельные PNG с прозрачным фоном.

Сетка исходников: 4 колонки × 5 строк. Ассеты складываются в MVP/furniture/,
не привязываясь к конкретной книге.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/furniture')
OUT = ROOT / 'furniture'
ROWS, COLS = 5, 4

NAMES = {
    'bag': [
        'bag-leather-closed', 'bag-leather-open-loot', 'bag-leather-open-empty', 'bag-leather-supplies',
        'backpack-tactical-closed', 'backpack-tactical-tools', 'backpack-tactical-empty', 'backpack-tactical-supplies',
        'bag-canvas-closed', 'bag-canvas-tools', 'bag-canvas-empty', 'bag-canvas-supplies',
        'case-tech-closed', 'case-tech-open-loot', 'case-tech-open-empty', 'case-tech-supplies',
        'bag-worn-closed', 'bag-worn-coins', 'bag-worn-empty', 'bag-worn-loot',
    ],
    'chest': [
        'chest-wood-closed', 'chest-wood-loot', 'chest-wood-open', 'chest-wood-chained',
        'chest-simple-closed', 'chest-simple-loot', 'chest-simple-open', 'chest-code-lock',
        'chest-metal-closed', 'chest-metal-loot', 'chest-metal-open', 'chest-metal-chained',
        'chest-tech-closed', 'chest-tech-loot', 'chest-tech-open', 'chest-tech-device',
        'chest-ornate-closed', 'chest-ornate-fire', 'chest-ornate-open', 'chest-ornate-locked',
    ],
    'closet': [
        'closet-wood-closed', 'closet-wood-open-empty', 'closet-wood-carved', 'closet-wood-supplies',
        'closet-metal-closed', 'closet-metal-open-empty', 'closet-metal-handles', 'closet-metal-medical',
        'closet-rust-closed', 'closet-rust-open-empty', 'closet-rust-damaged', 'closet-rust-loot',
        'closet-tech-closed', 'closet-tech-open-lit', 'closet-tech-panels', 'closet-tech-supplies',
        'closet-bandit-closed', 'closet-bandit-open-empty', 'closet-bandit-locked', 'closet-bandit-loot',
    ],
    'crate': [
        'crate-wood-closed', 'crate-wood-loot', 'crate-wood-open', 'crate-wood-broken',
        'crate-orange-closed', 'crate-orange-tools', 'crate-orange-open', 'crate-orange-damaged',
        'crate-metal-closed', 'crate-metal-wire', 'crate-metal-open', 'crate-metal-broken',
        'crate-tech-closed', 'crate-tech-loot', 'crate-tech-open', 'crate-tech-damaged',
        'crate-worn-closed', 'crate-worn-loot', 'crate-worn-empty', 'crate-worn-broken',
    ],
}
FOLDERS = {'bag': 'bags', 'chest': 'chests', 'closet': 'closets', 'crate': 'crates'}
# Границы взяты по белым промежуткам между рядами/колонками, а не делением на равные
# части: иначе нижняя кромка верхнего предмета попадает в следующий кадр.
BOUNDS = {
    'bag': ([0, 416, 830, 1220, 1610, 2048], [0, 520, 1022, 1520, 2048]),
    'chest': ([0, 420, 785, 1180, 1580, 2048], [0, 520, 1015, 1500, 2048]),
    'closet': ([0, 430, 830, 1230, 1620, 2048], [0, 520, 1030, 1490, 2048]),
    'crate': ([0, 440, 820, 1200, 1590, 2048], [0, 520, 1010, 1510, 2048]),
}


def cut_background(cell: Image.Image) -> Image.Image:
    """Удаляет светло-серый фон, связанный с краями ячейки."""
    rgb = cell.convert('RGB')
    a = np.asarray(rgb).astype(np.int16)
    span = a.max(axis=2) - a.min(axis=2)
    mn = a.min(axis=2)
    # фон и мягкая тень: нейтральные светлые/серые пиксели
    candidate = (span <= 28) & (mn >= 110)
    mask = Image.fromarray((candidate * 255).astype('uint8'), 'L').copy()
    w, h = mask.size
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if mask.getpixel(seed) == 255:
            ImageDraw.floodfill(mask, seed, 128)
    remove = np.asarray(mask) == 128
    # Закрытые петли ручек и щели между straps: чистый белый фон,
    # не связанный с краем ячейки. Убираем и такие островки.
    pure_white = (mn >= 248) & (span <= 10)
    remove |= pure_white
    alpha = np.where(remove, 0, 255).astype('uint8')

    # Убираем светлую кромку, оставшуюся от белого фона, в 1–2 пикселях
    # от прозрачности. Иначе на тёмной сцене вокруг мебели виден белый контур.
    for _ in range(4):
        transparent = alpha == 0
        near_transparent = transparent.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                near_transparent |= np.roll(transparent, (dy, dx), (0, 1))
        edge = near_transparent & (alpha > 0)
        fringe = edge & ((mn > 170) | ((span < 35) & (a.max(axis=2) > 150)))
        alpha[fringe] = 0

    # Лёгкая эрозия силуэта убирает оставшуюся белую кромку.
    solid = alpha > 0
    for _ in range(2):
        keep = solid.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                keep &= np.roll(solid, (dy, dx), (0, 1))
        solid = keep
    alpha = np.where(solid, 255, 0).astype('uint8')

    out = cell.convert('RGBA')
    out.putalpha(Image.fromarray(alpha, 'L'))
    box = out.getbbox()
    return out.crop(box) if box else out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {'source': str(SRC), 'grid': {'rows': ROWS, 'cols': COLS}, 'assets': []}
    for kind, names in NAMES.items():
        src = SRC / f'{kind}.png'
        sheet = Image.open(src).convert('RGB')
        rows, cols = BOUNDS[kind]
        folder = OUT / FOLDERS[kind]
        folder.mkdir(parents=True, exist_ok=True)
        if len(names) != ROWS * COLS:
            raise ValueError(f'{kind}: {len(names)} names for {ROWS * COLS} cells')
        for index, name in enumerate(names):
            row, col = divmod(index, COLS)
            x0, x1 = cols[col], cols[col + 1]
            y0, y1 = rows[row], rows[row + 1]
            cell = sheet.crop((x0, y0, x1, y1))
            asset = cut_background(cell)
            target = folder / f'{name}.png'
            asset.save(target, 'PNG', optimize=True)
            manifest['assets'].append({
                'type': kind,
                'name': name,
                'file': str(target.relative_to(OUT)),
                'source': f'{kind}.png',
                'row': row + 1,
                'col': col + 1,
                'width': asset.width,
                'height': asset.height,
            })
            print(f'{target.relative_to(ROOT)}  {asset.width}x{asset.height}')
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # Контактные листы для быстрой проверки на тёмном фоне.
    for kind in NAMES:
        assets = [a for a in manifest['assets'] if a['type'] == kind]
        cell_w, cell_h = 220, 220
        sheet_out = Image.new('RGB', (COLS * cell_w, ROWS * cell_h), (20, 14, 8))
        draw = ImageDraw.Draw(sheet_out)
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 10)
        except OSError:
            font = ImageFont.load_default()
        for i, item in enumerate(assets):
            im = Image.open(OUT / item['file']).convert('RGBA')
            im.thumbnail((cell_w - 16, cell_h - 32), Image.Resampling.LANCZOS)
            x = (i % COLS) * cell_w
            y = (i // COLS) * cell_h
            sheet_out.paste(im, (x + (cell_w - im.width) // 2, y + 18 + (cell_h - 32 - im.height) // 2), im)
            draw.text((x + 6, y + 4), item['name'], fill=(255, 190, 70), font=font)
        sheet_out.save(OUT / f'_contact-{kind}.png', 'PNG', optimize=True)


if __name__ == '__main__':
    main()
