import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveActivity } from '../lib/mechanics/activity';
import type { CheckDef, CombatDef, GambleDef } from '../lib/types';

const combat = { scene: '1', enemy: { name: 'X', attack: 1, health: 1 }, win: '2' } as CombatDef;
const gamble = { scene: '1', stat: 'luck', stake: { min: 1, max: 1 }, win: 7, push: 6 } as GambleDef;
const check = { scene: '1', stat: 'luck', compare: '<=', success: '2', failure: '3' } as CheckDef;

test('activity priority: combat > gamble > check', () => {
  assert.equal(resolveActivity({ combat, combatMode: 'contest', gamble, check })?.type, 'combat');
  assert.equal(resolveActivity({ gamble, check })?.type, 'gamble');
  assert.equal(resolveActivity({ check })?.type, 'check');
  assert.equal(resolveActivity({}), null);
});

test('combat activity keeps explicit mode and defaults to pool', () => {
  const duel = resolveActivity({ combat, combatMode: 'contest' });
  assert.equal(duel?.type, 'combat');
  if (duel?.type === 'combat') assert.equal(duel.mode, 'contest');
  const fallback = resolveActivity({ combat });
  if (fallback?.type === 'combat') assert.equal(fallback.mode, 'pool');
});
