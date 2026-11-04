import { join, resolve, sep } from 'node:path';

/** корень пакетов: одинаково для dev и для standalone-сборки (cwd у них свой) */
export const GAMES_DIR = join(process.cwd(), 'games');

/**
 * Безопасный путь внутри games/.
 * Возвращает null, если путь пытается выйти наружу или указывает на пустой сегмент.
 */
export function resolveInGames(parts: string[]): string | null {
  if (!parts.length) return null;
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) return null;
  const target = resolve(GAMES_DIR, ...parts);
  const root = resolve(GAMES_DIR);
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
