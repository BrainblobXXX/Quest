'use client';

import { activityRegistry } from '@/components/mechanics/registry';
import { resolveActivity } from '@/lib/mechanics/activity';
import type { ActivityHandlers } from '@/lib/mechanics/types';
import type { CheckDef, CombatDef, Game, GameState, GambleDef } from '@/lib/types';
import type { CombatMode } from '@/lib/combat';

/**
 * Хост активной механики сцены.
 *
 * Приоритет: бой → ставка → проверка. Story/continue/choices остаются
 * в GameScreen до следующего этапа выделения story-механики.
 */
export default function InteractionHost({
  game,
  state,
  check,
  gamble,
  combat,
  combatMode,
  onGamble,
  onCheck,
  onCombatWin,
  onCombatOutcome,
  onCombatExit,
  onRestart,
  onStaminaChange,
}: {
  game: Game;
  state: GameState;
  check?: CheckDef | null;
  gamble?: GambleDef | null;
  combat?: CombatDef | null;
  combatMode?: CombatMode;
  onGamble: (delta: number) => void;
  onCheck: (success: boolean) => void;
  onCombatWin: (result: GameState) => void;
  onCombatOutcome?: (result: GameState, target: string) => void;
  onCombatExit: () => void;
  onRestart: () => void;
  onStaminaChange?: (value: number, max: number) => void;
}) {
  const activity = resolveActivity({ combat, combatMode, gamble, check });

  if (!activity) return null;

  const handlers: ActivityHandlers = {
    onCombatWin,
    ...(onCombatOutcome ? { onCombatOutcome } : {}),
    onCombatExit,
    onRestart,
    onCheck,
    onGamble,
    ...(onStaminaChange ? { onStaminaChange } : {}),
  };

  return <>{activityRegistry[activity.type].render({ game, state, activity, handlers })}</>;
}
