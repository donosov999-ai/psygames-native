#!/usr/bin/env python3
"""ДОСКИ ДОРОЖКИ МАЛЫШЕЙ «СУДОКУ» — ВЫГРУЗКА (задача fa0d6f9c, 01.10.2026).

Дорожка до 1-го уровня обычной лестницы (план уровней v3, решение Дениса 01.10): звери 4×4 →
«Мяу — друзья» 4×4 → звери 6×6, по три ступени, по 12 досок на ступень. Ступени и число
подсказок задаёт развилка лестницы (psygames-sudoku-levels-claude-mac, LEVELS_PLAN.md, раздел
«ДАННЫЕ ДЛЯ МАЛЫШЕЙ ГОТОВЫ»); здесь они записаны константой STEPS.

Генератор — MindLab `engines/mindlab/sudoku/sudoku.py` (репо abstract-games-core, наш):
`generate(n, clues, seed, friends)` детерминирован по зерну. Поэтому зёрна не хранятся списком,
а ОТБИРАЮТСЯ правилом: от базы ступени вверх, доска берётся, если у неё ровно столько подсказок,
сколько велит ступень, а на «Мяу» — ещё и если без правила друзей решений больше одного (иначе
правило на доске ничего не решает). Замер 01.10: отбор дал те же 108 зёрен, что лежат в данных
развилки, и те же доски — 108/108.

Запуск (MindLab нужен только здесь, в приложение он не едет):
    python3 flutter/tools/export_kids_boards.py > flutter/assets/levels/sudoku-kids-boards.json
Путь к MindLab — переменная MINDLAB_SUDOKU (по умолчанию соседний репо на этом Маке).

Каждая доска проверяется перед записью: решение единственно (с правилом друзей, где оно есть),
задание — часть решения. Приложение проверяет то же своим перебором — проба
`flutter/test/sudoku_kids_test.dart`, чтобы генератор и приложение не разошлись молча.

ПРАВИЛО «МЯУ — ДРУЗЬЯ»: значение 1 (кот) обязано иметь значение 2 (мышь) в одной из четырёх
соседних клеток — слева, справа, сверху или снизу. С «недотрогами» (ход короля) несовместимо
(MindLab NOTES.md) — не смешивать.
"""
import json
import os
import sys

MINDLAB = os.environ.get(
    'MINDLAB_SUDOKU',
    os.path.expanduser('~/Downloads/Code claude/abstract-games-hub/engines/mindlab/sudoku'),
)
sys.path.insert(0, MINDLAB)
import sudoku as S  # noqa: E402

PER_STEP = 12
FRIENDS = (1, 2)

# Дорожка: имя, поле, блок (строк × столбцов), правило друзей, база зёрен ступени, подсказки по ступеням.
TRACKS = [
    ('animals4', 4, 2, 2, False, 1000, [10, 8, 6]),
    ('meow4', 4, 2, 2, True, 5000, [7, 6, 5]),
    ('animals6', 6, 2, 3, False, 1000, [20, 16, 13]),
]


def flat(grid):
    return ''.join(str(v) for row in grid for v in row)


def boards_for(n, friends, base, clues):
    out, seed = [], base
    while len(out) < PER_STEP:
        seed += 1
        if seed > base + 5000:
            raise SystemExit(f'n={n} clues={clues}: за 5000 зёрен набралось {len(out)} досок')
        try:
            puzzle, solution = S.generate(n, clues, seed, friends=friends)
        except AssertionError:
            continue  # у зерна нет полной решётки с правилом друзей
        if sum(1 for row in puzzle for v in row if v) != clues:
            continue
        if friends and S.count_solutions(puzzle, n, 2) < 2:
            continue  # без правила доска и так решается — правило ничего не решает
        if S.count_solutions(puzzle, n, 2, friends=friends) != 1:
            raise SystemExit(f'зерно {seed}: решение не единственно')
        if any(p and p != s for pr, sr in zip(puzzle, solution) for p, s in zip(pr, sr)):
            raise SystemExit(f'зерно {seed}: задание расходится с решением')
        out.append({'seed': seed, 'puzzle': flat(puzzle), 'solution': flat(solution)})
    return out


def main():
    tracks = []
    for name, n, br, bc, friends, base, clues in TRACKS:
        fr = FRIENDS if friends else None
        steps = [
            {'givens': c, 'boards': boards_for(n, fr, base * (k + 1), c)}
            for k, c in enumerate(clues)
        ]
        tracks.append({'id': name, 'n': n, 'br': br, 'bc': bc,
                       'friends': list(FRIENDS) if friends else None, 'steps': steps})
    json.dump({
        'source': 'MindLab sudoku.py generate(n, clues, seed, friends); flutter/tools/export_kids_boards.py',
        'tracks': tracks,
    }, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
