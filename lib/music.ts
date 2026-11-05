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

  // настроение задано: если трек для него есть — играем, если нет — продолжаем
  // текущий трек. Падать в default_mood здесь нельзя: «mystery» без музыки не
  // должен звучать как «calm».
  if (scene.mood) return trackOf(game, scene.mood);

  // настроения нет вовсе — вот здесь работает запасное
  return trackOf(game, game.defaultMood) ?? null;
}
