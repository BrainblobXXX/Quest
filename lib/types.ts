export type ItemDef = {
  title: string;
  description?: string;
  icon?: string;
  countable?: boolean;
  consumable?: boolean;
};

export type Choice = {
  label: string;
  goto: string;
  if?: string;
  take?: string | Record<string, number>;
  use?: string;
  drop?: string;
};

export type RollOutcome = { min?: number; goto: string };

export type MoodTracks = string | string[] | null;

export type Scene = {
  key: string;
  title: string;
  text: string;
  image?: string;
  mood?: string;
  music?: string;
  choices?: Choice[];
  next?: string | { roll: string; outcomes: RollOutcome[] };
  ending?: boolean;
};

export type Game = {
  format: string;
  id: string;
  title: string;
  author?: string;
  language?: string;
  start: string;
  startItems?: Record<string, number>;
  items?: Record<string, ItemDef>;
  moods?: Record<string, MoodTracks>;
  defaultMood?: string | null;
  scenes: Record<string, Scene>;
};

export type GameState = {
  game: string;
  format: string;
  scene: string;
  inventory: Record<string, number>;
  flags: string[];
  stats: Record<string, number>;
  visited: string[];
  updated: string;
};

export type GameIndexEntry = { id: string; title: string };
