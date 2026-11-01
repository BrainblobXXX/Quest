import { readFileSync } from 'node:fs';
import { availableChoices, advance, choose, inventoryLine, isEnding, newState, sceneOf } from '../lib/engine';
import type { Game } from '../lib/types';

const game: Game = JSON.parse(readFileSync('public/games/cave.json', 'utf8'));
const fail: string[] = [];
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} | ${name}`);
  if (!cond) fail.push(name);
};

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

console.log(fail.length ? `\nПРОВАЛЕНО: ${fail.length}` : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fail.length ? 1 : 0);
