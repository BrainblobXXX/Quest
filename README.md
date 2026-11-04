# QUEST-166 — каркас движка текстовых квестов

Монитор на системном блоке с ЭЛТ-экраном: BIOS-заставка, библиотека игр, игровой экран.
Собрано по [MVP.md](MVP.md), §7–8.

## Запуск

Подробные инструкции по добавлению книг и иллюстраций — в [GAMES.md](GAMES.md).

```bash
npm install
npm run dev     # сборка игр + http://127.0.0.1:3100
npm run build   # сборка игр + продакшн-сборка
npm start       # пересборка игр из games/ + сервер (порт 3000, или $PORT)
npm run games:build   # только игры + валидация пакетов
```

`npm start` каждый раз пересобирает игры из `games/` и кладёт свежий JSON в
standalone-сборку — новую игру достаточно положить в `games/` и перезапустить сервер,
`next build` для этого не нужен. Детали — в [GAMES.md](GAMES.md), §0.

## Что уже работает

- BIOS-заставка с проверкой памяти, пропускается кликом или клавишей;
- библиотека: две демо-игры, отметка продолжения, переключатель звука;
- игровой экран: строка состояния (глава + инвентарь), текст, нумерованные выборы;
- выборы с условием (`has_item`), взятие предметов (`take`), концовки;
- иллюстрации сцен: поле `image` в JSON, кадр до 60% высоты, вписан целиком;
- линейный переход `next` и бросок кубика `roll`/`outcomes`;
- автосейв в `localStorage` после каждой сцены;
- две физические кнопки на корпусе: «ДВИЖОК» и «ИГРА» с защёлкой и паузой;
- корпус: питание, LEDs, FDD, CD-ROM, вентиляция, шильдик;
- звук: гул ЭЛТ, щелчки, писк загрузки (стартует после первого действия);
- клавиатура: цифры — выбор, Enter — «Далее», Esc — в библиотеку.

## Структура

```text
app/                 Next.js: layout, страница, стили
components/          корпус, кнопки, экраны
lib/                 движок, условия, хранение, звук, загрузка игр
games/               исходники игр: game.yaml, story.md, items.yaml, assets/
public/games/        собранные JSON (генерируются)
test/                проверки движка
```

## Тесты движка

```bash
npx tsx test/engine.test.ts
```

## Скриншоты

```bash
npx playwright install chromium   # один раз
node test/shots.mjs               # shot-library.png, shot-game.png, shot-mobile.png
```

## Деплой на ONREZA

Репозиторий `BrainblobXXX/Quest`, ветка `main`, корень проекта — этот каталог (файл
`package.json` лежит в корне репозитория).

| Настройка | Значение |
|---|---|
| Framework | Next.js (определяется автоматически) |
| Install command | `npm install` |
| Build command | `npm run build` |
| Start command | `node .next/standalone/server.js` |
| Node.js | 20.9+ (лучше 22) |
| Output directory | оставить пустым |
| Environment variables | не нужны |
| Порт | платформа передаёт `PORT`, сервер его слушает |

Почему именно так:

- `prebuild` собирает игры из `games/` в `public/games/` — в git их нет, они генерируются;
- `postbuild` копирует `public/` и `.next/static/` внутрь `.next/standalone/`. Без этого
  на хостинге не будет стилей, скриптов и JSON игр: Next.js standalone их не копирует сам;
- `next.config.ts` включает `output: 'standalone'`;
- `npm start` запускает standalone-сервер, а не `next start` с жёстким портом.

Локальная проверка прод-сборки:

```bash
npm run build
PORT=3120 npm start        # http://127.0.0.1:3120
```
