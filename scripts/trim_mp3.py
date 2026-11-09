#!/usr/bin/env python3
"""Обрезает CBR MP3 по кадрам без перекодирования."""
from __future__ import annotations

import sys
from pathlib import Path

BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def id3_end(data: bytes) -> int:
    if data[:3] != b'ID3' or len(data) < 10:
        return 0
    size = (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]
    return 10 + size + (10 if data[5] & 0x10 else 0)


def frame_length(data: bytes, pos: int) -> int | None:
    if pos + 4 > len(data) or data[pos] != 0xFF or (data[pos + 1] & 0xE0) != 0xE0:
        return None
    b2, b3 = data[pos + 1], data[pos + 2]
    version = (b2 >> 3) & 0x03
    layer = (b2 >> 1) & 0x03
    bitrate_index = (b3 >> 4) & 0x0F
    rate_index = (b3 >> 2) & 0x03
    padding = (b3 >> 1) & 0x01
    if version == 1 or layer != 1 or bitrate_index in (0, 15) or rate_index == 3:
        return None
    table = BITRATES_V1_L3 if version == 3 else BITRATES_V2_L3
    bitrate = table[bitrate_index] * 1000
    sample_rate = RATES[version][rate_index]
    coefficient = 144 if version == 3 else 72
    length = coefficient * bitrate // sample_rate + padding
    return length if length >= 4 else None


def trim(src: Path, dst: Path, fraction: float = 0.5) -> tuple[float, float, int, int]:
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
        raise SystemExit('не найдено MP3-кадров')
    keep = max(1, round(len(frames) * fraction))
    end = frames[keep - 1][0] + frames[keep - 1][1]
    dst.write_bytes(data[:start] + data[start:end])
    # 1152 сэмплов на кадр для MPEG1 Layer III, 576 для MPEG2/2.5.
    b2 = data[start + 1]
    version = (b2 >> 3) & 3
    samples = 1152 if version == 3 else 576
    rate_index = (data[start + 2] >> 2) & 3
    sample_rate = RATES[version][rate_index]
    old_duration = len(frames) * samples / sample_rate
    new_duration = keep * samples / sample_rate
    return old_duration, new_duration, len(frames), keep


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: trim_mp3.py SRC DST')
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    old, new, total, kept = trim(src, dst)
    print(f'{src}: {old:.3f}s, {total} frames')
    print(f'{dst}: {new:.3f}s, {kept} frames')
