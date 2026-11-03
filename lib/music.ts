import type { Game, Scene } from './types';

/**
 * Какой трек включать для сцены.
 * - явный music на сцене важнее настроения;
 * - mood без трека в moods — ошибка сборки, здесь просто ничего не меняем;
 * - несколько треков на настроение выбираются случайно (расширение поверх MVP).
 */
function trackOf(game: Game, mood: string | null | undefined): string | null {
  if (!mood) return null;
  const value = game.moods?.[mood];
  if (!value) return null;
  if (Array.isArray(value)) return value.length ? value[Math.floor(Math.random() * value.length)] : null;
  return value;
}

export function trackFor(game: Game, scene: Scene): string | null {
  if (scene.music) return scene.music;
  return trackOf(game, scene.mood) ?? trackOf(game, game.defaultMood) ?? null;
}
