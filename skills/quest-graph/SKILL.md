---
name: quest-graph
description: Построить статический граф пакета Quest/2 и проверить достижимость.
---

# quest-graph

Используй, когда нужно понять структуру книги, найти сироты, тупики и
недостижимые концовки.

## Команда

```bash
python3 scripts/quest2_graph.py path/to/package
python3 scripts/quest2_graph.py path/to/package --json
python3 scripts/quest2_graph.py path/to/package --dot
```

## Что смотреть

- `unreachable` — сцены, до которых нет статического пути.
- `unreachable_endings` — недостижимые концовки.
- `dead_ends` — не-концовки без исходящих рёбер.
- `distances` — минимальная глубина от старта.

Помни: коды `codebook` создают динамические переходы и в статический граф не
входят; такие места проверяй отдельно.

Документация: `engine_docs/QUEST2_SCHEMA.md`.
