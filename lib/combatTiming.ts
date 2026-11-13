/**
 * Мобильные боевые тайминги.
 *
 * На узком/сенсорном экране анимации боя воспринимаются медленнее, поэтому
 * сокращаем JS-паузы, не меняя логику раунда. На десктопе значения остаются
 * прежними.
 */
const MOBILE_QUERY = '(max-width: 760px), (hover: none) and (pointer: coarse)';

export function isMobileCombat(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function combatMs(ms: number): number {
  return isMobileCombat() ? Math.max(80, Math.round(ms * 0.62)) : ms;
}
