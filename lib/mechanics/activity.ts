import type { CheckDef, CombatDef, GambleDef } from '@/lib/types';
import type { CombatMode } from '@/lib/combat';
import type { Activity } from './types';

/**
 * Приоритет активностей сцены. Совпадает с прежним InteractionHost:
 * бой → ставка → проверка. Story/continue/choices пока остаются в GameScreen.
 */
export function resolveActivity(input: {
  combat?: CombatDef | null;
  combatMode?: CombatMode;
  gamble?: GambleDef | null;
  check?: CheckDef | null;
}): Activity | null {
  if (input.combat) {
    return { type: 'combat', combat: input.combat, mode: input.combatMode ?? 'pool' };
  }
  if (input.gamble) return { type: 'gamble', gamble: input.gamble };
  if (input.check) return { type: 'check', check: input.check };
  return null;
}
