import { parse as parseYaml } from 'yaml';
import type { Choice, Game, ItemDef, ParseProblem, Scene } from './types';

/**
 * Разбор пакета игры прямо в браузере: story.md + game.yaml → объект Game.
 *
 * Раньше это делал scripts/build-games.mjs на этапе сборки и складывал JSON в
 * public/games. Теперь пакет — единственный источник: файлы читаются с диска
 * через /api/games/*, а разбор и все проверки выполняются здесь.
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

/** подпись кнопки из фразы, обёрнутой тегом {А}…{/А} */
function labelFrom(raw: string): string {
  let label = raw
    .replace(new RegExp(`\\s*(?:на|в|к|с|от|до|из|по|за)?\\s*\\[${LETTERS}\\]`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:Если|Или|А если|Если же|Или же)\s+/i, '')
    .replace(/^(?:Решай|Реши|Выбирай|Смотри)\s*,?\s*/i, '')
    .replace(/(?:^|[,\s])то(?=[,\s]|$)\s*.*$/i, '')
    .replace(/[\s,]+$/, '');

  label = label.replace(/[\s,;:—–-]+$/, '').replace(/^(?:Если|Или|А если|Если же|Или же)[,\s]+/i, '');
  if (label.length > 70) {
    const cut = Math.max(label.lastIndexOf(',', 70), label.lastIndexOf(' ', 70));
    label = (cut > 20 ? label.slice(0, cut) : label.slice(0, 70)).trim();
  }
  if (label) label = label[0].toUpperCase() + label.slice(1);
  return label;
}

type RawScene = {
  key: string;
  text: string;
  choices: Choice[];
  markers: { letter: string; mods: Record<string, string> }[];
  title: string;
};

function parseStory(md: string, problems: ParseProblem[]): Record<string, RawScene> {
  const scenes: Record<string, RawScene> = {};
  let key: string | null = null;
  let buffer: string[] = [];
  let choices: Choice[] | null = null;
  let markers: RawScene['markers'] = [];

  const flush = () => {
    if (key === null) return;
    scenes[key] = { key, text: buffer.join('\n').trim(), choices: choices ?? [], markers, title: '' };
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
      scene.choices = tags.map((tag) => {
        const target = variants[tag[1]];
        if (!target) {
          problems.push({
            level: 'error',
            code: 'E_CHOICE_TARGET_MISSING',
            message: `для тега ${tag[1]} нет цели в variants`,
            scene: key,
          });
        }
        const label = labelFrom(tag[2]) || `Вариант ${tag[1]}`;
        return { label, goto: String(target ?? '') };
      });

      const modsByLetter = Object.fromEntries(scene.markers.map((marker) => [marker.letter, marker.mods]));
      scene.choices.forEach((choice, index) => Object.assign(choice, modsByLetter[tags[index]?.[1] ?? ''] ?? {}));

      const tagLetters = new Set(tags.map((tag) => tag[1]));
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

      scene.text = scene.text
        .replace(tagRe, '$2')
        .replace(new RegExp(`\\s+(?:на|в|к)\\s*\\[([${LETTERS}])\\]`, 'g'), '')
        .replace(new RegExp(`\\s*\\[([${LETTERS}])\\]`, 'g'), '')
        .replace(/\s*([.,!?;:])\s*/g, '$1 ')
        .replace(/\s+/g, ' ')
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
      choices: scene.choices,
    };
    if (m.image) out.image = String(m.image);
    if (m.music) out.music = String(m.music);
    if (m.mood) {
      out.mood = String(m.mood);
      if (!(out.mood in moods)) {
        problems.push({ level: 'error', code: 'E_MOOD_UNKNOWN', message: `mood «${out.mood}» не объявлен в moods`, scene: key });
      }
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
        if (!['label', 'goto', 'if', 'take', 'use', 'drop'].includes(field)) {
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
