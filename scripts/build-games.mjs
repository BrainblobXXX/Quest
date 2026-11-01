#!/usr/bin/env node
/**
 * Сборка игровых пакетов: games/<id>/ → public/games/<id>.json + index.json
 *
 * Пакет: game.yaml, story.md, items.yaml (опц.), assets/ (опц.)
 * Формат описан в QuestRules.md (вне репозитория), пайплайн — в MVP.md §8.3.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

function parseStory(pkg, md) {
  const scenes = {};
  let key = null;
  let buffer = [];
  let choices = null;

  const flush = () => {
    if (key === null) return;
    const text = buffer.join('\n').trim();
    scenes[key] = { key, text, choices: choices ?? [] };
  };

  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      key = heading[1];
      buffer = [];
      choices = null;
      if (scenes[key]) fail(pkg, `дубль сцены «${key}»`);
      continue;
    }
    if (key === null) {
      if (line.trim()) fail(pkg, `текст до первой сцены: «${line.slice(0, 40)}»`);
      continue;
    }
    const m = CHOICE_RE.exec(line.trim());
    if (m) {
      if (choices === null) choices = [];
      const mods = {};
      if (m.groups.mods) {
        for (const part of m.groups.mods.split(',')) {
          const kv = /^\s*(\w+)\s*:\s*(.+?)\s*$/.exec(part);
          if (!kv) { fail(pkg, `сцена ${key}: не разобран модификатор «${part.trim()}»`); continue; }
          mods[kv[1]] = kv[2];
        }
      }
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
    if (m.ending) scene.ending = true;
    if (m.next) scene.next = m.next;
    if (m.on_enter) warn(pkg, `сцена ${key}: on_enter не поддерживается движком MVP`);
  }
  for (const key of Object.keys(meta)) {
    if (!scenes[key]) fail(pkg, `в game.yaml есть сцена «${key}», а в story.md её нет`);
  }

  let items = {};
  if (manifest.items && existsSync(join(dir, manifest.items))) {
    try {
      items = parseYaml(readFileSync(join(dir, manifest.items), 'utf8')).items ?? {};
    } catch (e) {
      fail(pkg, `${manifest.items} не читается: ${e.message}`);
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

  return {
    format: manifest.format,
    id: manifest.id ?? id,
    title: manifest.title ?? id,
    author: manifest.author,
    language: manifest.language,
    start: String(manifest.start),
    startItems,
    items,
    scenes: Object.fromEntries(Object.entries(scenes).map(([k, s]) => [k, { ...s, key: k }])),
    dir,
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
  const { dir, ...data } = game;
  writeFileSync(join(OUT_DIR, `${id}.json`), JSON.stringify(data, null, 2));

  // ассеты пакета копируются рядом с json
  if (existsSync(join(dir, 'assets'))) {
    cpSync(join(dir, 'assets'), join(OUT_DIR, id, 'assets'), { recursive: true });
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
