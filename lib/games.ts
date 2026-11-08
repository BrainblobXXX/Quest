import { parse as parseYaml } from 'yaml';
import { PackageError, parsePackage } from './parse';
import type { Game, GameIndexEntry, ParseProblem } from './types';

/**
 * Загрузка игры: файлы пакета читаются через /api/games/* и разбираются здесь,
 * в браузере. Никакого заранее собранного JSON не существует.
 */

const BASE = '/api/games';

export type LoadedGame = { game: Game; problems: ParseProblem[] };

/** этапы загрузки книги: по ним рисуется экран BOOK LOADER */
export type LoadStage = 'mount' | 'manifest' | 'story' | 'items' | 'parse' | 'ready';

export type LoadProgress = {
  stage: LoadStage;
  /** сколько байт уже прочитано на текущем шаге */
  loaded?: number;
  /** полный размер шага, если сервер сообщил Content-Length */
  total?: number;
};

export type LoadListener = (progress: LoadProgress) => void;

async function fetchIndex(): Promise<GameIndexEntry[]> {
  // ?t= — чтобы прокси и CDN не отдали список от прошлого деплоя
  const res = await fetch(`${BASE}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`E_INDEX: ${res.status}`);
  return (await res.json()) as GameIndexEntry[];
}

/**
 * Список игр с повторами: во время деплоя инстанс может на секунду оказаться без
 * каталога games/, и раньше приложение навсегда запоминало пустую библиотеку.
 */
export async function loadIndex(attempts = 3): Promise<GameIndexEntry[]> {
  let lastError: unknown = new Error('E_INDEX');
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const list = await fetchIndex();
      if (list.length) return list;
      lastError = new Error('E_INDEX_EMPTY');
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error('E_INDEX');
}

async function text(
  url: string,
  what: string,
  onBytes?: (loaded: number, total: number) => void,
): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new PackageError(`${what}: ${res.status === 404 ? 'файла нет' : `ошибка ${res.status}`}`, [
      { level: 'error', code: 'E_FILE_MISSING', message: `${what} не найден в пакете` },
    ]);
  }

  // story.md — самый большой файл пакета: читаем потоком, чтобы показать
  // реальный счётчик байт на экране загрузки, а не неподвижную строку
  if (!onBytes || !res.body) return res.text();

  const total = Number(res.headers.get('content-length') ?? 0);
  // заголовки уже пришли — показываем размер файла, даже если тело ещё в пути
  onBytes(0, total);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    loaded += value.byteLength;
    parts.push(decoder.decode(value, { stream: true }));
    onBytes(loaded, total);
  }
  parts.push(decoder.decode());
  return parts.join('');
}

async function optional(url: string): Promise<string | null> {
  const res = await fetch(url, { cache: 'no-store' });
  return res.ok ? res.text() : null;
}

export async function loadGame(id: string, onProgress?: LoadListener): Promise<LoadedGame> {
  const dir = `${BASE}/${encodeURIComponent(id)}`;
  const report: LoadListener = onProgress ?? (() => {});

  report({ stage: 'mount' });
  const manifestText = await text(`${dir}/game.yaml`, 'game.yaml');
  report({ stage: 'manifest' });

  let manifest: Record<string, unknown>;
  try {
    manifest = (parseYaml(manifestText) ?? {}) as Record<string, unknown>;
  } catch (e) {
    throw new PackageError(`game.yaml не разбирается: ${(e as Error).message}`, [
      { level: 'error', code: 'E_YAML', message: `game.yaml не разбирается: ${(e as Error).message}` },
    ]);
  }

  // items.yaml и stats.yaml необязательны и объявляются в манифесте.
  // Без объявления не запрашиваем их вовсе: у книг без предметов/статов
  // не будет лишнего 404, а объявленные файлы идут параллельно с story.md.
  const itemsFile = manifest.items ? String(manifest.items) : null;
  const itemsPromise = itemsFile
    ? optional(`${dir}/${itemsFile}`).catch(() => null)
    : Promise.resolve(null);

  const statsFile = manifest.stats ? String(manifest.stats) : null;
  const statsPromise = statsFile
    ? optional(`${dir}/${statsFile}`).catch(() => null)
    : Promise.resolve(null);

  const flagsFile = manifest.flags ? String(manifest.flags) : null;
  const flagsPromise = flagsFile
    ? optional(`${dir}/${flagsFile}`).catch(() => null)
    : Promise.resolve(null);

  const mechanicsFile = manifest.mechanics ? String(manifest.mechanics) : null;
  const mechanicsPromise = mechanicsFile
    ? optional(`${dir}/${mechanicsFile}`).catch(() => null)
    : Promise.resolve(null);

  const codesFile = manifest.codes ? String(manifest.codes) : null;
  const codesPromise = codesFile
    ? optional(`${dir}/${codesFile}`).catch(() => null)
    : Promise.resolve(null);

  const storyFile = String(manifest.story ?? 'story.md');
  report({ stage: 'story', loaded: 0 });
  const storyText = await text(`${dir}/${storyFile}`, storyFile, (loaded, total) =>
    report({ stage: 'story', loaded, total: total || undefined }),
  );
  report({ stage: 'items' });
  const itemsText = await itemsPromise;
  const statsText = await statsPromise;
  const flagsText = await flagsPromise;
  const mechanicsText = await mechanicsPromise;
  const codesText = await codesPromise;
  report({ stage: 'parse' });

  const parsed = parsePackage(id, manifest, storyText, itemsText, statsText, flagsText, mechanicsText, codesText);
  report({ stage: 'ready' });
  return parsed;
}
