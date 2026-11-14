import type { ReactNode } from 'react';
import type { CheckDef, CombatDef, Game, GameState, GambleDef } from '@/lib/types';
import type { CombatMode } from '@/lib/combat';

/** Механика, которая может выполняться внутри сцены. */
export type ActivityType = 'combat' | 'check' | 'gamble';

export type CombatActivity = {
  type: 'combat';
  combat: CombatDef;
  mode: CombatMode;
};

export type CheckActivity = {
  type: 'check';
  check: CheckDef;
};

export type GambleActivity = {
  type: 'gamble';
  gamble: GambleDef;
};

export type Activity = CombatActivity | CheckActivity | GambleActivity;

/** Колбэки, через которые механика сообщает ядру о завершении/изменении. */
export type ActivityHandlers = {
  onCombatWin: (result: GameState) => void;
  /** альтернативный исход боя: пощада, отступление */
  onCombatOutcome?: (result: GameState, target: string) => void;
  onCombatExit: () => void;
  onRestart: () => void;
  onCheck: (success: boolean) => void;
  onGamble: (delta: number) => void;
  onStaminaChange?: (value: number, max: number) => void;
};

export type ActivityRenderProps = {
  game: Game;
  state: GameState;
  activity: Activity;
  handlers: ActivityHandlers;
  /** Боевой режим: можно показывать плейсхолдеры вместо отсутствующих анимаций. */
  battleMode?: boolean;
  /** Иллюстрация текущей сцены для статичного портрета в плейсхолдере. */
  visualImage?: string | null;
};

/**
 * Контракт механики.
 *
 * Сейчас render — переходный этап: компоненты ещё владеют своим локальным
 * состоянием. Следующие шаги вынесут reducer/state в механику, не меняя
 * внешний контракт Activity.
 */
export type ActivityDefinition = {
  id: ActivityType;
  render: (props: ActivityRenderProps) => ReactNode;
};
