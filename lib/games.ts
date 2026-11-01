import type { Game, GameIndexEntry } from './types';

export async function loadIndex(): Promise<GameIndexEntry[]> {
  const res = await fetch('/games/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`E_INDEX: ${res.status}`);
  return (await res.json()) as GameIndexEntry[];
}

export async function loadGame(id: string): Promise<Game> {
  const res = await fetch(`/games/${id}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`E_GAME: ${id} (${res.status})`);
  return (await res.json()) as Game;
}
