import { parse as parseYaml } from 'yaml';
import { availableChoices, choose, newState } from '../lib/engine';
import { parsePackage } from '../lib/parse';

/** `take` на выборе может быть списком: {take: [bow, arrow]}. */
const STORY = `## 1

Сундук с оружием.

- [Взять лук и стрелы](2) {take: [bow, arrow]}

## 2

Конец.
`;

const MANIFEST = `format: quest/1
id: take-list-fixture
title: Take list
language: ru
start: '1'
items: items.yaml
scenes:
  '1':
    title: Глава 1
  '2':
    title: Глава 2
    ending: true
`;

const ITEMS = `items:
  bow:
    title: Лук
  arrow:
    title: Стрела
`;

const fail: string[] = [];
const ok = (name: string, condition: boolean) => {
  if (condition) console.log(`  ok: ${name}`);
  else {
    fail.push(name);
    console.error(`  FAIL: ${name}`);
  }
};

const parsed = parsePackage('take-list-fixture', parseYaml(MANIFEST), STORY, ITEMS, null);
ok('пакет разобран без ошибок', parsed.problems.filter((p) => p.level === 'error').length === 0);
const choice = parsed.game.scenes['1'].choices?.[0];
ok('take разобран как список', Array.isArray(choice?.take) && choice.take.length === 2);

const state = newState(parsed.game);
const after = choose(parsed.game, state, availableChoices(parsed.game, state)[0]);
ok('список take выдаёт оба предмета', after.inventory.bow === 1 && after.inventory.arrow === 1);

console.log(fail.length ? `\nПРОВАЛЕНО: ${fail.length}` : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fail.length ? 1 : 0);
