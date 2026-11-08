#!/usr/bin/env python3
"""Построение статического графа Quest/2."""
from __future__ import annotations
import argparse, json, sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from quest2_validate import collect_edges, load_package  # noqa: E402


def build_graph(package: dict) -> dict:
    scenes = package.get("scenes") or {}
    edges = {scene_id: sorted(set(collect_edges(scene))) for scene_id, scene in scenes.items()}
    start = str(package.get("start"))
    distance: dict[str, int] = {}
    queue = deque([start])
    distance[start] = 0
    while queue:
        current = queue.popleft()
        for target in edges.get(current, []):
            if target not in distance and target in scenes:
                distance[target] = distance[current] + 1
                queue.append(target)
    endings = sorted(scene_id for scene_id, scene in scenes.items() if scene.get("ending"))
    dynamic = sorted(
        scene_id for scene_id, scene in scenes.items()
        if isinstance(scene.get("interaction"), dict)
        and scene["interaction"].get("type") == "codebook"
    )
    return {
        "package": package.get("id"),
        "title": package.get("title"),
        "start": start,
        "scenes": sorted(scenes),
        "edges": {key: value for key, value in edges.items() if value},
        "distances": dict(sorted(distance.items(), key=lambda item: (item[1], item[0]))),
        "reachable": sorted(distance),
        "unreachable": sorted(set(scenes) - set(distance)),
        "endings": endings,
        "unreachable_endings": sorted(set(endings) - set(distance)),
        "dynamic": dynamic,
        "dead_ends": sorted(
            scene_id for scene_id in scenes
            if scene_id not in endings and scene_id not in dynamic and not edges.get(scene_id)
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Граф пакета Quest/2")
    parser.add_argument("path", type=Path)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--dot", action="store_true")
    args = parser.parse_args()
    try:
        package, source = load_package(args.path)
    except Exception as exc:
        print(f"ОШИБКА ЗАГРУЗКИ: {exc}", file=sys.stderr)
        return 2
    graph = build_graph(package)
    if args.json:
        print(json.dumps({"source": str(source), **graph}, ensure_ascii=False, indent=2))
        return 0
    if args.dot:
        print("digraph quest {")
        for key in graph["scenes"]:
            print(f'  "{key}";')
        for source_id, targets in graph["edges"].items():
            for target in targets:
                print(f'  "{source_id}" -> "{target}";')
        print("}")
        return 0
    print(f"ПАКЕТ: {source}")
    print(f"Сцен: {len(graph['scenes'])}; достижимо: {len(graph['reachable'])}; концовок: {len(graph['endings'])}")
    if graph["unreachable"]:
        print("НЕДОСТИЖИМЫЕ СЦЕНЫ:", ", ".join(graph["unreachable"]))
    if graph["unreachable_endings"]:
        print("НЕДОСТИЖИМЫЕ КОНЦОВКИ:", ", ".join(graph["unreachable_endings"]))
    if graph["dead_ends"]:
        print("ТУПИКИ БЕЗ КОНЦОВКИ:", ", ".join(graph["dead_ends"]))
    print("ДИСТАНЦИИ:")
    for key, value in graph["distances"].items():
        print(f"  {value:>3}  {key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
