#!/usr/bin/env python3
"""Выравнивает готовые кадры собак/крыс по общему масштабу и низу."""
from __future__ import annotations

from pathlib import Path
from statistics import median

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CANVAS = 512
DOG_SRC = ROOT / '.next/standalone/games/zombie-blood/assets/dogs'
RAT_SRC = ROOT / '.next/standalone/games/zombie-blood/assets/rats'
DOGS = ROOT / 'games/zombie-blood/assets/dogs'
RATS = ROOT / 'games/zombie-blood/assets/rats'


def load_frames(directory: Path, names: list[str]) -> list[tuple[str, Image.Image]]:
    return [(name, Image.open(directory / name).convert('RGBA')) for name in names]


def bbox_metrics(img: Image.Image):
    box = img.getbbox()
    if not box:
        return box, 0, 0
    left, top, right, bottom = box
    alpha = np.asarray(img.getchannel('A'))
    band = max(4, int((bottom - top) * 0.10))
    band_alpha = alpha[bottom - band:bottom, left:right]
    xs = np.where(band_alpha > 0)[1]
    anchor_x = int(np.median(xs)) + left if len(xs) else (left + right) // 2
    return box, anchor_x, bottom


def normalize(frames: list[tuple[str, Image.Image]], out_dir: Path, baseline: int) -> None:
    metrics = [(name, img, *bbox_metrics(img)) for name, img in frames]
    sizes = [(box[2] - box[0], box[3] - box[1]) for _, _, box, _, _ in metrics if box]
    if not sizes:
        return
    target_width = float(median(width for width, _ in sizes))
    target_width = min(430.0, target_width)
    # Один общий масштаб на группу: самый высокий кадр не должен вылезать
    # за холст и при этом не должен масштабироваться отдельно от остальных.
    height_limit = baseline - 20
    target_width = min(target_width, *(height_limit * width / max(1, height) for width, height in sizes))
    target_width = max(1.0, target_width)
    for name, img, box, anchor_x, bottom in metrics:
        if not box:
            continue
        width = box[2] - box[0]
        scale = target_width / max(1, width)
        if scale < 0.78 or scale > 1.28:
            scale = min(1.28, max(0.78, scale))
        if abs(scale - 1.0) > 0.01:
            img = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)
        box, anchor_x, bottom = bbox_metrics(img)
        left, top, right, bottom_box = box
        # Для ровной анимации важнее общий центр силуэта, а не точка хвоста.
        x = round(CANVAS / 2 - (left + right) / 2)
        y = baseline - bottom
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.alpha_composite(img, (x, y))
        canvas.save(out_dir / name, 'PNG', optimize=True)
        print(name, canvas.getbbox())


def main() -> None:
    dog_groups = {
        'passive': [f'dog-passive_{i}.png' for i in range(1, 6)],
        'attack': [f'dog-attack_{i}.png' for i in range(1, 6)],
        'death': ['dog_die_2.png', 'dog_die_3.png'],
    }
    for state, names in dog_groups.items():
        print('DOG', state)
        normalize(load_frames(DOG_SRC, names), DOGS, 496)

    rat_groups = {
        'passive': [f'rat-passive_{i}.png' for i in range(1, 6)],
        'attack': [f'rat-attack_{i}.png' for i in range(1, 6)],
        'death': [f'rat-die_{i}.png' for i in range(1, 6)],
    }
    for state, names in rat_groups.items():
        print('RAT', state)
        normalize(load_frames(RAT_SRC, names), RATS, 484)


if __name__ == '__main__':
    main()
