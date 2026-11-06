import { parse as parseYaml } from 'yaml';
import { availableChoices, choose, newState } from '../lib/engine';
import { parsePackage } from '../lib/parse';
import type { Game } from '../lib/types';

/**
 * Характеристики: стартовое значение из stats.yaml, списания на выборе и на
 * входе в сцену, ограничение min. Фикстура не попадает в games/.
 */
const STORY = `## 1

Выбор траты.

{А}Потратить 200{/А} на [А]. {Б}Не тратить{/Б} на [Б].

Вариант А {stat: {money: -200}}
Вариант Б

## 2

Обычная сцена с неожиданным расходом.

## 3

Конец.

## 4

Неподъёмный расход.
`;

const MANIFEST = `format: quest/1
id: stats-fixture
title: Статы
language: ru
start: '1'
stats: stats.yaml
scenes:
  '1':
    variants:
      А: '2'
      Б: '2'
  '2':
    on_enter:
      - stat: {money: -500}
    next: '3'
  '3':
    ending: true
  '4':
    on_enter:
      - stat: {money: -9999}
    ending: true
`;

const STATS = `stats:
  money:
    title: Деньги
    initial: 2500
    min: 0
`;

const { game, problems } = parsePackage(
  'stats-fixture',
  parseYaml(MANIFEST) as Record<string, unknown>,
  STORY,
  null,
  STATS,
) as { game: Game; problems: { level: string; code: string; message: string }[] };

const fail: string[] = [];
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} | ${name}`);
  if (!cond) fail.push(name);
};

ok('пакет со stats разбирается без ошибок', problems.length === 0);
ok('стартовые деньги из stats.yaml', newState(game).stats.money === 2500);

const first = newState(game);
const choices = availableChoices(game, first);
const pay = choices.find((choice) => choice.letter === 'А')!;
const skip = choices.find((choice) => choice.letter === 'Б')!;
ok('stat-модификатор разобран в карту', pay.stat?.money === -200);
ok('stat не попал в текст сцены', !game.scenes['1'].text.includes('{stat'));

const paid = choose(game, first, pay);
ok('выбор списывает деньги', paid.stats.money === 1800); // 2500 − 200 − 500 на входе в §2
const skipped = choose(game, first, skip);
ok('вход в сцену тоже списывает', skipped.stats.money === 2000); // 2500 − 500

const broke = newState({ ...game, start: '4' });
ok('min: деньги не уходят ниже нуля', broke.stats.money === 0);

console.log(fail.length ? `\nПРОВАЛЕНО: ${fail.length}` : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fail.length ? 1 : 0);
