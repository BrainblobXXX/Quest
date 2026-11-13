import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveDuelLuck, resolveDuelRound } from '../lib/mechanics/duel';
import type { Rng } from '../lib/rng';

function rng(values: number[]): Rng {
  let index = 0;
  return () => values[index++] ?? 0;
}

test('duel: player hit reduces enemy health', () => {
  const result = resolveDuelRound({
    stamina: 20, enemyHp: 8, skill: 10, enemySkill: 5,
    playerDamage: 2, enemyDamage: 2,
    rng: rng([0.99, 0.99, 0, 0]),
  });
  assert.equal(result.result, 'hit');
  assert.equal(result.enemyHp, 6);
  assert.equal(result.stamina, 20);
});

test('duel: enemy hit reduces stamina and respects enemy damage', () => {
  const result = resolveDuelRound({
    stamina: 20, enemyHp: 8, skill: 5, enemySkill: 10,
    playerDamage: 2, enemyDamage: 2,
    rng: rng([0, 0, 0.99, 0.99]),
  });
  assert.equal(result.result, 'wound');
  assert.equal(result.stamina, 18);
  assert.equal(result.enemyHp, 8);
});

test('duel: equal totals are parry and deal no damage', () => {
  const result = resolveDuelRound({
    stamina: 20, enemyHp: 8, skill: 5, enemySkill: 5,
    rng: rng([0, 0, 0, 0]),
  });
  assert.equal(result.result, 'parry');
  assert.equal(result.stamina, 20);
  assert.equal(result.enemyHp, 8);
});

test('duel: victory/defeat outcomes', () => {
  const victory = resolveDuelRound({
    stamina: 20, enemyHp: 2, skill: 10, enemySkill: 1,
    rng: rng([0.99, 0.99, 0, 0]),
  });
  assert.equal(victory.outcome, 'victory');
  const defeat = resolveDuelRound({
    stamina: 2, enemyHp: 8, skill: 1, enemySkill: 10,
    enemyDamage: 2,
    rng: rng([0, 0, 0.99, 0.99]),
  });
  assert.equal(defeat.outcome, 'defeat');
});

test('luck check is 2d6 <= luck', () => {
  assert.equal(resolveDuelLuck(7, rng([0, 0])).success, true);
  assert.equal(resolveDuelLuck(7, rng([0.99, 0.99])).success, false);
  assert.equal(resolveDuelLuck(7, rng([0.99, 0.99])).roll, 12);
});

test('enemy phases: manticore is stronger for the first four rounds', async () => {
  const { enemySkillForRound } = await import('../lib/mechanics/duel');
  const enemy = { name: 'Мантикора', attack: 2, skill: 6, health: 18,
    phases: [{ fromRound: 1, toRound: 4, skill: 12 }] };
  assert.equal(enemySkillForRound(enemy, 1, rng([0])), 12);
  assert.equal(enemySkillForRound(enemy, 4, rng([0])), 12);
  assert.equal(enemySkillForRound(enemy, 5, rng([0])), 6);
});

test('enemy phases: even d6 raises troll skill after round four', async () => {
  const { enemySkillForRound } = await import('../lib/mechanics/duel');
  const enemy = { name: 'Тролль', attack: 2, skill: 4, health: 7,
    phases: [{ fromRound: 5, evenSkill: 8 }] };
  assert.equal(enemySkillForRound(enemy, 4, rng([0.99])), 4);
  assert.equal(enemySkillForRound(enemy, 5, rng([0.99])), 8);
  assert.equal(enemySkillForRound(enemy, 5, rng([0])), 4);
});

test('on_hit: manticore poison triggers on 5-6 and has luck damage', async () => {
  const { resolveOnHit } = await import('../lib/mechanics/duel');
  const enemy = { name: 'Мантикора', attack: 2, skill: 12, health: 18,
    onHit: { roll: '1d6', min: 5, damage: 6, luckDamage: 2 } };
  const hit = resolveOnHit(enemy, rng([0.99]));
  assert.equal(hit?.triggered, true);
  assert.equal(hit?.damage, 6);
  assert.equal(hit?.luckDamage, 2);
  const miss = resolveOnHit(enemy, rng([0]));
  assert.equal(miss?.triggered, false);
});
