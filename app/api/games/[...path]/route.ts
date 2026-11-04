import { readFile, stat } from 'node:fs/promises';
import { contentType, resolveInGames } from '@/lib/server/games';

/**
 * Отдача файлов пакета как есть: story.md, game.yaml, items.yaml, картинки, музыка.
 *
 * Браузер разбирает story.md и game.yaml сам (lib/parse.ts), поэтому здесь не
 * нужны ни сборка JSON, ни копирование в public/. Для аудио поддержан Range,
 * иначе iOS Safari отказывается проигрывать mp3.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const file = resolveInGames(path);
  if (!file) return new Response('не найдено', { status: 404 });

  let info;
  try {
    info = await stat(file);
  } catch {
    return new Response('не найдено', { status: 404 });
  }
  if (!info.isFile()) return new Response('не найдено', { status: 404 });

  const type = contentType(file);
  const isText = type.startsWith('text/') || type.startsWith('application/json');
  const headers = new Headers({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    // тексты пакета меняются при каждой правке — их кэшировать нельзя
    'Cache-Control': isText ? 'no-store' : 'public, max-age=60',
  });

  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : info.size - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < info.size) {
        const stop = Math.min(end, info.size - 1);
        const buffer = await readFile(file);
        headers.set('Content-Range', `bytes ${start}-${stop}/${info.size}`);
        headers.set('Content-Length', String(stop - start + 1));
        return new Response(buffer.subarray(start, stop + 1), { status: 206, headers });
      }
    }
  }

  const buffer = await readFile(file);
  headers.set('Content-Length', String(buffer.byteLength));
  return new Response(buffer, { status: 200, headers });
}
