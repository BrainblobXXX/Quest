/**
 * Единые боевые тайминги.
 *
 * Раньше мобильная версия ускоряла бой относительно десктопа. Теперь
 * коэффициент общий: и анимация, и звук идут с одинаковой скоростью.
 */
const COMBAT_SPEED = 0.62;

export function combatMs(ms: number): number {
  return Math.max(80, Math.round(ms * COMBAT_SPEED));
}

/** Звук ускоряется тем же коэффициентом, что и боевые паузы. */
export function combatSoundRate(): number {
  return 1 / COMBAT_SPEED;
}
