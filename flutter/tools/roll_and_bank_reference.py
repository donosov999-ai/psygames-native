#!/usr/bin/env python3
"""ЭТАЛОН «РИСКНИ И СОХРАНИ»: оптимальный бот решением игры, а не порогом.

Запуск из корня дерева:  python3 flutter/tools/roll_and_bank_reference.py
Пишет flutter/test/fixtures/roll-and-bank-optimal.json — по нему проба сверяет
решатель на Dart (flutter/lib/games/roll_and_bank/solver.dart) решение в решение.

ЗАЧЕМ ДВЕ РЕАЛИЗАЦИИ. Бот верхних ступеней играет по таблице, которую никто не
проверит глазами: 13 950 решений «бросать / сохранить». Проба, сверяющая решатель
с ним же самим, была бы зелёной всегда. Поэтому эталон считается независимо, здесь,
и файл с ним лежит рядом с экспортёром — пересобирается одной командой.

ПОСТАНОВКА (как игру Pig решали Neller & Presser, 2004). P(i, j, k) — вероятность
победы того, кто ходит: у него сохранено i, у соперника j, в текущем ходу k.
  бросок: выпало <= B — сгорело, ход сопернику: 1 − P(j, i, 0);
          иначе i+k+f >= G — победа (финиш берётся сразу), или P(i, j, k+f);
  сохранить (k > 0): ход сопернику, у меня i+k: 1 − P(j, i+k, 0).
P = max(бросок, сохранить); итерация по значениям до сходимости.
Порядок обхода и порядок сложения граней — те же, что в Dart: тогда числа совпадают
до бита, и решения можно сверять без допусков (кроме настоящих ничьих).
"""
import json
import os

GOAL = 30
BUST = 1
EPS = 1e-12
TIE = 1e-9


def solve(goal, bust):
    p = {}
    for i in range(goal):
        for j in range(goal):
            for k in range(goal - i):
                p[(i, j, k)] = 0.5
    while True:
        delta = 0.0
        for i in range(goal):
            for j in range(goal):
                for k in range(goal - i):
                    pr = 0.0
                    for f in range(1, 7):
                        if f <= bust:
                            pr += (1 - p[(j, i, 0)]) / 6
                        elif i + k + f >= goal:
                            pr += 1 / 6
                        else:
                            pr += p[(i, j, k + f)] / 6
                    ph = (1 - p[(j, i + k, 0)]) if (k > 0 and i + k < goal) else -1.0
                    v = pr if pr >= ph else ph
                    d = abs(v - p[(i, j, k)])
                    if d > delta:
                        delta = d
                    p[(i, j, k)] = v
        if delta < EPS:
            return p


def decisions(p, goal, bust):
    """'1' — бросать, '0' — сохранить, 't' — ничья (|бросок − сохранить| <= 1e-9)."""
    out = []
    for i in range(goal):
        for j in range(goal):
            for k in range(goal - i):
                pr = 0.0
                for f in range(1, 7):
                    if f <= bust:
                        pr += (1 - p[(j, i, 0)]) / 6
                    elif i + k + f >= goal:
                        pr += 1 / 6
                    else:
                        pr += p[(i, j, k + f)] / 6
                ph = (1 - p[(j, i + k, 0)]) if (k > 0 and i + k < goal) else -1.0
                out.append('t' if abs(pr - ph) <= TIE else ('1' if pr >= ph else '0'))
    return ''.join(out)


def main():
    p = solve(GOAL, BUST)
    policy = decisions(p, GOAL, BUST)
    best = {str(s): round(p[(0, s, 0)], 12) for s in range(GOAL - 1)}
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'test', 'fixtures', 'roll-and-bank-optimal.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({
            'source': 'flutter/tools/roll_and_bank_reference.py',
            'goal': GOAL,
            'bust': BUST,
            'order': 'i (сохранено у ходящего), j (у соперника), k (в ходу) по возрастанию; k < goal - i',
            'policy': policy,
            'ties': policy.count('t'),
            'best_by_head_start': best,
        }, f, ensure_ascii=False, indent=1)
    print(f'решений {len(policy)}, бросать {policy.count("1")}, сохранить {policy.count("0")}, ничьих {policy.count("t")}')
    print(f'лучший игрок против лучшего бота без форы: {p[(0, 0, 0)]:.6f}; с форой 28: {p[(0, 28, 0)]:.6f}')
    print(f'записано: {os.path.relpath(out)}')


if __name__ == '__main__':
    main()
