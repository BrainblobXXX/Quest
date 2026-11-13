import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAction } from '../lib/actions';
import { newState, goToScene } from '../lib/engine';
import type { Game } from '../lib/types';

const game = {
  format: 'quest/2',
  id: 'encounter-fixture',
  title: 'Encounter',
  start: '339',
  items: { grenade: { title: 'Граната' } },
  scenes: {
    '339': {
      key: '339', title: 'Начало', text: '',
      encounter: { id: 'horde', name: 'Зомби', count: 27, item: 'grenade' },
    },
    '200': {
      key: '200', title: 'Граната', text: '',
      attrition: {
        scene: '200', encounter: 'horde', formula: '2d6+1', consume: 'grenade',
        choices: [
          { label: 'Ещё', goto: '108', letter: 'А' },
          { label: 'Дальше', goto: '17', letter: 'Б' },
        ],
      },
    },
    '108': { key: '108', title: 'Вторая', text: '', next: '17' },
    '17': { key: '17', title: 'Бой', text: '', ending: true },
  },
} as unknown as Game;

test('encounter is initialized on entry and persisted', () => {
  const state = newState(game);
  assert.equal(state.encounters?.horde.count, 27);
  const moved = goToScene(game, state, '200');
  assert.equal(moved.encounters?.horde.count, 27);
  assert.equal(moved.scene, '200');
});

test('attrition subtracts damage and consumes the grenade', () => {
  const state = goToScene(game, newState(game), '200');
  const next = applyAction(game, state, { type: 'attrition', damage: 5 });
  assert.ok(next);
  assert.equal(next.encounters?.horde.count, 22);
  assert.equal(next.inventory.grenade, undefined);
  assert.equal(next.encounters?.horde.history?.[0].damage, 5);
});

test('attrition with next transitions after applying damage', () => {
  const state = goToScene(game, newState(game), '200');
  const withNext = { ...game, scenes: { ...game.scenes, '200': { ...game.scenes['200'], attrition: { ...game.scenes['200'].attrition!, choices: undefined, next: '17' } } } } as unknown as Game;
  const next = applyAction(withNext, state, { type: 'attrition', damage: 6 });
  assert.ok(next);
  assert.equal(next.scene, '17');
  assert.equal(next.encounters?.horde.count, 21);
});
