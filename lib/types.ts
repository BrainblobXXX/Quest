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
  /** буква варианта: А, Б, В… — ею помечена фраза в тексте и отсылка [А] */
  letter?: string;
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
  /** исходный текст сцены из story.md: теги, отсылки, строки «Вариант А» */
  raw?: string;
  /** текст, разбитый по тегам вариантов: из него рисуется подсветка */
  rich?: { text: string; letter?: string }[];
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
  /** отпечаток версии книги: считается в браузере по тексту story.md */
  rev?: string;
  scenes: Record<string, Scene>;
};

export type GameState = {
  game: string;
  format: string;
  /** версия книги, на которой сделано сохранение */
  rev?: string;
  scene: string;
  inventory: Record<string, number>;
  flags: string[];
  stats: Record<string, number>;
  visited: string[];
  updated: string;
};

export type GameIndexEntry = {
  id: string;
  title: string;
  /** когда в последний раз менялся пакет на диске (ISO) */
  updatedAt?: string;
};

/** проблема разбора пакета: показывается в интерфейсе, а не в консоли */
export type ParseProblem = {
  level: 'error' | 'warn';
  code: string;
  message: string;
  scene?: string;
};
