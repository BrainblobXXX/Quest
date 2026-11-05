import { parse as parseYaml } from 'yaml';
import type { Choice, Game, ItemDef, ParseProblem, Scene } from './types';

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
    const marker = new RegExp(`^Вариант\\s+([${LETTERS}])\\s*(?:\\{([^}]*)\\})?\\s*$`).exec(line.trim());
    if (marker) {
      const mods: Record<string, string> = {};
      if (marker[2]) {
        for (const part of marker[2].split(',')) {
          const kv = /^\s*(\w+)\s*:\s*(.+?)\s*$/.exec(part);
          if (!kv) {
            problems.push({
              level: 'error',
              code: 'E_LIST_MARKER_UNPARSED',
              message: `не разобран модификатор «${part.trim()}»`,
              scene: key,
            });
            continue;
          }
          mods[kv[1]] = kv[2];
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
        for (const part of legacy.groups.mods.split(',')) {
          const kv = /^\s*(\w+)\s*:\s*(.+?)\s*$/.exec(part);
          if (kv) mods[kv[1]] = kv[2];
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
      if (choice.goto) targets.push(choice.goto);
      for (const field of Object.keys(choice)) {
        if (!['label', 'goto', 'letter', 'if', 'take', 'use', 'drop'].includes(field)) {
          problems.push({ level: 'error', code: 'E_CHOICE_UNKNOWN_KEY', message: `неизвестный ключ выбора «${field}»`, scene: key });
        }
      }
      for (const field of ['take', 'use', 'drop'] as const) {
        const value = choice[field];
        if (value && typeof value === 'string' && !items[value]) {
          problems.push({ level: 'error', code: 'E_EFFECT_UNKNOWN_ID', message: `${field} ссылается на необъявленный предмет «${value}»`, scene: key });
        }
      }
      for (const match of choice.if?.match(/has_item\s+([a-z0-9_]+)/gi) ?? []) {
        const itemId = match.split(/\s+/)[1];
        if (!items[itemId]) {
          problems.push({ level: 'error', code: 'E_COND_UNKNOWN_ID', message: `if ссылается на необъявленный предмет «${itemId}»`, scene: key });
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
    moods,
    defaultMood,
    rev: hash(storyText),
    scenes,
  };

  return { game, problems };
}
