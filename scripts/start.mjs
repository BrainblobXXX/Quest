#!/usr/bin/env node
/**
 * Запуск MVP: перед стартом сервера пересобирает игры из games/ и кладёт
 * свежий public/games в standalone-сборку.
 *
 * Зачем: Next.js с `output: 'standalone'` отдаёт статику из
 * .next/standalone/public, а не из public/. Без этого шага пакет, положенный
 * в games/, после запуска не виден — сервер продолжает отдавать JSON из
 * прошлой сборки (см. scripts/copy-standalone.mjs).
 *
 * Использование:
 *   npm start             — пересборка игр + запуск сервера
 *   npm run start:server  — запуск сервера как есть, без пересборки
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standalone = join(root, '.next', 'standalone');
const server = join(standalone, 'server.js');
const built = join(root, 'public', 'games');
const served = join(standalone, 'public', 'games');

if (!existsSync(server)) {
  console.error('Нет .next/standalone/server.js — сначала собери приложение: npm run build');
  process.exit(1);
}

console.log('→ сборка игр из games/');
const build = spawnSync(process.execPath, [join(root, 'scripts', 'build-games.mjs')], {
  stdio: 'inherit',
  cwd: root,
});
if (build.status !== 0) {
  console.error('Сборка игр упала — сервер не запускаю, ошибки выше.');
  process.exit(build.status ?? 1);
}

if (existsSync(built)) {
  // rmSync, а не поверх cpSync: удалённые игры не должны оставаться в standalone
  rmSync(served, { recursive: true, force: true });
  cpSync(built, served, { recursive: true });
  console.log('→ public/games → .next/standalone/public/games');
}

const port = process.env.PORT ?? '3000';
console.log(`→ сервер на порту ${port}`);
const child = spawn(process.execPath, [server], { stdio: 'inherit', cwd: root });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(signal ? 0 : (code ?? 0)));
