import type { Game, Scene } from './types';

/**
 * Какой трек включать для сцены.
 * - явный music на сцене важнее настроения;
 * - mood без трека в moods — ошибка сборки, здесь просто ничего не меняем;
 * - несколько треков на настроение выбираются случайно (расширение поверх MVP).
 */
export function trackFor(game: Game, scene: Scene): string | null {
  if (scene.music) return scene.music;
  if (!scene.mood) return null;
  const value = game.moods?.[scene.mood];
  if (!value) return null;
  if (Array.isArray(value)) return value.length ? value[Math.floor(Math.random() * value.length)] : null;
  return value;
}
