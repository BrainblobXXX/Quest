import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findChoiceByLetter, resolveStory } from '../lib/mechanics/story';
import type { Game, GameState } from '../lib/types';

const game = {
  format: 'quest/2',
  id: 'story-fixture',
  title: 'Story',
  start: '1',
  scenes: {
    '1': { key: '1', title: 'Выбор', text: 'Выбор.', choices: [
      { label: 'А', goto: '2', letter: 'А' },
      { label: 'Б', goto: '3', letter: 'Б' },
    ] },
    '2': { key: '2', title: 'Далее', text: 'Далее.', next: '3' },
    '3': { key: '3', title: 'Конец', text: 'Конец.', ending: true },
    '4': { key: '4', title: 'Бросок', text: 'Бросок.', next: { roll: '1d6', outcomes: [{ min: 1, max: 6, goto: '3' }] } },
    '5': { key: '5', title: 'Монета', text: 'Монета.', next: { roll: 'd2', outcomes: [{ min: 1, max: 2, goto: '3' }] } },
    '6': { key: '6', title: 'Тупик', text: 'Тупик.' },
    '7': { key: '7', title: 'Возврат', text: 'Быстрее возвращайся туда, откуда пришёл.', ending: true },
  },
} as unknown as Game;

function state(scene: string, visited = ['1']): GameState {
  return { game: game.id, format: game.format, scene, inventory: {}, flags: [], stats: {}, visited, updated: '' } as GameState;
}

test('story surface: choices, continue, ending, roll, dead-end', () => {
  assert.equal(resolveStory(game, state('1')).surface, 'choices');
  assert.equal(resolveStory(game, state('1')).itemCount, 2);
  assert.equal(resolveStory(game, state('2')).surface, 'continue');
  assert.equal(resolveStory(game, state('3')).surface, 'ending');
  assert.equal(resolveStory(game, state('4')).surface, 'roll');
  assert.equal(resolveStory(game, state('4')).isCoin, false);
  assert.equal(resolveStory(game, state('5')).isCoin, true);
  assert.equal(resolveStory(game, state('6')).surface, 'dead-end');
  assert.equal(resolveStory(game, state('6')).deadEnd, true);
});

test('ending return requires the return phrase and visited history', () => {
  assert.equal(resolveStory(game, state('7', ['1', '7'])).canReturn, true);
  assert.equal(resolveStory(game, state('7', ['7'])).canReturn, false);
  assert.equal(resolveStory(game, state('3', ['1', '3'])).canReturn, false);
});

test('choice letter lookup is shared', () => {
  const view = resolveStory(game, state('1'));
  assert.equal(findChoiceByLetter(view.choices, 'Б')?.goto, '3');
  assert.equal(findChoiceByLetter(view.choices, 'В'), undefined);
});
