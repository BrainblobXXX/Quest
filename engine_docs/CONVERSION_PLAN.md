# План конвертации `quest/1 → quest/2`

Статус: 11 пакетов `quest2.yaml` созданы; старые файлы `quest/1` удалены;
runtime читает `quest2.yaml`. JSON Schema и семантический валидатор проходят.
3.6 отложен.

## 1. Решение по существующим книгам

- Старые `quest/1`-файлы удалены; остались `quest2.yaml`, ассеты и исходники.
- Адаптер `quest/1 → quest/2` не делается.
- Исходники книг (PDF/TXT) лежат рядом с пакетами в `games/<id>/` и используются
  для сверки; они исключены из git через `.gitignore` (`games/**/*.pdf`,
  `games/**/*.txt`, `*.epub`, `*.fb2`).
- Судьба существующих книг после конвертации решается отдельно: удалить,
  пересоздать, обновить или промежуточный вариант.
- До начала конвертации конкретной книги менять её пакет нельзя.

## 2. Что считается конвертацией

Не «переписать YAML в новый синтаксис», а:

1. сверить пакет с исходником;
2. собрать `quest/2`-модель;
3. прогнать JSON Schema;
4. прогнать семантический валидатор;
5. прогнать граф;
6. прогнать симулятор;
7. сравнить поведение с `quest/1`;
8. зафиксировать расхождения в `review.md`.

Текущий результат: 11 файлов `games/<id>/quest2.yaml`, 0 `E_*`.
Предупреждения `W_UNREACHABLE` остались там, где они были в `quest/1`
(Orcsday, Rock, Steel, Zombie, Fallout); это контентные ограничения, не ошибки
конвертации.

## 3. Порядок книг

От простого к сложному:

1. `unicorn-cage` — 16 сцен, без механик;
2. `popadanec-v-harry-potter` — 66 сцен, без механик;
3. `summer-vacation` — 57 сцен, флаги;
4. `how-to-survive-on-2500` — 41 сцена, деньги;
5. `kupalo-night` — 228 сцен, музыка;
6. `steel-rat` — 351 сцена, предметы и статы;
7. `rybalka` — броски, деньги, наживка;
8. `rock-of-terror` — время, коды, флаги;
9. `orcsday` — проверки, ставки, Contest-бой;
10. `zombie-blood` — предметы, бой, магазин, initial roll;
11. `fallout2-barricades` — 600 сцен, коды, проверки, Fallout-бой.

## 4. Соответствие `quest/1 → quest/2`

| `quest/1` | `quest/2` |
|---|---|
| `type` | `profile` |
| `variants` | `interaction.type: choices` |
| `next: "N"` | `interaction.type: continue` |
| `next.roll` | `interaction.type: roll` |
| `checks` | `interaction.type: check` |
| `combat` | `interaction.type: combat` |
| `gambles` | `interaction.type: gamble` |
| `shop` | `interaction.type: shop` |
| `on_enter.take/drop/stat/set` | `entry`-эффекты |
| `on_enter.use` | `consume` |
| `on_enter.goto` | `redirect` |
| `on_enter.statRoll` | `roll` |
| `on_enter.dropBestWeapon` | `drop_best_weapon` |
| `learn_code` | `learn_code` |
| `show: false` | `visible: false` |
| `start_items` | `start_items` |
| `shopTitle/shopCurrency` | `interaction.title/currency` |
| `codes.yaml` | `codes` |
| `items.yaml` | `items` |
| `stats.yaml` | `stats` |
| `flags.yaml` | `flags` |

Точное соответствие полей — [QUEST2_SCHEMA.md](QUEST2_SCHEMA.md).

## 5. Проверка книги

```bash
python3 scripts/quest2_validate.py games/<id>/quest2.yaml
python3 scripts/quest2_graph.py games/<id>/quest2.yaml --json
python3 scripts/quest2_simulate.py games/<id>/quest2.yaml --runs 200 --seed 42
python3 scripts/quest2_diff.py old.yaml new.yaml
```

Выход конвертера: `games/<id>/quest2.yaml`; старые `game.yaml`/`story.md`
удалены после конвертации.

Критерий:

- нет `E_*`;
- все сцены достижимы, кроме объяснённых;
- все концовки достижимы;
- симулятор не находит тупиков/циклов;
- исходный текст сверен с PDF/TXT;
- `review.md` содержит все расхождения.

## 6. Что не делать

- не менять `story.md`, пока не начата конкретная книга;
- не подгонять формулы под симулятор;
- не добавлять сцены/ветки без исходника;
- не использовать код книги как причину менять движок;
- не делать адаптер.
