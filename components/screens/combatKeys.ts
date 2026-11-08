/** Латинские хоткеи боевых действий: A, B, C, D… */
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function combatKey(index: number): string {
  return KEYS[index] ?? '?';
}

export function combatKeyIndex(key: string): number {
  return KEYS.indexOf(key.toUpperCase());
}
