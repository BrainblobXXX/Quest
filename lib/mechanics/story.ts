import { availableChoices, isEnding, sceneOf } from '@/lib/engine';
import type { Choice, Game, GameState, RollOutcome, Scene } from '@/lib/types';

/** Что именно показывает story-слой после сцены. */
export type StorySurface = 'ending' | 'choices' | 'continue' | 'roll' | 'dead-end' | 'none';

export type StoryDice = { roll: string; outcomes: RollOutcome[] };

export type StoryView = {
  surface: StorySurface;
  ending: boolean;
  canReturn: boolean;
  choices: Choice[];
  hasNext: boolean;
  dice: StoryDice | null;
  isCoin: boolean;
  deadEnd: boolean;
  /** Количество выбираемых пунктов для стрелок/Enter. */
  itemCount: number;
};

function nextRoll(scene: Scene): StoryDice | null {
  if (!scene.next || typeof scene.next !== 'object') return null;
  return scene.next;
}

function canReturnFromEnding(scene: Scene, state: GameState, ending: boolean): boolean {
  return (
    ending &&
    state.visited.length > 1 &&
    /Быстрее\s+(?:возвращайся\s+)?туда,\s+откуда/i.test(scene.text)
  );
}

export function findChoiceByLetter(choices: Choice[], letter: string): Choice | undefined {
  return choices.find((choice) => choice.letter === letter);
}

/**
 * Чистая модель story-слоя: что показать и сколько пунктов доступно.
 * Не знает о клавиатуре, DOM и анимациях — это задача UI-адаптера.
 */
export function resolveStory(game: Game, state: GameState, choices?: Choice[]): StoryView {
  const scene = sceneOf(game, state);
  const available = choices ?? availableChoices(game, state);
  const ending = isEnding(game, state);
  const dice = ending ? null : nextRoll(scene);
  const hasNext = Boolean(scene.next);
  const canReturn = canReturnFromEnding(scene, state, ending);
  const isCoin = dice ? /d2$/i.test(dice.roll.trim()) : false;
  const deadEnd = !ending && !dice && available.length === 0 && !hasNext && !scene.codebook;

  let surface: StorySurface;
  if (ending) surface = 'ending';
  else if (dice) surface = 'roll';
  else if (available.length > 0) surface = 'choices';
  else if (hasNext) surface = 'continue';
  else if (scene.codebook) surface = 'none';
  else surface = 'dead-end';

  let itemCount = 0;
  if (ending) itemCount = canReturn ? 2 : 1;
  else if (dice) itemCount = 1;
  else if (available.length > 0) itemCount = available.length;
  else if (hasNext) itemCount = 1;

  return {
    surface,
    ending,
    canReturn,
    choices: available,
    hasNext,
    dice,
    isCoin,
    deadEnd,
    itemCount,
  };
}
