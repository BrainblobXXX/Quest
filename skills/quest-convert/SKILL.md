---
name: quest-convert
description: Создать параллельный quest2.yaml из существующего quest/1-пакета.
---

# quest-convert

Одноразовая конвертация существующей книги. Это **не адаптер**: старый пакет
не заменяется, рядом появляется `games/<id>/quest2.yaml`.

## Команда

```bash
cd /home/vlad/DeepSeekHome2/MVP
npx tsx scripts/convert-quest2.ts <id>
npx tsx scripts/convert-quest2.ts <id> --force
python3 scripts/quest2_validate.py games/<id>/quest2.yaml
```

Без `--force` существующий `quest2.yaml` не перезаписывается.

## Правила

- не менять `game.yaml` и `story.md` исходной книги;
- сверить исходник PDF/TXT в `games/<id>/`;
- сначала проверить `E_*`, потом `W_*`;
- после конвертации не удалять `quest/1` без решения человека;
- если конвертер не разобрал условие, остановиться и исправить конвертер, а не
  подгонять книгу.

Документация: `engine_docs/CONVERSION_PLAN.md`.
