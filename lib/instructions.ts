import type { Game } from './types';

export type Instruction = {
  title: string;
  text: string;
  /** true — в книге была собственная сцена rules */
  detailed: boolean;
};

function hasCombat(game: Game): boolean {
  return Object.keys(game.combat ?? {}).length > 0;
}

function hasChecks(game: Game): boolean {
  return Object.keys(game.checks ?? {}).length > 0 || Object.keys(game.gambles ?? {}).length > 0;
}

function hasCodes(game: Game): boolean {
  return Object.keys(game.codes ?? {}).length > 0;
}

function hasInventory(game: Game): boolean {
  return Object.keys(game.items ?? {}).length > 0 || Object.keys(game.startItems ?? {}).length > 0;
}

function hasShop(game: Game): boolean {
  return Object.values(game.scenes).some((scene) => (scene.shop?.length ?? 0) > 0);
}

function hasInitialRoll(game: Game): boolean {
  return Object.values(game.stats ?? {}).some((stat) => Boolean(stat.roll));
}

function commonControls(game: Game): string[] {
  const lines = [
    'Внизу экрана — варианты действий. Их можно нажимать мышью, а на клавиатуре — цифрами 1–9.',
    'Сохранение происходит автоматически после каждого шага. Вернуться в библиотеку можно по Esc.',
    'Стрелка «назад» в шапке возвращает к предыдущей сцене, если это разрешено книгой.',
  ];
  if (hasInventory(game)) {
    lines.push('Кнопка с рюкзаком открывает инвентарь; если предметов мало, они показаны прямо в шапке.');
  }
  if (Object.keys(game.stats ?? {}).filter((id) => game.stats?.[id]?.show !== false).length > 0) {
    lines.push('Кнопка с графиком открывает характеристики; при одном-двух параметрах они видны в шапке.');
  }
  if (hasCombat(game)) {
    lines.push('В бою действия выбираются латинскими клавишами A, B, C, D — они подписаны на кнопках.');
  }
  if (hasChecks(game)) {
    lines.push('В некоторых сценах требуется проверка: результат броска сравнивается с порогом или характеристикой.');
  }
  if (hasCodes(game)) {
    lines.push('Найденные коды записываются в журнал кодов; кнопка с документом открывает его.');
  }
  return lines;
}

function storybook(game: Game): string {
  const controls = commonControls(game).filter((line) => !line.includes('В бою'));
  return [
    'ЭТО КНИГА-ИГРА',
    '',
    'Вы читаете историю и сами решаете, что сделает герой. В конце сцены появляются варианты действий; выберите тот, который считаете правильным.',
    '',
    'КАК ЧИТАТЬ',
    ...controls.map((line) => `• ${line}`),
    '',
    'Некоторые варианты могут быть скрыты, пока герой не найдёт нужный предмет, не узнает код или не выполнит условие. Если вариант недоступен, попробуйте другой путь.',
    '',
    'У книги несколько концовок. Ошибочный выбор может привести к поражению, но историю всегда можно начать заново.',
  ].join('\n');
}

function hybrid(game: Game): string {
  return [
    'КАК ИГРАТЬ',
    '',
    'Это книга-игра с элементами приключения. Вы читаете сцены и выбираете действия; некоторые решения меняют характеристики, предметы или открывают новые пути.',
    '',
    'ОСНОВЫ',
    ...commonControls(game).map((line) => `• ${line}`),
    '',
    'Иногда в книге встречаются проверки и броски. Читайте условие на экране: от результата зависит, продолжится ли путь или герой попадёт в другую сцену.',
    '',
    'Если персонаж теряет все жизни или попадает в безвыходную ситуацию, начните книгу заново — часть тайн откроется только со второго прохождения.',
  ].join('\n');
}

function fightingFantasy(game: Game): string {
  return [
    'КАК ИГРАТЬ',
    '',
    'Это боевая книга-игра. Вы — герой, который исследует опасный мир, сражается с врагами и собирает снаряжение. Победа зависит не только от удачи, но и от выбранного пути.',
    '',
    'ОСНОВЫ',
    ...commonControls(game).map((line) => `• ${line}`),
    ...(hasInitialRoll(game) ? ['• В начале книги бросаются кубики, чтобы определить стартовые характеристики.'] : []),
    '',
    'БОЙ',
    'В бою сначала выберите оружие, затем действие. У врагов есть запас здоровья; урон наносится по очереди. Следите за своим здоровьем и не забывайте про аптечку.',
    'Каждый раунд заканчивается записью в журнале: в ней указано, сколько врагов осталось и сколько здоровья у персонажа.',
    '',
    'ПРОВЕРКИ',
    'Если сцена требует проверки, бросьте кубики и сравните результат с порогом. Неудачная проверка может стоить здоровья или изменить ход истории.',
    '',
    'Смерть в бою не всегда означает конец: книгу можно начать заново и попробовать другой маршрут.',
  ].join('\n');
}

function rpg(game: Game): string {
  return [
    'КАК ИГРАТЬ',
    '',
    'Это ролевая книга-игра. У героя есть характеристики и навыки, а решения проверяются броском d20. Читайте сцену, выбирайте действия и следите за последствиями.',
    '',
    'ОСНОВЫ',
    ...commonControls(game).map((line) => `• ${line}`),
    '',
    'ПРОВЕРКИ И БОЙ',
    'В проверках к d20 прибавляется подходящий навык; результат сравнивается со сложностью. В бою вы выбираете оружие и атакуете — попадание зависит от навыка, d20 и защиты врага.',
    ...(hasShop(game) ? ['В магазинах можно покупать предметы; следите за балансом.'] : []),
    ...(hasCodes(game) ? ['Коды и координаты записываются в журнал — они могут открыть новые маршруты.'] : []),
    '',
    'Здоровье, мораль и снаряжение сохраняются между сценами. Если герой погибает, начните заново или вернитесь к более раннему решению.',
  ].join('\n');
}

function generic(game: Game): string {
  return [
    'КАК ИГРАТЬ',
    '',
    'Это интерактивная книга. Читайте сцены, выбирайте варианты и следите за изменениями характеристик и предметов.',
    '',
    'ОСНОВЫ',
    ...commonControls(game).map((line) => `• ${line}`),
    '',
    'У истории есть несколько путей и концовок. Если что-то пошло не так, начните книгу заново.',
  ].join('\n');
}

/** Подробная инструкция книги или стандартная для её типа. */
export function instructionFor(game: Game): Instruction {
  const own = game.scenes.rules;
  if (own && typeof own.text === 'string' && own.text.trim()) {
    return { title: own.title || 'Правила книги', text: own.text, detailed: true };
  }

  const type = (game.type ?? '').toLowerCase();
  if (type === 'storybook' || type === 'story-book') {
    return { title: 'Как читать книгу-игру', text: storybook(game), detailed: false };
  }
  if (type === 'fighting-fantasy' || type === 'fantasy-battle') {
    return { title: 'Как играть', text: fightingFantasy(game), detailed: false };
  }
  if (type === 'rpg') {
    return { title: 'Как играть', text: rpg(game), detailed: false };
  }
  if (type === 'hybrid') {
    return { title: 'Как играть', text: hybrid(game), detailed: false };
  }
  return { title: 'Как играть', text: generic(game), detailed: false };
}
