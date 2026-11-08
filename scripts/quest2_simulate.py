#!/usr/bin/env python3
"""Детерминированная симуляция пакета Quest/2.

Это не игровой runtime, а инструмент проверки: он проходит книгу по seed,
применяет эффекты и сообщает об исходах, тупиках и превышении шагов.
"""
from __future__ import annotations
import argparse, json, random, re, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from quest2_validate import load_package  # noqa: E402

TOKEN_RE = re.compile(r"\d+d\d+|\d+|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/<>=!,]")
COMPARE_RE = re.compile(r"^(.*?)(>=|<=|!=|=|>|<)(.*)$")


class SimError(Exception):
    pass


def dice(value: int, faces: int, rng: random.Random) -> int:
    return sum(rng.randint(1, faces) for _ in range(value))


def eval_math(expr: str, stats: dict[str, int], rng: random.Random) -> float:
    tokens = TOKEN_RE.findall(expr.replace("−", "-").replace("–", "-"))
    pos = 0

    def atom() -> float:
        nonlocal pos
        if pos >= len(tokens):
            return 0
        token = tokens[pos]
        if token == "(":
            pos += 1
            value = add()
            if pos < len(tokens) and tokens[pos] == ")":
                pos += 1
            return value
        if token.lower() == "max":
            pos += 1
            if pos < len(tokens) and tokens[pos] == "(":
                pos += 1
            a = add()
            if pos < len(tokens) and tokens[pos] == ",":
                pos += 1
            b = add()
            if pos < len(tokens) and tokens[pos] == ")":
                pos += 1
            return max(a, b)
        pos += 1
        if re.fullmatch(r"\d+d\d+", token, re.I):
            n, m = re.split("d", token, flags=re.I)
            return dice(int(n), int(m), rng)
        if re.fullmatch(r"\d+", token):
            return int(token)
        return float(stats.get(token, 0))

    def mul() -> float:
        nonlocal pos
        value = atom()
        while pos < len(tokens) and tokens[pos] in {"*", "/"}:
            op = tokens[pos]
            pos += 1
            right = atom()
            value = value * right if op == "*" else (value / right if right else 0)
        return value

    def add() -> float:
        nonlocal pos
        value = mul()
        while pos < len(tokens) and tokens[pos] in {"+", "-"}:
            op = tokens[pos]
            pos += 1
            right = mul()
            value = value + right if op == "+" else value - right
        return value

    return add()


def eval_compare(formula: str, stats: dict[str, int], rng: random.Random) -> tuple[bool, float]:
    text = formula.replace("−", "-").replace("–", "-")
    match = COMPARE_RE.match(text)
    if not match:
        raise SimError(f"формула без сравнения: {formula}")
    left = eval_math(match.group(1), stats, rng)
    right = eval_math(match.group(3), stats, rng)
    op = match.group(2)
    ok = {
        ">=": left >= right, "<=": left <= right, ">": left > right,
        "<": left < right, "=": left == right, "!=": left != right,
    }[op]
    return ok, left


def truth(condition: dict | None, state: dict) -> bool:
    if not condition:
        return True
    if "always" in condition:
        return True
    if "all" in condition:
        return all(truth(c, state) for c in condition["all"])
    if "any" in condition:
        return any(truth(c, state) for c in condition["any"])
    if "not" in condition:
        return not truth(condition["not"], state)
    if "has_item" in condition:
        spec = condition["has_item"]
        return state["inventory"].get(spec.get("id"), 0) >= spec.get("count", 1)
    if "flag" in condition:
        return condition["flag"] in state["flags"]
    if "stat" in condition:
        spec = condition["stat"]
        value = state["stats"].get(spec.get("id"), 0)
        return {
            "=": value == spec.get("value"), "!=": value != spec.get("value"),
            "<": value < spec.get("value"), "<=": value <= spec.get("value"),
            ">": value > spec.get("value"), ">=": value >= spec.get("value"),
        }[spec.get("op")]
    if "visited" in condition:
        return condition["visited"] in state["visited"]
    if "known_code" in condition:
        return condition["known_code"] in state["codes"]
    return False


def add_item(state: dict, item: str, count: int = 1) -> None:
    state["inventory"][item] = state["inventory"].get(item, 0) + count


def drop_item(state: dict, item: str, count: int = 1) -> None:
    left = state["inventory"].get(item, 0) - count
    if left > 0:
        state["inventory"][item] = left
    else:
        state["inventory"].pop(item, None)


def apply_effects(package: dict, state: dict, effects: list[dict], rng: random.Random, visited_count: int) -> str | None:
    for effect in effects or []:
        if "if" in effect and not truth(effect["if"], state):
            continue
        if effect.get("once") and visited_count > 1:
            continue
        if "grant" in effect:
            add_item(state, effect["grant"]["item"], effect["grant"].get("count", 1))
        elif "consume" in effect:
            drop_item(state, effect["consume"]["item"], effect["consume"].get("count", 1))
        elif "drop" in effect:
            drop_item(state, effect["drop"]["item"], effect["drop"].get("count", 1))
        elif "modify" in effect:
            effect_modify(package, state, effect["modify"]["stat"], effect["modify"]["delta"])
        elif "set_flag" in effect:
            if effect["set_flag"] not in state["flags"]:
                state["flags"].append(effect["set_flag"])
        elif "clear_flag" in effect:
            if effect["clear_flag"] in state["flags"]:
                state["flags"].remove(effect["clear_flag"])
        elif "learn_code" in effect:
            if effect["learn_code"] not in state["codes"]:
                state["codes"].append(effect["learn_code"])
        elif "drop_best_weapon" in effect:
            best = None
            best_score = -1
            for item_id, count in list(state["inventory"].items()):
                item = package.get("items", {}).get(item_id, {})
                if count <= 0 or item.get("consumable") or not item.get("damage"):
                    continue
                score = average_damage(item["damage"])
                if score > best_score:
                    best, best_score = item_id, score
            if best:
                drop_item(state, best, 1)
        elif "roll" in effect:
            formula = str(effect["roll"].get("formula", ""))
            sign = -1 if formula.strip().startswith("-") else 1
            cleaned = formula.strip().lstrip("+-")
            amount = int(eval_math(cleaned, state["stats"], rng))
            effect_modify(package, state, effect["roll"]["stat"], sign * amount)
        elif "redirect" in effect:
            return effect["redirect"]
    return None


def effect_modify(package: dict, state: dict, stat: str, delta: int) -> None:
    definition = package.get("stats", {}).get(stat, {})
    value = state["stats"].get(stat, definition.get("initial", 0)) + delta
    if "min" in definition:
        value = max(definition["min"], value)
    if "max" in definition:
        value = min(definition["max"], value)
    state["stats"][stat] = value


def average_damage(formula: str) -> float:
    match = re.match(r"^(\d+)d(\d+)([+-]\d+)?$", formula.replace("−", "-").strip(), re.I)
    if not match:
        return 0
    return int(match.group(1)) * (int(match.group(2)) + 1) / 2 + int(match.group(3) or 0)


def enter(package: dict, state: dict, scene_id: str, rng: random.Random, depth: int = 0) -> None:
    if depth > 20:
        raise SimError("слишком глубокая цепочка redirect")
    scene = package["scenes"].get(scene_id)
    if not scene:
        raise SimError(f"нет сцены {scene_id}")
    state["scene"] = scene_id
    state["visited"].append(scene_id)
    state["counts"][scene_id] = state["counts"].get(scene_id, 0) + 1
    target = apply_effects(package, state, scene.get("entry") or [], rng, state["counts"][scene_id])
    if target:
        enter(package, state, target, rng, depth + 1)


def armor(package: dict, state: dict) -> int:
    return max([0] + [int(package.get("items", {}).get(item, {}).get("armor_rating", 0))
                      for item, count in state["inventory"].items() if count > 0])


def weapon(package: dict, state: dict) -> tuple[str, str, int]:
    best = None
    for item_id, count in state["inventory"].items():
        item = package.get("items", {}).get(item_id, {})
        if count > 0 and item.get("damage"):
            score = average_damage(item["damage"])
            if best is None or score > best[0]:
                best = (score, item_id, item["damage"], int(item.get("weapon_rating", 0)))
    if best:
        return best[1], best[2], best[3]
    return "fists", "1d6-3", 0


def combat(package: dict, state: dict, interaction: dict, rng: random.Random) -> str:
    mode = interaction.get("mode")
    enemies = interaction.get("enemies") or []
    options = interaction.get("options") or {}
    resource = "hp" if "hp" in state["stats"] else ("stamina" if "stamina" in state["stats"] else "hp")
    if resource not in state["stats"]:
        state["stats"][resource] = 20
    hp = int(state["stats"][resource])
    weapon_id, damage_formula, weapon_rating = weapon(package, state)
    if mode == "contest":
        enemy = enemies[0]
        enemy_hp = int(enemy.get("health", 1)) * int(enemy.get("count", 1))
        for _ in range(100):
            if hp <= 0:
                state["stats"][resource] = 0
                return "defeat"
            enemy_roll = dice(2, 6, rng)
            enemy_check = enemy_roll + max(state["stats"].get("brains", 0), state["stats"].get("luck", 0)) + armor(package, state)
            if enemy_check >= int(enemy.get("attack", 0)):
                hp -= 1
            if options.get("stop_at_one") and hp <= 1:
                state["stats"][resource] = hp
                return "victory"
            player_roll = dice(2, 6, rng)
            player_check = player_roll + state["stats"].get("muscles", 0) + weapon_rating
            if player_check >= int(enemy.get("defense", 0)):
                enemy_hp -= 1
            if enemy_hp <= 0:
                state["stats"][resource] = hp
                return "victory"
        raise SimError("contest combat не завершился")
    if mode == "pool":
        pool = [int(enemy.get("health", 1)) for enemy in enemies for _ in range(int(enemy.get("count", 1)))]
        for _ in range(100):
            if hp <= 0:
                state["stats"][resource] = 0
                return "defeat"
            damage = int(eval_math(damage_formula, state["stats"], rng))
            remaining = damage
            for index, value in enumerate(pool):
                if value <= 0 or remaining <= 0:
                    continue
                hit = min(value, remaining)
                pool[index] -= hit
                remaining -= hit
            alive = sum(1 for value in pool if value > 0)
            if alive == 0:
                state["stats"][resource] = hp
                return "victory"
            hp = max(0, hp - alive * int(enemies[0].get("attack", 0)))
        raise SimError("pool combat не завершился")
    # rpg: упрощённый d20 + первый боевой навык
    skills = ["small_guns", "energy_weapons", "big_guns", "melee"]
    skill = max((state["stats"].get(s, 0) for s in skills), default=1)
    enemy_list = [dict(enemy, health=int(enemy.get("health", 1)) * int(enemy.get("count", 1))) for enemy in enemies]
    for _ in range(100):
        if hp <= 0:
            state["stats"][resource] = 0
            return "defeat"
        target = next((enemy for enemy in enemy_list if enemy["health"] > 0), None)
        if target is None:
            state["stats"][resource] = hp
            return "victory"
        die = rng.randint(1, 20)
        if die + skill >= int(target.get("defense", 0)):
            target["health"] = max(0, target["health"] - int(eval_math(damage_formula, state["stats"], rng)))
        for enemy in [e for e in enemy_list if e["health"] > 0]:
            took = max(0, int(eval_math(enemy.get("weapon", "0"), state["stats"], rng)) - armor(package, state))
            hp = max(0, hp - took)
            if hp <= 0:
                break
        if hp <= 0:
            state["stats"][resource] = 0
            return "defeat"
    raise SimError("rpg combat не завершился")


def code_target(package: dict, scene_id: str, code: dict) -> str | None:
    base = str(code.get("base") or scene_id)
    offset = int(code.get("offset", 0))
    if offset == 0 and base in package["scenes"]:
        return base
    if not base.isdigit():
        return None
    target = str(int(base) + offset)
    return target if target in package["scenes"] else None



def resolve_after(package: dict, state: dict, after: dict | None, rng: random.Random) -> str | None:
    """Выполнить follow-up интеракцию сцены; вернуть причину остановки, если её нет."""
    if not after:
        return None
    kind = after.get("type")
    if kind == "continue":
        enter(package, state, after["to"], rng)
        return None
    if kind == "choices":
        options = [option for option in after.get("options", []) if truth(option.get("if"), state)]
        if not options:
            return "no-choices"
        option = rng.choice(options)
        apply_effects(package, state, option.get("effects") or [], rng, 1)
        enter(package, state, option["to"], rng)
        return None
    if kind == "check":
        ok, _ = eval_compare(after["formula"], state["stats"], rng)
        enter(package, state, after["outcomes"]["success" if ok else "failure"], rng)
        return None
    if kind == "roll":
        value = int(eval_math(after["formula"], state["stats"], rng))
        for outcome in after.get("outcomes", []):
            low = outcome.get("min", 1)
            high = outcome.get("max", low)
            if low <= value <= high:
                enter(package, state, outcome["to"], rng)
                return None
        return "roll-no-outcome"
    return f"unsupported-after-{kind}"

def simulate(package: dict, rng: random.Random, max_steps: int = 500) -> dict:
    stats = {name: int(defn.get("initial", 0)) for name, defn in (package.get("stats") or {}).items()}
    state = {
        "stats": stats, "inventory": {k: int(v) for k, v in (package.get("start_items") or {}).items()},
        "flags": [], "codes": [], "visited": [], "counts": {}, "scene": str(package["start"]),
        "endings": [],
    }
    enter(package, state, str(package["start"]), rng)
    for step in range(max_steps):
        scene_id = state["scene"]
        scene = package["scenes"][scene_id]
        if scene.get("ending"):
            return {"outcome": "ending", "scene": scene_id, "steps": step, "state": state}
        interaction = scene.get("interaction")
        if not interaction:
            return {"outcome": "no-interaction", "scene": scene_id, "steps": step, "state": state}
        kind = interaction.get("type")
        if kind == "choices":
            options = [option for option in interaction.get("options", []) if truth(option.get("if"), state)]
            if not options:
                return {"outcome": "no-choices", "scene": scene_id, "steps": step, "state": state}
            option = rng.choice(options)
            apply_effects(package, state, option.get("effects") or [], rng, 1)
            enter(package, state, option["to"], rng)
        elif kind == "continue":
            enter(package, state, interaction["to"], rng)
        elif kind == "check":
            ok, _ = eval_compare(interaction["formula"], state["stats"], rng)
            if interaction.get("morale_cost"):
                cost = int(eval_math(interaction["morale_cost"], state["stats"], rng))
                if "morale" in state["stats"]:
                    effect_modify(package, state, "morale", -max(0, cost))
            enter(package, state, interaction["outcomes"]["success" if ok else "failure"], rng)
        elif kind == "combat":
            result = combat(package, state, interaction, rng)
            target = interaction["outcomes"].get("victory" if result == "victory" else "defeat")
            if not target:
                return {"outcome": "death", "scene": scene_id, "steps": step, "state": state}
            enter(package, state, target, rng)
        elif kind == "gamble":
            total = dice(2, 6, rng) + state["stats"].get(interaction["stat"], 0)
            if total >= interaction["win"]:
                key = "win"
            elif total >= interaction["push"]:
                key = "push"
            else:
                key = "lose"
            target = (interaction.get("outcomes") or {}).get(key)
            if target:
                enter(package, state, target, rng)
            else:
                problem = resolve_after(package, state, scene.get("after"), rng)
                if problem:
                    return {"outcome": f"gamble-{key}" if problem is None else problem, "scene": scene_id, "steps": step, "state": state}
        elif kind == "shop":
            for offer in interaction.get("offers", []):
                money = state["stats"].get("money", 0)
                if state["inventory"].get(offer["item"], 0) == 0 and money >= offer["price"]:
                    state["stats"]["money"] = money - offer["price"]
                    add_item(state, offer["item"], 1)
                    break
            target = (interaction.get("outcomes") or {}).get("continue")
            if target:
                enter(package, state, target, rng)
            else:
                problem = resolve_after(package, state, scene.get("after"), rng)
                if problem:
                    return {"outcome": problem, "scene": scene_id, "steps": step, "state": state}
        elif kind == "roll":
            value = int(eval_math(interaction["formula"], state["stats"], rng))
            target = None
            for outcome in interaction.get("outcomes", []):
                low = outcome.get("min", 1)
                high = outcome.get("max", low)
                if low <= value <= high:
                    target = outcome["to"]
                    break
            if not target:
                return {"outcome": "roll-no-outcome", "scene": scene_id, "steps": step, "state": state}
            enter(package, state, target, rng)
        elif kind == "codebook":
            target = None
            for code_id in state["codes"]:
                target = code_target(package, scene_id, package.get("codes", {}).get(code_id, {}))
                if target:
                    break
            if not target:
                return {"outcome": "codebook-no-target", "scene": scene_id, "steps": step, "state": state}
            enter(package, state, target, rng)
        else:
            return {"outcome": f"unsupported-{kind}", "scene": scene_id, "steps": step, "state": state}
    return {"outcome": "max-steps", "scene": state["scene"], "steps": max_steps, "state": state}


def main() -> int:
    parser = argparse.ArgumentParser(description="Симуляция пакета Quest/2")
    parser.add_argument("path", type=Path)
    parser.add_argument("--runs", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-steps", type=int, default=500)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        package, source = load_package(args.path)
    except Exception as exc:
        print(f"ОШИБКА ЗАГРУЗКИ: {exc}", file=sys.stderr)
        return 2
    results = []
    for index in range(max(1, args.runs)):
        rng = random.Random(args.seed + index)
        try:
            result = simulate(package, rng, args.max_steps)
        except SimError as exc:
            result = {"outcome": f"error: {exc}", "scene": None, "steps": None, "state": None}
        results.append(result)
    counts = Counter(result["outcome"] for result in results)
    report = {
        "package": package.get("id"), "source": str(source), "runs": len(results),
        "seed": args.seed, "outcomes": dict(counts),
        "endings": dict(Counter(result["scene"] for result in results if result["outcome"] == "ending")),
        "errors": dict(Counter(result["outcome"] for result in results if str(result["outcome"]).startswith("error"))),
        "samples": [{k: result[k] for k in ("outcome", "scene", "steps")} for result in results[:10]],
    }
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"ПАКЕТ: {source}")
        print(f"Прогонов: {report['runs']} (seed {args.seed})")
        for outcome, count in sorted(counts.items()):
            print(f"  {outcome}: {count}")
    return 1 if any(str(result["outcome"]).startswith("error") or result["outcome"] in {"max-steps", "no-choices", "roll-no-outcome"} for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
