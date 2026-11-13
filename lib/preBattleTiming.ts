/**
 * Общий коэффициент длительности предбоевых анимаций.
 * 0.7 — сокращение на 30% относительно прежних значений.
 */
export const PREBATTLE_ANIMATION_SCALE = 0.7;

export function preBattleMs(ms: number): number {
  return Math.round(ms * PREBATTLE_ANIMATION_SCALE);
}
