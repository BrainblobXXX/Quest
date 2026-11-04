import { parse as parseYaml } from 'yaml';
import { PackageError, parsePackage } from './parse';
import type { Game, GameIndexEntry, ParseProblem } from './types';

/**
 * Загрузка игры: файлы пакета читаются через /api/games/* и разбираются здесь,
 * в браузере. Никакого заранее собранного JSON не существует.
 */

const BASE = '/api/games';

export type LoadedGame = { game: Game; problems: ParseProblem[] };

export async function loadIndex(): Promise<GameIndexEntry[]> {
  const res = await fetch(BASE, { cache: 'no-store' });
  if (!res.ok) throw new Error(`E_INDEX: ${res.status}`);
  return (await res.json()) as GameIndexEntry[];
}

async function text(url: string, what: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new PackageError(`${what}: ${res.status === 404 ? 'файла нет' : `ошибка ${res.status}`}`, [
      { level: 'error', code: 'E_FILE_MISSING', message: `${what} не найден в пакете` },
    ]);
  }
  return res.text();
}

async function optional(url: string): Promise<string | null> {
  const res = await fetch(url, { cache: 'no-store' });
  return res.ok ? res.text() : null;
}

export async function loadGame(id: string): Promise<LoadedGame> {
  const dir = `${BASE}/${encodeURIComponent(id)}`;

  const manifestText = await text(`${dir}/game.yaml`, 'game.yaml');
  let manifest: Record<string, unknown>;
  try {
    manifest = (parseYaml(manifestText) ?? {}) as Record<string, unknown>;
  } catch (e) {
    throw new PackageError(`game.yaml не разбирается: ${(e as Error).message}`, [
      { level: 'error', code: 'E_YAML', message: `game.yaml не разбирается: ${(e as Error).message}` },
    ]);
  }

  const storyFile = String(manifest.story ?? 'story.md');
  const storyText = await text(`${dir}/${storyFile}`, storyFile);

  const itemsFile = manifest.items ? String(manifest.items) : 'items.yaml';
  const itemsText = await optional(`${dir}/${itemsFile}`);

  return parsePackage(id, manifest, storyText, itemsText);
}
