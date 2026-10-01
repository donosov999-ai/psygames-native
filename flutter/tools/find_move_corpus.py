#!/usr/bin/env python3
"""ВЫБОРКА ЗАДАЧ «НАЙДИ ХОД» ИЗ БАЗЫ LICHESS (CC0 1.0).

Источник: https://database.lichess.org/lichess_db_puzzle.csv.zst — общественное достояние,
обязательств нет; источник назван по нашему правилу, а не по требованию лицензии.

Запуск (python-chess нужен только здесь, в приложение он не едет):
    zstd -dc lichess_db_puzzle.csv.zst | ~/dev/chess-tools/.venv/bin/python \\
        flutter/tools/find_move_corpus.py > flutter/assets/find_move/puzzles.json

КАК СНЯТА ВЫБОРКА
- Надёжность: Popularity ≥ 80, NbPlays ≥ 500, RatingDeviation ≤ 90 — рейтинг задачи устоялся на
  сотнях попыток, и задача не «сломанная» (у сломанных популярность отрицательная).
- Длина: 2, 4 или 6 полуходов записи — то есть 1, 2 или 3 хода человека. Первый ход записи —
  ход соперника, после него ходит человек.
- Двенадцать приёмов (THEMES). У задачи обычно несколько тем; приём задачи — САМЫЙ РЕДКИЙ из
  двенадцати (порядок RARITY, перепись корпуса 01.10.2026). Иначе вилка — 375 тыс. задач —
  забрала бы все клетки, где она стоит второй темой.
- Квота: QUOTA задач на клетку «приём × полоса рейтинга × длина». Где задач меньше — берутся все.
  Отбор внутри клетки — выборка-резервуар с постоянным зерном: тот же файл даёт ту же выборку.
- Проверка каждой задачи python-chess: все ходы записи законны; у матовых приёмов последний ход
  ставит мат. Приложение проверяет то же своими правилами (bishop) — проба
  `test/find_move_corpus_test.dart`, чтобы генератор и приложение не разошлись молча.

ФОРМАТ ЗАПИСИ: {"id", "f": позиция ДО хода соперника, "o": ход соперника, "s": [ход человека,
ответ соперника, ход человека, …], "r": рейтинг, "t": номер приёма в THEMES, "b": номер полосы}.
"""
import csv
import io
import json
import random
import sys

import chess

# Двенадцать приёмов в порядке открытия на лестнице (схема FIND_MOVE_SCHEME.md §2).
THEMES = [
    'hangingPiece', 'mateIn1', 'backRankMate',
    'fork', 'pin', 'skewer',
    'discoveredAttack', 'doubleCheck', 'trappedPiece',
    'deflection', 'attraction', 'mateIn2',
]
# От редкого к частому — перепись 01.10.2026 по надёжным задачам (Popularity ≥ 80, NbPlays ≥ 500):
# doubleCheck 18 593 · trappedPiece 38 859 · backRankMate 55 171 · skewer 64 598 · hangingPiece 94 321 ·
# attraction 127 700 · deflection 138 387 · discoveredAttack 161 040 · pin 190 112 · mateIn1 242 072 ·
# mateIn2 329 127 · fork 375 138.
RARITY = [
    'doubleCheck', 'trappedPiece', 'backRankMate', 'skewer', 'hangingPiece', 'attraction',
    'deflection', 'discoveredAttack', 'pin', 'mateIn1', 'mateIn2', 'fork',
]
MATES = {'mateIn1', 'mateIn2', 'backRankMate'}
BANDS = [(0, 1000), (1000, 1300), (1300, 1600), (1600, 1900), (1900, 2200), (2200, 4000)]
PLIES = (2, 4, 6)
QUOTA = 20
SEED = 20261001


def band_of(rating):
    for i, (lo, hi) in enumerate(BANDS):
        if lo <= rating < hi:
            return i
    return None


def valid(fen, moves, theme):
    board = chess.Board(fen)
    for uci in moves:
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            return False
        board.push(move)
    return board.is_checkmate() if theme in MATES else True


def main():
    rnd = random.Random(SEED)
    seen = {}
    cells = {}
    reader = csv.reader(io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8'))
    head = next(reader)
    col = {name: i for i, name in enumerate(head)}
    total = reliable = 0
    for row in reader:
        total += 1
        if int(row[col['Popularity']]) < 80 or int(row[col['NbPlays']]) < 500:
            continue
        if int(row[col['RatingDeviation']]) > 90:
            continue
        moves = row[col['Moves']].split()
        if len(moves) not in PLIES:
            continue
        themes = set(row[col['Themes']].split())
        theme = next((t for t in RARITY if t in themes), None)
        if theme is None:
            continue
        # мат в 1 — ровно один ход человека, мат в 2 — ровно два: тема Lichess это и значит.
        if (theme == 'mateIn1' and len(moves) != 2) or (theme == 'mateIn2' and len(moves) != 4):
            continue
        rating = int(row[col['Rating']])
        b = band_of(rating)
        if b is None:
            continue
        reliable += 1
        key = (theme, b, len(moves))
        seen[key] = seen.get(key, 0) + 1
        cell = cells.setdefault(key, [])
        item = (row[col['PuzzleId']], row[col['FEN']], moves, rating)
        # Резервуар с запасом: часть задач может не пройти проверку ниже.
        room = QUOTA * 2
        if len(cell) < room:
            cell.append(item)
        else:
            j = rnd.randrange(seen[key])
            if j < room:
                cell[j] = item
    out = []
    rejected = 0
    per_theme = {t: 0 for t in THEMES}
    for (theme, b, plies), cell in sorted(cells.items(), key=lambda kv: (THEMES.index(kv[0][0]), kv[0][1], kv[0][2])):
        cell.sort(key=lambda it: it[0])
        taken = 0
        for pid, fen, moves, rating in cell:
            if taken == QUOTA:
                break
            if not valid(fen, moves, theme):
                rejected += 1
                continue
            out.append({'id': pid, 'f': fen, 'o': moves[0], 's': moves[1:], 'r': rating,
                        't': THEMES.index(theme), 'b': b})
            taken += 1
            per_theme[theme] += 1
    doc = {
        '_источник': 'https://database.lichess.org/lichess_db_puzzle.csv.zst',
        '_лицензия': 'CC0 1.0 — общественное достояние',
        '_отбор': (f'Popularity ≥ 80, NbPlays ≥ 500, RatingDeviation ≤ 90; 1–3 хода человека; '
                   f'приём — самый редкий из двенадцати; квота {QUOTA} на клетку «приём × полоса × длина»; '
                   f'зерно {SEED}. Генератор: flutter/tools/find_move_corpus.py'),
        '_корпус': f'{total} задач в файле, {reliable} прошли фильтр, {rejected} отброшены проверкой',
        'themes': THEMES,
        'bands': [lo for lo, _ in BANDS],
        'puzzles': out,
    }
    json.dump(doc, sys.stdout, ensure_ascii=False, separators=(',', ':'))
    sys.stdout.write('\n')
    print(f'{total} в файле · {reliable} надёжных · {len(out)} в выборке · отброшено проверкой {rejected}',
          file=sys.stderr)
    for t in THEMES:
        print(f'  {t:18s} {per_theme[t]}', file=sys.stderr)


if __name__ == '__main__':
    main()
