# Quest/2 — нормативная схема пакета

Статус: схема зафиксирована как контракт `quest/2`.
Машиночитаемая форма: [quest2.schema.json](quest2.schema.json).
Старые `quest/1`-файлы удалены после конвертации; `quest2.yaml`, ассеты и
исходники сохранены. Адаптер `quest/1 → quest/2` не делается.

## 1. Область действия

`quest/2` описывает **логический пакет книги**:

- метаданные;
- профиль и возможности;
- статусы, предметы, флаги, коды;
- сцены;
- эффекты входа;
- интеракции;
- исходы.

Схема **не фиксирует**:

- лежат ли данные в одном `book.yaml` или в нескольких файлах;
- читает ли плеер YAML напрямую или собранный JSON;
- как устроен build-time;
- как выглядит UI.

Это отдельные решения, в частности открытый вопрос 3.6.

## 2. Идентификаторы

- `id` книги: `^[a-z0-9][a-z0-9-]*$`.
- `statId`, `itemId`, `flagId`, `codeId`: `^[a-z_][a-z0-9_]*$`.
- `sceneId` — произвольная непустая строка: числа, слаги, `intro`, `epilogue`.
- Ключ сцены в `scenes` — одновременно её `sceneId`.

Ссылки между объектами проверяет семантический валидатор, а не JSON Schema.

## 3. Корень пакета

Обязательные поля:

```yaml
format: quest/2
id: my-book
title: Название
profile: rpg
start: "1"
scenes: {}
```

Необязательные:

```yaml
features: [checks, combat.rpg, codes, shop]
status: release | alpha | beta | stable | draft
author, genre, annotation, language, year, edition, source, cover
moods
stats
items
start_items
flags
codes
effects
```

`profile`:

- `storybook`;
- `fighting-fantasy`;
- `rpg`;
- `hybrid`.

`start_items` — стартовый инвентарь: `{ itemId: count }`.

`features` — открытый список строк. Известные значения:

```text
choices
checks
combat.pool
combat.contest
combat.rpg
combat.duel
gambles
shop
codes
codebook
initial-roll
character-creation
timed
```

Список открыт, но каждая книга должна объявлять всё, что использует.

## 4. Сцена

```yaml
"218":
  title: "Глава 218"
  text: "Текст сцены."
  mood: tense
  music: danger
  image: assets/218.jpg
  prop:
    image: assets/furniture/chests/chest-wood-open.png
    alt: "Открытый деревянный сундук"
  entry: []
  interaction: {}
  ending: false
  ui:
    counter:
      stat: creation_points
      max: 10
      label: "ОСТАЛОСЬ ОЧКОВ"
  tags: []
```

Правила:

- `text` обязателен; пустая строка допустима для служебных узлов;
- `image` — иллюстрация сцены над текстом (рамка, тёмный фон);
- `prop` — отдельный предмет обстановки/эффект под текстом, над блоком
  «найдено/потеряно». Показывается без фона и рамки, с фильтром боевых
  спрайтов; это не иллюстрация сцены;
- `prop.image` — путь от корня пакета, `prop.alt` — необязательный alt;
- мебель и другие предметы обстановки не записывать в `image`;
- `ending: true` запрещает `interaction` и `after`;
- не-концовка должна иметь `interaction` либо безусловный `redirect` в `entry`;
- сцена без исходящих рёбер допустима только как концовка;
- `after` — follow-up после `gamble`/`shop` (например, проверка или выборы);
- `ui.counter` — данные, а не знание UI о конкретной книге.

JSON Schema проверяет запрет `ending + interaction`; остальные правила — семантический валидатор.

## 5. Эффекты входа

`entry` — упорядоченный массив эффектов.

Общие поля:

- `if` — условие;
- `once` — только при первом входе в сцену; по умолчанию `false`.

Действия (ровно одно на эффект):

```yaml
- grant: { item: pistol, count: 1 }
- consume: { item: medkit, count: 1 }
- drop: { item: knife, count: 1 }
- modify: { stat: hp, delta: -2 }
- set_flag: heart_up_19
- clear_flag: heart_up_19
- learn_code: anna
- drop_best_weapon: true
- roll: { stat: stamina, formula: "-2d6" }
- apply_effect: concussion
- redirect: "218_death"
```

Семантика:

- `grant` добавляет предметы;
- `consume` уменьшает количество, если предмет есть; отсутствие — no-op;
- `drop` удаляет предмет, если он есть;
- `modify` меняет статус с учётом `min`/`max`;
- `set_flag`/`clear_flag` меняют флаги;
- `learn_code` добавляет код в известные;
- `drop_best_weapon` удаляет лучшее оружие по среднему урону;
- `roll` бросает формулу и применяет знаковую дельту к статусу;
- `apply_effect` накладывает временный эффект из верхнеуровневого `effects`;
- `redirect` немедленно переводит в сцену и прекращает остальные эффекты.

Для `grant` в книгах-выдачах обычно нужен `once: true`; это ответственность данных.

### 5.1. Временные эффекты книги

Верхнеуровневый `effects` — словарь эффектов конкретной книги. Именно здесь
книга задаёт длительность и правила повторного наложения; они могут отличаться
от другой книги.

```yaml
effects:
  concussion:
    title: "Контузия"
    kind: debuff
    icon: concussion
    description: "−4 к урону в следующем бою"
    duration: next_combat
    stacking: refresh
    modifiers:
      player_damage: -4
```

Поля:

| Поле | Смысл |
|---|---|
| `title` | подпись и tooltip |
| `kind` | `buff` или `debuff` (цвет) |
| `icon` | семантический id иконки; неизвестный получает общий значок |
| `description` | пояснение для игрока |
| `duration` | `next_combat` или число боёв |
| `stacking` | `refresh`, `stack` или `ignore` |
| `modifiers` | числовые модификаторы; runtime понимает `player_damage` и `skill` |

`apply_effect` накладывает эффект при входе в сцену или на выборе. Активные
эффекты хранятся в сейве, показываются иконками **слева от здоровья** и
списываются после боя согласно `duration`.

`player_damage` прибавляется к броску игрока до сложения с уроном союзников;
итог не может быть меньше нуля. Урон союзников не модифицируется.

`skill` прибавляется к Мастерству игрока в режиме `duel`; складывается со
`skill_bonus` выбранного оружия. Несколько наложений с `stacking: stack`
складываются, `refresh` даёт одно значение.

`enemy_skill_per_round` снижает Мастерство врага на указанное значение за каждый
следующий раунд (`-2` — щит WOK).

`skill_multiplier` задаёт прибавку к множителю Мастерства: `1` означает ×2
(§411, заклинание роста).

## 6. Условия

Условие — рекурсивный объект:

```yaml
if:
  all:
    - has_item: { id: monk_heart }
    - not:
        flag: heart_up_19
```

Поддерживаются:

```text
all, any, not
has_item {id, count?}
flag
stat {id, op, value}
visited
known_code
always
```

`stat.op`: `= != < <= > >=`.

JSON Schema проверяет форму. Семантический валидатор проверяет, что `stat`, `item`, `flag`, `code`, `scene` существуют.

## 7. Интеракции

Ровно одна интеракция на сцену.

### 7.1. choices

```yaml
interaction:
  type: choices
  options:
    - label: "Взять меч"
      to: "12"
      if: { not: { has_item: { id: sword } } }
      effects:
        - grant: { item: sword }
```

### 7.2. continue

```yaml
interaction:
  type: continue
  to: "12"
```

Линейный переход. Заменяет старый `next`.

### 7.3. check

`mode` обязателен:

```yaml
interaction:
  type: check
  mode: stat
  stat: guts
  formula: "2d6 + guts >= orkishness"
  outcomes:
    success: "26"
    failure: "68"
```

```yaml
interaction:
  type: check
  mode: skill
  skill: outdoorsman
  formula: "outdoorsman >= 2"
  morale_cost: "(1d6 - outdoorsman) * 4"
  outcomes:
    success: "282"
    failure: "309"
```

Правила:

- `mode: stat` требует `stat` и запрещает `skill`;
- `mode: skill` требует `skill` и запрещает `stat`;
- `formula` — строка; её грамматика проверяется семантическим валидатором;
- `morale_cost` необязателен.

### 7.4. combat

```yaml
interaction:
  type: combat
  mode: contest
  enemies:
    - name: "Орк"
      count: 1
      attack: 8
      defense: 9
      health: 5
  options:
    stop_at_one: true
  outcomes:
    victory: "24"
    defeat: "25"   # необязателен: без него используется общий экран смерти
```

Режимы:

- `pool` — классический пул Здоровья;
- `contest` — FF-контест;
- `rpg` — Fallout-подобный бой;
- `duel` — FF-раунд: оба бросают `2d6 + Мастерство`, раненый теряет урон.

Пример `duel`:

```yaml
interaction:
  type: combat
  mode: duel
  enemies:
    - name: "Змей"
      attack: 2        # урон в pool-совместимых данных
      skill: 7         # Мастерство в duel
      health: 8
      damage: 2        # урон врага за ранение
  options:
    player_damage: 2   # урон игрока за ранение
    luck: true         # разрешить проверку Удачи
    steal_luck: true   # каждая проверка стоит 1 Удачи
    capture_if:        # §117: пощада при ранении
      enemy_health_at_most: 3
      player_health_at_least: 6
  outcomes:
    victory: "105"
    capture: "187"     # альтернативный исход
```

`options`:

```text
stop_at_one
threshold
bonus_damage       # устаревший алиас allies
player_damage      # duel: урон игрока за ранение, по умолчанию 2
luck               # duel: разрешить проверку Удачи
steal_luck         # duel: списывать 1 Удачи за проверку
capture_if         # условие пощады: enemy_health_at_most / player_health_at_least
pre_damage
pre_damage_from
pre_stamina
pre_damage_kind   # grenade: «ВЗРЫВ», browning: «ОЧЕРЕДЬ ПУЛЕМЕТА»
pre_damage_item   # расходуемый предмет (например, grenade)
pre_damage_optional # спросить перед боем: применить гранату или нет
```

`pre_damage` уменьшает пул врагов до боя; `pre_damage_item` проверяется и расходуется.
`pre_damage_optional` используется для гранаты: в бою граната не применяется, только отдельным предбоевым выбором. `banned_weapons` задаётся в `restrictions` и запрещает конкретное оружие; если запрета нет в данных, UI не должен показывать предупреждение.

### 7.4.1. Броски врага, союзники и ограничения

Для pool-боя можно задать формулу ответного урона врага:

```yaml
enemies:
  - name: "Юрр"
    attack: 1          # fallback, если attack_roll не задан
    attack_roll: "1d6-3"
    health: 7
```

- `attack_roll` — кубик врага; при наличии `attack` не используется;
- без `attack_roll` поведение прежнее: фиксированный `attack`;
- `skill` — Мастерство врага в `duel`; без него используется `attack`;
- `damage` — урон врага за ранение в `duel`; по умолчанию 2;
- `phases` — изменения Мастерства по раундам:
  - `from_round`, `to_round` — границы;
  - `skill` — абсолютное Мастерство в фазе;
  - `even_skill` — Мастерство на раунд, если d6 чётный;
- `on_hit` — особый эффект при ранении игрока:
  - `roll` — проверка (по умолчанию `1d6`);
  - `min` — минимальный результат срабатывания;
  - `damage` — урон эффекта;
  - `luck_damage` — урон при успешной Удаче;
- `boss: true` — увеличенное боевое окно и спрайт (Конг, Юрр);
- `armor` — броня врага; показывается только при наличии (у Конга `armor: 19` (19 брони + 1 жизнь = порог 20)).

Союзники бросают урон каждый раунд:

```yaml
allies:
  - id: emi
    name: "Эми"
    weapon: pistol
    damage: "1d6+2"
```

При `threshold` урон игрока и всех союзников складывается и сравнивается с порогом.
При обычном пуле эта сумма наносится врагам. `bonus_damage` оставлен для
старых данных, новые книги должны использовать `allies`.

Ограничения игрока:

```yaml
restrictions:
  allowed_weapons: [fists]
  allowed_items: []
  force_weapon: fists
```

- `allowed_weapons` — белый список id оружия; `fists` — кулаки;
- `allowed_items` — белый список предметов; пустой список запрещает всё;
- `force_weapon` — принудительно выбранное оружие.

Пример Конга:

```yaml
interaction:
  type: combat
  mode: pool
  enemies:
    - name: "Зомби-Конг"
      attack: 6
      health: 1
  allies:
    - id: emi
      name: "Эми"
      damage: "1d6+2"
  options:
    threshold: 20
  outcomes:
    victory: "19"
```

Пример Юрра:

```yaml
interaction:
  type: combat
  mode: pool
  enemies:
    - name: "Юрр"
      attack: 1
      attack_roll: "1d6-3"
      health: 7
  restrictions:
    allowed_weapons: [fists]
    allowed_items: []
  outcomes:
    victory: "44"
```

### 7.5. gamble

```yaml
interaction:
  type: gamble
  stat: luck
  stake: { min: 1, max: 5 }
  win: 15
  push: 12
```

`outcomes` необязателен. Если его нет, после ставки сцена остаётся текущей.

### 7.6. shop

```yaml
interaction:
  type: shop
  title: "Лавка Бориса"
  currency: "долларов"
  currency_item: money
  offers:
    - { item: pistol, price: 100 }
```

`currency_item` необязателен: если он задан, баланс и списание идут через
предмет (`inventory[currency_item]`), иначе через `stats.money`.

`outcomes.continue` необязателен.

### 7.7. codebook

```yaml
interaction:
  type: codebook
```

Открывает панель известных кодов. Цель кода вычисляется как
`(base ?? currentScene) + offset`; это динамический переход, поэтому он не
входит в статический граф.

### 7.8. roll

```yaml
interaction:
  type: roll
  formula: "1d15"
  outcomes:
    - { min: 15, to: "fish_set_15" }
    - { min: 14, max: 14, to: "fish_set_14" }
    - { min: 1, max: 2, to: "fish_set_01" }
```

Семантический валидатор обязан проверить, что диапазоны покрывают все возможные значения без пересечений.

## 8. Статусы

```yaml
stats:
  money:
    title: "Деньги"
    initial: 500
    min: 0
    visible: true
  bait:
    title: "Наживка"
    initial: 0
    min: 0
    max: 7
    visible: false
```

`visible: false` — технический статус, не показывать в UI.
`show` из `quest/1` в `quest/2` не используется.

`vital: true` — жизненный показатель (жизни, здоровье, выносливость).
Он показывается отдельным сердечком с числом и не попадает в панель
обычных характеристик. Если `vital` не указан, жизненными считаются
статы с id `hp`, `health`, `life`, `stamina`.

## 9. Предметы

Стартовый инвентарь задаётся отдельно от объявлений предметов:

```yaml
start_items:
  medkit: 1
```

```yaml
items:
  sword:
    title: "Меч"
    kind: weapon
    damage: "1d6+1"
    weapon_rating: 2
  chainmail:
    title: "Кольчуга"
    kind: armor
    armor_rating: 3
  medkit:
    title: "Аптечка"
    kind: consumable
    countable: true
    consumable: true
    restore: hp
```

`kind` — необязательная семантическая подсказка.
`damage` — формула или число (число означает постоянный урон);
`skill_bonus` — бонус к Мастерству в `duel`;
`weapon_rating`, `armor_rating`, `ammo`, `restore` — данные механик.

## 10. Коды

```yaml
codes:
  klamath_map:
    title: "Карта Кламата"
    offset: -260
  shop_games:
    title: "Игорный магазин"
    offset: 360
    base: "197"
```

Цель: `(base ?? currentScene) + offset`.

## 11. Формулы

JSON Schema считает формулы строками. Семантический валидатор обязан проверить:

- dice-форму `NdM` и `NdM±B`;
- Unicode-минус приводится к `-`;
- операции `+ - * /`;
- скобки;
- `max(a, b)`;
- идентификаторы только из `stats`;
- сравнения `>= <= > < = !=` там, где они разрешены;
- отсутствие деления на ноль.

Формулы не вычисляются JSON Schema.

## 12. Что проверяет JSON Schema

- типы;
- обязательные поля;
- перечисления;
- шаблоны id;
- `additionalProperties: false`;
- вложенность;
- `oneOf` для эффектов и интеракций;
- `ending` без `interaction`;
- `check.mode` и обязательный `stat`/`skill`.

## 13. Что проверяет семантический валидатор

1. `start` существует.
2. Все `to`, `redirect`, `outcomes`, roll-цели существуют.
3. Все `item`, `stat`, `flag`, `code` существуют.
4. `ammo` ссылается на предмет.
5. У не-концовки есть интеракция или безусловный redirect.
6. `ending` не имеет интеракции.
7. `check.mode` соответствует полям и формуле.
8. `gamble.stake.min <= max`.
9. `roll`-диапазоны покрывают все значения без дыр и пересечений.
10. `shop` не ссылается на несуществующий предмет.
11. `once` не противоречит смыслу эффекта.
12. Достижимость сцен/концовок.
13. Нет сцен-сирот без объяснения.
14. Нет недостижимых вариантов и мёртвых условий.

## 14. JSON Schema и runtime

На этом этапе одна схема `quest/2`.

Если 3.6 выберет build-time, возможны две формы:

```text
quest2.source.schema.json   — авторская, с формулами-строками
quest2.runtime.schema.json  — нормализованная, с AST и разрешёнными ссылками
```

Это не меняет текущий контракт, но требует отдельного решения до реализации сборки.

## 15. Совместимость

- `quest/1` не адаптируется.
- Существующие 11 книг не изменяются.
- После всех изменений пользователь решит: удалить, пересоздать или обновить.
- `format: quest/2` — мажорная версия контракта.
- Совместимое добавление необязательного поля — в рамках `quest/2`.
- Изменение смысла поля — `quest/3`.

## 16. Валидатор

```bash
python3 scripts/quest2_validate.py path/to/book.yaml
python3 scripts/quest2_validate.py path/to/package --json
```

Валидатор делает два прохода:

1. JSON Schema;
2. семантические проверки: ссылки, формулы, инварианты, достижимость.

Коды `W_*` — предупреждения, `E_*` — ошибки.

## 16. Encounter и attrition

Для встречи с группой врагов, растянутой на несколько сцен, используется
`encounter` в сцене и `attrition` для броска урона без боя.

```yaml
'339':
  title: "Толпа"
  text: "..."
  encounter:
    id: horde-17
    name: "Зомби без оружия"
    count: 27
    item: grenade
  interaction:
    type: choices
    options: [...]

'200':
  title: "Граната"
  text: "..."
  interaction:
    type: attrition
    encounter: horde-17
    formula: "2d6+1"
    consume: grenade
    animation: grenade
    options: [...]

'17':
  title: "Бой"
  text: "..."
  interaction:
    type: combat
    mode: pool
    encounter: horde-17
    enemies:
      - name: "Зомби без оружия"
        count: 27
        attack: 1
        health: 1
    empty: "215"
    outcomes:
      victory: "215"
```

- `encounter.count` задаёт стартовое количество; при входе в сцену создаётся
  `GameState.encounters`.
- `attrition` вычитает результат броска из encounter.
- `consume` списывает предмет в момент броска.
- `to` переходит после броска; `options` показывает выборы после броска.
- `empty` — ветка, если encounter дошёл до нуля.
- у `combat` с `encounter` количество врагов берётся из состояния, а не из
  статического `enemies[].count`; `count` остаётся fallback.

## 17. Минимальный пример

```yaml
format: quest/2
id: example
title: "Пример"
profile: storybook
status: beta
start: "1"
features: [choices]
scenes:
  "1":
    title: "Начало"
    interaction:
      type: choices
      options:
        - label: "Идти"
          to: "2"
  "2":
    title: "Конец"
    ending: true
```
