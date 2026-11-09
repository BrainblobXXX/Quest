#!/usr/bin/env python3
"""Обрезает звуки оружия/врагов по длительности боевых анимаций."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from trim_mp3 import RATES, frame_length, id3_end  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/home/vlad/DeepSeekHome2/soundeffects/weapon')
SOUNDS = ROOT / 'games/zombie-blood/assets/sounds'

# Атака игрока — фаза после броска до ответа врага.
WEAPON_ATTACK_SECONDS = 0.65
# Анимация ответной атаки противника.
ENEMY_ATTACK_SECONDS = 1.30
# Небольшой хвост после окончания анимации.
SOUND_TAIL_SECONDS = 0.50

WEAPONS = ['bat', 'chainsaw', 'crowbar', 'fists', 'knife', 'pistol', 'shotgun', 'sub-machine', 'sword']
ENEMIES = ['dog', 'rat', 'zombies']


def trim_to_seconds(src: Path, dst: Path, seconds: float) -> tuple[float, float, int, int]:
    data = src.read_bytes()
    start = id3_end(data)
    pos = start
    frames: list[tuple[int, int]] = []
    while pos + 4 <= len(data):
        length = frame_length(data, pos)
        if length is None:
            break
        frames.append((pos, length))
        pos += length
    if not frames:
        raise SystemExit(f'не найдено MP3-кадров: {src}')
    b2 = data[start + 1]
    version = (b2 >> 3) & 3
    samples = 1152 if version == 3 else 576
    rate = RATES[version][(data[start + 2] >> 2) & 3]
    max_frames = max(1, int(seconds * rate / samples))
    keep = min(len(frames), max_frames)
    end = frames[keep - 1][0] + frames[keep - 1][1]
    dst.parent.mkdir(parents=True, exist_ok=True)
    if keep == len(frames):
        shutil.copyfile(src, dst)
    else:
        dst.write_bytes(data[:start] + data[start:end])
    return len(frames) * samples / rate, keep * samples / rate, len(frames), keep


def main() -> None:
    jobs = []
    for name in WEAPONS:
        jobs.append((SRC / f'{name}.mp3', SOUNDS / 'weapons' / f'{name}.mp3', WEAPON_ATTACK_SECONDS + SOUND_TAIL_SECONDS))
    for name in ENEMIES:
        jobs.append((SRC / f'{name}.mp3', SOUNDS / 'enemies' / f'{name}.mp3', ENEMY_ATTACK_SECONDS + SOUND_TAIL_SECONDS))
    for src, dst, seconds in jobs:
        old, new, total, kept = trim_to_seconds(src, dst, seconds)
        print(f'{dst.name}: {old:.3f}s -> {new:.3f}s ({kept}/{total} frames)')


if __name__ == '__main__':
    main()
