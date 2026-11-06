import type { Choice, Game, GameState, ItemDef, Scene, SceneEffect } from './types';

export function newState(game: Game): GameState {
  const stats: Record<string, number> = {};
  for (const [id, def] of Object.entries(game.stats ?? {})) {
    const initial = Number(def.initial ?? 0);
    stats[id] = Number.isFinite(initial) ? initial : 0;
  }
  const state: GameState = {
    game: game.id,
    format: game.format,
    rev: game.rev,
    scene: game.start,
    inventory: { ...(game.startItems ?? {}) },
    flags: [],
    stats,
    visited: [game.start],
    updated: new Date().toISOString(),
  };
  // стартовая сцена тоже может что-то выдавать (game.yaml → on_enter)
  return applyOnEnter(game, state, game.scenes[game.start]);
}

export function sceneOf(game: Game, state: GameState): Scene {
  const scene = game.scenes[state.scene];
  if (!scene) throw new Error(`E_SCENE_MISSING: ${state.scene}`);
  return scene;
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
      return (state.inventory[id] ?? 0) > 0;
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

function dropItems(inv: Record<string, number>, value: SceneEffect['drop']) {
  if (!value) return;
  if (typeof value === 'string') delete inv[value];
  else if (Array.isArray(value)) for (const id of value) delete inv[String(id)];
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

/** применяет on_enter сцены: take/drop предметов и stat характеристик */
function applyOnEnter(game: Game, state: GameState, scene?: Scene): GameState {
  if (!scene?.onEnter?.length) return state;
  const inventory = { ...state.inventory };
  let stats = state.stats;
  for (const effect of scene.onEnter) {
    addItems(inventory, effect.take);
    dropItems(inventory, effect.drop);
    if (effect.stat) stats = applyStatDeltas(game, stats, effect.stat);
  }
  return { ...state, inventory, stats };
}

function useItem(inv: Record<string, number>, id: string, def?: ItemDef) {
  if (!def?.consumable) return;
  const left = (inv[id] ?? 0) - 1;
  if (left > 0) inv[id] = left;
  else delete inv[id];
}

function applyMods(game: Game, state: GameState, choice: Choice): GameState {
  const inventory = { ...state.inventory };
  if (choice.take) addItems(inventory, choice.take);
  if (choice.use) useItem(inventory, choice.use, game.items?.[choice.use]);
  if (choice.drop) delete inventory[choice.drop];
  const stats = choice.stat ? applyStatDeltas(game, state.stats, choice.stat) : state.stats;
  return { ...state, inventory, stats };
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

export function choose(game: Game, state: GameState, choice: Choice): GameState {
  const moved = applyMods(game, state, choice);
  return goTo(game, moved, choice.goto);
}

function goTo(game: Game, state: GameState, key: string): GameState {
  const moved: GameState = {
    ...state,
    scene: key,
    visited: [...state.visited, key],
    updated: new Date().toISOString(),
  };
  return applyOnEnter(game, moved, game.scenes[key]);
}

export function roll(dice: string): number {
  const m = /^(\d+)d(\d+)$/i.exec(dice.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const faces = Number(m[2]);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += 1 + Math.floor(Math.random() * faces);
  return sum;
}

export function resolveRoll(game: Game, state: GameState, value: number): GameState {
  const scene = sceneOf(game, state);
  if (!scene.next || typeof scene.next === 'string') throw new Error('E_NO_DICE');
  const outcome =
    scene.next.outcomes.find((o) => o.min !== undefined && value >= o.min) ??
    scene.next.outcomes[scene.next.outcomes.length - 1];
  return goTo(game, state, outcome.goto);
}

export function advance(game: Game, state: GameState): GameState {
  const scene = sceneOf(game, state);
  if (!scene.next) throw new Error('E_NO_NEXT');
  if (typeof scene.next === 'string') return goTo(game, state, scene.next);
  return resolveRoll(game, state, roll(scene.next.roll));
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
