'use client';

import CombatActivity from '@/components/mechanics/CombatActivity';
import CheckPanel from '@/components/screens/CheckPanel';
import GamblePanel from '@/components/screens/GamblePanel';
import type {
  ActivityDefinition,
  ActivityRenderProps,
  ActivityType,
} from '@/lib/mechanics/types';

function CheckActivity({ game, state, activity, handlers }: ActivityRenderProps) {
  if (activity.type !== 'check') return null;
  return (
    <CheckPanel
      game={game}
      state={state}
      check={activity.check}
      onResolve={handlers.onCheck}
    />
  );
}

function GambleActivity({ game, state, activity, handlers }: ActivityRenderProps) {
  if (activity.type !== 'gamble') return null;
  return (
    <GamblePanel
      game={game}
      state={state}
      gamble={activity.gamble}
      onDone={handlers.onGamble}
    />
  );
}

export const activityRegistry: Record<ActivityType, ActivityDefinition> = {
  combat: { id: 'combat', render: CombatActivity },
  check: { id: 'check', render: CheckActivity },
  gamble: { id: 'gamble', render: GambleActivity },
};
