---
name: quest-simulate
description: Прогнать пакет Quest/2 по seed и получить исходы/ошибки.
---

# quest-simulate

Используй после `quest-validate`, чтобы проверить прохождение, тупики и
распределение концовок.

## Команда

```bash
python3 scripts/quest2_simulate.py path/to/package --runs 100 --seed 42
python3 scripts/quest2_simulate.py path/to/package --runs 1000 --seed 42 --json
```

## Как читать

- `ending` — книга завершилась;
- `no-choices` — в сцене не осталось доступных вариантов;
- `max-steps` — вероятный цикл;
- `roll-no-outcome` — бросок не покрыт диапазонами;
- `codebook-no-target` — известный код не даёт существующую сцену;
- `error: ...` — ошибка эффекта/боя.

Симулятор — инструмент проверки, а не замена ручному проходу.

Документация: `engine_docs/QUEST2_SCHEMA.md`.
