import { parse as parseYaml } from 'yaml';
import { availableChoices, choose, evalCond, newState } from '../lib/engine';
import { parsePackage } from '../lib/parse';

const STORY = `## 1

Комната с двумя дверями.

- [Войти в первую](2)
- [Уйти](3)

## 2

Флаг установлен.

## 3

Конец без флага.
`;

const MANIFEST = `format: quest/1
id: flags-fixture
title: Flags
language: ru
start: '1'
flags: flags.yaml
scenes:
  '1':
    title: Глава 1
  '2':
    title: Глава 2
    ending: true
    on_enter:
      - set: met
  '3':
    title: Глава 3
    ending: true
`;

const FLAGS = `flags:
  - met
`;

const fail: string[] = [];
const ok = (name: string, condition: boolean) => {
  if (condition) console.log(`  ok: ${name}`);
  else {
    fail.push(name);
    console.error(`  FAIL: ${name}`);
  }
};

const parsed = parsePackage('flags-fixture', parseYaml(MANIFEST), STORY, null, null, FLAGS);
ok('пакет разобран без ошибок', parsed.problems.filter((p) => p.level === 'error').length === 0);
ok('flags.yaml прочитан', parsed.game.flags?.includes('met') === true);

const state = newState(parsed.game);
ok('стартовое состояние без флагов', state.flags.length === 0);
const after = choose(parsed.game, state, availableChoices(parsed.game, state)[0]);
ok('on_enter устанавливает флаг', after.flags.includes('met'));
ok('условие flag видит установленный флаг', evalCond('flag met', after));

const falseState = { ...state, flags: [] };
ok('условие flag ложно без флага', !evalCond('flag met', falseState));

console.log(fail.length ? `\nПРОВАЛЕНО: ${fail.length}` : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fail.length ? 1 : 0);
