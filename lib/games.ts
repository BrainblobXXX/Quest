import type { Game, GameIndexEntry } from './types';

/**
 * Версия сборки игр из public/games/build.json (поле builtAt).
 * Нужна, чтобы ?v= менялся от сборки к сборке: браузер, CDN и любой прокси
 * не могут отдать прошлый сюжет по тому же URL.
 */
let versionPromise: Promise<string> | null = null;

function buildVersion(): Promise<string> {
  if (!versionPromise) {
    versionPromise = fetch('/games/build.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => encodeURIComponent(String(data?.builtAt ?? '')))
      .catch(() => '');
  }
  return versionPromise;
}

async function withVersion(url: string): Promise<string> {
  const version = await buildVersion();
  if (!version) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
}

export async function loadIndex(): Promise<GameIndexEntry[]> {
  const res = await fetch(await withVersion('/games/index.json'), { cache: 'no-store' });
  if (!res.ok) throw new Error(`E_INDEX: ${res.status}`);
  return (await res.json()) as GameIndexEntry[];
}

export async function loadGame(id: string): Promise<Game> {
  const res = await fetch(await withVersion(`/games/${id}.json`), { cache: 'no-store' });
  if (!res.ok) throw new Error(`E_GAME: ${id} (${res.status})`);
  return (await res.json()) as Game;
}
