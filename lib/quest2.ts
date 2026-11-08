import { STATE_VERSION, type CheckDef, type Choice, type CombatDef, type CombatEnemy, type Game, type GameState, type GambleDef, type ItemDef, type ParseProblem, type RollOutcome, type Scene, type SceneEffect, type StatDef, type CodeDef } from './types';

type Json = Record<string, unknown>;
type Q2Condition = Record<string, unknown>;
type Q2Effect = Record<string, unknown>;
type Q2Interaction = Record<string, unknown> & { type?: string };

const ITEM_KEYS = new Set(['item', 'count']);

function asRecord(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function condition(value: unknown, problems: ParseProblem[], scene: string): string | undefined {
  if (!value) return undefined;
  const c = asRecord(value);
  if (!c) return undefined;
  if ('always' in c) return undefined;
  if ('all' in c) {
    const parts = asArray(c.all).map((item) => condition(item, problems, scene)).filter((item): item is string => Boolean(item));
    return parts.length > 1 ? `(${parts.join(' and ')})` : parts[0];
  }
  if ('any' in c) {
    const parts = asArray(c.any).map((item) => condition(item, problems, scene)).filter((item): item is string => Boolean(item));
    return parts.length > 1 ? `(${parts.join(' or ')})` : parts[0];
  }
  if ('not' in c) {
    const inner = condition(c.not, problems, scene);
    return inner ? `not (${inner})` : undefined;
  }
  if ('has_item' in c) {
    const item = asRecord(c.has_item);
    const id = str(item?.id);
    const count = Math.max(1, num(item?.count, 1));
    return id ? `has_item ${id}${count > 1 ? ` ${count}` : ''}` : undefined;
  }
  if ('flag' in c) return `flag ${str(c.flag)}`;
  if ('stat' in c) {
    const spec = asRecord(c.stat);
    return spec ? `stat ${str(spec.id)} ${str(spec.op)} ${num(spec.value)}` : undefined;
  }
  if ('visited' in c || 'known_code' in c) {
    problems.push({ level: 'warn', code: 'Q2_CONDITION_UNSUPPORTED', message: `условие ${Object.keys(c)[0]} пока не поддерживается runtime`, scene });
    return undefined;
  }
  return undefined;
}

function addTake(map: Record<string, number>, item: string, count = 1) {
  if (!item) return;
  map[item] = (map[item] ?? 0) + Math.max(1, count);
}

function itemSpec(value: unknown): { item: string; count: number } | null {
  const obj = asRecord(value);
  if (!obj) return null;
  return { item: str(obj.item), count: Math.max(1, num(obj.count, 1)) };
}

function effects(value: unknown, problems: ParseProblem[], scene: string): SceneEffect[] {
  const out: SceneEffect[] = [];
  for (const raw of asArray(value)) {
    const effect = asRecord(raw);
    if (!effect) continue;
    const cond = condition(effect.if, problems, scene);
    const base: SceneEffect = cond ? { if: cond } : {};
    if (effect.grant) {
      const spec = itemSpec(effect.grant);
      if (spec) out.push({ ...base, take: { [spec.item]: spec.count } });
    }
    if (effect.consume) {
      const spec = itemSpec(effect.consume);
      if (spec) out.push({ ...base, use: spec.item, useCount: spec.count });
    }
    if (effect.drop) {
      const spec = itemSpec(effect.drop);
      if (spec) out.push({ ...base, drop: spec.item, dropCount: spec.count });
    }
    if (effect.modify) {
      const spec = asRecord(effect.modify);
      if (spec) out.push({ ...base, stat: { [str(spec.stat)]: num(spec.delta) } });
    }
    if (effect.set_flag) out.push({ ...base, set: str(effect.set_flag) });
    if (effect.clear_flag) {
      problems.push({ level: 'warn', code: 'Q2_EFFECT_UNSUPPORTED', message: 'clear_flag пока не поддерживается runtime', scene });
    }
    if (effect.learn_code) out.push({ ...base, learn_code: str(effect.learn_code) });
    if (effect.drop_best_weapon) out.push({ ...base, dropBestWeapon: true });
    if (effect.roll) {
      const spec = asRecord(effect.roll);
      if (spec) out.push({ ...base, statRoll: { [str(spec.stat)]: str(spec.formula) } });
    }
    if (effect.redirect) out.push({ ...base, goto: str(effect.redirect) });
  }
  return out;
}

function choiceEffects(value: unknown): Pick<Choice, 'take' | 'use' | 'useCount' | 'drop' | 'dropCount' | 'set' | 'stat' | 'learn_code'> {
  const out: Pick<Choice, 'take' | 'use' | 'useCount' | 'drop' | 'dropCount' | 'set' | 'stat' | 'learn_code'> = {};
  const take: Record<string, number> = {};
  for (const raw of asArray(value)) {
    const effect = asRecord(raw);
    if (!effect) continue;
    if (effect.grant) {
      const spec = itemSpec(effect.grant);
      if (spec) addTake(take, spec.item, spec.count);
    }
    if (effect.consume) {
      const spec = itemSpec(effect.consume);
      if (spec) { out.use = spec.item; out.useCount = spec.count; }
    }
    if (effect.drop) {
      const spec = itemSpec(effect.drop);
      if (spec) { out.drop = spec.item; out.dropCount = spec.count; }
    }
    if (effect.set_flag) out.set = [...(Array.isArray(out.set) ? out.set : out.set ? [out.set] : []), str(effect.set_flag)];
    if (effect.modify) {
      const spec = asRecord(effect.modify);
      if (spec) out.stat = { ...(out.stat ?? {}), [str(spec.stat)]: num(spec.delta) };
    }
    if (effect.learn_code) out.learn_code = str(effect.learn_code);
  }
  if (Object.keys(take).length) out.take = take;
  return out;
}

function choices(value: unknown, problems: ParseProblem[], scene: string): Choice[] {
  return asArray(value).flatMap((raw) => {
    const option = asRecord(raw);
    if (!option) return [];
    const cond = condition(option.if, problems, scene);
    return [{
      label: str(option.label, 'Вариант'),
      goto: str(option.to),
      ...(option.letter ? { letter: str(option.letter) } : {}),
      ...(cond ? { if: cond } : {}),
      ...choiceEffects(option.effects),
    }];
  });
}

function checkFromInteraction(value: Q2Interaction, scene: string, gameType: string | undefined, problems: ParseProblem[]): CheckDef | null {
  const formula = str(value.formula);
  const success = str(asRecord(value.outcomes)?.success);
  const failure = str(asRecord(value.outcomes)?.failure);
  if (!success || !failure) return null;
  const mode = str(value.mode);
  if (mode === 'skill') {
    const skill = str(value.skill);
    const rest = formula.replace(new RegExp(`^\\s*${skill}\\b`), '').trim();
    const numeric = /^>=?\s*(\d+)$/.exec(rest);
    return { scene, skill, compare: rest || '>= 0', ...(numeric ? { difficulty: num(numeric[1]) } : {}), success, failure };
  }
  const stat = str(value.stat);
  const rest = formula.replace(new RegExp(`^\\s*2d6\\s*\\+\\s*${stat}\\b`), '').trim();
  if (!stat) problems.push({ level: 'warn', code: 'Q2_CHECK_STAT', message: 'проверка без stat', scene });
  return { scene, stat, compare: rest || '>= 0', success, failure };
}

function combatFromInteraction(value: Q2Interaction, scene: string): CombatDef | null {
  const enemies = asArray(value.enemies).map((raw) => asRecord(raw)).filter((raw): raw is Json => Boolean(raw));
  if (!enemies.length) return null;
  const mapEnemy = (enemy: Json): CombatEnemy => ({
    name: str(enemy.name, 'Противник'),
    ...(enemy.count !== undefined ? { count: num(enemy.count, 1) } : {}),
    attack: num(enemy.attack),
    ...(enemy.defense !== undefined ? { defense: num(enemy.defense) } : {}),
    health: num(enemy.health, 1),
    ...(enemy.weapon ? { weapon: str(enemy.weapon) } : {}),
  });
  const mapped = enemies.map(mapEnemy);
  const outcomes = asRecord(value.outcomes) ?? {};
  const win = str(outcomes.victory);
  if (!win) return null;
  const options = asRecord(value.options) ?? {};
  return {
    scene,
    enemy: mapped[0],
    enemies: mapped,
    win,
    ...(outcomes.defeat ? { lose: str(outcomes.defeat) } : {}),
    ...(options.stop_at_one ? { stopAtOne: true } : {}),
    ...(options.threshold !== undefined ? { threshold: num(options.threshold) } : {}),
    ...(options.bonus_damage ? { bonusDamage: str(options.bonus_damage) } : {}),
    ...(options.pre_damage ? { preDamage: str(options.pre_damage) } : {}),
    ...(Array.isArray(options.pre_damage_from) ? { preDamageFrom: options.pre_damage_from.map((x) => str(x)) } : {}),
    ...(options.pre_stamina !== undefined ? { preStamina: num(options.pre_stamina) } : {}),
  };
}

function gambleFromInteraction(value: Q2Interaction, scene: string): GambleDef | null {
  const stake = asRecord(value.stake) ?? {};
  const stat = str(value.stat);
  if (!stat) return null;
  return { scene, stat, stake: { min: num(stake.min, 1), max: num(stake.max, 1) }, win: num(value.win), push: num(value.push) };
}

function rollNext(value: Q2Interaction): { roll: string; outcomes: RollOutcome[] } | null {
  const formula = str(value.formula);
  if (!formula) return null;
  const outcomes = asArray(value.outcomes).map((raw) => asRecord(raw)).filter((raw): raw is Json => Boolean(raw))
    .map((outcome) => ({ ...(outcome.min !== undefined ? { min: num(outcome.min) } : {}), ...(outcome.max !== undefined ? { max: num(outcome.max) } : {}), goto: str(outcome.to) }))
    .sort((a, b) => (b.min ?? 1) - (a.min ?? 1));
  return { roll: formula, outcomes };
}

function shopOffers(value: unknown): Scene['shop'] {
  return asArray(value).map((raw) => asRecord(raw)).filter((raw): raw is Json => Boolean(raw))
    .map((offer) => ({ item: str(offer.item), price: num(offer.price) }));
}

function makeRev(raw: Json): string {
  const text = JSON.stringify(raw);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function parseQuest2(id: string, raw: Json): { game: Game; problems: ParseProblem[] } {
  const problems: ParseProblem[] = [];
  const rawScenes = asRecord(raw.scenes) ?? {};
  const game: Game = {
    format: 'quest/2',
    id,
    title: str(raw.title, id),
    type: str(raw.profile, 'hybrid'),
    ...(raw.cover ? { cover: str(raw.cover) } : {}),
    start: str(raw.start),
    scenes: {},
    ...(raw.moods ? { moods: raw.moods as Game['moods'] } : {}),
    rev: makeRev(raw),
    ...(raw.start_items ? { startItems: raw.start_items as Record<string, number> } : {}),
    ...(raw.flags ? { flags: asArray(raw.flags).map((x) => str(x)) } : {}),
    ...(raw.stats ? {
      stats: Object.fromEntries(
        Object.entries(raw.stats as Record<string, Json>).map(([key, def]) => [
          key,
          {
            ...(def as unknown as StatDef),
            ...(def.visible === false ? { show: false } : {}),
          },
        ]),
      ),
    } : {}),
    ...(raw.items ? { items: raw.items as Record<string, ItemDef> } : {}),
    ...(raw.codes ? { codes: raw.codes as Record<string, CodeDef> } : {}),
  };

  for (const [key, rawScene] of Object.entries(rawScenes)) {
    const sceneRaw = asRecord(rawScene);
    if (!sceneRaw) continue;
    const scene: Scene = {
      key,
      title: str(sceneRaw.title, `Глава ${key}`),
      text: str(sceneRaw.text),
      ...(sceneRaw.mood ? { mood: str(sceneRaw.mood) } : {}),
      ...(sceneRaw.music ? { music: str(sceneRaw.music) } : {}),
      ...(sceneRaw.image ? { image: str(sceneRaw.image) } : {}),
      ...(sceneRaw.ending ? { ending: true } : {}),
    };
    const entry = effects(sceneRaw.entry, problems, key);
    if (entry.length) scene.onEnter = entry;
    const counter = asRecord(sceneRaw.ui)?.counter;
    if (counter && typeof counter === 'object') {
      const c = asRecord(counter);
      if (c) scene.counter = { stat: str(c.stat), ...(c.max !== undefined ? { max: num(c.max) } : {}), ...(c.label ? { label: str(c.label) } : {}) };
    }

    const interaction = asRecord(sceneRaw.interaction);
    const type = interaction ? str(interaction.type) : '';
    if (interaction) {
      if (type === 'choices') scene.choices = choices(interaction.options, problems, key);
      else if (type === 'continue') scene.next = str(interaction.to);
      else if (type === 'check') {
        const check = checkFromInteraction(interaction, key, game.type, problems);
        if (check) game.checks = { ...(game.checks ?? {}), [key]: check };
      } else if (type === 'combat') {
        const combat = combatFromInteraction(interaction, key);
        if (combat) game.combat = { ...(game.combat ?? {}), [key]: combat };
      } else if (type === 'gamble') {
        const gamble = gambleFromInteraction(interaction, key);
        if (gamble) game.gambles = { ...(game.gambles ?? {}), [key]: gamble };
      } else if (type === 'shop') {
        scene.shop = shopOffers(interaction.offers);
        if (interaction.title) scene.shopTitle = str(interaction.title);
        if (interaction.currency) scene.shopCurrency = str(interaction.currency);
        if (interaction.currency_item) scene.shopCurrencyItem = str(interaction.currency_item);
      } else if (type === 'roll') {
        const next = rollNext(interaction);
        if (next) scene.next = next;
      } else if (type === 'codebook') {
        scene.codebook = true;
      } else {
        problems.push({ level: 'warn', code: 'Q2_INTERACTION_UNSUPPORTED', message: `интеракция ${type} не поддержана`, scene: key });
      }
    }

    const after = asRecord(sceneRaw.after);
    if (after) {
      const afterType = str(after.type);
      if (afterType === 'choices') scene.choices = choices(after.options, problems, key);
      else if (afterType === 'check') {
        const check = checkFromInteraction(after, key, game.type, problems);
        if (check) game.checks = { ...(game.checks ?? {}), [key]: check };
      } else {
        problems.push({ level: 'warn', code: 'Q2_AFTER_UNSUPPORTED', message: `after ${afterType} не поддержан`, scene: key });
      }
    }
    game.scenes[key] = scene;
  }

  if (!game.scenes[game.start]) {
    problems.push({ level: 'error', code: 'E_START_MISSING', message: `стартовая сцена ${game.start} не найдена` });
  }
  return { game, problems };
}

export function stateVersion(): number {
  return STATE_VERSION;
}
