#!/usr/bin/env python3
"""Quest/2 validator: JSON Schema + semantic checks.

Usage:
  python3 scripts/quest2_validate.py path/to/book.yaml
  python3 scripts/quest2_validate.py path/to/package --json

The schema validates shape. This script validates references, formulas,
interaction invariants and static reachability.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import deque
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("нужен PyYAML: python3 -m pip install pyyaml", file=sys.stderr)
    raise SystemExit(2)

try:
    import jsonschema
except ImportError:
    print("нужен jsonschema: python3 -m pip install jsonschema", file=sys.stderr)
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "engine_docs" / "quest2.schema.json"
CANDIDATES = ("quest2.yaml", "book.yaml", "game.yaml", "quest2.json", "book.json")
ID_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
DICE_RE = re.compile(r"^(\d+)d(\d+)([+-]\d+)?$", re.I)
SIGNED_DICE_RE = re.compile(r"^([+-]?)(\d+)d(\d+)$", re.I)
TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


class Finding(dict):
    def __init__(self, code: str, path: str, message: str):
        super().__init__(code=code, path=path, message=message)


def json_path(parts: list[Any]) -> str:
    out = "$"
    for part in parts:
        if isinstance(part, int):
            out += f"[{part}]"
        else:
            out += f".{part}"
    return out


def schema_errors(instance: Any) -> list[Finding]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema)
    findings: list[Finding] = []
    for error in sorted(validator.iter_errors(instance), key=lambda e: list(e.path)):
        findings.append(Finding("E_SCHEMA", json_path(list(error.path)), error.message))
    return findings


def load_package(path: Path) -> tuple[dict[str, Any], Path]:
    if path.is_dir():
        for name in CANDIDATES:
            candidate = path / name
            if candidate.exists():
                path = candidate
                break
        else:
            raise FileNotFoundError(f"в {path} нет ни одного из {', '.join(CANDIDATES)}")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("корень пакета должен быть объектом")
    return data, path


def is_dice(text: str) -> bool:
    return bool(DICE_RE.match(text.replace("−", "-").strip()))


def stats_in_formula(formula: str) -> set[str]:
    return {token for token in TOKEN_RE.findall(formula) if token not in {"max"} and not token.startswith("d")}


def check_formula_syntax(formula: str) -> str | None:
    text = formula.replace("−", "-").replace("–", "-").strip()
    if not re.search(r"(>=|<=|!=|=|>|<)", text):
        return "формула проверки должна содержать сравнение"
    # Разрешаем dice, идентификаторы, числа, операции, max и скобки.
    tokens = re.findall(r"\d+d\d+|\d+|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/<>=!,]", text)
    if not tokens:
        return "пустая формула"
    # Идентификаторы проверяются отдельно по stats; здесь важна только форма.
    return None


def collect_edges(scene: dict[str, Any]) -> list[str]:
    edges: list[str] = []
    for effect in scene.get("entry", []) or []:
        target = effect.get("redirect")
        if target:
            edges.append(str(target))
    interaction = scene.get("interaction")
    if not isinstance(interaction, dict):
        return edges
    kind = interaction.get("type")
    if kind in {"choices"}:
        for option in interaction.get("options", []) or []:
            if option.get("to"):
                edges.append(str(option["to"]))
    elif kind in {"continue"}:
        if interaction.get("to"):
            edges.append(str(interaction["to"]))
    elif kind == "check":
        for key in ("success", "failure"):
            target = interaction.get("outcomes", {}).get(key)
            if target:
                edges.append(str(target))
    elif kind == "combat":
        for key in ("victory", "defeat", "retreat"):
            target = interaction.get("outcomes", {}).get(key)
            if target:
                edges.append(str(target))
    elif kind == "gamble":
        for target in (interaction.get("outcomes") or {}).values():
            if target:
                edges.append(str(target))
    elif kind == "shop":
        for target in (interaction.get("outcomes") or {}).values():
            if target:
                edges.append(str(target))
    elif kind == "roll":
        for outcome in interaction.get("outcomes", []) or []:
            if outcome.get("to"):
                edges.append(str(outcome["to"]))
    elif kind == "attrition":
        if interaction.get("to"):
            edges.append(str(interaction["to"]))
        for option in interaction.get("options", []) or []:
            if option.get("to"):
                edges.append(str(option["to"]))
    after = scene.get("after")
    if isinstance(after, dict):
        edges.extend(collect_edges({"after": None, "interaction": after}))
    return edges


def validate_condition(condition: Any, scene_id: str, path: str, refs: dict[str, set[str]]) -> list[Finding]:
    out: list[Finding] = []
    if not isinstance(condition, dict):
        return [Finding("E_CONDITION", path, "условие должно быть объектом")]
    if "all" in condition or "any" in condition:
        key = "all" if "all" in condition else "any"
        for index, child in enumerate(condition.get(key) or []):
            out += validate_condition(child, scene_id, f"{path}.{key}[{index}]", refs)
    elif "not" in condition:
        out += validate_condition(condition["not"], scene_id, f"{path}.not", refs)
    elif "has_item" in condition:
        item = condition["has_item"]
        if isinstance(item, dict) and item.get("id") not in refs["items"]:
            out.append(Finding("E_ITEM_MISSING", path, f"неизвестный предмет «{item.get('id')}»"))
    elif "stat" in condition:
        spec = condition["stat"]
        if isinstance(spec, dict) and spec.get("id") not in refs["stats"]:
            out.append(Finding("E_STAT_MISSING", path, f"неизвестный статус «{spec.get('id')}»"))
    elif "flag" in condition:
        if condition["flag"] not in refs["flags"]:
            out.append(Finding("E_FLAG_MISSING", path, f"неизвестный флаг «{condition['flag']}»"))
    elif "visited" in condition:
        if condition["visited"] not in refs["scenes"]:
            out.append(Finding("E_SCENE_MISSING", path, f"неизвестная сцена «{condition['visited']}»"))
    elif "known_code" in condition:
        if condition["known_code"] not in refs["codes"]:
            out.append(Finding("E_CODE_MISSING", path, f"неизвестный код «{condition['known_code']}»"))
    return out


def validate_effects(effects: Any, scene_id: str, path: str, refs: dict[str, set[str]]) -> list[Finding]:
    out: list[Finding] = []
    if not isinstance(effects, list):
        return out
    for index, effect in enumerate(effects):
        epath = f"{path}[{index}]"
        if not isinstance(effect, dict):
            continue
        if "if" in effect:
            out += validate_condition(effect["if"], scene_id, f"{epath}.if", refs)
        if "grant" in effect:
            item = effect["grant"].get("item") if isinstance(effect["grant"], dict) else None
            if item not in refs["items"]:
                out.append(Finding("E_ITEM_MISSING", epath, f"grant: неизвестный предмет «{item}»"))
        if "consume" in effect:
            item = effect["consume"].get("item") if isinstance(effect["consume"], dict) else None
            if item not in refs["items"]:
                out.append(Finding("E_ITEM_MISSING", epath, f"consume: неизвестный предмет «{item}»"))
        if "drop" in effect:
            item = effect["drop"].get("item") if isinstance(effect["drop"], dict) else None
            if item not in refs["items"]:
                out.append(Finding("E_ITEM_MISSING", epath, f"drop: неизвестный предмет «{item}»"))
        if "modify" in effect:
            stat = effect["modify"].get("stat") if isinstance(effect["modify"], dict) else None
            if stat not in refs["stats"]:
                out.append(Finding("E_STAT_MISSING", epath, f"modify: неизвестный статус «{stat}»"))
        if "roll" in effect:
            stat = effect["roll"].get("stat") if isinstance(effect["roll"], dict) else None
            if stat not in refs["stats"]:
                out.append(Finding("E_STAT_MISSING", epath, f"roll: неизвестный статус «{stat}»"))
            formula = effect["roll"].get("formula", "") if isinstance(effect["roll"], dict) else ""
            if not SIGNED_DICE_RE.match(str(formula).replace("−", "-").strip()):
                out.append(Finding("E_FORMULA", epath, "roll: формула должна иметь вид +/-NdM"))
        if "set_flag" in effect and effect["set_flag"] not in refs["flags"]:
            out.append(Finding("E_FLAG_MISSING", epath, f"set_flag: неизвестный флаг «{effect['set_flag']}»"))
        if "clear_flag" in effect and effect["clear_flag"] not in refs["flags"]:
            out.append(Finding("E_FLAG_MISSING", epath, f"clear_flag: неизвестный флаг «{effect['clear_flag']}»"))
        if "learn_code" in effect and effect["learn_code"] not in refs["codes"]:
            out.append(Finding("E_CODE_MISSING", epath, f"learn_code: неизвестный код «{effect['learn_code']}»"))
        if "redirect" in effect and effect["redirect"] not in refs["scenes"]:
            out.append(Finding("E_SCENE_MISSING", epath, f"redirect: неизвестная сцена «{effect['redirect']}»"))
    return out


def validate_scene(scene_id: str, scene: dict[str, Any], refs: dict[str, set[str]]) -> list[Finding]:
    out: list[Finding] = []
    path = f"scenes.{scene_id}"
    out += validate_effects(scene.get("entry", []), scene_id, f"{path}.entry", refs)
    interaction = scene.get("interaction")
    if scene.get("ending") and interaction:
        out.append(Finding("E_ENDING_INTERACTION", path, "у концовки не должно быть interaction"))
    if scene.get("ending") and scene.get("after"):
        out.append(Finding("E_ENDING_INTERACTION", path, "у концовки не должно быть after"))
    if not scene.get("ending") and not interaction:
        has_redirect = any("redirect" in e for e in (scene.get("entry") or []) if isinstance(e, dict))
        if not has_redirect:
            out.append(Finding("E_DEAD_END", path, "не-концовка без interaction и без redirect"))
    if not isinstance(interaction, dict):
        after = scene.get("after")
        if isinstance(after, dict):
            out += validate_scene(f"{scene_id}.after", {"title": "after", "text": "", "interaction": after}, refs)
        return out
    kind = interaction.get("type")
    ipath = f"{path}.interaction"
    if kind == "choices":
        for index, option in enumerate(interaction.get("options", []) or []):
            opath = f"{ipath}.options[{index}]"
            if option.get("to") not in refs["scenes"]:
                out.append(Finding("E_SCENE_MISSING", opath, f"неизвестная сцена «{option.get('to')}»"))
            if "if" in option:
                out += validate_condition(option["if"], scene_id, f"{opath}.if", refs)
            out += validate_effects(option.get("effects", []), scene_id, f"{opath}.effects", refs)
    elif kind == "continue":
        if interaction.get("to") not in refs["scenes"]:
            out.append(Finding("E_SCENE_MISSING", ipath, f"неизвестная сцена «{interaction.get('to')}»"))
    elif kind == "check":
        for key in ("success", "failure"):
            target = interaction.get("outcomes", {}).get(key)
            if target not in refs["scenes"]:
                out.append(Finding("E_SCENE_MISSING", ipath, f"outcomes.{key}: неизвестная сцена «{target}»"))
        stat_field = interaction.get("stat") or interaction.get("skill")
        if stat_field and stat_field not in refs["stats"]:
            out.append(Finding("E_STAT_MISSING", ipath, f"неизвестный статус «{stat_field}»"))
        formula = str(interaction.get("formula", ""))
        formula_error = check_formula_syntax(formula)
        if formula_error:
            out.append(Finding("E_FORMULA", ipath, formula_error))
        for token in sorted(stats_in_formula(formula)):
            if token not in refs["stats"] and token != "max":
                out.append(Finding("E_STAT_MISSING", ipath, f"в формуле неизвестный статус «{token}»"))
        stat_field = interaction.get("stat") or interaction.get("skill")
        if stat_field and stat_field not in formula:
            out.append(Finding("W_CHECK_FORMULA", ipath, f"в формуле нет поля «{stat_field}»"))
    elif kind == "combat":
        for key in ("victory", "defeat"):
            target = interaction.get("outcomes", {}).get(key)
            if target is None and key == "defeat":
                continue  # общий экран смерти; defeat необязателен
            if target not in refs["scenes"]:
                out.append(Finding("E_SCENE_MISSING", ipath, f"outcomes.{key}: неизвестная сцена «{target}»"))
        for index, enemy in enumerate(interaction.get("enemies", []) or []):
            if not enemy.get("name"):
                out.append(Finding("E_ENEMY", f"{ipath}.enemies[{index}]", "у врага нет name"))
    elif kind == "gamble":
        for key, target in (interaction.get("outcomes") or {}).items():
            if target not in refs["scenes"]:
                out.append(Finding("E_SCENE_MISSING", ipath, f"outcomes.{key}: неизвестная сцена «{target}»"))
        if interaction.get("stat") not in refs["stats"]:
            out.append(Finding("E_STAT_MISSING", ipath, f"неизвестный статус «{interaction.get('stat')}»"))
        stake = interaction.get("stake") or {}
        if stake.get("min", 0) > stake.get("max", 0):
            out.append(Finding("E_STAKE", ipath, "stake.min больше stake.max"))
        if interaction.get("win", 0) < interaction.get("push", 0):
            out.append(Finding("E_GAMBLE", ipath, "win меньше push"))
    elif kind == "shop":
        for index, offer in enumerate(interaction.get("offers", []) or []):
            if offer.get("item") not in refs["items"]:
                out.append(Finding("E_ITEM_MISSING", f"{ipath}.offers[{index}]", f"неизвестный предмет «{offer.get('item')}»"))
        for key, target in (interaction.get("outcomes") or {}).items():
            if target not in refs["scenes"]:
                out.append(Finding("E_SCENE_MISSING", ipath, f"outcomes.{key}: неизвестная сцена «{target}»"))
    elif kind == "attrition":
        if interaction.get("to") and interaction.get("to") not in refs["scenes"]:
            out.append(Finding("E_SCENE_MISSING", ipath, f"неизвестная сцена «{interaction.get('to')}»"))
        for index, option in enumerate(interaction.get("options", []) or []):
            opath = f"{ipath}.options[{index}]"
            if option.get("to") not in refs["scenes"]:
                out.append(Finding("E_SCENE_MISSING", opath, f"неизвестная сцена «{option.get('to')}»"))
            if "if" in option:
                out += validate_condition(option["if"], scene_id, f"{opath}.if", refs)
            out += validate_effects(option.get("effects", []), scene_id, f"{opath}.effects", refs)
        if interaction.get("consume") and interaction.get("consume") not in refs["items"]:
            out.append(Finding("E_ITEM_MISSING", ipath, f"неизвестный предмет «{interaction.get('consume')}»"))
    elif kind == "roll":
        formula = str(interaction.get("formula", ""))
        match = DICE_RE.match(formula.replace("−", "-").strip())
        if not match:
            out.append(Finding("E_FORMULA", ipath, "roll: формула должна иметь вид NdM"))
        else:
            max_value = int(match.group(1)) * int(match.group(2))
            ranges: list[tuple[int, int, str]] = []
            covered: set[int] = set()
            for index, outcome in enumerate(interaction.get("outcomes", []) or []):
                target = outcome.get("to")
                if target not in refs["scenes"]:
                    out.append(Finding("E_SCENE_MISSING", f"{ipath}.outcomes[{index}]", f"неизвестная сцена «{target}»"))
                if "min" not in outcome:
                    out.append(Finding("E_ROLL_RANGE", f"{ipath}.outcomes[{index}]", "у исхода нет min"))
                    continue
                low = int(outcome["min"])
                high = int(outcome.get("max", low))
                if low > high:
                    out.append(Finding("E_ROLL_RANGE", f"{ipath}.outcomes[{index}]", "min больше max"))
                ranges.append((low, high, str(target)))
                for value in range(low, high + 1):
                    if value in covered:
                        out.append(Finding("E_ROLL_OVERLAP", f"{ipath}.outcomes[{index}]", f"значение {value} уже покрыто"))
                    covered.add(value)
            missing = [v for v in range(1, max_value + 1) if v not in covered]
            if missing:
                out.append(Finding("E_ROLL_GAP", ipath, f"не покрыты значения: {missing[:8]}{'…' if len(missing) > 8 else ''}"))
    after = scene.get("after")
    if isinstance(after, dict):
        out += validate_scene(f"{scene_id}.after", {"title": "after", "text": "", "interaction": after}, refs)
    return out


def validate_package(package: dict[str, Any]) -> list[Finding]:
    findings = schema_errors(package)
    if findings:
        return findings
    scenes = package.get("scenes") or {}
    refs = {
        "scenes": set(scenes),
        "stats": set((package.get("stats") or {})),
        "items": set((package.get("items") or {})),
        "flags": set(package.get("flags") or []),
        "codes": set((package.get("codes") or {})),
    }
    if package.get("start") not in refs["scenes"]:
        findings.append(Finding("E_START", "$.start", f"стартовая сцена «{package.get('start')}» не существует"))
    for item_id in (package.get("start_items") or {}):
        if item_id not in refs["items"]:
            findings.append(Finding("E_ITEM_MISSING", "$.start_items", f"неизвестный предмет «{item_id}»"))
    for code_id, code in (package.get("codes") or {}).items():
        base = str(code.get("base") or "")
        offset = int(code.get("offset", 0))
        if not base:
            continue
        if offset == 0 and base in refs["scenes"]:
            continue
        target = str(int(base) + offset) if base.isdigit() else None
        if target not in refs["scenes"]:
            findings.append(Finding("E_CODE_TARGET", f"$.codes.{code_id}", f"цель кода «{base}{offset:+d}» не существует"))
    for scene_id, scene in scenes.items():
        findings += validate_scene(scene_id, scene, refs)

    # статическая достижимость
    graph = {scene_id: collect_edges(scene) for scene_id, scene in scenes.items()}
    reachable: set[str] = set()
    queue = deque([str(package.get("start"))])
    while queue:
        current = queue.popleft()
        if current in reachable or current not in graph:
            continue
        reachable.add(current)
        queue.extend(graph[current])
    unreachable = sorted(set(scenes) - reachable)
    if unreachable:
        findings.append(Finding("W_UNREACHABLE", "$.scenes", f"недостижимые сцены: {', '.join(unreachable[:30])}"))
    endings = {scene_id for scene_id, scene in scenes.items() if scene.get("ending")}
    unreachable_endings = sorted(endings - reachable)
    if unreachable_endings:
        findings.append(Finding("W_UNREACHABLE_ENDING", "$.scenes", f"недостижимые концовки: {', '.join(unreachable_endings[:30])}"))
    if not endings:
        findings.append(Finding("W_NO_ENDINGS", "$.scenes", "в пакете нет концовок"))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Проверка пакета Quest/2")
    parser.add_argument("path", type=Path)
    parser.add_argument("--json", action="store_true", help="машиночитаемый отчёт")
    args = parser.parse_args()
    try:
        package, source = load_package(args.path)
    except Exception as exc:
        print(f"ОШИБКА ЗАГРУЗКИ: {exc}", file=sys.stderr)
        return 2
    findings = validate_package(package)
    if args.json:
        print(json.dumps({"package": str(source), "findings": findings}, ensure_ascii=False, indent=2))
    else:
        print(f"ПАКЕТ: {source}")
        if not findings:
            print("OK: схема и семантические проверки пройдены")
        for finding in findings:
            print(f"{finding['code']} {finding['path']}: {finding['message']}")
    return 1 if any(f["code"].startswith("E_") for f in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
