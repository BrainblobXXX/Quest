import { STATE_VERSION, type Choice, type Game, type GameState, type ItemChange, type ItemDef, type Scene, type SceneEffect } from './types';
import { rollDie, type Rng } from './rng';

export function newState(game: Game, rng: Rng = Math.random): GameState {
  const stats: Record<string, number> = {};
  for (const [id, def] of Object.entries(game.stats ?? {})) {
    const initial = Number(def.initial ?? 0);
    stats[id] = Number.isFinite(initial) ? initial : 0;
  }
  const state: GameState = {
    game: game.id,
    format: game.format,
    version: STATE_VERSION,
    rev: game.rev,
    scene: game.start,
    inventory: { ...(game.startItems ?? {}) },
    flags: [],
    knownCodes: [],
    gamblesDone: [],
    stats,
    initialStats: { ...stats },
    visited: [game.start],
    updated: new Date().toISOString(),
  };
  // стартовая сцена тоже может что-то выдавать (game.yaml → on_enter)
  const entered = applyOnEnter(game, state, game.scenes[game.start], rng);
  return { ...entered, itemChanges: inventoryDiff(state.inventory, entered.inventory) };
}

export function sceneOf(game: Game, state: GameState): Scene {
  const scene = game.scenes[state.scene];
  if (!scene) throw new Error(`E_SCENE_MISSING: ${state.scene}`);
  return scene;
}

/** Разница инвентаря: только реально изменившиеся предметы. */
export function inventoryDiff(
  before: Record<string, number>,
  after: Record<string, number>,
  reason?: 'shop',
): ItemChange[] {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...ids]
    .map((id) => ({
      id,
      delta: Number(after[id] ?? 0) - Number(before[id] ?? 0),
      ...(reason ? { reason } : {}),
    }))
    .filter((change) => change.delta !== 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeItemChanges(...groups: Array<ItemChange[] | undefined>): ItemChange[] {
  const totals = new Map<string, { delta: number; shop: number; count: number }>();
  for (const group of groups) {
    for (const change of group ?? []) {
      const current = totals.get(change.id) ?? { delta: 0, shop: 0, count: 0 };
      current.delta += change.delta;
      current.count += 1;
      if (change.reason === 'shop') current.shop += 1;
      totals.set(change.id, current);
    }
  }
  return [...totals.entries()]
    .filter(([, value]) => value.delta !== 0)
    .map(([id, value]) => ({
      id,
      delta: value.delta,
      ...(value.shop === value.count ? { reason: 'shop' as const } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/* ── условия ─────────────────────────────────────────────── */

function tokenize(expr: string): string[] {
  return expr
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function evalCond(expr: string, state: GameState): boolean {
  const tokens = tokenize(expr);
  let i = 0;

  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function primary(): boolean {
    const t = peek();
    if (t === '(') {
      next();
      const v = orExpr();
      if (peek() === ')') next();
      return v;
    }
    const word = next();
    if (word === 'has_item') {
      const id = next();
      const maybeCount = peek();
      const required = maybeCount && /^\d+$/.test(maybeCount) ? Number(next()) : 1;
      return (state.inventory[id] ?? 0) >= required;
    }
    if (word === 'flag') {
      return state.flags.includes(next());
    }
    if (word === 'stat') {
      const id = next();
      const op = next();
      const num = Number(next());
      const v = state.stats[id] ?? 0;
      switch (op) {
        case '=': case '==': return v === num;
        case '!=': return v !== num;
        case '<': return v < num;
        case '<=': return v <= num;
        case '>': return v > num;
        case '>=': return v >= num;
      }
    }
    return false;
  }

  function notExpr(): boolean {
    if (peek() === 'not') { next(); return !notExpr(); }
    return primary();
  }

  function andExpr(): boolean {
    let v = notExpr();
    while (peek() === 'and') { next(); const r = notExpr(); v = v && r; }
    return v;
  }

  function orExpr(): boolean {
    let v = andExpr();
    while (peek() === 'or') { next(); const r = andExpr(); v = v || r; }
    return v;
  }

  try {
    return orExpr();
  } catch {
    return false;
  }
}

/* ── предметы ────────────────────────────────────────────── */

function addItem(inv: Record<string, number>, id: string, n = 1) {
  inv[id] = (inv[id] ?? 0) + n;
}

function addItems(inv: Record<string, number>, value: SceneEffect['take']) {
  if (!value) return;
  if (typeof value === 'string') addItem(inv, value, 1);
  else if (Array.isArray(value)) for (const id of value) addItem(inv, String(id), 1);
  else {
    for (const [id, n] of Object.entries(value)) {
      const count = Number(n);
      if (Number.isFinite(count) && count > 0) addItem(inv, id, count);
    }
  }
}

/** средний урон формулы NdM+B — для выбора «лучшего» оружия */
function damageScore(formula: string | undefined): number {
  if (!formula) return 0;
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(formula.trim());
  if (!match) return 0;
  const dice = Math.max(1, Number(match[1]));
  const faces = Math.max(2, Number(match[2]));
  return dice * ((faces + 1) / 2) + Number(match[3] ?? 0);
}

function dropBestWeapon(inv: Record<string, number>, items: Game['items']) {
  let best: string | null = null;
  let bestScore = -1;
  for (const [id, count] of Object.entries(inv)) {
    if (count <= 0) continue;
    const item = items?.[id];
    if (!item?.damage || item.consumable) continue;
    const score = damageScore(item.damage);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (best) delete inv[best];
}

function dropItems(inv: Record<string, number>, value: SceneEffect['drop'], count = 1) {
  if (!value) return;
  if (typeof value === 'string') {
    const left = (inv[value] ?? 0) - Math.max(1, count);
    if (left > 0) inv[value] = left;
    else delete inv[value];
  } else if (Array.isArray(value)) for (const id of value) delete inv[String(id)];
}

function addFlags(flags: string[], value: string | string[] | undefined): string[] {
  if (!value) return flags;
  const next = new Set(flags);
  const ids = typeof value === 'string' ? [value] : value;
  for (const id of ids) if (id) next.add(String(id));
  return [...next];
}

/** разыгрывает изменения статусов вида { stamina: "-2d6" } */
function applyRollStatDeltas(
  game: Game,
  stats: Record<string, number>,
  values: Record<string, string>,
  rng: Rng,
): Record<string, number> {
  let next = stats;
  for (const [id, formula] of Object.entries(values)) {
    const match = /^([+-]?)(\d+)d(\d+)$/i.exec(formula.trim());
    if (!match) continue;
    const sign = match[1] === '-' ? -1 : 1;
    const dice = Math.max(1, Number(match[2]));
    const faces = Math.max(2, Number(match[3]));
    let sum = 0;
    for (let i = 0; i < dice; i += 1) sum += rollDie(faces, rng);
    next = applyStatDeltas(game, next, { [id]: sign * sum });
  }
  return next;
}

/** применяет изменения характеристик с учётом min/max из stats.yaml */
function applyStatDeltas(
  game: Game,
  current: Record<string, number>,
  deltas: Record<string, number>,
): Record<string, number> {
  const stats = { ...current };
  for (const [id, raw] of Object.entries(deltas)) {
    const delta = Number(raw);
    if (!Number.isFinite(delta)) continue;
    const def = game.stats?.[id];
    let value = (stats[id] ?? Number(def?.initial ?? 0)) + delta;
    const min = Number(def?.min);
    const max = Number(def?.max);
    if (def?.min !== undefined && Number.isFinite(min)) value = Math.max(min, value);
    if (def?.max !== undefined && Number.isFinite(max)) value = Math.min(max, value);
    stats[id] = value;
  }
  return stats;
}

/** применяет on_enter сцены: take/drop предметов, set флагов и stat характеристик */
function applyOnEnter(game: Game, state: GameState, scene?: Scene, rng: Rng = Math.random): GameState {
  if (!scene?.onEnter?.length) return state;
  const inventory = { ...state.inventory };
  let stats = state.stats;
  let flags = state.flags;
  let knownCodes = [...(state.knownCodes ?? [])];
  let goTo: string | null = null;
  const repeatVisit = state.visited.filter((key) => key === scene.key).length > 1;
  for (const effect of scene.onEnter) {
    if (effect.if && !evalCond(effect.if, state)) continue;
    // Предметы выдаются только при первом входе: «если ещё не делали этого».
    // Повторные stat/set/use остаются эффектами сцены.
    if (!repeatVisit) addItems(inventory, effect.take);
    dropItems(inventory, effect.drop, effect.dropCount);
    if (effect.dropBestWeapon) dropBestWeapon(inventory, game.items);
    if (effect.use) useItem(inventory, effect.use, game.items?.[effect.use], effect.useCount);
    flags = addFlags(flags, effect.set);
    if (effect.learn_code && !knownCodes.includes(effect.learn_code)) {
      knownCodes = [...knownCodes, effect.learn_code];
    }
    if (effect.stat) stats = applyStatDeltas(game, stats, effect.stat);
    if (effect.statRoll) stats = applyRollStatDeltas(game, stats, effect.statRoll, rng);
    if (effect.goto && game.scenes[effect.goto]) {
      goTo = effect.goto;
      break;
    }
  }
  const moved = { ...state, inventory, stats, flags, knownCodes };
  if (goTo) {
    return applyOnEnter(game, {
      ...moved,
      scene: goTo,
      visited: [...moved.visited, goTo],
    }, game.scenes[goTo], rng);
  }
  return moved;
}

function useItem(inv: Record<string, number>, id: string, def?: ItemDef, count = 1) {
  if (!def?.consumable) return;
  const left = (inv[id] ?? 0) - Math.max(1, count);
  if (left > 0) inv[id] = left;
  else delete inv[id];
}

function applyMods(game: Game, state: GameState, choice: Choice): GameState {
  const inventory = { ...state.inventory };
  if (choice.take) addItems(inventory, choice.take);
  if (choice.use) useItem(inventory, choice.use, game.items?.[choice.use], choice.useCount);
  if (choice.drop) dropItems(inventory, choice.drop, choice.dropCount);
  const flags = addFlags(state.flags, choice.set);
  const stats = choice.stat ? applyStatDeltas(game, state.stats, choice.stat) : state.stats;
  const knownCodes =
    choice.learn_code && !(state.knownCodes ?? []).includes(choice.learn_code)
      ? [...(state.knownCodes ?? []), choice.learn_code]
      : state.knownCodes;
  return { ...state, inventory, stats, flags, knownCodes };
}

/* ── ходы ────────────────────────────────────────────────── */

export function availableChoices(game: Game, state: GameState): Choice[] {
  const scene = sceneOf(game, state);
  return (scene.choices ?? []).filter((c) => !c.if || evalCond(c.if, state));
}

export function blockedChoices(game: Game, state: GameState): Choice[] {
  const scene = sceneOf(game, state);
  return (scene.choices ?? []).filter((c) => c.if && !evalCond(c.if, state));
}

export function choose(game: Game, state: GameState, choice: Choice, rng: Rng = Math.random): GameState {
  const moved = applyMods(game, state, choice);
  const carry = inventoryDiff(state.inventory, moved.inventory);
  return goToScene(game, moved, choice.goto, rng, carry);
}

/** применяет известный код: target = (base ?? текущая сцена) + offset */
export function useCode(game: Game, state: GameState, id: string, rng: Rng = Math.random): GameState | null {
  const code = game.codes?.[id];
  if (!code) return null;
  const base = code.base ?? state.scene;
  if (!/^\d+$/.test(base)) return null;
  const target = String(Number(base) + code.offset);
  if (!game.scenes[target]) return null;
  return goToScene(game, state, target, rng);
}

export function goToScene(
  game: Game,
  state: GameState,
  key: string,
  rng: Rng = Math.random,
  carry: ItemChange[] = [],
): GameState {
  const before = state.inventory;
  const moved: GameState = {
    ...state,
    scene: key,
    visited: [...state.visited, key],
    updated: new Date().toISOString(),
  };
  const entered = applyOnEnter(game, moved, game.scenes[key], rng);
  return {
    ...entered,
    itemChanges: mergeItemChanges(carry, inventoryDiff(before, entered.inventory)),
  };
}

export function roll(dice: string, rng: Rng = Math.random): number {
  const m = /^(\d+)d(\d+)$/i.exec(dice.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const faces = Number(m[2]);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += rollDie(faces, rng);
  return sum;
}

export function resolveRoll(game: Game, state: GameState, value: number): GameState {
  const scene = sceneOf(game, state);
  if (!scene.next || typeof scene.next === 'string') throw new Error('E_NO_DICE');
  const outcome =
    scene.next.outcomes.find((o) =>
      o.min !== undefined && value >= o.min && (o.max === undefined || value <= o.max),
    ) ?? scene.next.outcomes[scene.next.outcomes.length - 1];
  return goToScene(game, state, outcome.goto);
}

export function advance(game: Game, state: GameState, rng: Rng = Math.random): GameState {
  const scene = sceneOf(game, state);
  if (!scene.next) throw new Error('E_NO_NEXT');
  if (typeof scene.next === 'string') return goToScene(game, state, scene.next);
  return resolveRoll(game, state, roll(scene.next.roll, rng));
}

export function isEnding(game: Game, state: GameState): boolean {
  return Boolean(sceneOf(game, state).ending);
}

export function inventoryLine(game: Game, state: GameState): string {
  return Object.entries(state.inventory)
    .map(([id, n]) => {
      const title = (game.items?.[id]?.title ?? id).toUpperCase();
      return n > 1 ? `${title}×${n}` : title;
    })
    .join(' · ');
}
