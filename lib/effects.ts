import type { ActiveEffect, EffectDef, Game, GameState } from './types';

export type ActiveEffectView = {
  id: string;
  def: EffectDef;
  remaining: number;
  stacks: number;
};

function durationValue(duration: EffectDef['duration']): number {
  if (duration === 'next_combat') return 1;
  const value = Number(duration);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function activeEffectViews(game: Game, state: Pick<GameState, 'effects'>): ActiveEffectView[] {
  return (state.effects ?? []).flatMap((active) => {
    const def = game.effects?.[active.id];
    if (!def || active.remaining <= 0) return [];
    return [{ id: active.id, def, remaining: active.remaining, stacks: Math.max(1, active.stacks ?? 1) }];
  });
}

/** Наложить эффект по правилам, объявленным в книге. */
export function addEffect(
  game: Game,
  effects: ActiveEffect[] | undefined,
  id: string,
): ActiveEffect[] {
  const def = game.effects?.[id];
  if (!def) return effects ?? [];
  const current = [...(effects ?? [])];
  const duration = durationValue(def.duration);
  const index = current.findIndex((item) => item.id === id);
  if (index < 0) return [...current, { id, remaining: duration, stacks: 1 }];

  const existing = current[index];
  const stacking = def.stacking ?? 'refresh';
  if (stacking === 'ignore') return current;
  if (stacking === 'stack') {
    current[index] = {
      ...existing,
      remaining: Math.max(existing.remaining, duration),
      stacks: Math.max(1, existing.stacks) + 1,
    };
    return current;
  }
  current[index] = { ...existing, remaining: Math.max(existing.remaining, duration), stacks: 1 };
  return current;
}

/** Сумма модификаторов активных эффектов для урона игрока. */
export function playerDamageModifier(game: Game, state: Pick<GameState, 'effects'>): number {
  return activeEffectViews(game, state).reduce((sum, effect) => {
    const modifier = Number(effect.def.modifiers?.player_damage ?? 0);
    return sum + (Number.isFinite(modifier) ? modifier * effect.stacks : 0);
  }, 0);
}

/** Списать один бой у эффектов; вернуть новый массив. */
export function expireCombatEffects(effects: ActiveEffect[] | undefined): ActiveEffect[] {
  return (effects ?? []).flatMap((effect) => {
    const remaining = Math.max(0, effect.remaining - 1);
    return remaining > 0 ? [{ ...effect, remaining }] : [];
  });
}

export function effectModifierLabel(effect: ActiveEffectView): string {
  const parts = Object.entries(effect.def.modifiers ?? {})
    .filter(([key, value]) => key === 'player_damage' && Number(value) !== 0)
    .map(([, value]) => {
      const n = Number(value) * effect.stacks;
      return `${n > 0 ? '+' : ''}${n} к урону`;
    });
  if (parts.length > 0) return parts.join(', ');
  return effect.def.description ?? 'временный эффект';
}
