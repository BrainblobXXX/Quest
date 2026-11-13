import assert from 'node:assert/strict';
import { test } from 'node:test';
import { skillModifier } from '../lib/effects';
import type { Game, GameState } from '../lib/types';

const game = {
  format: 'quest/2',
  id: 'effects-fixture',
  title: 'Effects',
  start: '1',
  scenes: {},
  effects: {
    smell: {
      title: 'Вонь',
      duration: 'next_combat',
      stacking: 'stack',
      modifiers: { skill: -2 },
    },
  },
} as unknown as Game;

const state = {
  effects: [{ id: 'smell', remaining: 1, stacks: 2 }],
} as Pick<GameState, 'effects'>;

test('effect skill modifiers stack', () => {
  assert.equal(skillModifier(game, state), -4);
});

test('wok shield modifier is shared with duel', async () => {
  const { enemySkillPerRoundModifier } = await import('../lib/effects');
  assert.equal(enemySkillPerRoundModifier(game, state), 0);
});

test('skill multiplier is 1 + modifiers', async () => {
  const { skillMultiplier } = await import('../lib/effects');
  const giant = { ...game, effects: { ...(game.effects ?? {}), giant: { title: 'Рост', duration: 'next_combat' as const, modifiers: { skill_multiplier: 1 } } } } as unknown as Game;
  assert.equal(skillMultiplier(giant, { effects: [{ id: 'giant', remaining: 1, stacks: 1 }] }), 2);
});
