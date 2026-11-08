/**
 * Одноразовый конвертер games/<id>/ quest/1 → quest/2.
 *
 * Не адаптер: результат кладётся в games/<id>/quest2.yaml, исходный quest/1
 * не меняется. Книга проходит schema/semantic validator после конвертации.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { parsePackage } from '../lib/parse';
import type { Choice, CombatDef, Game, Scene, SceneEffect } from '../lib/types';

type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { has_item: { id: string; count?: number } }
  | { flag: string }
  | { stat: { id: string; op: string; value: number } }
  | { visited: string }
  | { known_code: string }
  | { always: true };

type Effect =
  | { grant: { item: string; count?: number }; once?: boolean; if?: Condition }
  | { consume: { item: string; count?: number }; if?: Condition }
  | { drop: { item: string; count?: number }; if?: Condition }
  | { modify: { stat: string; delta: number }; if?: Condition }
  | { set_flag: string; if?: Condition }
  | { clear_flag: string; if?: Condition }
  | { learn_code: string; if?: Condition }
  | { drop_best_weapon: true; if?: Condition }
  | { roll: { stat: string; formula: string }; if?: Condition }
  | { redirect: string; if?: Condition };

type Interaction = Record<string, unknown> & { type: string };
type Quest2Scene = Record<string, unknown> & { title: string; text: string };

const COND_TOKEN = /\s*(\(|\)|>=|<=|!=|=|>|<|[A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*/g;

function conditionTokens(input: string): string[] {
  const out: string[] = [];
  let last = 0;
  for (const match of input.matchAll(COND_TOKEN)) {
    if (match.index !== last && input.slice(last, match.index).trim()) {
      throw new Error(`не разобрано условие: ${input}`);
    }
    out.push(match[1]);
    last = match.index! + match[0].length;
  }
  if (input.slice(last).trim()) throw new Error(`не разобрано условие: ${input}`);
  return out;
}

function parseCondition(input: string): Condition {
  const tokens = conditionTokens(input.replace(/−/g, '-'));
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const parseOr = (): Condition => {
    let left = parseAnd();
    while (peek() === 'or') {
      take();
      left = { any: [left, parseAnd()] };
    }
    return left;
  };
  const parseAnd = (): Condition => {
    let left = parseUnary();
    while (peek() === 'and') {
      take();
      left = { all: [left, parseUnary()] };
    }
    return left;
  };
  const parseUnary = (): Condition => {
    if (peek() === 'not') {
      take();
      return { not: parseUnary() };
    }
    if (peek() === '(') {
      take();
      const value = parseOr();
      if (take() !== ')') throw new Error(`нет ) в условии: ${input}`);
      return value;
    }
    const word = take();
    if (word === 'has_item') return { has_item: { id: take() } };
    if (word === 'flag') return { flag: take() };
    if (word === 'stat') {
      const id = take();
      const op = take();
      const raw = take();
      const value = Number(raw);
      if (!id || !op || !Number.isFinite(value)) throw new Error(`плохой stat в условии: ${input}`);
      return { stat: { id, op, value } };
    }
    if (word === 'always') return { always: true };
    throw new Error(`неизвестный терм «${word}» в условии: ${input}`);
  };
  const result = parseOr();
  if (pos !== tokens.length) throw new Error(`лишние токены в условии: ${input}`);
  return result;
}

function addMany<T>(out: T[], values: T[]) {
  out.push(...values);
}

function asItems(value: unknown): Array<[string, number]> {
  if (!value) return [];
  if (typeof value === 'string') return [[value, 1]];
  if (Array.isArray(value)) return value.map((item) => [String(item), 1]);
  return Object.entries(value as Record<string, unknown>)
    .map(([id, count]) => [id, Number(count)] as [string, number])
    .filter(([, count]) => Number.isFinite(count) && count > 0);
}

function convertEffects(effects: SceneEffect[] | undefined): Effect[] {
  const out: Effect[] = [];
  for (const effect of effects ?? []) {
    const condition = effect.if ? parseCondition(effect.if) : undefined;
    const withIf = <T extends Record<string, unknown>>(value: T): T & { if?: Condition } =>
      condition ? { ...value, if: condition } : value;
    if (effect.take) {
      for (const [item, count] of asItems(effect.take)) {
        out.push(withIf({ grant: { item, count }, once: true }));
      }
    }
    if (effect.drop) {
      for (const [item, count] of asItems(effect.drop)) out.push(withIf({ drop: { item, count } }));
    }
    if (effect.use) out.push(withIf({ consume: { item: effect.use } }));
    if (effect.set) {
      for (const flag of Array.isArray(effect.set) ? effect.set : [effect.set]) {
        out.push(withIf({ set_flag: flag }));
      }
    }
    if (effect.stat) {
      for (const [stat, delta] of Object.entries(effect.stat)) {
        out.push(withIf({ modify: { stat, delta } }));
      }
    }
    if (effect.statRoll) {
      for (const [stat, formula] of Object.entries(effect.statRoll)) {
        out.push(withIf({ roll: { stat, formula } }));
      }
    }
    if (effect.learn_code) out.push(withIf({ learn_code: effect.learn_code }));
    if (effect.dropBestWeapon) out.push(withIf({ drop_best_weapon: true }));
    if (effect.goto) out.push(withIf({ redirect: effect.goto }));
  }
  return out;
}

function choiceEffects(choice: Choice): Effect[] {
  const out: Effect[] = [];
  if (choice.take) for (const [item, count] of asItems(choice.take)) out.push({ grant: { item, count } });
  if (choice.use) out.push({ consume: { item: choice.use } });
  if (choice.drop) out.push({ drop: { item: choice.drop } });
  if (choice.set) for (const flag of Array.isArray(choice.set) ? choice.set : [choice.set]) out.push({ set_flag: flag });
  if (choice.stat) for (const [stat, delta] of Object.entries(choice.stat)) out.push({ modify: { stat, delta } });
  if (choice.learn_code) out.push({ learn_code: choice.learn_code });
  return out;
}

function choicesInteraction(choices: Choice[]): Interaction {
  return {
    type: 'choices',
    options: choices.map((choice) => ({
      label: choice.label,
      to: choice.goto,
      ...(choice.letter ? { letter: choice.letter } : {}),
      ...(choice.if ? { if: parseCondition(choice.if) } : {}),
      ...(choiceEffects(choice).length ? { effects: choiceEffects(choice) } : {}),
    })),
  };
}

function combatOutcomes(combat: CombatDef): Record<string, string> {
  const outcomes: Record<string, string> = { victory: combat.win };
  if (combat.lose) outcomes.defeat = combat.lose;
  return outcomes;
}

function combatInteraction(game: Game, combat: CombatDef): Interaction {
  const mode =
    combat.enemy.defense !== undefined && game.type === 'fighting-fantasy'
      ? 'contest'
      : combat.enemy.defense !== undefined && game.type === 'rpg'
        ? 'rpg'
        : 'pool';
  const enemies = (combat.enemies?.length ? combat.enemies : [combat.enemy]).map((enemy) => ({
    name: enemy.name,
    ...(enemy.count !== undefined ? { count: enemy.count } : {}),
    attack: enemy.attack,
    ...(enemy.defense !== undefined ? { defense: enemy.defense } : {}),
    health: enemy.health,
    ...(enemy.weapon ? { weapon: enemy.weapon } : {}),
  }));
  const options: Record<string, unknown> = {};
  if (combat.stopAtOne) options.stop_at_one = true;
  if (combat.threshold !== undefined) options.threshold = combat.threshold;
  if (combat.bonusDamage) options.bonus_damage = combat.bonusDamage;
  if (combat.preDamage) options.pre_damage = combat.preDamage;
  if (combat.preDamageFrom?.length) options.pre_damage_from = combat.preDamageFrom;
  if (combat.preStamina !== undefined) options.pre_stamina = combat.preStamina;
  return {
    type: 'combat',
    mode,
    enemies,
    ...(Object.keys(options).length ? { options } : {}),
    outcomes: combatOutcomes(combat),
  };
}

function checkInteraction(game: Game, check: NonNullable<Game['checks']>[string]): Interaction {
  if (check.skill) {
    const formula = check.difficulty !== undefined ? `${check.skill} ${check.compare ?? `>= ${check.difficulty}`}` : `${check.skill} ${check.compare ?? '>= 0'}`;
    return {
      type: 'check',
      mode: 'skill',
      skill: check.skill,
      formula,
      ...(game.type === 'rpg' ? { morale_cost: `(1d6 - ${check.skill}) * 4` } : {}),
      outcomes: { success: check.success, failure: check.failure },
    };
  }
  const stat = check.stat ?? '';
  return {
    type: 'check',
    mode: 'stat',
    stat,
    formula: `2d6 + ${stat} ${check.compare ?? '>= 0'}`,
    outcomes: { success: check.success, failure: check.failure },
  };
}

function rollMax(formula: string): number {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(formula.replace(/−/g, '-').trim());
  if (!match) return 0;
  return Math.max(1, Number(match[1]) * Number(match[2]) + Number(match[3] ?? 0));
}

function rollInteraction(game: Game, scene: Scene): Interaction | null {
  if (!scene.next || typeof scene.next === 'string') return null;
  const max = rollMax(scene.next.roll);
  const sorted = [...scene.next.outcomes].sort((a, b) => (b.min ?? 1) - (a.min ?? 1));
  const outcomes = sorted.map((outcome, index) => {
    const min = outcome.min ?? 1;
    const high = index === 0 ? max : (sorted[index - 1].min ?? 1) - 1;
    const low = index === sorted.length - 1 ? 1 : min;
    return { min: low, max: high, to: outcome.goto };
  });
  return { type: 'roll', formula: scene.next.roll, outcomes };
}

function primaryInteraction(game: Game, scene: Scene): { primary: Interaction | null; after?: Interaction } {
  const sceneId = scene.key;
  const combat = game.combat?.[sceneId];
  const check = game.checks?.[sceneId];
  const gamble = game.gambles?.[sceneId];
  const choices = scene.choices ?? [];
  if (combat) return { primary: combatInteraction(game, combat) };
  if (gamble) {
    const primary: Interaction = {
      type: 'gamble',
      stat: gamble.stat,
      stake: { min: gamble.stake.min, max: gamble.stake.max },
      win: gamble.win,
      push: gamble.push,
    };
    return { primary, ...(check ? { after: checkInteraction(game, check) } : choices.length ? { after: choicesInteraction(choices) } : {}) };
  }
  if (check) return { primary: checkInteraction(game, check) };
  if (scene.shop?.length) {
    return {
      primary: {
        type: 'shop',
        ...(scene.shopTitle ? { title: scene.shopTitle } : {}),
        ...(scene.shopCurrency ? { currency: scene.shopCurrency } : {}),
        offers: scene.shop.map((offer) => ({ item: offer.item, price: offer.price })),
      },
      ...(choices.length ? { after: choicesInteraction(choices) } : {}),
    };
  }
  const roll = rollInteraction(game, scene);
  if (roll) return { primary: roll };
  if (choices.length) return { primary: choicesInteraction(choices) };
  if (typeof scene.next === 'string') return { primary: { type: 'continue', to: scene.next } };
  return { primary: null };
}

function features(game: Game): string[] {
  const out = new Set<string>();
  if (Object.values(game.scenes).some((scene) => scene.choices?.length)) out.add('choices');
  if (game.checks && Object.keys(game.checks).length) out.add('checks');
  if (game.combat) for (const combat of Object.values(game.combat)) {
    out.add(combat.enemy.defense !== undefined && game.type === 'fighting-fantasy'
      ? 'combat.contest'
      : combat.enemy.defense !== undefined && game.type === 'rpg'
        ? 'combat.rpg'
        : 'combat.pool');
  }
  if (game.gambles && Object.keys(game.gambles).length) out.add('gambles');
  if (Object.values(game.scenes).some((scene) => scene.shop?.length)) out.add('shop');
  if (game.codes && Object.keys(game.codes).length) {
    out.add('codes');
    out.add('codebook');
  }
  if (Object.values(game.scenes).some((scene) => scene.next && typeof scene.next === 'object')) out.add('roll');
  if (Object.values(game.stats ?? {}).some((stat) => stat.roll)) out.add('initial-roll');
  return [...out];
}

function convertScene(game: Game, scene: Scene): Quest2Scene {
  const { primary, after } = primaryInteraction(game, scene);
  const result: Quest2Scene = {
    title: scene.title,
    text: scene.text,
    ...(scene.mood ? { mood: scene.mood } : {}),
    ...(scene.music ? { music: scene.music } : {}),
    ...(scene.image ? { image: scene.image } : {}),
    ...(scene.onEnter?.length ? { entry: convertEffects(scene.onEnter) } : {}),
    ...(scene.ending ? { ending: true } : {}),
    ...(primary ? { interaction: primary } : {}),
    ...(after ? { after } : {}),
  };
  return result;
}

function convert(game: Game, raw: Record<string, unknown>): Record<string, unknown> {
  const scenes: Record<string, unknown> = {};
  for (const [key, scene] of Object.entries(game.scenes)) scenes[key] = convertScene(game, scene);
  const stats: Record<string, unknown> = {};
  for (const [id, def] of Object.entries(game.stats ?? {})) {
    stats[id] = {
      title: def.title,
      ...(def.initial !== undefined ? { initial: def.initial } : {}),
      ...(def.min !== undefined ? { min: def.min } : {}),
      ...(def.max !== undefined ? { max: def.max } : {}),
      ...(def.roll ? { roll: def.roll } : {}),
      ...(def.show === false ? { visible: false } : {}),
    };
  }
  const items: Record<string, unknown> = {};
  for (const [id, item] of Object.entries(game.items ?? {})) {
    items[id] = {
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
      ...(item.damage ? { damage: item.damage } : {}),
      ...(item.ammo ? { ammo: item.ammo } : {}),
      ...(item.weapon_rating !== undefined ? { weapon_rating: item.weapon_rating } : {}),
      ...(item.armor_rating !== undefined ? { armor_rating: item.armor_rating } : {}),
      ...(item.countable !== undefined ? { countable: item.countable } : {}),
      ...(item.consumable !== undefined ? { consumable: item.consumable } : {}),
      ...(item.restore ? { restore: item.restore } : {}),
    };
  }
  const codes: Record<string, unknown> = {};
  for (const [id, code] of Object.entries(game.codes ?? {})) {
    codes[id] = { title: code.title, offset: code.offset, ...(code.base ? { base: code.base } : {}) };
  }
  const profile = game.type === 'storybook' || game.type === 'fighting-fantasy' || game.type === 'rpg' || game.type === 'hybrid'
    ? game.type
    : 'hybrid';
  return {
    format: 'quest/2',
    id: game.id,
    title: String(raw.title ?? game.title),
    profile,
    ...(raw.status ? { status: String(raw.status) } : {}),
    ...(raw.author ? { author: String(raw.author) } : {}),
    ...(raw.genre ? { genre: String(raw.genre) } : {}),
    ...(raw.annotation ? { annotation: String(raw.annotation) } : {}),
    ...(raw.language ? { language: String(raw.language) } : {}),
    ...(raw.year ? { year: Number(raw.year) } : {}),
    ...(raw.edition ? { edition: String(raw.edition) } : {}),
    ...(raw.source ? { source: String(raw.source) } : {}),
    ...(raw.cover ? { cover: String(raw.cover) } : {}),
    ...(game.moods ? { moods: game.moods } : {}),
    features: features(game),
    ...(Object.keys(stats).length ? { stats } : {}),
    ...(Object.keys(items).length ? { items } : {}),
    ...(game.startItems && Object.keys(game.startItems).length ? { start_items: game.startItems } : {}),
    ...(game.flags?.length ? { flags: game.flags } : {}),
    ...(Object.keys(codes).length ? { codes } : {}),
    start: game.start,
    scenes,
  };
}

const id = process.argv[2];
if (!id) {
  console.error('usage: npx tsx scripts/convert-quest2.ts <id> [--out path]');
  process.exit(2);
}
const dir = join('games', id);
if (!existsSync(join(dir, 'game.yaml')) || !existsSync(join(dir, 'story.md'))) {
  console.error(`нет пакета quest/1: ${dir}`);
  process.exit(2);
}
const optional = (name: string): string | null => {
  const path = join(dir, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};
const manifest = parseYaml(readFileSync(join(dir, 'game.yaml'), 'utf8')) as Record<string, unknown>;
const parsed = parsePackage(
  id,
  manifest,
  readFileSync(join(dir, 'story.md'), 'utf8'),
  optional('items.yaml'),
  optional('stats.yaml'),
  optional('flags.yaml'),
  optional('mechanics.yaml'),
  optional('codes.yaml'),
);
const outputPath = process.argv[3] === '--out' ? process.argv[4] : join(dir, 'quest2.yaml');
if (existsSync(outputPath) && !process.argv.includes('--force')) {
  console.error(`файл уже существует: ${outputPath}; добавь --force`);
  process.exit(2);
}
const result = convert(parsed.game, manifest);
let yamlText = stringifyYaml(result, { lineWidth: 0 });
// PyYAML трактует голый `=` как тег value; кавычки сохраняют оператор строкой.
yamlText = yamlText.replace(/op: (>=|<=|!=|=|>|<)/g, 'op: "$1"');
writeFileSync(outputPath, yamlText, 'utf8');
console.log(`создано: ${outputPath}`);
console.log(`сцен: ${Object.keys(parsed.game.scenes).length}; features: ${(result.features as string[]).join(', ')}`);
if (parsed.problems.length) {
  console.log(`parse problems: ${parsed.problems.length}`);
  for (const problem of parsed.problems.slice(0, 10)) console.log(`  ${problem.level} ${problem.code} ${problem.scene ?? ''} ${problem.message}`);
}
