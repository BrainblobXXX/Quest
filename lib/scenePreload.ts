import { itemIconUrl } from './itemIcons';
import { preloadImages, preloadImage } from './preload';
import type { Choice, Game, GameState, Scene } from './types';

function assetUrl(game: Game, path: string): string {
  if (/^(https?:)?\//.test(path)) return path;
  return `/api/games/${encodeURIComponent(game.id)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Все изображения, которые принадлежат самой сцене. */
export function sceneImageSources(game: Game, scene: Scene | undefined): string[] {
  if (!scene) return [];
  return [
    scene.image,
    scene.prop?.image,
  ]
    .filter((path): path is string => Boolean(path))
    .map((path) => assetUrl(game, path));
}

/**
 * Куда можно перейти из текущей сцены. Берём только реальные сцены, чтобы
 * не тянуть лишние файлы.
 */
export function sceneTargetKeys(
  game: Game,
  scene: Scene | undefined,
  choices: readonly Choice[],
): string[] {
  if (!scene) return [];
  const keys = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value) keys.add(value);
  };

  for (const choice of choices) add(choice.goto);
  if (typeof scene.next === 'string') add(scene.next);
  else if (scene.next && typeof scene.next === 'object') {
    for (const outcome of scene.next.outcomes) add(outcome.goto);
  }

  const combat = game.combat?.[scene.key];
  add(combat?.win);
  add(combat?.lose);
  add(combat?.capture);

  const attrition = scene.attrition;
  add(attrition?.next);
  add(attrition?.empty);
  for (const choice of attrition?.choices ?? []) add(choice.goto);

  return [...keys].filter((key) => Boolean(game.scenes[key]));
}

/** Прогреть изображения и иконки предметов сцены. */
export function preloadSceneAssets(game: Game, scene: Scene | undefined): void {
  if (!scene) return;

  void preloadImages(sceneImageSources(game, scene));

  // Иконки текущей сцены и её immediate-переходов: они появятся в «найдено».
  const itemIds = new Set<string>();
  for (const effect of scene.onEnter ?? []) {
    const take = effect.take;
    if (typeof take === 'string') itemIds.add(take);
    else if (Array.isArray(take)) for (const id of take) itemIds.add(id);
    else if (take && typeof take === 'object') for (const id of Object.keys(take)) itemIds.add(id);
  }
  for (const id of itemIds) {
    const icon = itemIconUrl(game, id);
    if (icon) void preloadImage(icon);
  }
}

/** Прогреть текущую сцену и все ближайшие цели выборов. */
export function preloadSceneNeighborhood(
  game: Game,
  state: GameState,
  scene: Scene | undefined,
  choices: readonly Choice[],
): void {
  if (!scene) return;
  const keys = new Set<string>([scene.key, ...sceneTargetKeys(game, scene, choices)]);
  for (const key of keys) preloadSceneAssets(game, game.scenes[key]);
}
