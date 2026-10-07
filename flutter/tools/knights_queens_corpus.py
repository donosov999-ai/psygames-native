"""Корпус «Конь и ферзи»: задачи «Восемь ферзей» и «Обход конём» с лестницей.

Задача 39ad8924 (цепочка «Шахматы: семь новых игр», игра 3). Запуск из flutter/:
    python3 tools/knights_queens_corpus.py  →  assets/knights_queens/{queens,tours}.json

Схема до кода: ~/dev/psygames/chess-chat/KNIGHTS_QUEENS_SCHEME.md.

ФЕРЗИ. Доска N×N, на ней «заданные» ферзи (стоят с начала, снять нельзя) и «дыры» (туда ставить нельзя).
Решено — N ферзей, никто никого не бьёт. Мера трудности P — вероятность, что СЛУЧАЙНАЯ расстановка по рядам
дойдёт до конца: в каждом свободном ряду ферзь встаёт равновероятно на любое поле, которое не дыра и не бито
стоящими ферзями (заданные бьют с самого начала). Дерево перебора при N ≤ 8 считается точно, не выборкой.
Генератор доказывает решаемость: число решений ≥ 1, а в группах «единственное» — ровно 1.

КОНЬ. Доска R×C, старт, поля-препятствия, иногда заданный финиш. Решено — конь побывал на каждом свободном
поле ровно раз (и закончил на финише, если он задан). Посчитать дерево точно на 8×8 нельзя, поэтому мера —
W, доля успехов правила Варнсдорфа («туда, откуда меньше всего выходов») со СЛУЧАЙНЫМ выбором среди равных,
на 300 прогонах. W = 1 — правило проходит доску само, ступень лёгкая; W мало — нужен счёт вперёд. Решаемость
доказывает перебор с откатом (Варнсдорф первым), он же отдаёт эталонный обход для разбора.

Лестница каждого режима — 24 ступени: 8 групп × треть по мере (лёгкая, средняя, трудная).
Зерно постоянное — корпус воспроизводится байт в байт.
"""
import json, os, random, sys

PER_BAND = 20

# ─────────────────────────── ФЕРЗИ ───────────────────────────


def attacks(a, b):
    (r1, c1), (r2, c2) = a, b
    return r1 == r2 or c1 == c2 or abs(r1 - r2) == abs(c1 - c2)


def queens_analyse(n, givens, holes):
    """(число решений, P) — точный перебор по рядам. givens: set клеток, holes: set клеток."""
    given_rows = {r: (r, c) for r, c in givens}
    for a in givens:
        for b in givens:
            if a < b and attacks(a, b):
                return 0, 0.0

    def go(row, placed):
        if row == n:
            return 1, 1.0
        if row in given_rows:
            return go(row + 1, placed)
        safe = [(row, c) for c in range(n)
                if (row, c) not in holes and all(not attacks((row, c), q) for q in placed)]
        if not safe:
            return 0, 0.0
        sols, p = 0, 0.0
        for cell in safe:
            s, q = go(row + 1, placed + [cell])
            sols += s
            p += q
        return sols, p / len(safe)

    return go(0, list(givens))


def all_solutions(n):
    out = []

    def go(row, cols):
        if row == n:
            out.append(tuple(cols))
            return
        for c in range(n):
            if all(c != cc and abs(c - cc) != row - rr for rr, cc in enumerate(cols)):
                go(row + 1, cols + [c])
    go(0, [])
    return out


def queens_code(n, givens, holes):
    return ''.join('Q' if (r, c) in givens else '#' if (r, c) in holes else '.'
                   for r in range(n) for c in range(n))


# (N, заданных: от–до, дыр: от–до (None — ставятся на чужие решения), только единственное решение)
QUEEN_GROUPS = [
    (4, (0, 1), (0, 2), False),
    (5, (0, 1), (0, 3), False),
    (6, (0, 1), (0, 3), False),
    (6, (0, 0), (0, 4), False),
    (7, (0, 1), (0, 4), False),
    (8, (0, 1), (0, 4), False),
    (7, (0, 1), None, True),
    (8, (0, 0), None, True),
]


def queens_corpus(rng):
    out = []
    for group, (n, (g_lo, g_hi), hole_range, unique) in enumerate(QUEEN_GROUPS):
        h_lo, h_hi = hole_range or (0, 0)
        sols = all_solutions(n)
        pool, seen = [], set()
        tries = 0
        while len(pool) < 3 * PER_BAND * 3 and tries < 20000:
            tries += 1
            s = rng.choice(sols)
            sol_cells = [(r, c) for r, c in enumerate(s)]
            g = rng.randint(g_lo, g_hi)
            givens = set(rng.sample(sol_cells, g))
            free = [(r, c) for r in range(n) for c in range(n) if (r, c) not in sol_cells]
            if unique:
                # Дыры ставятся НА ЧУЖИЕ решения, пока не останется одно — своё. Случайные дыры
                # единственности почти не дают: 8 задач из 20 000 попыток (замер 01.10.2026).
                holes = set()
                others = [o for o in sols if o != s]
                while True:
                    alive = [o for o in others
                             if all((r, c) not in holes for r, c in enumerate(o))
                             and all(o[r] == c for r, c in givens)]
                    if not alive:
                        break
                    o = rng.choice(alive)
                    holes.add(rng.choice([(r, c) for r, c in enumerate(o) if (r, c) not in sol_cells]))
            else:
                holes = set(rng.sample(free, rng.randint(h_lo, min(h_hi, len(free)))))
            code = queens_code(n, givens, holes)
            if code in seen:
                continue
            seen.add(code)
            count, p = queens_analyse(n, givens, holes)
            if count == 0 or (unique and count != 1):
                continue
            pool.append((code, round(p, 6), count))
        # Трети по P: выше P — легче. Внутри трети — первые PER_BAND по зерну.
        pool.sort(key=lambda x: (-x[1], x[0]))
        third = len(pool) // 3
        if third < 4:
            sys.exit(f'ферзи: группа {group} (N={n}) — всего {len(pool)} задач, мало для трёх третей')
        for band in range(3):
            part = pool[band * third:(band + 1) * third]
            rng.shuffle(part)
            for code, p, count in part[:PER_BAND]:
                out.append([n, code, p, count, group, band])
    return out


# ─────────────────────────── КОНЬ ───────────────────────────

KNIGHT = [(1, 2), (2, 1), (2, -1), (1, -2), (-1, -2), (-2, -1), (-2, 1), (-1, 2)]


class Board:
    def __init__(self, rows, cols, blocked):
        self.rows, self.cols, self.blocked = rows, cols, set(blocked)
        self.cells = [(r, c) for r in range(rows) for c in range(cols) if (r, c) not in self.blocked]
        self.nb = {}
        for r, c in self.cells:
            self.nb[(r, c)] = [(r + dr, c + dc) for dr, dc in KNIGHT
                               if 0 <= r + dr < rows and 0 <= c + dc < cols and (r + dr, c + dc) not in self.blocked]


def find_tour(b, start, end=None, budget=200000, shuffle=None):
    """Перебор с откатом, Варнсдорф первым. Возвращает обход (список клеток) или None."""
    total = len(b.cells)
    path, seen = [start], {start}
    nodes = [0]

    def exits(x):
        return sum(1 for y in b.nb[x] if y not in seen)

    def go(x):
        nodes[0] += 1
        if nodes[0] > budget:
            return False
        if len(path) == total:
            return end is None or x == end
        cand = [y for y in b.nb[x] if y not in seen]
        if end is not None and len(path) < total - 1:
            cand = [y for y in cand if y != end]
        if shuffle is not None:
            shuffle.shuffle(cand)
            cand.sort(key=exits)
        else:
            cand.sort(key=lambda y: (exits(y), y))
        for y in cand:
            path.append(y); seen.add(y)
            if go(y):
                return True
            path.pop(); seen.discard(y)
        return False

    return list(path) if go(start) else None


def warnsdorff_rate(b, start, end, rng, trials=300):
    """Доля успехов правила Варнсдорфа со случайным выбором среди равных."""
    total = len(b.cells)
    ok = 0
    for _ in range(trials):
        x, seen, steps = start, {start}, 1
        while steps < total:
            cand = [y for y in b.nb[x] if y not in seen and (end is None or steps == total - 1 or y != end)]
            if not cand:
                break
            least = min(sum(1 for z in b.nb[y] if z not in seen) for y in cand)
            x = rng.choice([y for y in cand if sum(1 for z in b.nb[y] if z not in seen) == least])
            seen.add(x); steps += 1
        if steps == total and (end is None or x == end):
            ok += 1
    return ok / trials


def tour_code(b, start, end):
    return ''.join('S' if (r, c) == start else 'E' if (r, c) == end else
                   '#' if (r, c) in b.blocked else '.'
                   for r in range(b.rows) for c in range(b.cols))


# (ряды, столбцы, препятствий: от–до, доля задач с заданным финишем)
# Малые доски без финиша дают мало разных задач: у 5×5 обход есть только с 13 полей,
# у 7×7 — с 25 (поля цвета углов). Заданный финиш — честная вторая ось: он и множит
# задачи, и делает их труднее (Варнсдорф с финишем ошибается чаще).
TOUR_GROUPS = [
    (3, 4, (0, 0), 1.0),
    (4, 5, (0, 0), 0.5),
    (5, 5, (0, 0), 0.5),
    (5, 6, (0, 0), 0.5),
    (6, 6, (0, 0), 0.5),
    (7, 7, (0, 0), 0.5),
    (8, 8, (0, 0), 0.0),
    (8, 8, (2, 6), 1.0),
]


def tours_corpus(rng):
    out = []
    for group, (rows, cols, (o_lo, o_hi), end_share) in enumerate(TOUR_GROUPS):
        pool, seen = [], set()
        tries = 0
        while len(pool) < 3 * PER_BAND * 2 and tries < 8000:
            tries += 1
            with_end = rng.random() < end_share
            all_cells = [(r, c) for r in range(rows) for c in range(cols)]
            blocked = set(rng.sample(all_cells, rng.randint(o_lo, o_hi)))
            b = Board(rows, cols, blocked)
            start = rng.choice(b.cells)
            end = None
            if with_end:
                # Финиш — конец СЛУЧАЙНОГО обхода из этого старта: перебор с перемешанным
                # порядком, иначе финиш у одного старта был бы всегда один и тот же.
                tour = find_tour(b, start, shuffle=rng)
                if tour is None:
                    continue
                end = tour[-1]
            code = tour_code(b, start, end)
            if code in seen:
                continue
            seen.add(code)
            tour = find_tour(b, start, end)
            if tour is None:
                continue
            w = warnsdorff_rate(b, start, end, rng)
            path = [r * cols + c for r, c in tour]
            pool.append((code, round(w, 4), path))
        pool.sort(key=lambda x: (-x[1], x[0]))
        third = len(pool) // 3
        if third < 2:
            sys.exit(f'конь: группа {group} ({rows}×{cols}) — всего {len(pool)} задач')
        for band in range(3):
            part = pool[band * third:(band + 1) * third]
            rng.shuffle(part)
            for code, w, path in part[:PER_BAND]:
                out.append([rows, cols, code, w, path, group, band])
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, '..', 'assets', 'knights_queens')
    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(20261001)
    queens = queens_corpus(rng)
    with open(os.path.join(out_dir, 'queens.json'), 'w') as f:
        json.dump({'format': 'n, code (Q заданный, # дыра), P, решений, группа, треть',
                   'puzzles': queens}, f, separators=(',', ':'))
    tours = tours_corpus(rng)
    with open(os.path.join(out_dir, 'tours.json'), 'w') as f:
        json.dump({'format': 'ряды, столбцы, code (S старт, E финиш, # препятствие), W, эталонный обход (номера клеток), группа, треть',
                   'puzzles': tours}, f, separators=(',', ':'))
    for name, rows, gi in (('ферзи', queens, 4), ('конь', tours, 5)):
        by = {}
        for row in rows:
            by.setdefault((row[gi], row[gi + 1]), 0)
            by[(row[gi], row[gi + 1])] += 1
        print(name, len(rows), 'задач; по группам×третям:', dict(sorted(by.items())))


if __name__ == '__main__':
    main()
