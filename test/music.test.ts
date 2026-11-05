import { trackFor } from '../lib/music';
import type { Game, Scene } from '../lib/types';

const game: Game = {
  format: 'quest/1',
  id: 'test',
  title: 'test',
  start: '1',
  moods: { calm: 'music/calm.mp3', mystery: null, tense: 'music/tense.mp3' },
  defaultMood: 'calm',
  scenes: {},
};

const scene = (mood?: string, music?: string): Scene => ({ key: '1', title: '', text: '', mood, music });

const fail: string[] = [];
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} | ${name}`);
  if (!cond) fail.push(name);
};

ok('mood с треком даёт трек', trackFor(game, scene('tense')) === 'music/tense.mp3');
ok('mood без трека — продолжать текущий (null)', trackFor(game, scene('mystery')) === null);
ok('mood не задан — берётся default_mood', trackFor(game, scene(undefined)) === 'music/calm.mp3');
ok('явный music важнее mood', trackFor(game, scene('mystery', 'music/win.mp3')) === 'music/win.mp3');
ok('пакет без moods и без mood — тишина', trackFor({ ...game, moods: {}, defaultMood: null }, scene(undefined)) === null);

if (fail.length) {
  console.error(`\nПРОВАЛЕНО: ${fail.length}`);
  process.exit(1);
}
console.log('\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
