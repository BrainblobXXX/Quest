import { roll2d6, rollDie, rollFormula, type Rng } from '@/lib/rng';
import type { CombatEnemy } from '@/lib/types';

export type DuelRoundResult = 'hit' | 'wound' | 'parry';

export type DuelRound = {
  playerFaces: number[];
  enemyFaces: number[];
  playerTotal: number;
  enemyTotal: number;
  result: DuelRoundResult;
  stamina: number;
  enemyHp: number;
  outcome: 'round' | 'victory' | 'defeat';
};

/**
 * FF-раунд: оба бросают 2d6 + Мастерство. Проигравший теряет урон.
 * Парирование не меняет здоровье.
 */
export function resolveDuelRound({
  stamina,
  enemyHp,
  skill,
  enemySkill,
  playerDamage = 2,
  enemyDamage = 2,
  rng = Math.random,
}: {
  stamina: number;
  enemyHp: number;
  skill: number;
  enemySkill: number;
  playerDamage?: number;
  enemyDamage?: number;
  rng?: Rng;
}): DuelRound {
  const player = roll2d6(rng);
  const enemy = roll2d6(rng);
  const playerTotal = player.total + skill;
  const enemyTotal = enemy.total + enemySkill;
  let nextStamina = stamina;
  let nextEnemyHp = enemyHp;
  let result: DuelRoundResult = 'parry';

  if (playerTotal > enemyTotal) {
    nextEnemyHp = Math.max(0, enemyHp - Math.max(0, playerDamage));
    result = 'hit';
  } else if (enemyTotal > playerTotal) {
    nextStamina = Math.max(0, stamina - Math.max(0, enemyDamage));
    result = 'wound';
  }

  return {
    playerFaces: player.faces,
    enemyFaces: enemy.faces,
    playerTotal,
    enemyTotal,
    result,
    stamina: nextStamina,
    enemyHp: nextEnemyHp,
    outcome: nextEnemyHp <= 0 ? 'victory' : nextStamina <= 0 ? 'defeat' : 'round',
  };
}

/**
 * Мастерство врага на конкретный раунд.
 *
 * `phases` применяются по порядку; последняя подходящая фаза побеждает.
 * `evenSkill` бросает d6 только в раундах своей фазы.
 */
export function enemySkillForRound(enemy: CombatEnemy, round: number, rng: Rng = Math.random): number {
  let skill = Number(enemy.skill ?? enemy.attack ?? 0);
  for (const phase of enemy.phases ?? []) {
    const from = phase.fromRound ?? 1;
    const to = phase.toRound ?? Number.POSITIVE_INFINITY;
    if (round < from || round > to) continue;
    if (phase.skill !== undefined) skill = phase.skill;
    if (phase.evenSkill !== undefined && rollDie(6, rng) % 2 === 0) skill = phase.evenSkill;
  }
  return skill;
}

export type OnHitResult = {
  roll: number;
  triggered: boolean;
  damage: number;
  luckDamage: number;
};

/** Особый эффект при ранении игрока: яд мантикоры и аналоги. */
export function resolveOnHit(enemy: CombatEnemy, rng: Rng = Math.random): OnHitResult | null {
  if (!enemy.onHit) return null;
  const rolled = rollFormula(enemy.onHit.roll ?? '1d6', rng);
  const roll = rolled.total;
  const from = enemy.onHit.min ?? 5;
  return {
    roll,
    triggered: roll >= from,
    damage: Math.max(0, enemy.onHit.damage ?? 6),
    luckDamage: Math.max(0, enemy.onHit.luckDamage ?? 2),
  };
}

export type LuckResult = { roll: number; success: boolean };

/** Проверка Удачи: 2d6 <= текущая Удача. */
export function resolveDuelLuck(luck: number, rng: Rng = Math.random): LuckResult {
  const dice = roll2d6(rng);
  return { roll: dice.total, success: dice.total <= luck };
}
