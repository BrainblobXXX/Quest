import { STATE_VERSION, type AttritionDef, type CheckDef, type Choice, type CombatDef, type CombatEnemy, type EffectDef, type EncounterDef, type Game, type GameState, type GambleDef, type ItemDef, type ParseProblem, type RollOutcome, type Scene, type SceneEffect, type StatDef, type CodeDef } from './types';

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

function effectDefinitions(value: unknown, problems: ParseProblem[]): Record<string, EffectDef> {
  const result: Record<string, EffectDef> = {};
  for (const [id, raw] of Object.entries(asRecord(value) ?? {})) {
    const def = asRecord(raw);
    if (!def) continue;
    const durationRaw = def.duration;
    const duration = durationRaw === 'next_combat'
      ? 'next_combat'
      : Math.max(1, num(durationRaw, 1));
    const modifiersRaw = asRecord(def.modifiers);
    const modifiers = modifiersRaw
      ? Object.fromEntries(Object.entries(modifiersRaw).map(([key, value]) => [key, num(value)]))
      : undefined;
    const stackingRaw = str(def.stacking, 'refresh');
    const stacking = (['refresh', 'stack', 'ignore'] as const).includes(stackingRaw as 'refresh' | 'stack' | 'ignore')
      ? stackingRaw as 'refresh' | 'stack' | 'ignore'
      : undefined;
    result[id] = {
      title: str(def.title, id),
      ...(def.kind === 'buff' || def.kind === 'debuff' ? { kind: def.kind } : {}),
      ...(def.icon ? { icon: str(def.icon) } : {}),
      ...(def.description ? { description: str(def.description) } : {}),
      duration,
      ...(stacking ? { stacking } : {}),
      ...(modifiers ? { modifiers } : {}),
    };
    if (durationRaw !== 'next_combat' && (typeof durationRaw !== 'number' || !Number.isFinite(durationRaw) || durationRaw < 1)) {
      problems.push({ level: 'warn', code: 'Q2_EFFECT_DURATION', message: `эффект ${id}: duration должен быть next_combat или целым числом боёв` });
    }
  }
  return result;
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
    if (effect.apply_effect) out.push({ ...base, applyEffect: str(effect.apply_effect) });
  }
  return out;
}

function choiceEffects(value: unknown): Pick<Choice, 'take' | 'use' | 'useCount' | 'drop' | 'dropCount' | 'set' | 'stat' | 'learn_code' | 'applyEffect'> {
  const out: Pick<Choice, 'take' | 'use' | 'useCount' | 'drop' | 'dropCount' | 'set' | 'stat' | 'learn_code' | 'applyEffect'> = {};
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
    if (effect.apply_effect) out.applyEffect = str(effect.apply_effect);
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
    ...(enemy.skill !== undefined ? { skill: num(enemy.skill) } : {}),
    ...(enemy.damage !== undefined ? { damage: num(enemy.damage) } : {}),
    ...(Array.isArray(enemy.phases)
      ? {
          phases: enemy.phases
            .map((raw) => asRecord(raw))
            .filter((raw): raw is Json => Boolean(raw))
            .map((raw) => ({
              ...(raw.from_round !== undefined ? { fromRound: num(raw.from_round) } : {}),
              ...(raw.to_round !== undefined ? { toRound: num(raw.to_round) } : {}),
              ...(raw.skill !== undefined ? { skill: num(raw.skill) } : {}),
              ...(raw.even_skill !== undefined ? { evenSkill: num(raw.even_skill) } : {}),
            })),
        }
      : {}),
    ...(asRecord(enemy.on_hit)
      ? {
          onHit: {
            ...(asRecord(enemy.on_hit)?.roll ? { roll: str(asRecord(enemy.on_hit)?.roll) } : {}),
            ...(asRecord(enemy.on_hit)?.min !== undefined ? { min: num(asRecord(enemy.on_hit)?.min) } : {}),
            ...(asRecord(enemy.on_hit)?.damage !== undefined ? { damage: num(asRecord(enemy.on_hit)?.damage) } : {}),
            ...(asRecord(enemy.on_hit)?.luck_damage !== undefined ? { luckDamage: num(asRecord(enemy.on_hit)?.luck_damage) } : {}),
          },
        }
      : {}),
    ...(enemy.defense !== undefined ? { defense: num(enemy.defense) } : {}),
    health: num(enemy.health, 1),
    ...(enemy.attack_roll ? { attackRoll: str(enemy.attack_roll) } : {}),
    ...(enemy.boss === true ? { boss: true } : {}),
    ...(enemy.armor !== undefined ? { armor: num(enemy.armor) } : {}),
    ...(enemy.weapon ? { weapon: str(enemy.weapon) } : {}),
  });
  const mapped = enemies.map(mapEnemy);
  const outcomes = asRecord(value.outcomes) ?? {};
  const win = str(outcomes.victory);
  if (!win) return null;
  const rawMode = str(value.mode);
  const mode = rawMode === 'pool' || rawMode === 'contest' || rawMode === 'rpg' || rawMode === 'duel' ? rawMode : undefined;
  const options = asRecord(value.options) ?? {};
  const allies = asArray(value.allies)
    .map((raw) => asRecord(raw))
    .filter((raw): raw is Record<string, unknown> => Boolean(raw))
    .map((raw, index) => ({
      id: str(raw.id, `ally_${index + 1}`),
      name: str(raw.name, `Союзник ${index + 1}`),
      ...(raw.weapon ? { weapon: str(raw.weapon) } : {}),
      damage: str(raw.damage, '1d6'),
    }));
  const restrictionsRaw = asRecord(value.restrictions) ?? {};
  const allowedWeapons = Array.isArray(restrictionsRaw.allowed_weapons)
    ? restrictionsRaw.allowed_weapons.map((item) => str(item)).filter(Boolean)
    : undefined;
  const allowedItems = Array.isArray(restrictionsRaw.allowed_items)
    ? restrictionsRaw.allowed_items.map((item) => str(item)).filter(Boolean)
    : undefined;
  const forceWeapon = restrictionsRaw.force_weapon ? str(restrictionsRaw.force_weapon) : undefined;
  const bannedWeapons = Array.isArray(restrictionsRaw.banned_weapons)
    ? restrictionsRaw.banned_weapons.map((item) => str(item)).filter(Boolean)
    : undefined;
  const restrictions = allowedWeapons || allowedItems || forceWeapon || bannedWeapons
    ? {
        ...(allowedWeapons ? { allowedWeapons } : {}),
        ...(allowedItems ? { allowedItems } : {}),
        ...(forceWeapon ? { forceWeapon } : {}),
        ...(bannedWeapons ? { bannedWeapons } : {}),
      }
    : undefined;
  return {
    scene,
    ...(mode ? { mode } : {}),
    ...(value.encounter ? { encounter: str(value.encounter) } : {}),
    ...(value.empty ? { empty: str(value.empty) } : {}),
    enemy: mapped[0],
    enemies: mapped,
    ...(allies.length > 0 ? { allies } : {}),
    ...(restrictions ? { restrictions } : {}),
    win,
    ...(outcomes.defeat ? { lose: str(outcomes.defeat) } : {}),
    ...(outcomes.capture ? { capture: str(outcomes.capture) } : {}),
    ...(asRecord(options.capture_if)
      ? {
          captureIf: {
            ...(asRecord(options.capture_if)?.enemy_health_at_most !== undefined
              ? { enemyHealthAtMost: num(asRecord(options.capture_if)?.enemy_health_at_most) }
              : {}),
            ...(asRecord(options.capture_if)?.player_health_at_least !== undefined
              ? { playerHealthAtLeast: num(asRecord(options.capture_if)?.player_health_at_least) }
              : {}),
          },
        }
      : {}),
    ...(options.stop_at_one ? { stopAtOne: true } : {}),
    ...(options.player_damage !== undefined ? { playerDamage: num(options.player_damage) } : {}),
    ...(options.luck === true ? { luck: true } : {}),
    ...(options.steal_luck !== false && options.luck === true ? { stealLuck: true } : {}),
    ...(options.threshold !== undefined ? { threshold: num(options.threshold) } : {}),
    ...(options.bonus_damage ? { bonusDamage: str(options.bonus_damage) } : {}),
    ...(options.pre_damage ? { preDamage: str(options.pre_damage) } : {}),
    ...(Array.isArray(options.pre_damage_from) ? { preDamageFrom: options.pre_damage_from.map((x) => str(x)) } : {}),
    ...(options.pre_stamina !== undefined ? { preStamina: num(options.pre_stamina) } : {}),
    ...(options.pre_damage_kind ? { preDamageKind: str(options.pre_damage_kind) as 'browning' | 'grenade' | 'damage' } : {}),
    ...(options.pre_damage_item ? { preDamageItem: str(options.pre_damage_item) } : {}),
    ...(options.pre_damage_optional === true ? { preDamageOptional: true } : {}),
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

function attritionFromInteraction(value: Q2Interaction, scene: string, problems: ParseProblem[]): AttritionDef | null {
  const encounter = str(value.encounter);
  const formula = str(value.formula);
  if (!encounter || !formula) {
    problems.push({ level: 'warn', code: 'Q2_ATTRITION_FIELDS', message: 'attrition требует encounter и formula', scene });
    return null;
  }
  const consume = str(value.consume);
  const animation = str(value.animation);
  const next = str(value.to);
  const empty = str(value.empty);
  const options = asArray(value.options);
  return {
    scene,
    encounter,
    formula,
    ...(consume ? { consume } : {}),
    ...(animation === 'grenade' || animation === 'browning' ? { animation } : {}),
    ...(next ? { next } : {}),
    ...(empty ? { empty } : {}),
    ...(options.length ? { choices: choices(options, problems, scene) } : {}),
  };
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
    ...(raw.effects ? { effects: effectDefinitions(raw.effects, problems) } : {}),
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
    const encounterRaw = asRecord(sceneRaw.encounter);
    if (encounterRaw) {
      const encounterId = str(encounterRaw.id, key);
      const encounterName = str(encounterRaw.name, 'Противники');
      const encounterCount = num(encounterRaw.count, 0);
      if (encounterId && encounterCount > 0) {
        scene.encounter = {
          id: encounterId,
          name: encounterName,
          count: encounterCount,
          ...(encounterRaw.item ? { item: str(encounterRaw.item) } : {}),
        };
      }
    }
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
      } else if (type === 'attrition') {
        const attrition = attritionFromInteraction(interaction, key, problems);
        if (attrition) scene.attrition = attrition;
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
