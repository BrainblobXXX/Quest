export type ItemDef = {
  title: string;
  description?: string;
  icon?: string;
  countable?: boolean;
  consumable?: boolean;
  /** формула урона: 1d6, 2d6+5, 1d6-3… */
  damage?: string;
  /** id предмета-патронов, если оружие огнестрельное */
  ammo?: string;
  /** id характеристики, которую восстанавливает предмет */
  restore?: string;
};

export type StatDef = {
  title: string;
  initial?: number;
  min?: number;
  max?: number;
};

export type Choice = {
  label: string;
  goto: string;
  /** буква варианта: А, Б, В… — ею помечена фраза в тексте и отсылка [А] */
  letter?: string;
  if?: string;
  take?: string | string[] | Record<string, number>;
  use?: string;
  drop?: string;
  /** установить флаги: строка или список */
  set?: string | string[];
  /** изменение характеристик при выборе: {money: -200} */
  stat?: Record<string, number>;
};

export type RollOutcome = { min?: number; goto: string };

export type MoodTracks = string | string[] | null;

/**
 * Эффект при входе в сцену (game.yaml → on_enter).
 * `take` — выдать предметы, `drop` — убрать, `set` — установить флаги,
 * `stat` — изменить характеристики.
 */
export type SceneEffect = {
  take?: string | string[] | Record<string, number>;
  drop?: string | string[];
  set?: string | string[];
  stat?: Record<string, number>;
};

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
  /** что происходит при входе в сцену: выдача и изъятие предметов */
  onEnter?: SceneEffect[];
  /** исходный текст сцены из story.md: теги, отсылки, строки «Вариант А» */
  raw?: string;
  /** текст, разбитый по тегам вариантов: из него рисуется подсветка */
  rich?: { text: string; letter?: string }[];
};

export type CombatEnemy = {
  name: string;
  /** число врагов; без него бой не запускается — данные неполные */
  count?: number;
  attack: number;
  health: number;
};

export type CombatDef = {
  scene: string;
  enemy: CombatEnemy;
  /** разрешённые id оружия; `automatic` — алиас `submachine` */
  weapon?: string[];
  win: string;
  lose?: string;
  note?: string;
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
  stats?: Record<string, StatDef>;
  /** объявленные в flags.yaml флаги; начальное состояние — пустое */
  flags?: string[];
  /** бои из mechanics.yaml по ключу сцены */
  combat?: Record<string, CombatDef>;
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
  author?: string;
  genre?: string;
  /** тип книги для колонки «Тип»: story-book, fighting-fantasy, rpg… */
  type?: string;
  annotation?: string;
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
