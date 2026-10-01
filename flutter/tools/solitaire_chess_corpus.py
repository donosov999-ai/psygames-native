"""Корпус «Шахматного пасьянса»: доски 4×4, где каждый ход — взятие, а в конце остаётся одна фигура.

Задача 66b3d2ac (цепочка «Шахматы: семь новых игр», игра 2). Запуск из flutter/:
    python3 tools/solitaire_chess_corpus.py  →  assets/solitaire_chess/puzzles.json

ПРАВИЛА (как у настольного Solitaire Chess, ThinkFun): фигуры ходят по-шахматному, но ТОЛЬКО со взятием;
цвета нет — бить можно любую фигуру; шаха нет, короля тоже берут; пешка бьёт на клетку по диагонали ВВЕРХ
и не превращается. Решено — когда на доске одна фигура. Набор фигур тот же, что в коробке: король и ферзь
по одному, ладей, слонов, коней и пешек — до двух (значит, фигур от 3 до 10).

ТРУДНОСТЬ. Число фигур трудностью не является: случайная доска из 9 фигур имеет медиану 1160 решений и
решается почти сама (замер 01.10.2026: 200 досок на число фигур). Мера здесь — P, вероятность расчистить
доску СЛУЧАЙНЫМИ взятиями (каждый раз равновероятно любое взятие): тупики делают P малым. Она разная при
любом числе фигур — от 1,0 до 0,001 — и считается точно перебором. Для каждого числа фигур доски делятся
на три части по P: лёгкая треть (P выше), средняя, трудная (P ниже). Ступень лестницы = (фигур, треть).

Генерация как у sol_chess (cool-mist, AGPL — код не брали, взят только приём): случайная расстановка из
набора коробки → оставить, если решается. Зерно постоянное, корпус воспроизводится байт в байт.
Запись доски — 16 знаков сверху вниз, слева направо, «.» — пусто (как `pb......br..p..p` у sol_chess).
"""
import json, os, random, sys

N = 4
BOX = {'K': 1, 'Q': 1, 'R': 2, 'B': 2, 'N': 2, 'P': 2}
SLIDE = {'R': [(1, 0), (-1, 0), (0, 1), (0, -1)], 'B': [(1, 1), (1, -1), (-1, 1), (-1, -1)]}
SLIDE['Q'] = SLIDE['R'] + SLIDE['B']
KNIGHT = [(1, 2), (2, 1), (-1, 2), (-2, 1), (1, -2), (2, -1), (-1, -2), (-2, -1)]
PER_BAND = 30          # досок в каждой трети каждого числа фигур
SAMPLE = 3 * PER_BAND * 4  # из скольких решаемых делить на трети


def captures(b):
    """b: dict (row, col) -> буква. Взятия как пары клеток. Ряд 0 — верхний."""
    out = []
    for (r, c), p in b.items():
        if p in SLIDE:
            for dr, dc in SLIDE[p]:
                rr, cc = r + dr, c + dc
                while 0 <= rr < N and 0 <= cc < N:
                    if (rr, cc) in b:
                        out.append(((r, c), (rr, cc)))
                        break
                    rr += dr; cc += dc
        elif p == 'N':
            out += [((r, c), (r + dr, c + dc)) for dr, dc in KNIGHT if (r + dr, c + dc) in b]
        elif p == 'K':
            out += [((r, c), (r + dr, c + dc)) for dr, dc in SLIDE['Q'] if (r + dr, c + dc) in b]
        elif p == 'P':
            out += [((r, c), (r - 1, c + dc)) for dc in (-1, 1) if (r - 1, c + dc) in b]
    return out


def play(b, mv):
    f, t = mv
    nb = dict(b)
    nb[t] = nb.pop(f)
    return nb


def key(b):
    return tuple(sorted(b.items()))


def analyse(b):
    """(число решений, P случайной игры) — точным перебором с памятью."""
    memo = {}

    def go(x):
        if len(x) == 1:
            return 1, 1.0
        k = key(x)
        if k in memo:
            return memo[k]
        cs = captures(x)
        sols, p = 0, 0.0
        for mv in cs:
            s, q = go(play(x, mv))
            sols += s
            p += q
        r = (sols, p / len(cs) if cs else 0.0)
        memo[k] = r
        return r

    return go(b)


def board_str(b):
    return ''.join(b.get((r, c), '.') for r in range(N) for c in range(N))


def main():
    rng = random.Random(20261001)
    bag = [p for p, n in BOX.items() for _ in range(n)]
    out = []
    seen = set()
    for k in range(3, 11):
        found = []
        while len(found) < SAMPLE:
            pieces = rng.sample(bag, k)
            squares = rng.sample([(r, c) for r in range(N) for c in range(N)], k)
            b = dict(zip(squares, pieces))
            s = board_str(b)
            if s in seen:
                continue
            sols, p = analyse(b)
            if sols:
                seen.add(s)
                found.append((p, s, sols))
        found.sort(key=lambda x: (-x[0], x[1]))        # P по убыванию: лёгкие первыми
        third = len(found) // 3
        for band in range(3):
            part = found[band * third:(band + 1) * third]
            step = len(part) / PER_BAND
            for i in range(PER_BAND):
                p, s, sols = part[int(i * step)]
                out.append([s, round(p, 4), sols, band])
        ps = [x[0] for x in found]
        print(f'фигур {k}: P от {ps[-1]:.4f} до {ps[0]:.4f}, границы третей {ps[third]:.3f} / {ps[2 * third]:.3f}', file=sys.stderr)
    data = {'v': 1, 'dim': N, 'note': 'board, P random-play success, solutions, band 0 easy..2 hard', 'puzzles': out}
    path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'solitaire_chess', 'puzzles.json')
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f'досок {len(out)} → {os.path.normpath(path)} ({os.path.getsize(path)} байт)', file=sys.stderr)


if __name__ == '__main__':
    main()
