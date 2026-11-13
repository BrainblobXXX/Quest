export const STATE_VERSION = 3;

export type ItemDef = {
  title: string;
  description?: string;
  icon?: string;
  /** семантический вид предмета */
  kind?: 'weapon' | 'armor' | 'consumable' | 'quest' | 'misc';
  countable?: boolean;
  consumable?: boolean;
  /** урон: число (плоский) или формула 1d6, 2d6+5, 1d6-3… */
  damage?: string | number;
  /** бонус к Мастерству в duel-бою */
  skill_bonus?: number;
  /** бонус действует только с этим оружием (например, повязка Рагнара) */
  skill_bonus_weapon?: string;
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
  /** наложить временный эффект при выборе */
  applyEffect?: string;
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
  /** наложить временный эффект из game.effects */
  applyEffect?: string;
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

export type EncounterDef = {
  id: string;
  name: string;
  count: number;
  item?: string;
};

export type AttritionDef = {
  scene: string;
  encounter: string;
  formula: string;
  /** предмет, который списывается при применении */
  consume?: string;
  /** вид предбоевой анимации */
  animation?: 'grenade' | 'browning';
  /** если задано — после результата сразу перейти сюда */
  next?: string;
  /** переход, если encounter закончился */
  empty?: string;
  /** если задано — после результата показать выборы */
  choices?: Choice[];
};

export type Scene = {
  key: string;
  title: string;
  text: string;
  image?: string;
  mood?: string;
  music?: string;
  choices?: Choice[];
  /** объявление/продолжение встречи с группой врагов */
  encounter?: EncounterDef;
  /** бросок урона по encounter без боя */
  attrition?: AttritionDef;
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

export type CombatEnemyPhase = {
  /** первый раунд фазы, по умолчанию 1 */
  fromRound?: number;
  /** последний раунд фазы; без него — до конца боя */
  toRound?: number;
  /** абсолютное Мастерство в этой фазе */
  skill?: number;
  /** если выпадет чётное d6, Мастерство становится таким на этот раунд */
  evenSkill?: number;
};

export type CombatEnemyOnHit = {
  /** формула проверки, по умолчанию 1d6 */
  roll?: string;
  /** минимальный результат, при котором срабатывает эффект */
  min?: number;
  /** урон эффекта; заменяет обычный урон ранения */
  damage?: number;
  /** урон при успешной проверке Удачи */
  luckDamage?: number;
};

export type CombatEnemy = {
  name: string;
  /** число врагов; без него бой не запускается — данные неполные */
  count?: number;
  attack: number;
  /** Мастерство врага в режиме duel; без него используется attack */
  skill?: number;
  /** урон врага в режиме duel; по умолчанию 2 */
  damage?: number;
  /** изменения Мастерства по раундам в duel */
  phases?: CombatEnemyPhase[];
  /** особый эффект при ранении игрока (например, яд мантикоры) */
  onHit?: CombatEnemyOnHit;
  /** формула ответного урона в pool-бою; при наличии заменяет attack */
  attackRoll?: string;
  /** босс: увеличенное боевое окно */
  boss?: boolean;
  /** броня врага (показывается только при наличии) */
  armor?: number;
  /** защита — сложность атаки игрока */
  defense?: number;
  health: number;
  /** урон оружия врага (Fallout) */
  weapon?: string;
};

export type CombatAlly = {
  id: string;
  name: string;
  /** id оружия союзника для иконки */
  weapon?: string;
  /** формула урона союзника в раунде */
  damage: string;
};

export type CombatRestrictions = {
  /** белый список оружия; если задан — остальное недоступно */
  allowedWeapons?: string[];
  /** белый список предметов (аптечка, граната…); пустой — всё запрещено */
  allowedItems?: string[];
  /** оружие, выбранное принудительно */
  forceWeapon?: string;
  /** чёрный список оружия */
  bannedWeapons?: string[];
};

export type CombatDef = {
  scene: string;
  /** явный режим боя; без него режим выводится из type/defense */
  mode?: 'pool' | 'contest' | 'rpg' | 'duel';
  /** id encounter, из которого берётся количество врагов */
  encounter?: string;
  /** переход, если encounter уже пуст и бой не начинается */
  empty?: string;
  enemy: CombatEnemy;
  /** все враги сцены (Fallout: несколько статблоков на одной сцене) */
  enemies?: CombatEnemy[];
  /** разрешённые id оружия; `automatic` — алиас `submachine` */
  weapon?: string[];
  win: string;
  lose?: string;
  /** альтернативный исход боя: пощада */
  capture?: string;
  /** условие пощады после раунда */
  captureIf?: { enemyHealthAtMost?: number; playerHealthAtLeast?: number };
  note?: string;
  /** урон, который уже случился перед боем (граната/первый залп) */
  preDamage?: string;
  /** если задано, preDamage применяется только после этих сцен */
  preDamageFrom?: string[];
  /** фиксированная потеря Выносливости до боя */
  preStamina?: number;
  /** вид предбоевого эффекта: граната, пулемёт или просто урон */
  preDamageKind?: 'browning' | 'grenade' | 'damage';
  /** предмет, который требуется и расходуется для pre_damage */
  preDamageItem?: string;
  /** гранату можно применить только отдельным выбором перед боем */
  preDamageOptional?: boolean;
  /** особый бой: нужно нанести не меньше порога за раунд */
  threshold?: number;
  /** @deprecated используйте allies; дополнительный бросок к урону */
  bonusDamage?: string;
  /** союзники, бросающие урон каждый раунд */
  allies?: CombatAlly[];
  /** ограничения игрока в этой сцене */
  restrictions?: CombatRestrictions;
  /** бой останавливается, когда у одного из участников остаётся 1 здоровье */
  stopAtOne?: boolean;
  /** урон игрока за ранение в duel; по умолчанию 2 */
  playerDamage?: number;
  /** разрешить проверку Удачи в duel */
  luck?: boolean;
  /** каждая проверка Удачи списывает 1 */
  stealLuck?: boolean;
};

export type EffectDuration = number | 'next_combat';

/** Временный эффект, объявленный в rules/quest2.yaml конкретной книги. */
export type EffectDef = {
  title: string;
  /** buff/debuff влияет только на цвет и подпись, не на механику */
  kind?: 'buff' | 'debuff';
  /** семантический id иконки; неизвестный id получает общий значок */
  icon?: string;
  description?: string;
  /** число боёв или next_combat */
  duration: EffectDuration;
  /** как ведёт себя повторное наложение */
  stacking?: 'refresh' | 'stack' | 'ignore';
  /** числовые модификаторы; сейчас runtime понимает player_damage */
  modifiers?: Record<string, number>;
};

/** Активный эффект в сейве. */
export type ActiveEffect = {
  id: string;
  /** сколько боёв ещё действует */
  remaining: number;
  /** число наложений; для stacking: refresh всегда 1 */
  stacks: number;
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
  /** временные эффекты, объявленные в rules/quest2.yaml книги */
  effects?: Record<string, EffectDef>;
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

export type ItemChange = { id: string; delta: number; reason?: 'shop' };

export type EncounterState = {
  id: string;
  name: string;
  initial: number;
  count: number;
  item?: string;
  history?: { scene: string; roll: number; damage: number }[];
};

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
  /** активные временные эффекты */
  effects?: ActiveEffect[];
  /** сцены, где ставка уже сделана */
  gamblesDone?: string[];
  /** активные встречи с группами врагов */
  encounters?: Record<string, EncounterState>;
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
