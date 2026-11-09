import type { GameState } from './types';

export type Settings = {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  crt: boolean;
};

const SAVE_KEY = (id: string) => `quest:save:${id}`;
const SETTINGS_KEY = 'quest:settings';

export function loadSave(id: string): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY(id));
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVE_KEY(state.game), JSON.stringify(state));
  } catch {
    /* переполнение или приватный режим — молча теряем автосейв */
  }
}

export function clearSave(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SAVE_KEY(id));
}

export function loadSettings(): Settings {
  const fallback: Settings = { sound: true, music: true, soundVolume: 1, musicVolume: 0.7, crt: true };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Settings>) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
