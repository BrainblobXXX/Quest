import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/**
 * Где лежат пакеты игр.
 *
 * В dev это <проект>/games. В standalone-сборке сервер стартует из
 * <проект>/.next/standalone, и туда games/ копирует postbuild. Но на хостинге
 * копия иногда отсутствует (артефакт обрезан, диск пересоздан) — при этом сам
 * репозиторий рядом цел. Поэтому каталог ищется по списку кандидатов, а не
 * берётся жёстко из cwd.
 */
function candidates(): string[] {
  const list = [
    process.env.GAMES_DIR,
    join(process.cwd(), 'games'),
    join(process.cwd(), '..', 'games'),
    join(process.cwd(), '..', '..', 'games'),
  ];
  return list.filter((value): value is string => Boolean(value)).map((value) => resolve(value));
}

function looksLikeGames(dir: string): boolean {
  try {
    return readdirSync(dir, { withFileTypes: true }).some(
      (entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'game.yaml')),
    );
  } catch {
    return false;
  }
}

let cached: string | null = null;
let warned = false;

/** Каталог с играми или null, если ни один кандидат не подошёл. */
export function gamesDir(): string | null {
  if (cached && looksLikeGames(cached)) return cached;

  const found = candidates().find(looksLikeGames) ?? null;
  if (found && found !== cached && found !== resolve(process.cwd(), 'games') && !warned) {
    warned = true;
    console.warn(`[games] каталог найден не в cwd: ${found}`);
  }
  cached = found;
  return found;
}

/** Все проверенные пути — для диагностики через /api/health. */
export function gamesDirCandidates(): { path: string; ok: boolean }[] {
  return candidates().map((path) => ({ path, ok: looksLikeGames(path) }));
}

/**
 * Безопасный путь внутри games/.
 * Возвращает null, если путь пытается выйти наружу или указывает на пустой сегмент.
 */
export function resolveInGames(parts: string[]): string | null {
  const root = gamesDir();
  if (!root) return null;
  if (!parts.length) return null;
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) return null;
  const target = resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

const TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

export function contentType(path: string): string {
  const dot = path.lastIndexOf('.');
  return (dot >= 0 && TYPES[path.slice(dot).toLowerCase()]) || 'application/octet-stream';
}
