import { rollDie, type Rng } from '@/lib/rng';
import type { CheckDef, Game, GameState } from '@/lib/types';

/** Значение характеристики, к которой относится проверка. */
export function checkValue(state: GameState, check: CheckDef): number {
  const id = check.stat ?? check.skill;
  return Number(id ? state.stats[id] ?? 0 : 0);
}

/** Детерминированная проверка не бросает кубики (RPG/навык). */
export function isDeterministicCheck(game: Game, check: CheckDef): boolean {
  return game.type === 'rpg' || Boolean(check.skill && check.difficulty !== undefined);
}

/** Выражение справа от оператора: число, характеристика, max(...). */
export function evalExpr(expr: string, stats: Record<string, number>): number {
  const tokens = expr.match(/max|[a-z_][a-z0-9_]*|\d+|[()+\-*/]/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function atom(): number {
    const token = next();
    if (token === undefined) return 0;
    if (token === '(') {
      const value = sum();
      if (peek() === ')') next();
      return value;
    }
    if (token.toLowerCase() === 'max') {
      if (peek() === '(') next();
      const a = sum();
      if (peek() === ',') next();
      const b = sum();
      if (peek() === ')') next();
      return Math.max(a, b);
    }
    if (/^\d+$/.test(token)) return Number(token);
    return Number(stats[token] ?? 0);
  }

  function product(): number {
    let value = atom();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const right = atom();
      value = op === '*' ? value * right : right === 0 ? 0 : value / right;
    }
    return value;
  }

  function sum(): number {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = product();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  return sum();
}

function compare(left: number, compare: string | undefined, stats: Record<string, number>): boolean {
  const parsed = compare?.match(/^\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
  if (!parsed) return false;
  const right = evalExpr(parsed[2], stats);
  switch (parsed[1]) {
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '<': return left < right;
    case '!=': return left !== right;
    default: return left === right;
  }
}

export function statTitle(game: Game, id: string | undefined): string {
  if (!id) return 'ПРОВЕРКА';
  return (game.stats?.[id]?.title ?? id).toUpperCase();
}

export function checkLabel(game: Game, check: CheckDef): string {
  if (isDeterministicCheck(game, check)) {
    return check.skill
      ? `${statTitle(game, check.skill)} · СЛОЖНОСТЬ ${check.difficulty}`
      : `${statTitle(game, check.stat)} ${check.compare ?? ''}`;
  }
  return `${statTitle(game, check.stat)} + 2d6 ${check.compare ?? ''}`;
}

export type CheckResolution = {
  success: boolean;
  value: number;
  moraleCost: number;
  total?: number;
  faces?: [number, number];
  right?: number;
};

/** Проверка без броска: сравнение характеристики/навыка со сложностью. */
export function resolveDeterministicCheck(
  game: Game,
  state: GameState,
  check: CheckDef,
  rng: Rng = Math.random,
): CheckResolution {
  const value = checkValue(state, check);
  const parsed = check.compare?.match(/^\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
  let success = false;
  let right: number | undefined;
  if (parsed) {
    right = evalExpr(parsed[2], state.stats);
    success = compare(value, check.compare, state.stats);
  } else if (check.difficulty !== undefined) {
    right = check.difficulty;
    success = value >= check.difficulty;
  }

  let moraleCost = 0;
  if (game.type === 'rpg' && check.skill) {
    const die = rollDie(6, rng);
    moraleCost = Math.max(0, (die - value) * 4);
  }
  return { success, value, moraleCost, ...(right !== undefined ? { right } : {}) };
}

/** Результат уже брошенной 2d6-проверки. */
export function resolveRolledCheck(
  state: GameState,
  check: CheckDef,
  faces: [number, number],
): CheckResolution {
  const value = checkValue(state, check);
  const total = faces[0] + faces[1] + value;
  return {
    success: compare(total, check.compare, state.stats),
    value,
    moraleCost: 0,
    total,
    faces,
  };
}
