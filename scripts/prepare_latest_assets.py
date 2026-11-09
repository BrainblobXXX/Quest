#!/usr/bin/env python3
"""Обновляет axe и добавляет grenade."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/weapons')
WEAPONS = ROOT / 'games/zombie-blood/assets/weapons'
ITEMS = ROOT / 'games/zombie-blood/assets/items'


def remove_white(im: Image.Image, threshold: int = 245) -> Image.Image:
    rgb = im.convert('RGB')
    a = np.asarray(rgb).astype(np.int16)
    span = a.max(axis=2) - a.min(axis=2)
    value = a.max(axis=2)
    near = (span <= 15) & (value >= threshold)
    matte = Image.fromarray((near * 255).astype('uint8'), 'L').copy()
    w, h = matte.size
    for x in range(w):
        for y in (0, h - 1):
            if matte.getpixel((x, y)) == 255:
                ImageDraw.floodfill(matte, (x, y), 128, thresh=0)
    for y in range(h):
        for x in (0, w - 1):
            if matte.getpixel((x, y)) == 255:
                ImageDraw.floodfill(matte, (x, y), 128, thresh=0)
    alpha = np.where(np.asarray(matte) == 128, 0, 255).astype('uint8')
    rgba = im.convert('RGBA')
    rgba.putalpha(Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(0.35)))
    box = rgba.getbbox()
    return rgba.crop(box) if box else rgba


def remove_checker(im: Image.Image) -> Image.Image:
    rgb = im.convert('RGB')
    a = np.asarray(rgb).astype(np.int16)
    span = a.max(axis=2) - a.min(axis=2)
    value = a.max(axis=2)
    # Шахматка: светло-серые квадраты; объект цветной/тёмный.
    near = (span <= 16) & (value >= 70)
    matte = Image.fromarray((near * 255).astype('uint8'), 'L').copy()
    w, h = matte.size
    seen = np.zeros((h, w), dtype=bool)
    remove = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in range(w):
            if matte.getpixel((x, y)) != 255 or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            comp = []
            edge = False
            while stack:
                cy, cx = stack.pop()
                comp.append((cy, cx))
                if cy == 0 or cx == 0 or cy == h - 1 or cx == w - 1:
                    edge = True
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and matte.getpixel((nx, ny)) == 255 and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if edge or len(comp) > 800:
                for cy, cx in comp:
                    remove[cy, cx] = True
    alpha = np.where(remove, 0, 255).astype('uint8')
    rgba = im.convert('RGBA')
    rgba.putalpha(Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(0.35)))
    box = rgba.getbbox()
    return rgba.crop(box) if box else rgba


def save(img: Image.Image, path: Path) -> None:
    if max(img.size) > 512:
        img.thumbnail((512, 512), Image.Resampling.LANCZOS)
    img.save(path, 'PNG', optimize=True)
    print(path.name, img.size)


def main() -> None:
    new_axe = Image.open(SRC / 'axe.png').convert('RGB')
    save(remove_checker(new_axe), WEAPONS / 'axe.png')
    save(remove_white(Image.open(SRC / 'granades.png').convert('RGBA')), ITEMS / 'grenade.png')

    ip = ITEMS / 'items.json'
    data = json.loads(ip.read_text())
    data.setdefault('items', {})['grenade'] = 'assets/items/grenade.png'
    ip.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
