import type { Choice, Game, GameState, ItemDef, Scene } from './types';

export function newState(game: Game): GameState {
  return {
    game: game.id,
    format: game.format,
    scene: game.start,
    inventory: { ...(game.startItems ?? {}) },
    flags: [],
    stats: {},
    visited: [game.start],
    updated: new Date().toISOString(),
  };
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

function useItem(inv: Record<string, number>, id: string, def?: ItemDef) {
  if (!def?.consumable) return;
  const left = (inv[id] ?? 0) - 1;
  if (left > 0) inv[id] = left;
  else delete inv[id];
}

function applyMods(game: Game, state: GameState, choice: Choice): GameState {
  const inventory = { ...state.inventory };
  if (choice.take) {
    if (typeof choice.take === 'string') addItem(inventory, choice.take, 1);
    else for (const [id, n] of Object.entries(choice.take)) addItem(inventory, id, n);
  }
  if (choice.use) useItem(inventory, choice.use, game.items?.[choice.use]);
  if (choice.drop) delete inventory[choice.drop];
  return { ...state, inventory };
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
  return goTo(moved, choice.goto);
}

function goTo(state: GameState, key: string): GameState {
  return {
    ...state,
    scene: key,
    visited: [...state.visited, key],
    updated: new Date().toISOString(),
  };
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

export function advance(game: Game, state: GameState): GameState {
  const scene = sceneOf(game, state);
  if (!scene.next) throw new Error('E_NO_NEXT');
  if (typeof scene.next === 'string') return goTo(state, scene.next);
  const value = roll(scene.next.roll);
  const outcome =
    scene.next.outcomes.find((o) => o.min !== undefined && value >= o.min) ??
    scene.next.outcomes[scene.next.outcomes.length - 1];
  return goTo(state, outcome.goto);
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
