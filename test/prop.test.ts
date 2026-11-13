import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseQuest2 } from '../lib/quest2';

test('scene prop is parsed separately from the scene illustration', () => {
  const { game, problems } = parseQuest2('prop-fixture', {
    format: 'quest/2',
    id: 'prop-fixture',
    title: 'Prop',
    status: 'draft',
    start: '1',
    scenes: {
      '1': {
        title: 'Сцена',
        text: 'Перед вами открытый сундук.',
        prop: {
          image: 'assets/furniture/chests/chest-wood-open.png',
          alt: 'Открытый деревянный сундук',
        },
      },
    },
  });

  assert.deepEqual(game.scenes['1'].prop, {
    image: 'assets/furniture/chests/chest-wood-open.png',
    alt: 'Открытый деревянный сундук',
  });
  assert.equal(game.scenes['1'].image, undefined);
  assert.equal(problems.filter((problem) => problem.level === 'error').length, 0);
});

test('empty prop image is reported and does not create a prop', () => {
  const { game, problems } = parseQuest2('prop-empty', {
    format: 'quest/2',
    id: 'prop-empty',
    title: 'Prop',
    status: 'draft',
    start: '1',
    scenes: {
      '1': {
        title: 'Сцена',
        text: 'Текст.',
        prop: { alt: 'Нет картинки' },
      },
    },
  });

  assert.equal(game.scenes['1'].prop, undefined);
  assert.ok(problems.some((problem) => problem.code === 'Q2_PROP_FIELDS'));
});
