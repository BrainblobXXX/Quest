#!/usr/bin/env node
/**
 * Next.js standalone не копирует public/ и .next/static/ в .next/standalone.
 * Без этого шага на хостинге не грузятся стили, скрипты и игры из public/games.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  console.log('standalone-сборки нет — шаг пропущен');
  process.exit(0);
}

for (const [from, to] of [
  [join(root, 'public'), join(standalone, 'public')],
  [join(root, '.next', 'static'), join(standalone, '.next', 'static')],
]) {
  if (!existsSync(from)) continue;
  // чистим приёмник: cpSync копирует поверх и оставляет файлы удалённых игр
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log('скопировано:', from.replace(root + '/', ''), '→', to.replace(root + '/', ''));
}
