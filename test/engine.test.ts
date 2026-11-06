import { parse as parseYaml } from 'yaml';
import { availableChoices, advance, choose, inventoryLine, isEnding, newState, resolveRoll, sceneOf } from '../lib/engine';
import { trackFor } from '../lib/music';
import { parsePackage } from '../lib/parse';
import type { Game } from '../lib/types';

/**
 * Мини-пакет для проверок движка. Это данные теста, а не игра из games/:
 * демо-книги убраны из библиотеки, но разбор и переходы должны быть покрыты.
 */
const STORY = `## 1

Тёмный вход в пещеру. Пахнет сыростью и старой золой. Где-то в глубине капает вода.

- [Войти внутрь](2)
- [Осмотреть стены](3)

## 2

Зал. В центре — сундук, запертый на ржавый замок. На стенах пляшут тени.

- [Открыть сундук](4) {if: has_item rusty_key}
- [Уйти ни с чем](5)

## 3

На стене выцарапаны имена. Под ногами что-то блестит — кажется, ключ.

- [Поднять ключ](2) {take: rusty_key}
- [Спуститься в провал](6)
- [Вернуться](1)

## 4

Замок поддаётся. Сундук полон монет. Ты выходишь из пещеры богачом.

## 5

Ты уходишь с пустыми руками. Пещера остаётся ждать следующего смельчака.

## 6

Ты срываешься вниз и цепляешься за выступ. Куда ты приземлишься?
`;

const MANIFEST = `format: quest/1
id: engine-fixture
title: Тестовая пещера
language: ru
start: '1'
items: items.yaml
start_items:
  sword: 1
moods:
  calm: assets/audio/calm.wav
  tense: assets/audio/tense.wav
  danger: assets/audio/danger.wav
  victory: assets/audio/victory.wav
scenes:
  '1':
    title: Глава 1. Вход в пещеру
    mood: calm
  '2':
    title: Глава 2. Зал
    mood: tense
  '3':
    title: Глава 3. Стены
    mood: calm
  '4':
    title: Глава 4. Богатая добыча
    mood: victory
    ending: true
  '5':
    title: Глава 5. С пустыми руками
    mood: calm
    ending: true
  '6':
    title: Глава 6. Провал
    mood: danger
    next:
      roll: 1d6
      outcomes:
        - min: 4
          goto: '4'
        - goto: '5'
`;

const ITEMS = `items:
  sword:
    title: Меч
  rusty_key:
    title: Ржавый ключ
    description: Ключ от сундука в зале.
`;

const { game, problems } = parsePackage(
  'engine-fixture',
  parseYaml(MANIFEST) as Record<string, unknown>,
  STORY,
  ITEMS,
) as { game: Game; problems: { level: string; code: string; message: string }[] };
const fail: string[] = [];
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} | ${name}`);
  if (!cond) fail.push(name);
};

ok('пакет разбирается без ошибок', problems.length === 0);
let s = newState(game);
ok('старт в сцене 1', s.scene === '1');
ok('стартовый инвентарь — меч', s.inventory.sword === 1);
ok('инвентарь в строку', inventoryLine(game, s) === 'МЕЧ');

// выбор без предмета скрыт
s = choose(game, s, availableChoices(game, s).find((c) => c.goto === '2')!);
const hidden = availableChoices(game, s).some((c) => c.goto === '4');
ok('сундук недоступен без ключа', !hidden);
ok('показан уход', availableChoices(game, s).some((c) => c.goto === '5'));

// возврат и взятие ключа
s = { ...s, scene: '3' };
const take = availableChoices(game, s).find((c) => c.take)!;
s = choose(game, s, take);
ok('взял ключ', (s.inventory.rusty_key ?? 0) === 1);
ok('оказался в зале', s.scene === '2');
ok('теперь сундук доступен', availableChoices(game, s).some((c) => c.goto === '4'));

// открываем сундук → концовка
s = choose(game, s, availableChoices(game, s).find((c) => c.goto === '4')!);
ok('сцена 4', s.scene === '4');
ok('это концовка', isEnding(game, s));
ok('пройденные сцены записаны', s.visited.length >= 4);

// линейный переход и бросок
const linear = { ...s, scene: '6' };
const after = advance(game, linear);
ok('бросок уводит в 4 или 5', ['4', '5'].includes(after.scene));
ok('название сцены есть', sceneOf(game, after).title.length > 0);

// фиксированный бросок
const diceState = { ...s, scene: '6' };
ok('бросок 6 уводит в 4', resolveRoll(game, diceState, 6).scene === '4');
ok('бросок 1 уводит в 5', resolveRoll(game, diceState, 1).scene === '5');

// эффекты входа в сцену: выдача и изъятие предметов
const enterGame: Game = {
  ...game,
  scenes: {
    ...game.scenes,
    '2': {
      ...game.scenes['2'],
      onEnter: [{ take: ['rusty_key'] }, { take: { sword: 2 } }],
    },
  },
};
const enterStart = newState(enterGame);
const entered = choose(
  enterGame,
  enterStart,
  availableChoices(enterGame, enterStart).find((c) => c.goto === '2')!,
);
ok('on_enter выдаёт предметы', entered.inventory.rusty_key === 1 && entered.inventory.sword === 3);

const dropGame: Game = {
  ...game,
  scenes: { ...game.scenes, '2': { ...game.scenes['2'], onEnter: [{ drop: ['sword'] }] } },
};
const dropStart = newState(dropGame);
const dropped = choose(
  dropGame,
  dropStart,
  availableChoices(dropGame, dropStart).find((c) => c.goto === '2')!,
);
ok('on_enter забирает предмет', dropped.inventory.sword === undefined);

const enterStartGame: Game = {
  ...game,
  scenes: { ...game.scenes, '1': { ...game.scenes['1'], onEnter: [{ take: ['rusty_key'] }] } },
};
ok('on_enter стартовой сцены', newState(enterStartGame).inventory.rusty_key === 1);

// музыка по настроению
const scene1 = game.scenes['1'];
ok('трек по настроению сцены', trackFor(game, scene1) === 'assets/audio/calm.wav');
ok('сцена без mood не меняет музыку', trackFor(game, { ...scene1, mood: undefined }) === null);
ok(
  'music важнее mood',
  trackFor(game, { ...scene1, music: 'assets/audio/x.ogg' }) === 'assets/audio/x.ogg',
);
const plannedGame: Game = { ...game, moods: { calm: null } };
ok('настроение без трека молчит', trackFor(plannedGame, { ...scene1, mood: 'calm' }) === null);
const listGame: Game = { ...game, moods: { calm: ['a.ogg', 'b.ogg'] } };
const picked = trackFor(listGame, { ...scene1, mood: 'calm' });
ok('список треков даёт один из вариантов', picked === 'a.ogg' || picked === 'b.ogg');

console.log(fail.length ? `\nПРОВАЛЕНО: ${fail.length}` : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fail.length ? 1 : 0);
