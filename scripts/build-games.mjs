#!/usr/bin/env node
/**
 * Сборка игровых пакетов: games/<id>/ → public/games/<id>.json + index.json
 *
 * Пакет: game.yaml, story.md, items.yaml (опц.), assets/ (опц.)
 * Формат описан в QuestRules.md (вне репозитория), пайплайн — в MVP.md §8.3.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = process.cwd();
const GAMES_DIR = join(ROOT, 'games');
const OUT_DIR = join(ROOT, 'public', 'games');

const errors = [];
const warnings = [];
const fail = (pkg, msg) => errors.push(`${pkg}: ${msg}`);
const warn = (pkg, msg) => warnings.push(`${pkg}: ${msg}`);

/* ── story.md ───────────────────────────────────────────── */

const CHOICE_RE = /^- \[(?<label>.+?)\]\((?<target>[^)\s]+)\)\s*(?:\{(?<mods>.*)\})?\s*$/;

function parseMods(pkg, key, raw) {
  const mods = {};
  if (!raw) return mods;
  for (const part of raw.split(',')) {
    const kv = /^\s*(\w+)\s*:\s*(.+?)\s*$/.exec(part);
    if (!kv) { fail(pkg, `сцена ${key}: не разобран модификатор «${part.trim()}»`); continue; }
    mods[kv[1]] = kv[2];
  }
  return mods;
}

function parseStory(pkg, md) {
  const scenes = {};
  let key = null;
  let buffer = [];
  let choices = null;
  let markers = [];

  const flush = () => {
    if (key === null) return;
    const text = buffer.join('\n').trim();
    scenes[key] = { key, text, choices: choices ?? [], markers };
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
      if (scenes[key]) fail(pkg, `дубль сцены «${key}»`);
      continue;
    }
    if (key === null) {
      if (line.trim()) fail(pkg, `текст до первой сцены: «${line.slice(0, 40)}»`);
      continue;
    }
    const vm = /^Вариант\s+([А-ЯЁA-Z])\s*(?:\{([^}]*)\})?\s*$/.exec(line.trim());
    if (vm) {
      markers.push({ letter: vm[1], mods: parseMods(pkg, key, vm[2]) });
      continue;
    }
    const m = CHOICE_RE.exec(line.trim());
    if (m) {
      if (choices === null) choices = [];
      const mods = parseMods(pkg, key, m.groups.mods);
      choices.push({ label: m.groups.label, goto: m.groups.target, ...mods });
      continue;
    }
    if (choices !== null && line.trim()) {
      fail(pkg, `сцена ${key}: текст после списка выборов`);
    }
    buffer.push(line);
  }
  flush();
  return scenes;
}

/* ── game.yaml ──────────────────────────────────────────── */

function buildPackage(id) {
  const dir = join(GAMES_DIR, id);
  const pkg = id;
  const manifestPath = join(dir, 'game.yaml');
  if (!existsSync(manifestPath)) { fail(pkg, 'нет game.yaml'); return null; }

  let manifest;
  try {
    manifest = parseYaml(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail(pkg, `game.yaml не читается: ${e.message}`);
    return null;
  }

  const storyFile = manifest.story ?? 'story.md';
  const storyPath = join(dir, storyFile);
  if (!existsSync(storyPath)) { fail(pkg, `нет ${storyFile}`); return null; }

  const scenes = parseStory(pkg, readFileSync(storyPath, 'utf8'));
  const meta = manifest.scenes ?? {};

  for (const [key, scene] of Object.entries(scenes)) {
    const m = meta[key] ?? {};
    if (!m.title) warn(pkg, `сцена ${key} без title, взято «Глава ${key}»`);
    scene.title = m.title ?? `Глава ${key}`;
    if (m.image) scene.image = m.image;
    if (m.music) scene.music = m.music;
    if (m.mood) scene.mood = m.mood;
    if (m.ending) scene.ending = true;
    if (m.next) scene.next = m.next;
    if (m.on_enter) warn(pkg, `сцена ${key}: on_enter не поддерживается движком MVP`);
  }
  for (const key of Object.keys(meta)) {
    if (!scenes[key]) fail(pkg, `в game.yaml есть сцена «${key}», а в story.md её нет`);
  }

  // аннотированный story.md: {А}…{/А} + [А], цели в meta.scenes[k].variants
  for (const [key, scene] of Object.entries(scenes)) {
    const variants = meta[key]?.variants;
    if (!variants) continue;
    const tags = [...scene.text.matchAll(/\{([А-ЯЁA-Z])\}([\s\S]*?)\{\/\1\}/g)];
    const letters = Object.keys(variants);
    if (!tags.length) fail(pkg, `сцена ${key}: есть variants, но нет тегов {А}…{/А}`);
    scene.choices = tags.map((t) => {
      const letter = t[1];
      const target = variants[letter];
      if (!target) fail(pkg, `сцена ${key}: для тега ${letter} нет цели в variants`);
      let label = t[2]
        .replace(/\s*(?:на|в|к|с|от|до|из|по|за)?\s*\[[А-ЯЁA-Z]\]/g, ' ')
        .replace(/\s+/g, ' ').trim()
        .replace(/^(?:Если|Или|А если|Если же|Или же)\s+/i, '')
        .replace(/^(?:Решай|Реши|Выбирай|Смотри)\s*,?\s*/i, '')
        .replace(/(?:^|[,\s])то(?=[,\s]|$)\s*.*$/i, '')
        .replace(/[\s,]+$/, '');
      if (label) label = label[0].toUpperCase() + label.slice(1);
      label = label.replace(/^[А-ЯЁ]/, (c) => c.toUpperCase());
      label = label.replace(/[\s,;:—–-]+$/, '').replace(/^(?:Если|Или|А если|Если же|Или же)[,\s]+/i, '');
      if (label.length > 70) {
        const cut = Math.max(label.lastIndexOf(',', 70), label.lastIndexOf(' ', 70));
        label = (cut > 20 ? label.slice(0, cut) : label.slice(0, 70)).trim();
        label = label.replace(/[\s,]+$/, '');
      }
      if (label) label = label[0].toUpperCase() + label.slice(1);
      if (!label) label = `Вариант ${letter}`;
      return { label, goto: String(target) };
    });
    const modsByLetter = Object.fromEntries(scene.markers.map((m) => [m.letter, m.mods]));
    scene.choices.forEach((c, i) => Object.assign(c, modsByLetter[tags[i][1]] || {}));
    const tagLetters = new Set(tags.map((t) => t[1]));
    for (const l of letters) {
      if (!tagLetters.has(l)) fail(pkg, `сцена ${key}: variants.${l} без тега {${l}}…{/${l}}`);
    }
    for (const m of scene.text.matchAll(/\[([А-ЯЁA-Z])\]/g)) {
      if (!variants[m[1]]) fail(pkg, `сцена ${key}: отсылка [${m[1]}] без цели в variants`);
    }
    scene.text = scene.text
      .replace(/\{([А-ЯЁA-Z])\}([\s\S]*?)\{\/\1\}/g, '$2')
      .replace(/\s+(?:на|в|к)\s*\[([А-ЯЁA-Z])\]/g, '')
      .replace(/\s*\[([А-ЯЁA-Z])\]/g, '')
      .replace(/\s*([.,!?;:])\s*/g, '$1 ')
      .replace(/\s+/g, ' ').trim();
  }

  let items = {};
  if (manifest.items && existsSync(join(dir, manifest.items))) {
    try {
      items = parseYaml(readFileSync(join(dir, manifest.items), 'utf8')).items ?? {};
    } catch (e) {
      fail(pkg, `${manifest.items} не читается: ${e.message}`);
    }
  }

  const defaultMood = manifest.default_mood ?? null;
  const moods = manifest.moods ?? {};
  for (const [key, value] of Object.entries(moods)) {
    // null — настроение объявлено по плану soundtrack.md, трека пока нет
    if (value === null) continue;
    const files = Array.isArray(value) ? value : [value];
    for (const f of files) {
      if (typeof f !== 'string' || !f.trim()) fail(pkg, `moods.${key}: пустой путь к треку`);
      // существование файла проверяется при сборе ассетов ниже (addAsset)
    }
  }
  if (defaultMood && !(defaultMood in moods)) {
    fail(pkg, `default_mood «${defaultMood}» не объявлен в moods`);
  }
  for (const [key, scene] of Object.entries(scenes)) {
    if (scene.mood && !(scene.mood in moods)) {
      fail(pkg, `сцена ${key}: mood «${scene.mood}» не объявлен в moods`);
    }
  }

  /* проверки */
  if (!manifest.start) fail(pkg, 'не задан start');
  if (manifest.start && !scenes[manifest.start]) fail(pkg, `start «${manifest.start}» не существует`);
  if (manifest.format !== 'quest/1') fail(pkg, `format «${manifest.format}», ожидается quest/1`);

  for (const [key, scene] of Object.entries(scenes)) {
    const targets = [];
    if (typeof scene.next === 'string') targets.push(scene.next);
    else if (scene.next?.outcomes) {
      if (scene.next.outcomes.some((o) => o.goto === undefined)) fail(pkg, `сцена ${key}: исход без goto`);
      scene.next.outcomes.forEach((o) => targets.push(o.goto));
      if (!scene.next.outcomes.at(-1) || scene.next.outcomes.at(-1).min !== undefined)
        fail(pkg, `сцена ${key}: у броска нет последнего исхода без min`);
    }
    scene.choices.forEach((c) => {
      targets.push(c.goto);
      for (const k of Object.keys(c)) {
        if (!['label', 'goto', 'if', 'take', 'use', 'drop'].includes(k))
          fail(pkg, `сцена ${key}: неизвестный ключ выбора «${k}»`);
      }
      if (c.take && !items[c.take]) fail(pkg, `сцена ${key}: take ссылается на необъявленный предмет «${c.take}»`);
      if (c.use && !items[c.use]) fail(pkg, `сцена ${key}: use ссылается на необъявленный предмет «${c.use}»`);
      if (c.drop && !items[c.drop]) fail(pkg, `сцена ${key}: drop ссылается на необъявленный предмет «${c.drop}»`);
      for (const it of (c.if ?? '').match(/has_item\s+([a-z0-9_]+)/gi) ?? []) {
        const itemId = it.split(/\s+/)[1];
        if (!items[itemId]) fail(pkg, `сцена ${key}: if ссылается на необъявленный предмет «${itemId}»`);
      }
    });
    for (const t of targets) {
      if (!scenes[t]) fail(pkg, `сцена ${key}: переход в несуществующую сцену «${t}»`);
    }
    const worded = /\[[^\]]*(?:глав[а-яё]*\s*\d+|\d+\s*глава)[^\]]*\]|к\s+[а-яё]+ой\s+главе|см\.\s*главу\s*\d+/i.exec(scene.text);
    if (worded) {
      warn(pkg, `сцена ${key}: похоже на словесную отсылку «${worded[0].slice(0, 50)}» — проверь вручную (C_REF_WORDED)`);
    }
    if (!targets.length && !scene.ending) fail(pkg, `сцена ${key}: тупик без ending`);
    if (targets.length && scene.choices.length === 0 && scene.next === undefined)
      fail(pkg, `сцена ${key}: есть цели, но нет ни next, ни выборов`);
  }

  // достижимость от стартовой сцены
  const reachable = new Set();
  const stack = [String(manifest.start)];
  while (stack.length) {
    const k = stack.pop();
    if (reachable.has(k) || !scenes[k]) continue;
    reachable.add(k);
    const sc = scenes[k];
    if (typeof sc.next === 'string') stack.push(sc.next);
    else if (sc.next?.outcomes) sc.next.outcomes.forEach((o) => stack.push(o.goto));
    sc.choices.forEach((c) => stack.push(c.goto));
  }
  const unreachable = Object.keys(scenes).filter((k) => !reachable.has(k));
  if (unreachable.length) {
    warn(pkg, `недостижимые сцены (${unreachable.length}): ${unreachable.slice(0, 8).join(', ')}`);
  }

  const startItems = manifest.start_items ?? {};
  for (const [itemId, n] of Object.entries(startItems)) {
    if (!items[itemId]) fail(pkg, `start_items: предмет «${itemId}» не объявлен`);
    if (!Number.isInteger(n) || n < 1) fail(pkg, `start_items: у «${itemId}» количество ${n}`);
  }

  // ассеты: копируются по путям, а не «папкой assets/» — пакет может держать
  // иллюстрации и музыку где угодно (assets/, illustrations/, music/, …)
  const assets = new Set();
  const addAsset = (path, where) => {
    if (/^(\/|[A-Za-z]:\\)/.test(path) || path.split(/[\\/]/).includes('..')) {
      fail(pkg, `${where}: путь «${path}» выходит за пределы пакета`);
      return;
    }
    if (!existsSync(join(dir, path))) {
      fail(pkg, `${where}: нет файла «${path}»`);
      return;
    }
    assets.add(path);
  };
  for (const [key, scene] of Object.entries(scenes)) {
    if (scene.image) addAsset(scene.image, `сцена ${key}: image`);
    if (scene.music) addAsset(scene.music, `сцена ${key}: music`);
  }
  for (const [key, value] of Object.entries(moods)) {
    if (value === null) continue;
    for (const file of Array.isArray(value) ? value : [value]) {
      if (typeof file === 'string' && file.trim()) addAsset(file, `moods.${key}`);
    }
  }
  for (const [itemId, item] of Object.entries(items)) {
    if (item?.icon) addAsset(item.icon, `предмет ${itemId}: icon`);
  }

  return {
    format: manifest.format,
    id: manifest.id ?? id,
    title: manifest.title ?? id,
    author: manifest.author,
    language: manifest.language,
    start: String(manifest.start),
    startItems,
    items,
    moods,
    defaultMood,
    scenes: Object.fromEntries(Object.entries(scenes).map(([k, s]) => [k, { ...s, key: k }])),
    dir,
    assets: [...assets],
  };
}

/* ── сборка ─────────────────────────────────────────────── */

if (!existsSync(GAMES_DIR)) { console.error('нет папки games/'); process.exit(1); }
// чистим прошлую сборку, чтобы удалённые игры не висели
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const ids = readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const index = [];
for (const id of ids) {
  const game = buildPackage(id);
  if (!game) continue;
  const { dir, assets, ...data } = game;
  writeFileSync(join(OUT_DIR, `${id}.json`), JSON.stringify(data, null, 2));

  // ассеты копируются с сохранением относительных путей рядом с json
  for (const rel of assets) {
    const target = join(OUT_DIR, id, rel);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(dir, rel), target);
  }
  index.push({ id, title: data.title });
}

writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));

for (const w of warnings) console.warn('WARN', w);
if (errors.length) {
  console.error('\nОШИБКИ СБОРКИ:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log(`Собрано игр: ${index.length}`, index.map((g) => g.id).join(', '));
