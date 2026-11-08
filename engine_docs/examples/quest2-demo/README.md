# Тестовый пакет Quest/2

Пакет не подключён к библиотеке и не является книгой. Он нужен для проверки
схемы, валидатора, графа и симулятора.

Покрывает:

- `choices`, `continue`, `check`, `combat.contest`, `gamble`, `shop`, `roll`,
  `codebook`;
- `entry`-эффекты: `grant`, `consume`, `modify`, `set_flag`, `learn_code`,
  `redirect`;
- условия `if`/`not`/`stat`/`flag`/`known_code`;
- `once`;
- `ui.counter`;
- видимые и скрытые статусы;
- коды с явной базой;
- несколько концовок.

Проверка:

```bash
python3 scripts/quest2_validate.py engine_docs/examples/quest2-demo
python3 scripts/quest2_graph.py engine_docs/examples/quest2-demo
python3 scripts/quest2_simulate.py engine_docs/examples/quest2-demo --runs 100 --seed 42
```
