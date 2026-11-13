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

function modifierSum(game: Game, state: Pick<GameState, 'effects'>, key: string): number {
  return activeEffectViews(game, state).reduce((sum, effect) => {
    const modifier = Number(effect.def.modifiers?.[key] ?? 0);
    return sum + (Number.isFinite(modifier) ? modifier * effect.stacks : 0);
  }, 0);
}

/** Сумма модификаторов активных эффектов для урона игрока. */
export function playerDamageModifier(game: Game, state: Pick<GameState, 'effects'>): number {
  return modifierSum(game, state, 'player_damage');
}

/** Сумма модификаторов Мастерства в duel-бою. */
export function skillModifier(game: Game, state: Pick<GameState, 'effects'>): number {
  return modifierSum(game, state, 'skill');
}

/** Снижение Мастерства врага за каждый следующий раунд (щит WOK). */
export function enemySkillPerRoundModifier(game: Game, state: Pick<GameState, 'effects'>): number {
  return modifierSum(game, state, 'enemy_skill_per_round');
}

/** Множитель Мастерства игрока (например, заклинание роста §411). */
export function skillMultiplier(game: Game, state: Pick<GameState, 'effects'>): number {
  const value = 1 + modifierSum(game, state, 'skill_multiplier');
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Списать один бой у эффектов; вернуть новый массив. */
export function expireCombatEffects(effects: ActiveEffect[] | undefined): ActiveEffect[] {
  return (effects ?? []).flatMap((effect) => {
    const remaining = Math.max(0, effect.remaining - 1);
    return remaining > 0 ? [{ ...effect, remaining }] : [];
  });
}

export function effectModifierLabel(effect: ActiveEffectView): string {
  const labels: Record<string, string> = {
    player_damage: 'к урону',
    skill: 'к Мастерству',
    enemy_skill_per_round: 'к Мастерству врага за раунд',
    skill_multiplier: 'к множителю Мастерства',
  };
  const parts = Object.entries(effect.def.modifiers ?? {})
    .filter(([key, value]) => key in labels && Number(value) !== 0)
    .map(([key, value]) => {
      const n = Number(value) * effect.stacks;
      return `${n > 0 ? '+' : ''}${n} ${labels[key]}`;
    });
  if (parts.length > 0) return parts.join(', ');
  return effect.def.description ?? 'временный эффект';
}
