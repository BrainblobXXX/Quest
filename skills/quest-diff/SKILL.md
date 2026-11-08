---
name: quest-diff
description: Сравнить два пакета Quest/2 по структуре.
---

# quest-diff

Используй для ревью изменений книги или сравнения версий.

## Команда

```bash
python3 scripts/quest2_diff.py old/book.yaml new/book.yaml
python3 scripts/quest2_diff.py old new --json
```

## Как читать

- `added` — новое поле/сцена;
- `removed` — удалено;
- `changed` — изменено значение.

Сначала проверь изменения в `scenes.*.interaction.outcomes`, `start`, `items`,
`stats` и `codes` — они чаще всего ломают достижимость.

Документация: `engine_docs/QUEST2_SCHEMA.md`.
