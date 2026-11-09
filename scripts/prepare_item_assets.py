#!/usr/bin/env python3
"""Нарезает новые картинки предметов из pic_v2/weapons."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2/weapons')
WEAPONS = ROOT / 'games/zombie-blood/assets/weapons'
ITEMS = ROOT / 'games/zombie-blood/assets/items'
MAX = 512


def remove_flat_background(im: Image.Image, threshold: int = 245, broad: bool = False) -> Image.Image:
    rgb = im.convert('RGB')
    a = np.asarray(rgb).astype(np.int16)
    span = a.max(axis=2) - a.min(axis=2)
    value = a.max(axis=2)
    near = ((span <= 30) & (value >= 25)) if broad else ((span <= 14) & (value >= threshold))
    matte = Image.fromarray((near * 255).astype('uint8'), 'L').copy()
    w, h = matte.size
    # Крупные белые области (в том числе закрытые петли верёвки) — фон.
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
            if edge or (not broad and len(comp) > 500):
                for cy, cx in comp:
                    remove[cy, cx] = True
    alpha = np.where(remove, 0, 255).astype('uint8')
    rgba = im.convert('RGBA')
    rgba.putalpha(Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(0.4)))
    box = rgba.getbbox()
    return rgba.crop(box) if box else rgba


def prepare(img: Image.Image, threshold: int = 245, broad: bool = False) -> Image.Image:
    img = remove_flat_background(img, threshold, broad)
    if max(img.size) > MAX:
        img.thumbnail((MAX, MAX), Image.Resampling.LANCZOS)
    return img


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'PNG', optimize=True)
    print(path.name, img.size)


def main() -> None:
    # 8 предметов на листе: строки разделены линиями на y=640/1042/1478,
    # столбцы — на x=538/542. Фиксированная сетка 2×4 здесь режет предметы.
    sheet = Image.open(SRC / 'assets1.jpg').convert('RGB')
    names = [
        'rubber_gloves', 'lab_coat',
        'short_rope', 'climbing_rope',
        'pulley', 'note_paper',
        'brass_key', 'keyring',
    ]
    rows = [(0, 640), (642, 1042), (1044, 1477), (1480, 1920)]
    cols = [(0, 538), (542, 1080)]
    for index, name in enumerate(names):
        row, col = divmod(index, 2)
        x0, x1 = cols[col]
        y0, y1 = rows[row]
        save(prepare(sheet.crop((x0 + 4, y0 + 4, x1 - 4, y1 - 4))), ITEMS / f'{name}.png')

    # Скриншот: верх — ключи от машины, низ — деньги. Обрезаем интерфейс
    # и не захватываем кончик ключа над пачкой денег.
    phone = Image.open(SRC / 'assets2.jpg').convert('RGB')
    save(prepare(phone.crop((90, 240, 1120, 980))), ITEMS / 'car_keys.png')
    save(prepare(phone.crop((40, 1100, 1120, 2010))), ITEMS / 'money.png')

    # Одиночные предметы и оружие
    singles = {
        'sword.jpg': ('weapons', 'sword'),
        'crowbar.jpg': ('weapons', 'crowbar'),
        'pistolshots.jpg': ('items', 'ammo'),
        'shotgun_shots.jpg': ('items', 'shotgun_ammo'),
        'saw.jpg': ('items', 'hacksaw'),
    }
    thresholds = {'sword.jpg': 190, 'crowbar.jpg': 190, 'pistolshots.jpg': 170, 'shotgun_shots.jpg': 245, 'saw.jpg': 245}
    for filename, (kind, name) in singles.items():
        target = WEAPONS if kind == 'weapons' else ITEMS
        img = Image.open(SRC / filename).convert('RGB')
        # Убираем интерфейс телефона и водяные знаки, не задевая предмет.
        if filename == 'crowbar.jpg':
            img = img.crop((90, 240, 1090, 2080))
        if filename == 'sword.jpg':
            ImageDraw.Draw(img).rectangle((690, 870, img.width, img.height), fill=(255, 255, 255))
        if filename in {'pistolshots.jpg', 'shotgun_shots.jpg', 'saw.jpg'}:
            img = img.crop((0, 0, img.width, img.height - 55))
        broad = filename == 'pistolshots.jpg'
        save(prepare(img, thresholds.get(filename, 245), broad), target / f'{name}.png')

    # Манифест предметов (id → файл)
    item_map = {
        'rubber_gloves': 'assets/items/rubber_gloves.png',
        'lab_coat': 'assets/items/lab_coat.png',
        'short_rope': 'assets/items/short_rope.png',
        'climbing_rope': 'assets/items/climbing_rope.png',
        'pulley': 'assets/items/pulley.png',
        'note_paper': 'assets/items/note_paper.png',
        'note121': 'assets/items/note_paper.png',
        'code161': 'assets/items/note_paper.png',
        'note333': 'assets/items/note_paper.png',
        'brass_key': 'assets/items/brass_key.png',
        'keyring': 'assets/items/keyring.png',
        'number9_key': 'assets/items/brass_key.png',
        'number111_key': 'assets/items/brass_key.png',
        'car_keys': 'assets/items/car_keys.png',
        'money': 'assets/items/money.png',
        'ammo': 'assets/items/ammo.png',
        'shotgun_ammo': 'assets/items/shotgun_ammo.png',
        'hacksaw': 'assets/items/hacksaw.png',
    }
    (ITEMS / 'items.json').write_text(json.dumps({'items': item_map}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # Обновляем карту оружия, не теряя старые записи.
    wp = WEAPONS / 'weapons.json'
    manifest = json.loads(wp.read_text()) if wp.exists() else {'items': {}}
    manifest.setdefault('items', {}).update({
        'axe': 'axe.png',
        'crowbar': 'crowbar.png',
        'sword': 'sword.png',
        'submachine': 'submachine.png',
        'fists': 'bare_hands.png',
    })
    manifest['source'] = 'Кровь зомби: PDF стр. 98 + pic_v2/weapons'
    wp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # Контактный лист предметов
    preview = [(name, ITEMS / f'{name}.png') for name in [
        'rubber_gloves', 'lab_coat', 'short_rope', 'climbing_rope',
        'pulley', 'note_paper', 'brass_key', 'keyring',
        'car_keys', 'money', 'ammo', 'shotgun_ammo', 'hacksaw',
    ]]
    cols, cell_w, cell_h = 4, 280, 300
    rows = (len(preview) + cols - 1) // cols
    sheet_out = Image.new('RGB', (cols * cell_w, rows * cell_h), (18, 12, 5))
    draw = ImageDraw.Draw(sheet_out)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 14)
    except OSError:
        font = ImageFont.load_default()
    for i, (name, path) in enumerate(preview):
        im = Image.open(path).convert('RGBA')
        im.thumbnail((240, 240), Image.Resampling.LANCZOS)
        x = (i % cols) * cell_w + 20
        y = (i // cols) * cell_h + 10
        sheet_out.paste(im, (x + (240 - im.width) // 2, y + 240 - im.height), im)
        draw.text((x, y + 250), name, fill=(255, 190, 70), font=font)
    sheet_out.save(ITEMS / 'items-contact-sheet.png', 'PNG', optimize=True)


if __name__ == '__main__':
    main()
