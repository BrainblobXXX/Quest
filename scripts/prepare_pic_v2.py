#!/usr/bin/env python3
"""Готовит ассеты из pic_v2: оружие и кадры собаки."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/pic_v2')
WEAPONS_OUT = ROOT / 'games/zombie-blood/assets/weapons'
DOGS_OUT = ROOT / 'games/zombie-blood/assets/dogs'
CANVAS = 512
PADDING = 16


def near_background(rgb) -> Image.Image:
    """Светлый/серый фон (включая шахматку), но не цветной объект."""
    import numpy as np
    a = np.asarray(rgb).astype(np.int16)
    span = a.max(axis=2) - a.min(axis=2)
    value = a.max(axis=2)
    mask = (span <= 16) & (value >= 70)
    return Image.fromarray((mask * 255).astype('uint8'), 'L').copy()


def remove_background(im: Image.Image) -> Image.Image:
    rgba = im.convert('RGBA')
    matte = near_background(im.convert('RGB'))
    import numpy as np
    near = np.asarray(matte) == 255
    h, w = near.shape
    seen = np.zeros_like(near, dtype=bool)
    remove = np.zeros_like(near, dtype=bool)

    for y in range(h):
        for x in range(w):
            if not near[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            component: list[tuple[int, int]] = []
            touches_edge = False
            while stack:
                cy, cx = stack.pop()
                component.append((cy, cx))
                if cy == 0 or cx == 0 or cy == h - 1 or cx == w - 1:
                    touches_edge = True
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            # Большие области фона и всё, что касается края, убираем.
            # Маленькие белые пятна внутри собаки (глаза, зубы) оставляем.
            if touches_edge or len(component) > 1000:
                for cy, cx in component:
                    remove[cy, cx] = True

    alpha = np.where(remove, 0, 255).astype('uint8')
    rgba.putalpha(Image.fromarray(alpha, 'L'))
    rgba.putalpha(rgba.getchannel('A').filter(ImageFilter.GaussianBlur(0.45)))
    box = rgba.getbbox()
    return rgba.crop(box) if box else rgba


def trim_borders(img: Image.Image, px: int = 5) -> Image.Image:
    """Срезает оставшиеся линии сетки у краёв клетки."""
    if img.width <= px * 2 or img.height <= px * 2:
        return img
    from PIL import ImageChops
    alpha = img.getchannel('A').copy()
    # обнуляем узкую рамку вокруг уже обрезанного объекта
    alpha.paste(0, (0, 0, img.width, px))
    alpha.paste(0, (0, img.height - px, img.width, img.height))
    alpha.paste(0, (0, 0, px, img.height))
    alpha.paste(0, (img.width - px, 0, img.width, img.height))
    out = img.copy()
    out.putalpha(ImageChops.multiply(alpha, img.getchannel('A')))
    box = out.getbbox()
    return out.crop(box) if box else out


def fit_canvas(img: Image.Image) -> Image.Image:
    img.thumbnail((CANVAS - PADDING * 2, CANVAS - PADDING * 2), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((CANVAS - img.width) // 2, CANVAS - PADDING - img.height))
    return canvas


def make_weapons() -> list[tuple[str, str]]:
    WEAPONS_OUT.mkdir(parents=True, exist_ok=True)
    mapping = {
        'axe.jpg': 'axe.png',
        'bare_hands.jpg': 'bare_hands.png',
        'sub-machine.jpg': 'submachine.png',
    }
    out = []
    for source, target in mapping.items():
        img = remove_background(Image.open(SRC / 'weapons' / source).convert('RGB'))
        # для иконок достаточно 512 px по большей стороне
        if max(img.size) > 512:
            img.thumbnail((512, 512), Image.Resampling.LANCZOS)
        img.save(WEAPONS_OUT / target, 'PNG', optimize=True)
        out.append((target, source))
        print('weapon', target, img.size)
    return out


def make_dogs() -> int:
    DOGS_OUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SRC / 'zombie art' / 'dog.png').convert('RGB')
    # Реальные границы клеток: линии сетки на исходнике не равномерны.
    cols = [(18, 411), (423, 814), (822, 1227), (1239, 1629), (1637, 2030)]
    rows = [(18, 504), (511, 997), (1004, 1466), (1473, 2019)]
    frames = []
    for row, (top, bottom) in enumerate(rows):
        for col, (left, right) in enumerate(cols):
            index = row * 5 + col + 1
            cut = remove_background(source.crop((left, top, right, bottom)))
            cut = fit_canvas(trim_borders(cut, 5))
            name = f'dog-{index:02d}.png'
            cut.save(DOGS_OUT / name, 'PNG', optimize=True)
            frames.append({'id': f'dog-{index:02d}', 'file': f'assets/dogs/{name}', 'row': row + 1, 'col': col + 1})
    (DOGS_OUT / 'dogs.json').write_text(
        json.dumps({'source': 'pic_v2/zombie art/dog.png', 'grid': {'rows': 4, 'cols': 5}, 'canvas': [CANVAS, CANVAS], 'frames': frames}, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    # контактный лист
    sheet = Image.new('RGB', (5 * 240, 4 * 260), (18, 12, 5))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 16)
    except OSError:
        font = ImageFont.load_default()
    for index in range(20):
        im = Image.open(DOGS_OUT / f'dog-{index + 1:02d}.png').convert('RGBA')
        im.thumbnail((210, 210), Image.Resampling.LANCZOS)
        x = (index % 5) * 240 + 15
        y = (index // 5) * 260 + 10
        sheet.paste(im, (x + (210 - im.width) // 2, y + 210 - im.height), im)
        draw.text((x + 4, y + 215), f'{index + 1:02d}', fill=(255, 190, 70), font=font)
    sheet.save(DOGS_OUT / 'dogs-contact-sheet.png', 'PNG', optimize=True)
    return len(frames)


def main() -> None:
    weapons = make_weapons()
    # обновить оружейный манифест
    manifest_path = WEAPONS_OUT / 'weapons.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    items = manifest.setdefault('items', {})
    items.update({
        'axe': 'axe.png',
        'submachine': 'submachine.png',
        'fists': 'bare_hands.png',
    })
    manifest['items'] = items
    manifest['files'] = sorted(set(manifest.get('files', [])) | {name for name, _ in weapons})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    count = make_dogs()
    print('dogs', count)


if __name__ == '__main__':
    main()
