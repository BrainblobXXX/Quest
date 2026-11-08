---
name: quest-validate
description: Проверить пакет Quest/2 по JSON Schema и семантическим правилам.
---

# quest-validate

Используй, когда нужно проверить новый или изменённый пакет `quest/2`.

## Команда

```bash
python3 scripts/quest2_validate.py path/to/package
python3 scripts/quest2_validate.py path/to/package --json
```

## Как читать

- `E_SCHEMA` — нарушена форма: сначала исправь структуру.
- `E_SCENE_MISSING`, `E_ITEM_MISSING`, `E_STAT_MISSING`, `E_FLAG_MISSING`,
  `E_CODE_MISSING` — битые ссылки.
- `E_FORMULA` — формула не разбирается.
- `E_ENDING_INTERACTION`, `E_DEAD_END`, `E_STAKE` — нарушены инварианты.
- `W_UNREACHABLE`, `W_UNREACHABLE_ENDING` — предупреждения о недостижимости.

Сначала исправляй `E_*`; `W_*` обсуждай с человеком.
Не меняй `engine_docs/quest2.schema.json` ради обхода ошибки в книге.

Документация: `engine_docs/QUEST2_SCHEMA.md`.
