#!/usr/bin/env python3
"""ЭТАЛОН «ПОДЛОДОК» ДЛЯ FLUTTER — прогон живого движка MindLab `submarinos/sea.py`.

Пишет flutter/test/fixtures/submarines-reference.json: состояния выстрелов (мимо/попал,
потопленные), вероятностную карту бота `prob_map` в каждом и множество клеток, из
которых бот выбирает ход (`ai_shot` до броска: соседи попаданий или максимумы карты).
Dart-перенос (`flutter/lib/games/submarines/model.dart`) сверяется с этим файлом ТОЧНЫМ
равенством чисел — карта целочисленная.

Сверяется не флот и не бросок бота: генераторы случайности Python и Dart разные, одно
зерно даёт разные флоты. Сверяется то, что от случайности не зависит, — правила.

Запуск (движок лежит вне репозитория, путь можно переопределить):
    python3 flutter/tool/record_submarines_reference.py
    MINDLAB_SUBMARINOS=/путь/к/submarinos python3 flutter/tool/record_submarines_reference.py
ПОСЛЕ ЛЮБОЙ ПРАВКИ sea.py — перезапустить и закоммитить эталон.
"""

import json
import os
import random
import sys

ENGINE = os.environ.get(
    'MINDLAB_SUBMARINOS',
    os.path.expanduser('~/Downloads/Code claude/abstract-games-hub/engines/mindlab/submarinos'),
)
sys.path.insert(0, ENGINE)
import sea  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test', 'fixtures', 'submarines-reference.json')


def candidates(shots, sunk):
    """Клетки, из которых ai_shot выбирает бросок, — та же логика, что в движке."""
    hits = [c for c, v in shots.items() if v == sea.HIT]
    cand = []
    for r, c in hits:
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nb = (r + dr, c + dc)
            if 0 <= nb[0] < sea.SIZE and 0 <= nb[1] < sea.SIZE and nb not in shots:
                cand.append(nb)
    if cand:
        return 'hunt', sorted(set(cand))
    scores = sea.prob_map(shots, sunk)
    if not scores:
        return 'free', sorted((r, c) for r in range(sea.SIZE) for c in range(sea.SIZE) if (r, c) not in shots)
    best = max(scores.values())
    return 'best', sorted(c for c, v in scores.items() if v == best)


def main():
    states = []
    for seed in range(1, 41):
        s = sea.Sea(seed=seed)
        rng = random.Random(seed + 1000)
        stop = random.Random(seed * 7).randrange(0, 70)
        for _ in range(stop):
            if s.done:
                break
            r, c = sea.ai_shot(s.shots, s.sunk, rng)
            s.fire(r, c)
        scores = sea.prob_map(s.shots, s.sunk)
        kind, cand = candidates(s.shots, s.sunk)
        states.append({
            'seed': seed,
            'shots': [[r, c, v] for (r, c), v in sorted(s.shots.items())],
            'sunk': sorted(s.sunk),
            'prob': [[r, c, v] for (r, c), v in sorted(scores.items())],
            'kind': kind,
            'candidates': [[r, c] for r, c in cand],
        })
    bot = [sea.bot_game(seed)[0] for seed in range(1, 101)]
    data = {
        'source': 'abstract-games-hub/engines/mindlab/submarinos/sea.py',
        'size': sea.SIZE,
        'fleet': [[n, ln] for n, ln in sea.FLEET],
        'states': states,
        'botShots': {'seeds': '1..100', 'mean': sum(bot) / len(bot), 'max': max(bot), 'min': min(bot)},
    }
    kinds = {st['kind'] for st in states}
    if not {'hunt', 'best'} <= kinds:
        raise SystemExit(f'эталон однобокий: только {kinds}')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print(f'эталон «Подлодок»: состояний {len(states)}, виды {sorted(kinds)}, бот в среднем {data["botShots"]["mean"]:.1f} выстрела → {OUT}')


if __name__ == '__main__':
    main()
