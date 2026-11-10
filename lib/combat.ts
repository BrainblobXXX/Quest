import type { CombatDef, CombatEnemy, Game } from './types';
import { roll2d6, rollDie, rollFormula, type Rng } from './rng';

export type CombatMode = 'pool' | 'contest' | 'rpg';

/**
 * Контракт выбора боевого режима.
 *
 * Режим определяется данными боя и типом книги, а не флагами UI:
 * - `contest` — fighting-fantasy с Защитой;
 * - `rpg` — Fallout-подобный бой с Защитой/несколькими врагами;
 * - `pool` — классический пул Здоровья.
 */
export function combatMode(game: Game, combat: CombatDef | undefined): CombatMode {
  if (!combat || combat.enemy.defense === undefined) return 'pool';
  if (game.type === 'fighting-fantasy') return 'contest';
  if (game.type === 'rpg') return 'rpg';
  return 'pool';
}

/** Все враги боя: одиночный enemy или массив enemies. */
export function combatEnemies(combat: CombatDef) {
  return combat.enemies?.length ? combat.enemies : [combat.enemy];
}


export type CombatOutcome = 'round' | 'victory' | 'defeat';

/** Чистое распределение урона по пулу врагов. */
export function applyPoolDamage(enemies: number[], damage: number): { enemies: number[]; killed: number } {
  let remaining = damage;
  let killed = 0;
  const next = [...enemies];
  for (let i = 0; i < next.length && remaining > 0; i += 1) {
    if (next[i] <= 0) continue;
    const hit = Math.min(next[i], remaining);
    next[i] -= hit;
    remaining -= hit;
    if (next[i] <= 0) killed += 1;
  }
  return { enemies: next, killed };
}

export type PoolAttackResult = {
  enemies: number[];
  killed: number;
  after: number;
  victory: boolean;
};

/** Первая фаза раунда: урон игрока и союзников по пулу врагов/порогу. */
export function resolvePoolAttack({
  enemies,
  total,
  threshold,
}: {
  enemies: number[];
  total: number;
  threshold?: number;
}): PoolAttackResult {
  if (threshold !== undefined) {
    if (total >= threshold) {
      return { enemies: enemies.map(() => 0), killed: enemies.length, after: 0, victory: true };
    }
    const after = enemies.filter((hp) => hp > 0).length;
    return { enemies, killed: 0, after, victory: false };
  }
  const damaged = applyPoolDamage(enemies, total);
  const after = damaged.enemies.filter((hp) => hp > 0).length;
  return { enemies: damaged.enemies, killed: damaged.killed, after, victory: after === 0 };
}

/** Вторая фаза раунда: ответный урон выживших врагов. */
export function resolvePoolCounter({
  stamina,
  damage,
}: {
  stamina: number;
  damage: number;
}): { stamina: number; outcome: CombatOutcome } {
  const next = Math.max(0, stamina - Math.max(0, damage));
  return { stamina: next, outcome: next <= 0 ? 'defeat' : 'round' };
}

export function resolvePoolRound({
  stamina,
  enemies,
  enemyAttack,
  total,
  threshold,
}: {
  stamina: number;
  enemies: number[];
  enemyAttack: number;
  total: number;
  threshold?: number;
}): { stamina: number; enemies: number[]; killed: number; after: number; outcome: CombatOutcome } {
  if (threshold !== undefined) {
    if (total >= threshold) {
      return { stamina, enemies: enemies.map(() => 0), killed: enemies.length, after: 0, outcome: 'victory' };
    }
    const nextStamina = Math.max(0, stamina - enemyAttack);
    return {
      stamina: nextStamina,
      enemies,
      killed: 0,
      after: enemies.filter((hp) => hp > 0).length,
      outcome: nextStamina <= 0 ? 'defeat' : 'round',
    };
  }

  const damaged = applyPoolDamage(enemies, total);
  const after = damaged.enemies.filter((hp) => hp > 0).length;
  const nextStamina = Math.max(0, stamina - after * enemyAttack);
  return {
    stamina: nextStamina,
    enemies: damaged.enemies,
    killed: damaged.killed,
    after,
    outcome: after === 0 ? 'victory' : nextStamina <= 0 ? 'defeat' : 'round',
  };
}

export function resolveContestRound({
  hp,
  enemyHp,
  enemyAttack,
  enemyDefense,
  brains,
  luck,
  muscles,
  armor,
  weaponRating,
  stopAtOne,
  enemyFaces: suppliedEnemyFaces,
  playerFaces: suppliedPlayerFaces,
  rng = Math.random,
}: {
  hp: number;
  enemyHp: number;
  enemyAttack: number;
  enemyDefense: number;
  brains: number;
  luck: number;
  muscles: number;
  armor: number;
  weaponRating: number;
  stopAtOne?: boolean;
  enemyFaces?: number[];
  playerFaces?: number[];
  rng?: Rng;
}): {
  hp: number;
  enemyHp: number;
  enemyFaces: number[];
  playerFaces: number[];
  enemyTotal: number;
  playerTotal: number;
  enemyCheck: number;
  playerCheck: number;
  enemyHit: boolean;
  playerHit: boolean;
  outcome: CombatOutcome;
} {
  const enemyRoll = suppliedEnemyFaces ? { faces: suppliedEnemyFaces, total: suppliedEnemyFaces.reduce((a, b) => a + b, 0) } : roll2d6(rng);
  const playerRoll = suppliedPlayerFaces ? { faces: suppliedPlayerFaces, total: suppliedPlayerFaces.reduce((a, b) => a + b, 0) } : roll2d6(rng);
  const enemyCheck = enemyRoll.total + Math.max(brains, luck) + armor;
  const enemyHit = enemyCheck >= enemyAttack;
  let nextHp = enemyHit ? Math.max(0, hp - 1) : hp;
  if (nextHp <= 0) {
    return { hp: 0, enemyHp, enemyFaces: enemyRoll.faces, playerFaces: playerRoll.faces, enemyTotal: enemyRoll.total, playerTotal: playerRoll.total, enemyCheck, playerCheck: 0, enemyHit, playerHit: false, outcome: 'defeat' };
  }
  if (stopAtOne && nextHp <= 1) {
    return { hp: nextHp, enemyHp, enemyFaces: enemyRoll.faces, playerFaces: playerRoll.faces, enemyTotal: enemyRoll.total, playerTotal: playerRoll.total, enemyCheck, playerCheck: 0, enemyHit, playerHit: false, outcome: 'victory' };
  }
  const playerCheck = playerRoll.total + muscles + weaponRating;
  const playerHit = playerCheck >= enemyDefense;
  const nextEnemyHp = playerHit ? Math.max(0, enemyHp - 1) : enemyHp;
  const outcome: CombatOutcome = nextEnemyHp <= 0 || (stopAtOne && nextEnemyHp <= 1) ? 'victory' : 'round';
  return { hp: nextHp, enemyHp: nextEnemyHp, enemyFaces: enemyRoll.faces, playerFaces: playerRoll.faces, enemyTotal: enemyRoll.total, playerTotal: playerRoll.total, enemyCheck, playerCheck, enemyHit, playerHit, outcome };
}

export function resolveRpgRound({
  hp,
  enemies,
  weaponDamage,
  skill,
  armor,
  d20: suppliedD20,
  rng = Math.random,
}: {
  hp: number;
  enemies: CombatEnemy[];
  weaponDamage: string;
  skill: number;
  armor: number;
  d20?: number;
  rng?: Rng;
}): {
  hp: number;
  enemies: CombatEnemy[];
  d20: number;
  target: number;
  hit: boolean;
  damageTotal: number;
  damageText: string;
  enemyAttacks: { name: string; text: string; taken: number }[];
  outcome: CombatOutcome;
} {
  const target = enemies.findIndex((enemy) => enemy.health > 0);
  if (target < 0) {
    return { hp, enemies, d20: 0, target: -1, hit: false, damageTotal: 0, damageText: '0', enemyAttacks: [], outcome: 'victory' };
  }
  const die = suppliedD20 ?? rollDie(20, rng);
  const targetEnemy = enemies[target];
  const check = die + skill;
  const hit = check >= Number(targetEnemy.defense ?? 0);
  let nextEnemies = enemies;
  let damageTotal = 0;
  let damageText = '0';
  if (hit) {
    const damage = rollFormula(weaponDamage, rng);
    damageTotal = damage.total;
    damageText = damage.text;
    nextEnemies = enemies.map((enemy, index) =>
      index === target ? { ...enemy, health: Math.max(0, enemy.health - damage.total) } : enemy,
    );
  }
  const alive = nextEnemies.filter((enemy) => enemy.health > 0);
  if (alive.length === 0) {
    return { hp, enemies: nextEnemies, d20: die, target, hit, damageTotal, damageText, enemyAttacks: [], outcome: 'victory' };
  }
  let nextHp = hp;
  const enemyAttacks: { name: string; text: string; taken: number }[] = [];
  for (const enemy of alive) {
    const damage = rollFormula(enemy.weapon, rng);
    const taken = Math.max(0, damage.total - armor);
    nextHp = Math.max(0, nextHp - taken);
    enemyAttacks.push({ name: enemy.name, text: damage.text, taken });
    if (nextHp <= 0) break;
  }
  return {
    hp: nextHp,
    enemies: nextEnemies,
    d20: die,
    target,
    hit,
    damageTotal,
    damageText,
    enemyAttacks,
    outcome: nextHp <= 0 ? 'defeat' : 'round',
  };
}
