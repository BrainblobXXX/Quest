# Результат конвертации 11 книг

Дата: после фиксации `quest/2`.
Способ: одноразовый конвертер `scripts/convert-quest2.ts`.
Старые файлы `quest/1` удалены; `quest2.yaml`, ассеты и исходники книг
сохранены.

## 1. Файлы

Для каждой книги создан параллельный файл:

```text
games/<id>/quest2.yaml
```

Файлы `game.yaml`, `story.md`, `items.yaml`, `stats.yaml`, `flags.yaml`,
`mechanics.yaml`, `codes.yaml` и старые брифы удалены. Ассеты (`assets/`) и
PDF/TXT-исходники сохранены; исходники исключены из git (`.gitignore`).

## 2. Сверка структуры

| id | сцен | концовок | `quest/2` ошибок | предупреждений |
|---|---:|---:|---:|---:|
| unicorn-cage | 16 | 5 | 0 | 0 |
| how-to-survive-on-2500 | 41 | 8 | 0 | 0 |
| kupalo-night | 228 | 26 | 0 | 0 |
| popadanec-v-harry-potter | 66 | 22 | 0 | 0 |
| summer-vacation | 57 | 7 | 0 | 0 |
| rybalka | 53 | 2 | 0 | 0 |
| orcsday | 108 | 4 | 0 | 2 |
| rock-of-terror | 108 | 15 | 0 | 2 |
| steel-rat | 351 | 5 | 0 | 2 |
| zombie-blood | 403 | 40 | 0 | 1 |
| fallout2-barricades | 600 | 36 | 0 | 2 |

Количество сцен и концовок совпадает с `quest/1` во всех 11 книгах.

## 3. Предупреждения

`W_UNREACHABLE` / `W_UNREACHABLE_ENDING` — известные контентные ограничения,
которые были в `quest/1`:

- Orcsday: 7 сцен, включая §33; спутник/call-return;
- Rock of Terror: недостижимые ветки/сердечные сцены;
- Steel Rat: 4/5 концовок;
- Zombie Blood: §335 и служебная `rules`;
- Fallout II: большая часть сцен достижима через коды, статический граф их не
  видит; это ожидаемо.

Это не ошибки конвертации. Решение по контенту — отдельно.

## 4. Проверка

```bash
python3 scripts/quest2_validate.py games/<id>/quest2.yaml
python3 scripts/quest2_graph.py games/<id>/quest2.yaml --json
python3 scripts/quest2_simulate.py games/<id>/quest2.yaml --runs 200 --seed 42
```

Все 11 файлов проходят JSON Schema и семантический валидатор без `E_*`.

## 5. Что пока не сделано

- `quest2.yaml` подключён к библиотеке/runtime (загрузчик quest2);
- старые `quest/1` удалены; runtime `quest/2` подключён;
- в Zombie Blood «Доллары» перенесены из `stats` в предмет `money`;
- в «Рыбалке» видимые статы сведены к деньгам и усталости, улов перенесён в предметы инвентаря;
- обложки подключены: миниатюры в библиотеке, увеличение и первая страница книги.
- `3.6` отложен;
- симулятор для больших книг может сообщать `max-steps` на случайных циклах
  (Steel/Fallout) — это ограничение инструмента, а не ошибка схемы;
- контентные дефекты (S-01, O-02, O-03, F-02, F-03, Z-12, K-02) остаются.
