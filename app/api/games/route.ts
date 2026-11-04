import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { GameIndexEntry } from '@/lib/types';
import { GAMES_DIR } from '@/lib/server/games';

/**
 * Список игр: читается прямо из games/ на диске.
 * Никакой сборки JSON — браузер получает те же файлы, что лежат в пакете.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  let entries: string[] = [];
  try {
    entries = (await readdir(GAMES_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return Response.json([] satisfies GameIndexEntry[], { headers: { 'Cache-Control': 'no-store' } });
  }

  const games: GameIndexEntry[] = [];
  for (const id of entries) {
    const dir = join(GAMES_DIR, id);
    try {
      const manifest = parseYaml(await readFile(join(dir, 'game.yaml'), 'utf8')) as {
        title?: string;
      } | null;
      const story = await stat(join(dir, 'story.md'));
      games.push({
        id,
        title: String(manifest?.title ?? id),
        updatedAt: story.mtime.toISOString(),
      });
    } catch {
      // папка без game.yaml/story.md — не игра, молча пропускаем
    }
  }

  return Response.json(games, { headers: { 'Cache-Control': 'no-store' } });
}
