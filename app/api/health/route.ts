import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gamesDir, gamesDirCandidates } from '@/lib/server/games';

/**
 * Диагностика развёртывания: по какому пути найдены игры, какие есть и сколько
 * весят. Открывается в браузере как /api/health.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const dir = gamesDir();
  const games: { id: string; bytes: number }[] = [];

  if (dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const story = await stat(join(dir, entry.name, 'story.md'));
          games.push({ id: entry.name, bytes: story.size });
        } catch {
          // папка без story.md — не игра
        }
      }
    } catch {
      // не читается — покажем пустой список
    }
  }

  return Response.json(
    {
      ok: Boolean(dir) && games.length > 0,
      cwd: process.cwd(),
      gamesDir: dir,
      candidates: gamesDirCandidates(),
      games,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
