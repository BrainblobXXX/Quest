import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { GameIndexEntry } from '@/lib/types';
import { gamesDir } from '@/lib/server/games';

/**
 * Список игр: читается прямо из games/ на диске.
 * Никакой сборки JSON — браузер получает те же файлы, что лежат в пакете.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const dir = gamesDir();
  if (!dir) {
    // каталога games/ нет ни по одному пути — это сбой развёртывания
    return Response.json(
      { error: 'games directory is not available' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let entries: string[] = [];
  try {
    entries = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return Response.json([], { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const games: GameIndexEntry[] = [];
  for (const id of entries) {
    const gameDir = join(dir, id);
    try {
      const manifest = parseYaml(await readFile(join(gameDir, 'game.yaml'), 'utf8')) as {
        title?: string;
        author?: string;
        genre?: string;
        type?: string;
        annotation?: string;
        status?: string;
      } | null;
      const story = await stat(join(gameDir, 'story.md'));
      const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
      games.push({
        id,
        title: String(manifest?.title ?? id),
        author: text(manifest?.author),
        genre: text(manifest?.genre),
        type: text(manifest?.type),
        status: text(manifest?.status),
        annotation: text(manifest?.annotation),
        updatedAt: story.mtime.toISOString(),
      });
    } catch {
      // папка без game.yaml/story.md — не игра, молча пропускаем
    }
  }

  return Response.json(games, { headers: { 'Cache-Control': 'no-store' } });
}
