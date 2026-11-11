'use client';

import CombatPanel from '@/components/screens/CombatPanel';
import CheckPanel from '@/components/screens/CheckPanel';
import ContestCombatPanel from '@/components/screens/ContestCombatPanel';
import FalloutCombatPanel from '@/components/screens/FalloutCombatPanel';
import GamblePanel from '@/components/screens/GamblePanel';
import type { CheckDef, CombatDef, GambleDef, Game, GameState } from '@/lib/types';
import type { CombatMode } from '@/lib/combat';

/**
 * Единственная точка выбора интерактивного блока сцены.
 *
 * Приоритет фиксирован и совпадает с ARCHITECTURE.md:
 * бой → проверка → ставка. Магазин и нижние действия сцены остаются в
 * GameScreen, потому что это не внутрисценовая интеракция.
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
  onCombatExit: () => void;
  onRestart: () => void;
  onStaminaChange?: (value: number) => void;
}) {
  if (combat) {
    if (combatMode === 'contest') {
      return (
        <ContestCombatPanel
          game={game}
          state={state}
          combat={combat}
          onWin={onCombatWin}
          onExit={onCombatExit}
          onRestart={onRestart}
        />
      );
    }
    if (combatMode === 'rpg') {
      return (
        <FalloutCombatPanel
          game={game}
          state={state}
          combat={combat}
          onWin={onCombatWin}
          onExit={onCombatExit}
          onRestart={onRestart}
        />
      );
    }
    return (
      <CombatPanel
        game={game}
        state={state}
        combat={combat}
        onWin={onCombatWin}
        onExit={onCombatExit}
        onRestart={onRestart}
        onStaminaChange={onStaminaChange}
      />
    );
  }

  if (gamble) {
    return <GamblePanel game={game} state={state} gamble={gamble} onDone={onGamble} />;
  }

  if (check) {
    return <CheckPanel game={game} state={state} check={check} onResolve={onCheck} />;
  }

  return null;
}
