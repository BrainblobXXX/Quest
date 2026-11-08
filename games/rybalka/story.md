## 1

Купите наживку.

{А}Червь, «Деньги» -2, «Червь» +1 — [А]{/А}
{Б}Мотыль, «Мотыль» +10, «Деньги» -15 — [Б]{/Б}
{В}Опарыш, «Опарыш» +1, «Деньги» -4 — [В]{/В}
{Г}Хлеб, «Хлеб» +10, «Деньги» -15 — [Г]{/Г}
{Д}Кукуруза, «Кукуруза» +10, «Деньги» -7 — [Д]{/Д}
{Е}Тесто, «Деньги» -25, «Тесто» +10 — [Е]{/Е}
{Ж}Подсака, «Деньги» -100, «Подсака» +1 — [Ж]{/Ж}
{З}На рыбалку — [З]{/З}
{И}Итог — [И]{/И}

Вариант А {if: stat money >= 2, take: {worm: 1}, stat: {money: -2}}
Вариант Б {if: stat money >= 15, take: {moth: 10}, stat: {money: -15}}
Вариант В {if: stat money >= 4, take: {maggot: 1}, stat: {money: -4}}
Вариант Г {if: stat money >= 15, take: {bread: 10}, stat: {money: -15}}
Вариант Д {if: stat money >= 7, take: {corn: 10}, stat: {money: -7}}
Вариант Е {if: stat money >= 25, take: {dough: 10}, stat: {money: -25}}
Вариант Ж {if: stat money >= 100 and not has_item net, take: {net: 1}, stat: {money: -100}}
Вариант З
Вариант И {if: stat money < 1}

## 2

Рыбка сорвалась.

## 3

Рыбка уже у берега.

## 4

Вы поймали щуку.

## 5

Удочка заброшена. Остается только ждать.

## 6

И это ...

## 7

И это ...

Щука

## 8

И это ...

## 9

И это ...

## 10

Наконец-то клюет.

{А}Подсечь — [А]{/А}
{Б}Резко потянуть — [Б]{/Б}

Вариант А
Вариант Б

## 11

Выберите наживку.

{А}Назад — [А]{/А}
{Б}Червь, «Червь» -1 — [Б]{/Б}
{В}Опарыш, «Опарыш» -1 — [В]{/В}
{Г}Кукуруза, «Кукуруза» -1 — [Г]{/Г}
{Д}Мотыль, «Мотыль» -1 — [Д]{/Д}
{Е}Хлеб, «Хлеб» -1 — [Е]{/Е}
{Ж}Тесто, «Тесто» -1 — [Ж]{/Ж}
{З}Живец, «Живец» -1 — [З]{/З}

Вариант А
Вариант Б {if: has_item worm, use: worm, stat: {bait: 1}}
Вариант В {if: has_item maggot, use: maggot, stat: {bait: 3}}
Вариант Г {if: has_item corn, use: corn, stat: {bait: 6}}
Вариант Д {if: has_item moth, use: moth, stat: {bait: 2}}
Вариант Е {if: has_item bread, use: bread, stat: {bait: 4}}
Вариант Ж {if: has_item dough, use: dough, stat: {bait: 5}}
Вариант З {if: has_item live_bait, use: live_bait, stat: {bait: 7}}

## 12

И это ...

## 13

Вы поймали карпа.

## 14

И это ...

Карась

## 15

Вы потратили все деньги и отправились домой.

## 16

Вы поймали карася.

## 17

Рыбак так долго ждал клева, что аж уснул. Он проснулся уже поздней ночью. Его удочку утащила какая-то рыба. По этой причине, рыбак пошел домой с пойманным уловом и больше никогда не ходил на рыбалку.

## 18

Вы поймали плотву.

{А}Отпустить — [А]{/А}
{Б}Сделать живец, «Живец» +1 — [Б]{/Б}

Вариант А
Вариант Б {take: {live_bait: 1}, stat: {bait: -7}}

## 19

Вы поймали ...

{А}Узнать — [А]{/А}
{Б}Узнать — [Б]{/Б}
{В}Узнать — [В]{/В}
{Г}Узнать — [Г]{/Г}
{Д}Узнать — [Д]{/Д}
{Е}Узнать — [Е]{/Е}
{Ж}Узнать — [Ж]{/Ж}

Вариант А {if: stat bait = 1}
Вариант Б {if: stat bait = 2}
Вариант В {if: stat bait = 7}
Вариант Г {if: stat bait = 3}
Вариант Д {if: stat bait = 4}
Вариант Е {if: stat bait = 5}
Вариант Ж {if: stat bait = 6}

## 20

И это ...

Карп

## 21

Вы поймали красноперку.

## s3_yes

## s3_no

## s3_both

## s3_menu

{А}Тянуть — [А]{/А}
{Б}Тянуть — [Б]{/Б}
{В}Взять подсакой — [В]{/В}

Вариант А {if: stat risk_yes = 1, stat: {risk_yes: -1, risk_no: -1}}
Вариант Б {if: stat risk_no = 1, stat: {risk_yes: -1, risk_no: -1}}
Вариант В {if: has_item net}

## s5_yes

## s5_no

## s5_both

## s5_menu

{А}Клюет — [А]{/А}
{Б}Ждать, «Усталость» +1 — [Б]{/Б}
{В}Сменить наживку — [В]{/В}
{Г}Рыбак уснул — [Г]{/Г}

Вариант А {if: stat bite_yes = 1 and stat fatigue < 5, stat: {bite_yes: -1}}
Вариант Б {if: stat bite_no = 1 and stat fatigue < 5, stat: {bite_no: -1, fatigue: 1}}
Вариант В {if: stat fatigue < 5 and stat bite_yes = 0, stat: {bait: -7}}
Вариант Г {if: stat fatigue >= 5}

## s6_carp

## s6_rudd

## s6_both

## s6_menu

{А}Карп — [А]{/А}
{Б}Красноперка — [Б]{/Б}

Вариант А {if: stat fish_carp = 1, stat: {fish_carp: -1, fish_rudd: -1, fish_crucian: -1, fish_roach: -1}}
Вариант Б {if: stat fish_rudd = 1, stat: {fish_carp: -1, fish_rudd: -1, fish_crucian: -1, fish_roach: -1}}

## fish_set_01

## fish_set_02

## fish_set_03

## fish_set_04

## fish_set_05

## fish_set_06

## fish_set_07

## fish_set_08

## fish_set_09

## fish_set_10

## fish_set_11

## fish_set_12

## fish_set_13

## fish_set_14

## fish_set_15

## fish_menu

{А}Карась — [А]{/А}
{Б}Карп — [Б]{/Б}
{В}Красноперка — [В]{/В}
{Г}Плотва — [Г]{/Г}

Вариант А {if: stat fish_crucian = 1, stat: {fish_crucian: -1, fish_carp: -1, fish_rudd: -1, fish_roach: -1}}
Вариант Б {if: stat fish_carp = 1, stat: {fish_crucian: -1, fish_carp: -1, fish_rudd: -1, fish_roach: -1}}
Вариант В {if: stat fish_rudd = 1, stat: {fish_crucian: -1, fish_carp: -1, fish_rudd: -1, fish_roach: -1}}
Вариант Г {if: stat fish_roach = 1, stat: {fish_crucian: -1, fish_carp: -1, fish_rudd: -1, fish_roach: -1}}

## s12_rudd

## s12_roach

## s12_both

## s12_menu

{А}Красноперка — [А]{/А}
{Б}Плотва — [Б]{/Б}

Вариант А {if: stat fish_rudd = 1, stat: {fish_rudd: -1, fish_roach: -1, fish_carp: -1, fish_crucian: -1}}
Вариант Б {if: stat fish_roach = 1, stat: {fish_rudd: -1, fish_roach: -1, fish_carp: -1, fish_crucian: -1}}
