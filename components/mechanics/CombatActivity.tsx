'use client';

import CombatPanel from '@/components/screens/CombatPanel';
import ContestCombatPanel from '@/components/screens/ContestCombatPanel';
import FalloutCombatPanel from '@/components/screens/FalloutCombatPanel';
import DuelCombatPanel from '@/components/mechanics/DuelCombatPanel';
import type { ActivityRenderProps } from '@/lib/mechanics/types';

export default function CombatActivity({ game, state, activity, handlers, battleMode, visualImage }: ActivityRenderProps) {
  if (activity.type !== 'combat') return null;

  if (activity.mode === 'duel') {
    return (
      <DuelCombatPanel
        game={game}
        state={state}
        combat={activity.combat}
        onWin={handlers.onCombatWin}
        onExit={handlers.onCombatExit}
        onRestart={handlers.onRestart}
        onOutcome={handlers.onCombatOutcome}
        onStaminaChange={handlers.onStaminaChange}
        battleMode={battleMode}
        visualImage={visualImage}
      />
    );
  }

  if (activity.mode === 'contest') {
    return (
      <ContestCombatPanel
        game={game}
        state={state}
        combat={activity.combat}
        onWin={handlers.onCombatWin}
        onExit={handlers.onCombatExit}
        onRestart={handlers.onRestart}
      />
    );
  }

  if (activity.mode === 'rpg') {
    return (
      <FalloutCombatPanel
        game={game}
        state={state}
        combat={activity.combat}
        onWin={handlers.onCombatWin}
        onExit={handlers.onCombatExit}
        onRestart={handlers.onRestart}
      />
    );
  }

  return (
    <CombatPanel
      game={game}
      state={state}
      combat={activity.combat}
      onWin={handlers.onCombatWin}
      onExit={handlers.onCombatExit}
      onRestart={handlers.onRestart}
      onStaminaChange={handlers.onStaminaChange}
      battleMode={battleMode}
      visualImage={visualImage}
    />
  );
}
