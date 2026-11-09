export const STATE_VERSION = 2;

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
  /** рейтинг оружия (контестный бой: 2d6 + стат + рейтинг) */
  weapon_rating?: number;
  /** рейтинг брони (контестный бой) */
  armor_rating?: number;
  /** id характеристики, которую восстанавливает предмет */
  restore?: string;
};

export type StatDef = {
  title: string;
  initial?: number;
  min?: number;
  max?: number;
  /** стартовый бросок, который прибавляется к initial (например, `2d6`) */
  roll?: string;
  /** false — технический статус, не показывать в интерфейсе */
  show?: boolean;
  /** жизненный показатель: показывается отдельным сердечком */
  vital?: boolean;
};

export type Choice = {
  label: string;
  goto: string;
  /** буква варианта: А, Б, В… — ею помечена фраза в тексте и отсылка [А] */
  letter?: string;
  if?: string;
  take?: string | string[] | Record<string, number>;
  use?: string;
  useCount?: number;
  drop?: string;
  dropCount?: number;
  /** установить флаги: строка или список */
  set?: string | string[];
  /** изменение характеристик при выборе: {money: -200} */
  stat?: Record<string, number>;
  /** изучить код при выборе */
  learn_code?: string;
};

export type RollOutcome = { min?: number; max?: number; goto: string };

export type MoodTracks = string | string[] | null;

/**
 * Эффект при входе в сцену (game.yaml → on_enter).
 * `take` — выдать предметы, `drop` — убрать, `set` — установить флаги,
 * `stat` — изменить характеристики.
 */
export type SceneEffect = {
  /** условие применения эффекта (например, `not has_item pistol`) */
  if?: string;
  take?: string | string[] | Record<string, number>;
  /** применить (списать) предмет при входе в сцену */
  use?: string;
  useCount?: number;
  /** изменить статус на случайный бросок: { stamina: "-2d6" } */
  statRoll?: Record<string, string>;
  /** уничтожить лучшее оружие игрока (по среднему урону) */
  dropBestWeapon?: boolean;
  /** изучить код из codes.yaml */
  learn_code?: string;
  /** условный переход в другую сцену (например, смерть без предмета) */
  goto?: string;
  drop?: string | string[];
  dropCount?: number;
  set?: string | string[];
  stat?: Record<string, number>;
};

export type CheckDef = {
  scene: string;
  /** проверка характеристики (2d6 + stat) */
  stat?: string;
  /** проверка навыка/сложности (Fallout) */
  skill?: string;
  /** выражение для stat-проверки: ">= 10", ">= orkishness + 5" */
  compare?: string;
  difficulty?: number;
  success: string;
  failure: string;
};

export type GambleDef = {
  scene: string;
  stat: string;
  stake: { min: number; max: number };
  /** 2d6 + stat >= win: ставка возвращается и столько же сверху */
  win: number;
  /** >= push: ставка возвращается */
  push: number;
};

export type CodeDef = {
  title: string;
  /** смещение к номеру текущей сцены или base */
  offset: number;
  /** явная база, если книга её называет */
  base?: string;
};

export type ShopOffer = {
  /** id предмета из items.yaml */
  item: string;
  price: number;
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
  /** покупки в лавке: предмет и цена */
  shop?: ShopOffer[];
  /** заголовок и валюта конкретной лавки */
  shopTitle?: string;
  shopCurrency?: string;
  /** id предмета-валюты; без него используется stats.money */
  shopCurrencyItem?: string;
  /** счётчик, который показывается под текстом сцены */
  counter?: { stat: string; max?: number; label?: string };
  /** сцена открывает панель известных кодов */
  codebook?: boolean;
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
  /** защита — сложность атаки игрока */
  defense?: number;
  health: number;
  /** урон оружия врага (Fallout) */
  weapon?: string;
};

export type CombatDef = {
  scene: string;
  enemy: CombatEnemy;
  /** все враги сцены (Fallout: несколько статблоков на одной сцене) */
  enemies?: CombatEnemy[];
  /** разрешённые id оружия; `automatic` — алиас `submachine` */
  weapon?: string[];
  win: string;
  lose?: string;
  note?: string;
  /** урон, который уже случился перед боем (граната/первый залп) */
  preDamage?: string;
  /** если задано, preDamage применяется только после этих сцен */
  preDamageFrom?: string[];
  /** фиксированная потеря Выносливости до боя */
  preStamina?: number;
  /** особый бой: нужно нанести не меньше порога за раунд */
  threshold?: number;
  /** дополнительный бросок к урону (пистолет Эми у Конга) */
  bonusDamage?: string;
  /** бой останавливается, когда у одного из участников остаётся 1 здоровье */
  stopAtOne?: boolean;
};

export type Game = {
  format: string;
  id: string;
  title: string;
  type?: string;
  author?: string;
  language?: string;
  cover?: string;
  start: string;
  startItems?: Record<string, number>;
  items?: Record<string, ItemDef>;
  stats?: Record<string, StatDef>;
  /** объявленные в flags.yaml флаги; начальное состояние — пустое */
  flags?: string[];
  /** бои из mechanics.yaml по ключу сцены */
  combat?: Record<string, CombatDef>;
  /** коды «параграф ± число» */
  codes?: Record<string, CodeDef>;
  /** проверки характеристик/навыков */
  checks?: Record<string, CheckDef>;
  /** ставки: 2d6 + характеристика */
  gambles?: Record<string, GambleDef>;
  moods?: Record<string, MoodTracks>;
  defaultMood?: string | null;
  /** отпечаток версии книги: считается в браузере по тексту story.md */
  rev?: string;
  scenes: Record<string, Scene>;
};

export type ItemChange = { id: string; delta: number };

export type GameState = {
  game: string;
  format: string;
  /** версия схемы состояния; старые сейвы мигрируются */
  version?: number;
  /** версия книги, на которой сделано сохранение */
  rev?: string;
  scene: string;
  inventory: Record<string, number>;
  flags: string[];
  /** изученные коды (не расходуются) */
  knownCodes?: string[];
  /** сцены, где ставка уже сделана */
  gamblesDone?: string[];
  /** предметы, полученные/потерянные при входе в текущую сцену или действием в ней */
  itemChanges?: ItemChange[];
  stats: Record<string, number>;
  /** стартовые значения после бросков (для лечения «до начального уровня») */
  initialStats?: Record<string, number>;
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
  /** alpha / beta / complete и т.п. */
  status?: string;
  /** путь к обложке относительно пакета */
  cover?: string;
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
