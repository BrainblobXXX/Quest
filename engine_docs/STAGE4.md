# Этап 4 — AI-инструменты

Статус: инструменты и скиллы созданы; документация QuestParser/TestAI
обновлена (QuestParser 0.67, TestAI `10-quest2.md`). Runtime `quest/2` подключён;
внешние UI-специфичные механики (`after`/`codebook`) проверяются отдельно.

## 1. CLI

- `scripts/quest2_validate.py` — JSON Schema + семантика;
- `scripts/quest2_graph.py` — граф, достижимость, тупики, концовки;
- `scripts/quest2_simulate.py` — прохождение по seed, исходы и ошибки;
- `scripts/quest2_diff.py` — структурное сравнение двух пакетов.

Все инструменты поддерживают `--json` (кроме `diff`/`graph` — у них свой JSON
режим) и возвращают ненулевой код при ошибке.

## 2. AI-скиллы

- `skills/quest-validate/SKILL.md`;
- `skills/quest-graph/SKILL.md`;
- `skills/quest-simulate/SKILL.md`;
- `skills/quest-diff/SKILL.md`;
- `skills/quest-convert/SKILL.md` — одноразовая конвертация существующей книги.

Скиллы содержат готовые команды и правила чтения отчётов.

## 3. Тестовый пакет

`engine_docs/examples/quest2-demo/` — не книга и не элемент библиотеки.
Покрывает choices, check, contest combat, gamble, shop, roll, codebook,
entry-эффекты, условия, `once`, скрытые статусы, коды и концовки.

Проверки:

```bash
python3 scripts/quest2_validate.py engine_docs/examples/quest2-demo
python3 scripts/quest2_graph.py engine_docs/examples/quest2-demo
python3 scripts/quest2_simulate.py engine_docs/examples/quest2-demo --runs 100 --seed 42
```

## 4. Обновление QuestParser

Задачи после стабилизации схемы:

- синхронизировать `docs/handoff.md` и `docs/manifest.md` с `quest/2`;
- описать `effects`, `condition`, `interaction`, `codebook`, `start_items`;
- добавить в `docs/review.md` семантические коды (`E_SCENE_MISSING`,
  `E_ITEM_MISSING`, `E_ROLL_GAP`, `E_CODE_TARGET`);
- обновить `docs/conversion.md`: новые книги пишутся в `quest/2`;
- не переводить существующие 11 книг без решения пользователя.

## 5. Обновление TestAI

- добавить прогон `quest2_validate`/`graph`/`simulate` как preflight;
- проверять новые книги на schema/семантику до UI-тестов;
- тестировать `codebook`, `start_items`, `visible`, формулы;
- генерировать багрепорты с кодами и путями из JSON-отчёта;
- не менять существующие книги.

## 6. Что отложено

- **адаптер** `quest/1 → quest/2` не делаем;
- одноразовый конвертер `scripts/convert-quest2.ts` создан для параллельных
  `quest2.yaml`; это не runtime-адаптер;
- build-time нормализация (3.6) — отдельный вопрос;
- шаблон новой книги — не создаётся.
