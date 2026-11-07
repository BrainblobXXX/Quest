import { parse as parseYaml } from 'yaml';
import type { Choice, CombatDef, Game, ItemDef, ParseProblem, Scene, SceneEffect, StatDef } from './types';

/**
 * Разбор пакета игры прямо в браузере: story.md + game.yaml → объект Game.
 *
 * Раньше разбор шёл на этапе сборки и складывал готовый JSON в public/. Теперь
 * пакет — единственный источник: файлы читаются с диска через /api/games/*,
 * а разбор и все проверки выполняются здесь, в браузере.
 * Ошибки не бросаются молча: они возвращаются списком и показываются в UI.
 */

export class PackageError extends Error {
  problems: ParseProblem[];

  constructor(message: string, problems: ParseProblem[] = []) {
    super(message);
    this.name = 'PackageError';
    this.problems = problems;
  }
}

const CHOICE_RE = /^- \[(?<label>.+?)\]\((?<target>[^)\s]+)\)\s*(?:\{(?<mods>.*)\})?\s*$/;
const LETTERS = 'А-ЯЁA-Z';

/** короткий отпечаток текста книги: им помечаются сохранения */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** id предметов из эффекта: строка, список или карта {id: количество}. */
function effectItemIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.map((id) => String(id));
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>);
  return [];
}

/** take на выборе приходит строкой из маркера: id, [id, id] или {id: количество}. */
function parseTakeValue(value: unknown): { value?: Choice['take']; error?: string } {
  if (value === undefined) return {};
  if (typeof value !== 'string') return { value: value as Choice['take'] };
  const text = value.trim();
  if (!text.startsWith('[') && !text.startsWith('{')) return { value: text };
  try {
    const parsed = parseYaml(text);
    if (Array.isArray(parsed)) return { value: parsed.map((id) => String(id)) };
    if (parsed && typeof parsed === 'object') {
      return { value: parsed as Record<string, number> };
    }
    return { error: 'take должен быть id, списком id или картой {id: количество}' };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

/** set на выборе приходит строкой: id или [id, id]. */
function parseSetValue(value: unknown): { value?: Choice['set']; error?: string } {
  if (value === undefined) return {};
  if (typeof value !== 'string') return { value: value as Choice['set'] };
  const text = value.trim();
  if (!text.startsWith('[')) return { value: text };
  try {
    const parsed = parseYaml(text);
    if (Array.isArray(parsed)) return { value: parsed.map((id) => String(id)) };
    return { error: 'set должен быть id или списком id' };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

/** делит модификаторы по запятым верхнего уровня, не задевая {money: -200, food: 1} */
function splitMods(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

type RawScene = {
  key: string;
  text: string;
  raw: string;
  choices: Choice[];
  markers: { letter: string; mods: Record<string, string> }[];
  title: string;
  rich?: { text: string; letter?: string }[];
};

function parseStory(md: string, problems: ParseProblem[]): Record<string, RawScene> {
  const scenes: Record<string, RawScene> = {};
  let key: string | null = null;
  let buffer: string[] = [];
  let choices: Choice[] | null = null;
  let markers: RawScene['markers'] = [];
  let rawLines: string[] = [];

  const flush = () => {
    if (key === null) return;
    scenes[key] = {
      key,
      text: buffer.join('\n').trim(),
      raw: rawLines.join('\n').trim(),
      choices: choices ?? [],
      markers,
      title: '',
    };
  };

  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      key = heading[1];
      buffer = [];
      choices = null;
      markers = [];
      rawLines = [];
      if (scenes[key]) {
        problems.push({ level: 'error', code: 'E_SCENE_DUPLICATE', message: 'сцена объявлена дважды', scene: key });
      }
      continue;
    }
    if (key === null) {
      if (line.trim()) {
        problems.push({
          level: 'error',
          code: 'E_TEXT_BEFORE_SCENE',
          message: `текст до первой сцены: «${line.slice(0, 40)}»`,
        });
      }
      continue;
    }
    rawLines.push(line);
    const marker = new RegExp(
      `^Вариант\\s+([${LETTERS}])(?:\\s*\\{([\\s\\S]*)\\})?\\s*$`,
    ).exec(line.trim());
    if (marker) {
      const mods: Record<string, string> = {};
      if (marker[2]) {
        for (const part of splitMods(marker[2])) {
          const colon = part.indexOf(':');
          if (colon < 0) {
            problems.push({
              level: 'error',
              code: 'E_LIST_MARKER_UNPARSED',
              message: `не разобран модификатор «${part}»`,
              scene: key,
            });
            continue;
          }
          const name = part.slice(0, colon).trim();
          const value = part.slice(colon + 1).trim();
          if (!name || !value) {
            problems.push({
              level: 'error',
              code: 'E_LIST_MARKER_UNPARSED',
              message: `не разобран модификатор «${part}»`,
              scene: key,
            });
            continue;
          }
          mods[name] = value;
        }
      }
      markers.push({ letter: marker[1], mods });
      continue;
    }
    const legacy = CHOICE_RE.exec(line.trim());
    if (legacy) {
      choices ??= [];
      const mods: Record<string, string> = {};
      if (legacy.groups?.mods) {
        for (const part of splitMods(legacy.groups.mods)) {
          const colon = part.indexOf(':');
          if (colon > 0) mods[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
        }
      }
      choices.push({ label: legacy.groups?.label ?? '', goto: legacy.groups?.target ?? '', ...mods } as Choice);
      continue;
    }
    if (choices !== null && line.trim()) {
      problems.push({ level: 'error', code: 'E_TEXT_AFTER_CHOICES', message: 'текст после списка выборов', scene: key });
    }
    buffer.push(line);
  }
  flush();
  return scenes;
}

export type ParsedPackage = { game: Game; problems: ParseProblem[] };

export function parsePackage(
  id: string,
  manifest: Record<string, unknown>,
  storyText: string,
  itemsText?: string | null,
  statsText?: string | null,
  flagsText?: string | null,
  mechanicsText?: string | null,
): ParsedPackage {
  const problems: ParseProblem[] = [];

  const rawScenes = parseStory(storyText, problems);
  const meta = (manifest.scenes ?? {}) as Record<string, Record<string, unknown>>;

  for (const [key, scene] of Object.entries(rawScenes)) {
    const m = meta[key];
    if (!m) {
      problems.push({ level: 'warn', code: 'W_SCENE_NO_META', message: 'у сцены нет записи в game.yaml', scene: key });
    }
    scene.title = String(m?.title ?? `Глава ${key}`);

    const variants = (m?.variants ?? null) as Record<string, string> | null;
    if (variants) {
      const tagRe = new RegExp(`\\{([${LETTERS}])\\}([\\s\\S]*?)\\{\\/\\1\\}`, 'g');
      const tags = [...scene.text.matchAll(tagRe)];
      if (!tags.length) {
        problems.push({
          level: 'error',
          code: 'E_CHOICE_NO_TAGS',
          message: 'есть variants, но нет тегов {А}…{/А}',
          scene: key,
        });
      }
      // подпись варианта — сама буква («Вариант А»), а не вырезанная из прозы фраза
      const tagLetters = new Set(tags.map((tag) => tag[1]));
      const letters: string[] = [];
      for (const tag of tags) if (!letters.includes(tag[1])) letters.push(tag[1]);
      for (const letter of Object.keys(variants)) if (!letters.includes(letter)) letters.push(letter);

      scene.choices = letters.map((letter) => {
        const target = variants[letter];
        if (!target) {
          problems.push({
            level: 'error',
            code: 'E_CHOICE_TARGET_MISSING',
            message: `для буквы ${letter} нет цели в variants`,
            scene: key,
          });
        }
        return { label: `Вариант ${letter}`, goto: String(target ?? ''), letter };
      });

      const modsByLetter = Object.fromEntries(scene.markers.map((marker) => [marker.letter, marker.mods]));
      scene.choices.forEach((choice) => Object.assign(choice, modsByLetter[choice.letter ?? ''] ?? {}));

      for (const letter of Object.keys(variants)) {
        if (!tagLetters.has(letter)) {
          problems.push({
            level: 'error',
            code: 'E_CHOICE_NO_TAG',
            message: `variants.${letter} без тега {${letter}}…{/${letter}}`,
            scene: key,
          });
        }
      }
      for (const letter of tagLetters) {
        if (!(letter in variants)) {
          problems.push({
            level: 'error',
            code: 'E_CHOICE_NO_TARGET',
            message: `тег {${letter}}…{/${letter}} без цели в variants`,
            scene: key,
          });
        }
      }
      for (const ref of scene.text.matchAll(new RegExp(`\\[([${LETTERS}])\\]`, 'g'))) {
        if (!variants[ref[1]]) {
          problems.push({
            level: 'error',
            code: 'E_CHOICE_TARGET_MISSING',
            message: `отсылка [${ref[1]}] без цели в variants`,
            scene: key,
          });
        }
      }

      // в тексте остаются и фраза, и отсылка [А]; убираются только фигурные теги,
      // а границы фразы сохраняются сегментами — по ним рисуется подсветка
      const rich: { text: string; letter?: string }[] = [];
      let last = 0;
      for (const tag of tags) {
        const start = tag.index ?? 0;
        if (start > last) rich.push({ text: scene.text.slice(last, start) });
        rich.push({ text: tag[2], letter: tag[1] });
        last = start + tag[0].length;
      }
      if (last < scene.text.length) rich.push({ text: scene.text.slice(last) });
      scene.rich = rich;
      scene.text = rich
        .map((segment) => segment.text)
        .join('')
        .replace(/ {2,}/g, ' ')
        .trim();
    }
  }

  for (const key of Object.keys(meta)) {
    if (!rawScenes[key]) {
      problems.push({ level: 'error', code: 'E_SCENE_META_ORPHAN', message: 'сцена объявлена в game.yaml, но её нет в story.md', scene: key });
    }
  }

  let items: Record<string, ItemDef> = {};
  if (itemsText) {
    try {
      items = ((parseYaml(itemsText) ?? {}) as { items?: Record<string, ItemDef> }).items ?? {};
    } catch (e) {
      problems.push({ level: 'error', code: 'E_ITEMS_YAML', message: `items.yaml не разбирается: ${(e as Error).message}` });
    }
  }

  let stats: Record<string, StatDef> = {};
  if (statsText) {
    try {
      stats = ((parseYaml(statsText) ?? {}) as { stats?: Record<string, StatDef> }).stats ?? {};
    } catch (e) {
      problems.push({ level: 'error', code: 'E_STATS_YAML', message: `stats.yaml не разбирается: ${(e as Error).message}` });
    }
  }

  let flags: string[] = [];
  if (flagsText) {
    try {
      const doc = (parseYaml(flagsText) ?? {}) as { flags?: unknown };
      const raw = doc.flags;
      if (Array.isArray(raw)) flags = raw.map((id) => String(id));
      else if (raw && typeof raw === 'object') flags = Object.keys(raw as Record<string, unknown>);
      else if (raw !== undefined) {
        problems.push({
          level: 'error',
          code: 'E_FLAGS_YAML',
          message: 'flags.yaml: flags должен быть списком или картой идентификаторов',
        });
      }
    } catch (e) {
      problems.push({ level: 'error', code: 'E_FLAGS_YAML', message: `flags.yaml не разбирается: ${(e as Error).message}` });
    }
  }
  flags = [...new Set(flags)];

  const combat: Record<string, CombatDef> = {};
  if (mechanicsText) {
    try {
      const doc = (parseYaml(mechanicsText) ?? {}) as { combat?: unknown };
      if (Array.isArray(doc.combat)) {
        for (const raw of doc.combat) {
          if (!raw || typeof raw !== 'object') continue;
          const item = raw as Record<string, unknown>;
          const enemyRaw = item.enemy as Record<string, unknown> | undefined;
          const sceneKey = String(item.scene ?? '');
          if (!sceneKey || !enemyRaw) {
            problems.push({
              level: 'warn',
              code: 'W_COMBAT_INVALID',
              message: 'mechanics.yaml: у боя нет scene/enemy',
            });
            continue;
          }
          const rawCount = enemyRaw.count;
          const count = rawCount === undefined ? undefined : Number(rawCount);
          if (count !== undefined && (!Number.isFinite(count) || count < 1)) {
            problems.push({
              level: 'warn',
              code: 'W_COMBAT_COUNT',
              message: `mechanics.yaml: у боя §${sceneKey} некорректный count`,
              scene: sceneKey,
            });
          }
          const win = String(item.win ?? '');
          if (!win) {
            problems.push({
              level: 'error',
              code: 'E_COMBAT_WIN',
              message: `mechanics.yaml: у боя §${sceneKey} нет win`,
              scene: sceneKey,
            });
          }
          const weapons = Array.isArray(item.weapon)
            ? item.weapon.map((id) => {
                const weapon = String(id);
                return weapon === 'automatic' ? 'submachine' : weapon;
              })
            : undefined;
          combat[sceneKey] = {
            scene: sceneKey,
            enemy: {
              name: String(enemyRaw.name ?? 'Противник'),
              count: count !== undefined && Number.isFinite(count) && count >= 1 ? Math.floor(count) : undefined,
              attack: Math.max(0, Number(enemyRaw.attack ?? 1) || 0),
              health: Math.max(1, Number(enemyRaw.health ?? 1) || 1),
            },
            weapon: weapons,
            win,
            lose: item.lose ? String(item.lose) : undefined,
            note: item.note ? String(item.note) : undefined,
            preDamage: item.preDamage ? String(item.preDamage) : undefined,
            preDamageFrom: Array.isArray(item.preDamageFrom)
              ? item.preDamageFrom.map(String)
              : undefined,
            preStamina: item.preStamina === undefined ? undefined : Number(item.preStamina),
            threshold: item.threshold === undefined ? undefined : Number(item.threshold),
            bonusDamage: item.bonusDamage ? String(item.bonusDamage) : undefined,
          };
        }
      }
    } catch (e) {
      problems.push({
        level: 'error',
        code: 'E_MECHANICS_YAML',
        message: `mechanics.yaml не разбирается: ${(e as Error).message}`,
      });
    }
  }

  const moods = ((manifest.moods ?? {}) as Record<string, string | string[] | null>) ?? {};
  const defaultMood = (manifest.default_mood ?? null) as string | null;
  if (defaultMood && !(defaultMood in moods)) {
    problems.push({ level: 'error', code: 'E_MOOD_UNKNOWN', message: `default_mood «${defaultMood}» не объявлен в moods` });
  }

  const scenes: Record<string, Scene> = {};
  for (const [key, scene] of Object.entries(rawScenes)) {
    const m = meta[key] ?? {};
    const out: Scene = {
      key,
      title: scene.title,
      text: scene.text,
      raw: scene.raw,
      rich: scene.rich,
      choices: scene.choices,
    };
    if (m.image) out.image = String(m.image);
    if (m.music) out.music = String(m.music);
    if (m.mood) {
      out.mood = String(m.mood);
      if (!(out.mood in moods)) {
        problems.push({ level: 'error', code: 'E_MOOD_UNKNOWN', message: `mood «${out.mood}» не объявлен в moods`, scene: key });
      }
    } else if (Object.keys(moods).length > 0) {
      problems.push({
        level: 'warn',
        code: 'W_MOOD_MISSING',
        message: 'у сцены не задано mood, хотя музыка в пакете есть',
        scene: key,
      });
    }
    if (m.ending) out.ending = true;
    if (m.next) out.next = m.next as Scene['next'];
    if (Array.isArray(m.shop)) {
      out.shop = m.shop
        .filter((offer): offer is Record<string, unknown> => Boolean(offer) && typeof offer === 'object')
        .map((offer) => ({
          item: String(offer.item ?? ''),
          price: Number(offer.price ?? 0),
        }));
    }

    // эффекты входа: выдача и изъятие предметов (ZombieBlood, Steel Rat и др.)
    const onEnter = Array.isArray(m.on_enter)
      ? (m.on_enter.filter((effect) => effect && typeof effect === 'object') as SceneEffect[])
      : [];
    if (onEnter.length) {
      out.onEnter = onEnter;
      for (const effect of onEnter) {
        for (const field of ['take', 'drop'] as const) {
          for (const itemId of effectItemIds(effect[field])) {
            if (!items[itemId]) {
              problems.push({
                level: 'error',
                code: 'E_EFFECT_UNKNOWN_ID',
                message: `on_enter.${field} ссылается на необъявленный предмет «${itemId}»`,
                scene: key,
              });
            }
          }
        }
        for (const flagId of effectItemIds(effect.set)) {
          if (!flags.includes(flagId)) {
            problems.push({
              level: 'error',
              code: 'E_EFFECT_UNKNOWN_ID',
              message: `on_enter.set ссылается на необъявленный флаг «${flagId}»`,
              scene: key,
            });
          }
        }
        for (const match of effect.if?.match(/has_item\s+([a-z0-9_]+)/gi) ?? []) {
          const itemId = match.split(/\s+/)[1];
          if (!items[itemId]) {
            problems.push({
              level: 'error',
              code: 'E_COND_UNKNOWN_ID',
              message: `on_enter.if ссылается на необъявленный предмет «${itemId}»`,
              scene: key,
            });
          }
        }
        for (const match of effect.if?.match(/\bflag\s+([a-z0-9_]+)/gi) ?? []) {
          const flagId = match.split(/\s+/)[1];
          if (!flags.includes(flagId)) {
            problems.push({
              level: 'error',
              code: 'E_COND_UNKNOWN_ID',
              message: `on_enter.if ссылается на необъявленный флаг «${flagId}»`,
              scene: key,
            });
          }
        }
        if (effect.stat) {
          for (const [statId, value] of Object.entries(effect.stat)) {
            if (!stats[statId]) {
              problems.push({
                level: 'error',
                code: 'E_STAT_UNKNOWN',
                message: `on_enter.stat ссылается на неизвестную характеристику «${statId}»`,
                scene: key,
              });
            }
            if (!Number.isFinite(Number(value))) {
              problems.push({
                level: 'error',
                code: 'E_STAT_VALUE',
                message: `on_enter.stat «${statId}»: не число «${String(value)}»`,
                scene: key,
              });
            }
          }
        }
      }
    }

    const targets: string[] = [];
    if (typeof out.next === 'string') targets.push(out.next);
    else if (out.next && typeof out.next === 'object' && 'outcomes' in out.next) {
      const outcomes = out.next.outcomes ?? [];
      for (const outcome of outcomes) {
        if (!outcome.goto) {
          problems.push({ level: 'error', code: 'E_DICE_NO_GOTO', message: 'исход броска без goto', scene: key });
        } else targets.push(outcome.goto);
      }
      const last = outcomes[outcomes.length - 1];
      if (!last || last.min !== undefined) {
        problems.push({ level: 'error', code: 'E_DICE_NO_FALLBACK', message: 'у броска нет последнего исхода без min', scene: key });
      }
    }

    out.choices?.forEach((choice) => {
      // stat приходит из разметки строкой "{money: -200}" — разбираем в карту
      const rawStat = (choice as { stat?: unknown }).stat;
      if (rawStat !== undefined) {
        let parsed: unknown = rawStat;
        if (typeof rawStat === 'string') {
          try {
            parsed = parseYaml(rawStat);
          } catch (e) {
            problems.push({
              level: 'error',
              code: 'E_STAT_YAML',
              message: `stat не разбирается: ${(e as Error).message}`,
              scene: key,
            });
            parsed = null;
          }
        }
        if (parsed === null) {
          delete choice.stat;
        } else if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          problems.push({
            level: 'error',
            code: 'E_STAT_FORMAT',
            message: 'stat должен быть картой {id: изменение}',
            scene: key,
          });
          delete choice.stat;
        } else {
          const deltas: Record<string, number> = {};
          for (const [statId, raw] of Object.entries(parsed as Record<string, unknown>)) {
            const delta = Number(raw);
            if (!Number.isFinite(delta)) {
              problems.push({
                level: 'error',
                code: 'E_STAT_VALUE',
                message: `stat «${statId}»: не число «${String(raw)}»`,
                scene: key,
              });
              continue;
            }
            if (!stats[statId]) {
              problems.push({
                level: 'error',
                code: 'E_STAT_UNKNOWN',
                message: `stat ссылается на неизвестную характеристику «${statId}»`,
                scene: key,
              });
              continue;
            }
            deltas[statId] = delta;
          }
          if (Object.keys(deltas).length) choice.stat = deltas;
          else delete choice.stat;
        }
      }

      if (choice.take !== undefined) {
        const take = parseTakeValue(choice.take);
        if (take.error) {
          problems.push({
            level: 'error',
            code: 'E_EFFECT_FORMAT',
            message: `take: ${take.error}`,
            scene: key,
          });
          delete choice.take;
        } else if (take.value !== undefined) {
          choice.take = take.value;
        }
      }

      if (choice.set !== undefined) {
        const set = parseSetValue(choice.set);
        if (set.error) {
          problems.push({
            level: 'error',
            code: 'E_EFFECT_FORMAT',
            message: `set: ${set.error}`,
            scene: key,
          });
          delete choice.set;
        } else if (set.value !== undefined) {
          choice.set = set.value;
        }
      }

      if (choice.goto) targets.push(choice.goto);
      for (const field of Object.keys(choice)) {
        if (!['label', 'goto', 'letter', 'if', 'take', 'use', 'drop', 'set', 'stat'].includes(field)) {
          problems.push({ level: 'error', code: 'E_CHOICE_UNKNOWN_KEY', message: `неизвестный ключ выбора «${field}»`, scene: key });
        }
      }
      for (const flagId of effectItemIds(choice.set)) {
        if (!flags.includes(flagId)) {
          problems.push({ level: 'error', code: 'E_EFFECT_UNKNOWN_ID', message: `set ссылается на необъявленный флаг «${flagId}»`, scene: key });
        }
      }
      for (const field of ['take', 'drop'] as const) {
        for (const itemId of effectItemIds(choice[field])) {
          if (!items[itemId]) {
            problems.push({ level: 'error', code: 'E_EFFECT_UNKNOWN_ID', message: `${field} ссылается на необъявленный предмет «${itemId}»`, scene: key });
          }
        }
      }
      if (choice.use && typeof choice.use === 'string' && !items[choice.use]) {
        problems.push({ level: 'error', code: 'E_EFFECT_UNKNOWN_ID', message: `use ссылается на необъявленный предмет «${choice.use}»`, scene: key });
      }
      for (const match of choice.if?.match(/has_item\s+([a-z0-9_]+)/gi) ?? []) {
        const itemId = match.split(/\s+/)[1];
        if (!items[itemId]) {
          problems.push({ level: 'error', code: 'E_COND_UNKNOWN_ID', message: `if ссылается на необъявленный предмет «${itemId}»`, scene: key });
        }
      }
      for (const match of choice.if?.match(/\bflag\s+([a-z0-9_]+)/gi) ?? []) {
        const flagId = match.split(/\s+/)[1];
        if (!flags.includes(flagId)) {
          problems.push({ level: 'error', code: 'E_COND_UNKNOWN_ID', message: `if ссылается на необъявленный флаг «${flagId}»`, scene: key });
        }
      }
    });

    for (const target of targets) {
      if (!rawScenes[target]) {
        problems.push({ level: 'error', code: 'E_CHOICE_TARGET_MISSING', message: `переход в несуществующую сцену «${target}»`, scene: key });
      }
    }

    if (!targets.length && !out.ending) {
      problems.push({ level: 'error', code: 'E_SCENE_DEAD_END', message: 'тупик: нет next, выборов и ending', scene: key });
    }

    scenes[key] = out;
  }

  for (const [sceneKey, definition] of Object.entries(combat)) {
    if (!scenes[sceneKey]) {
      problems.push({
        level: 'warn',
        code: 'W_COMBAT_SCENE',
        message: `mechanics.yaml: бой ссылается на несуществующую сцену §${sceneKey}`,
        scene: sceneKey,
      });
    }
    if (definition.win && !scenes[definition.win]) {
      problems.push({
        level: 'error',
        code: 'E_COMBAT_WIN',
        message: `mechanics.yaml: win §${definition.win} не существует`,
        scene: sceneKey,
      });
    }
    if (definition.lose && !scenes[definition.lose]) {
      problems.push({
        level: 'error',
        code: 'E_COMBAT_LOSE',
        message: `mechanics.yaml: lose §${definition.lose} не существует`,
        scene: sceneKey,
      });
    }
  }

  for (const [sceneKey, scene] of Object.entries(scenes)) {
    for (const offer of scene.shop ?? []) {
      if (!items[offer.item]) {
        problems.push({
          level: 'error',
          code: 'E_SHOP_UNKNOWN_ITEM',
          message: `shop ссылается на необъявленный предмет «${offer.item}»`,
          scene: sceneKey,
        });
      }
      if (!Number.isFinite(offer.price) || offer.price < 0) {
        problems.push({
          level: 'error',
          code: 'E_SHOP_PRICE',
          message: `shop: некорректная цена для «${offer.item}»`,
          scene: sceneKey,
        });
      }
    }
  }

  const start = String(manifest.start ?? '');
  if (!start) {
    problems.push({ level: 'error', code: 'E_START_MISSING', message: 'в game.yaml не задан start' });
  } else if (!scenes[start]) {
    problems.push({ level: 'error', code: 'E_START_MISSING', message: `start «${start}» не существует` });
  }
  if (manifest.format !== 'quest/1') {
    problems.push({ level: 'error', code: 'E_FORMAT', message: `format «${String(manifest.format)}», ожидается quest/1` });
  }

  const startItems = (manifest.start_items ?? {}) as Record<string, number>;
  for (const [itemId, count] of Object.entries(startItems)) {
    if (!items[itemId]) {
      problems.push({ level: 'error', code: 'E_EFFECT_UNKNOWN_ID', message: `start_items: предмет «${itemId}» не объявлен` });
    }
    if (!Number.isInteger(count) || count < 1) {
      problems.push({ level: 'error', code: 'E_START_ITEMS_COUNT', message: `start_items: у «${itemId}» количество ${count}` });
    }
  }

  const game: Game = {
    format: String(manifest.format ?? ''),
    id: String(manifest.id ?? id),
    title: String(manifest.title ?? id),
    author: manifest.author ? String(manifest.author) : undefined,
    language: manifest.language ? String(manifest.language) : undefined,
    start,
    startItems,
    items,
    stats,
    flags,
    combat,
    moods,
    defaultMood,
    rev: hash(storyText),
    scenes,
  };

  return { game, problems };
}
