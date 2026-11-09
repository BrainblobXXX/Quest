#!/usr/bin/env python3
"""Убирает мелкие оторванные точки и выравнивает кадры животных."""
from __future__ import annotations

from pathlib import Path
from statistics import median

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CANVAS = 512
DOGS = ROOT / 'games/zombie-blood/assets/dogs'
RATS = ROOT / 'games/zombie-blood/assets/rats'


def clean(img: Image.Image) -> Image.Image:
    alpha = np.asarray(img.getchannel('A')).copy()
    mask = alpha > 0
    h, w = mask.shape
    seen = np.zeros_like(mask)
    comps = []
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
    largest = max(len(comp) for comp in comps)
    # Оторванные пылинки/кусочки соседних кадров — меньше 0.4% силуэта.
    threshold = max(100, int(largest * 0.004))
    keep = np.zeros_like(mask)
    for comp in comps:
        if len(comp) >= threshold:
            for y, x in comp:
                keep[y, x] = True
    out = img.copy()
    out.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype('uint8'), 'L'))
    box = out.getbbox()
    return out.crop(box) if box else out


def normalise(frames: list[tuple[str, Image.Image]], out_dir: Path, baseline: int) -> None:
    metrics = []
    for name, img in frames:
        img = clean(img)
        box = img.getbbox()
        if box:
            metrics.append((name, img, box))
    sizes = [(box[2] - box[0], box[3] - box[1]) for _, _, box in metrics]
    target_width = min(430.0, median(width for width, _ in sizes))
    height_limit = baseline - 20
    target_width = min(target_width, *(height_limit * width / max(1, height) for width, height in sizes))
    for name, img, box in metrics:
        width = box[2] - box[0]
        scale = target_width / max(1, width)
        if abs(scale - 1.0) > 0.01:
            img = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)
        box = img.getbbox()
        left, top, right, bottom = box
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.alpha_composite(img, (round(CANVAS / 2 - (left + right) / 2), baseline - bottom))
        canvas.save(out_dir / name, 'PNG', optimize=True)
        print(name, canvas.getbbox())


def main() -> None:
    dog_groups = [
        [f'dog-passive_{i}.png' for i in range(1, 6)],
        [f'dog-attack_{i}.png' for i in range(1, 6)],
        ['dog_die_2.png', 'dog_die_3.png'],
    ]
    for names in dog_groups:
        normalise([(n, Image.open(DOGS / n).convert('RGBA')) for n in names], DOGS, 496)
    rat_groups = [
        [f'rat-passive_{i}.png' for i in range(1, 6)],
        [f'rat-attack_{i}.png' for i in range(1, 6)],
        [f'rat-die_{i}.png' for i in range(1, 6)],
    ]
    for names in rat_groups:
        normalise([(n, Image.open(RATS / n).convert('RGBA')) for n in names], RATS, 484)


if __name__ == '__main__':
    main()
