#!/usr/bin/env node
/**
 * Next.js в режиме `output: 'standalone'` не кладёт в .next/standalone ни
 * статику, ни public/, ни пакеты игр. Сервер читает их относительно своей
 * папки, поэтому перед запуском они должны лежать рядом с server.js.
 *
 * Здесь же копируются games/ — именно оттуда API читает story.md, game.yaml
 * и ассеты в рантайме (сборки JSON больше нет).
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
  [join(root, '.next', 'static'), join(standalone, '.next', 'static')],
  [join(root, 'public'), join(standalone, 'public')],
  [join(root, 'games'), join(standalone, 'games')],
]) {
  if (!existsSync(from)) continue;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log('скопировано:', from.replace(root + '/', ''), '→', to.replace(root + '/', ''));
}
