import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PREBATTLE_ANIMATION_SCALE, preBattleMs } from '../lib/preBattleTiming';

test('prebattle animation is 30% shorter', () => {
  assert.equal(PREBATTLE_ANIMATION_SCALE, 0.7);
  assert.equal(preBattleMs(3900), 2730);
  assert.equal(preBattleMs(300), 210);
  assert.equal(preBattleMs(520), 364);
  assert.equal(preBattleMs(2600), 1820);
});
