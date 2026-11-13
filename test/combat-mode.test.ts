import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combatMode } from '../lib/combat';
import type { CombatDef, CombatEnemy, Game } from '../lib/types';

const enemy = { name: 'X', attack: 1, health: 1 } as CombatEnemy;
const base = { scene: '1', enemy, win: '2' } as CombatDef;
const game = { format: 'quest/2', id: 'mode-fixture', title: 'Mode', type: 'fighting-fantasy', start: '1', scenes: {} } as unknown as Game;

test('explicit mode wins over type/defense heuristics', () => {
  assert.equal(combatMode(game, { ...base, mode: 'pool', enemy: { ...enemy, defense: 10 } }), 'pool');
  assert.equal(combatMode(game, { ...base, mode: 'contest', enemy: { ...enemy, defense: 10 } }), 'contest');
  assert.equal(combatMode(game, { ...base, mode: 'rpg' }), 'rpg');
});

test('mode falls back to the previous heuristics', () => {
  assert.equal(combatMode(game, base), 'pool');
  assert.equal(combatMode(game, { ...base, enemy: { ...enemy, defense: 10 } }), 'contest');
  assert.equal(combatMode({ ...game, type: 'rpg' }, { ...base, enemy: { ...enemy, defense: 10 } }), 'rpg');
});
