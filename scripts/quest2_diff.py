#!/usr/bin/env python3
"""Сравнение двух пакетов Quest/2 по структуре."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from quest2_validate import load_package  # noqa: E402


def diff(a, b, path="$") -> list[dict]:
    out: list[dict] = []
    if type(a) is not type(b):
        return [{"op": "changed", "path": path, "before": a, "after": b}]
    if isinstance(a, dict):
        for key in sorted(set(a) | set(b)):
            child = f"{path}.{key}"
            if key not in a:
                out.append({"op": "added", "path": child, "after": b[key]})
            elif key not in b:
                out.append({"op": "removed", "path": child, "before": a[key]})
            else:
                out += diff(a[key], b[key], child)
        return out
    if isinstance(a, list):
        if len(a) != len(b):
            out.append({"op": "changed", "path": path, "before": f"list[{len(a)}]", "after": f"list[{len(b)}]"})
        for index in range(min(len(a), len(b))):
            out += diff(a[index], b[index], f"{path}[{index}]")
        return out
    if a != b:
        out.append({"op": "changed", "path": path, "before": a, "after": b})
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Сравнить два пакета Quest/2")
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        first, first_path = load_package(args.before)
        second, second_path = load_package(args.after)
    except Exception as exc:
        print(f"ОШИБКА ЗАГРУЗКИ: {exc}", file=sys.stderr)
        return 2
    changes = diff(first, second)
    if args.json:
        print(json.dumps({"before": str(first_path), "after": str(second_path), "changes": changes}, ensure_ascii=False, indent=2))
    else:
        print(f"{first_path} → {second_path}")
        for change in changes:
            print(f"{change['op']:8} {change['path']}")
            if "before" in change:
                print(f"         было: {change['before']!r}")
            if "after" in change:
                print(f"         стало: {change['after']!r}")
        if not changes:
            print("Изменений нет")
    return 0 if not changes else 1


if __name__ == "__main__":
    raise SystemExit(main())
