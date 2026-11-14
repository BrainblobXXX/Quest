import type { Game, Scene } from './types';

/**
 * Какой трек/плейлист включать для сцены.
 * - явный music на сцене важнее настроения;
 * - mood без трека — продолжаем текущий трек;
 * - несколько треков на настроение — плейлист, из которого выбирается один.
 */
function tracksOf(game: Game, mood: string | null | undefined): string[] {
  if (!mood) return [];
  const value = game.moods?.[mood];
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((track): track is string => Boolean(track));
  return [value];
}

function pick(tracks: readonly string[]): string | null {
  if (tracks.length === 0) return null;
  return tracks[Math.floor(Math.random() * tracks.length)] ?? null;
}

export function tracksFor(game: Game, scene: Scene): string[] {
  if (scene.music) return [scene.music];
  if (scene.mood) return tracksOf(game, scene.mood);
  return tracksOf(game, game.defaultMood);
}

/** Одиночный трек для обратной совместимости и тестов. */
export function trackFor(game: Game, scene: Scene): string | null {
  return pick(tracksFor(game, scene));
}

/**
 * Плейлист для загрузки/входа в сцену, где mood мог быть намеренно не задан.
 * Продолжаем последний трек из истории посещений, а не включаем тишину.
 */
export function tracksForVisited(
  game: Game,
  scene: Scene,
  visited: readonly string[],
): string[] {
  const direct = tracksFor(game, scene);
  if (direct.length > 0) return direct;
  for (let index = visited.length - 2; index >= 0; index -= 1) {
    const previous = game.scenes[visited[index]];
    const tracks = previous ? tracksFor(game, previous) : [];
    if (tracks.length > 0) return tracks;
  }
  const start = game.scenes[game.start];
  return start ? tracksFor(game, start) : [];
}

/** Одиночный fallback для старых вызовов. */
export function trackForVisited(
  game: Game,
  scene: Scene,
  visited: readonly string[],
): string | null {
  return pick(tracksForVisited(game, scene, visited));
}
