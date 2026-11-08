/**
 * Единственный источник случайности для движка.
 *
 * В обычной игре используется Math.random. Для тестов и симулятора можно
 * передать seed — поведение станет детерминированным.
 */
export type Rng = () => number;

/** mulberry32 — маленький детерминированный PRNG. */
export function createRng(seed?: number): Rng {
  if (seed === undefined) return Math.random;
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDie(faces: number, rng: Rng = Math.random): number {
  return 1 + Math.floor(rng() * Math.max(1, faces));
}

export function roll2d6(rng: Rng = Math.random): { total: number; faces: number[] } {
  const faces2 = [rollDie(6, rng), rollDie(6, rng)];
  return { total: faces2[0] + faces2[1], faces: faces2 };
}

export function parseDice(formula: string | undefined): { count: number; faces: number; bonus: number } | null {
  if (!formula) return null;
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(formula.replace(/[−–]/g, '-').trim());
  if (!match) return null;
  return {
    count: Math.max(1, Number(match[1])),
    faces: Math.max(2, Number(match[2])),
    bonus: Number(match[3] ?? 0),
  };
}

export function rollFormula(
  formula: string | undefined,
  rng: Rng = Math.random,
): { rolls: number[]; bonus: number; total: number; text: string } {
  const parsed = parseDice(formula);
  if (!parsed) return { rolls: [], bonus: 0, total: 0, text: '0' };
  const rolls = Array.from({ length: parsed.count }, () => rollDie(parsed.faces, rng));
  const total = Math.max(0, rolls.reduce((sum, value) => sum + value, 0) + parsed.bonus);
  const bonusText =
    parsed.bonus === 0 ? '' : parsed.bonus > 0 ? ` + ${parsed.bonus}` : ` − ${Math.abs(parsed.bonus)}`;
  return {
    rolls,
    bonus: parsed.bonus,
    total,
    text: `${rolls.join(' + ')}${bonusText} = ${total}`,
  };
}
