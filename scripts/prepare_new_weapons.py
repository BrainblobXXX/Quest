#!/usr/bin/env python3
"""Новые ассеты: дробовик+пистолет, аптечка, бензопила."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/weapons')
WEAPONS = ROOT / 'games/zombie-blood/assets/weapons'
ITEMS = ROOT / 'games/zombie-blood/assets/items'
MAX = 512


def remove_white(im: Image.Image, threshold: int = 238) -> Image.Image:
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


def save(img: Image.Image, path: Path, max_size: int = MAX) -> None:
    if max(img.size) > max_size:
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'PNG', optimize=True)
    print(path.name, img.size)


def main() -> None:
    # Старый дробовик — это обрез, сохраняем его отдельным файлом.
    old_shotgun = Image.open(SRC / 'shotgun.png').convert('RGBA')
    save(old_shotgun, WEAPONS / 'sawed_off.png')

    source = Image.open(SRC / 'shotgun_auto.png').convert('RGBA')
    # Новый дробовик: пистолет из нижней части листа сначала заливаем
    # фоном, чтобы после удаления белого от него не осталось фрагментов.
    shotgun_src = source.crop((20, 0, 310, 180)).convert('RGB')
    ImageDraw.Draw(shotgun_src).rectangle((118, 92, 310, 180), fill=(255, 255, 255))
    save(remove_white(shotgun_src), WEAPONS / 'shotgun.png')

    # Пистолет из того же листа (захватываем рукоять целиком).
    save(remove_white(source.crop((132, 100, 290, 210))), WEAPONS / 'pistol.png')

    save(remove_white(Image.open(SRC / 'medkit.png').convert('RGBA')), ITEMS / 'medkit.png')
    save(remove_white(Image.open(SRC / 'chainsaw.webp').convert('RGBA')), WEAPONS / 'chainsaw.png')

    # Манифесты
    wp = WEAPONS / 'weapons.json'
    data = json.loads(wp.read_text())
    data.setdefault('items', {}).update({
        'pistol': 'pistol.png',
        'shotgun': 'shotgun.png',
        'sawed_off': 'sawed_off.png',
        'chainsaw': 'chainsaw.png',
    })
    data['files'] = sorted({v for v in data['items'].values()})
    wp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    ip = ITEMS / 'items.json'
    items = json.loads(ip.read_text())
    items.setdefault('items', {})['medkit'] = 'assets/items/medkit.png'
    ip.write_text(json.dumps(items, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print('done')


if __name__ == '__main__':
    main()
