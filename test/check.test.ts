import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkValue,
  checkLabel,
  evalExpr,
  isDeterministicCheck,
  resolveDeterministicCheck,
  resolveRolledCheck,
} from '../lib/mechanics/check';
import type { CheckDef, Game, GameState } from '../lib/types';

const game = { format: 'quest/2', id: 'check-fixture', title: 'Check', type: 'fighting-fantasy', start: '1', scenes: { '1': { text: '' } } } as unknown as Game;
const rpgGame = { ...game, type: 'rpg' } as unknown as Game;
const state = {
  game: 'check-fixture', format: 'quest/2', scene: '1', inventory: {}, flags: [],
  stats: { luck: 7, skill: 5 }, visited: ['1'], updated: '',
} as GameState;

const randomCheck: CheckDef = { scene: '1', stat: 'luck', compare: '>= 9', success: '2', failure: '3' };

test('evalExpr handles stats and arithmetic', () => {
  assert.equal(evalExpr('luck + 2', state.stats), 9);
  assert.equal(evalExpr('max(luck, skill) * 2', state.stats), 14);
});

test('rolled check adds both dice and the stat', () => {
  assert.equal(checkValue(state, randomCheck), 7);
  const result = resolveRolledCheck(state, randomCheck, [1, 1]);
  assert.equal(result.total, 9);
  assert.equal(result.success, true);
  assert.equal(resolveRolledCheck(state, randomCheck, [1, 0]).success, false);
});

test('deterministic skill check compares the stat with difficulty', () => {
  const check: CheckDef = { scene: '1', skill: 'skill', difficulty: 5, success: '2', failure: '3' };
  assert.equal(isDeterministicCheck(game, check), true);
  assert.equal(resolveDeterministicCheck(game, state, check).success, true);
  assert.equal(resolveDeterministicCheck(game, state, { ...check, difficulty: 6 }).success, false);
});

test('rpg morale cost is part of the pure result', () => {
  const check: CheckDef = { scene: '1', skill: 'skill', difficulty: 5, success: '2', failure: '3' };
  const result = resolveDeterministicCheck(rpgGame, state, check, () => 0.99);
  assert.equal(result.success, true);
  assert.equal(result.moraleCost, 4);
});

test('label distinguishes deterministic and rolled checks', () => {
  assert.match(checkLabel(game, randomCheck), /LUCK \+ 2d6/);
  assert.match(checkLabel(game, { scene: '1', skill: 'skill', difficulty: 5, success: '2', failure: '3' }), /СЛОЖНОСТЬ 5/);
});
