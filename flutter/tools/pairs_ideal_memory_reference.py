#!/usr/bin/env python3
"""ЭТАЛОН «ИДЕАЛЬНОЙ ПАМЯТИ» ДЛЯ «ПАРНЫХ КАРТИНОК» — из движков MindLab, а не из Dart.

Запуск из корня дерева:  python3 flutter/tools/pairs_ideal_memory_reference.py
Пишет flutter/test/fixtures/pairs-ideal-memory-reference.json — по нему проба сверяет
`idealMemoryMoves` (flutter/lib/games/picture_pairs/model.dart) расклад в расклад.

ОТКУДА. Решение Дениса 30.09.2026 (задача cd9685ec): движки MindLab добавляем в разделы
нативно. Эталоны ниже взяты из репо donosov999-ai/abstract-games-core (коммит 73ec95d, свой
clean-room-код): `perfect_memory_moves` из engines/mindlab/kids/pairs.py — дословно, класс колоды
урезан до нужного ему; `perfect_moves` из engines/mindlab/punchline/punchline.py — тот же алгоритм,
переписанный на голую колоду. Колоды тасует тот же `random.Random(seed)`, что и движки, поэтому
якорь из их тестов («8 пар, seed=1 — 12 ходов») воспроизводится здесь и проверяется assert'ом.

ЗАЧЕМ ДВЕ РЕАЛИЗАЦИИ. Проба, сверяющая Dart с ним же самим, была бы зелёной всегда.
· ПАРЫ: Dart обязан совпасть с `perfect_memory_moves` ход в ход.
· ТРОЙКИ: `perfect_moves` из Punchline открывает три НЕИЗВЕСТНЫЕ карты и не добирает
  известными — это верхняя граница, а не эталон. Dart добирает известными, значит обязан
  уложиться в неё (не больше ходов) и не быть быстрее «одной группы за ход».
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'test', 'fixtures', 'pairs-ideal-memory-reference.json')


# ── engines/mindlab/kids/pairs.py (perfect_memory_moves дословно) ─────────────────────────────────
class Pairs:
    def __init__(self, n_pairs=8, seed=1):
        rng = random.Random(seed)
        deck = list(range(n_pairs)) * 2
        rng.shuffle(deck)
        self.cards = deck
        self.open_found = set()
        self.moves = 0

    @property
    def n(self):
        return len(self.cards)

    @property
    def done(self):
        return len(self.open_found) == self.n

    def peek(self, i):
        return self.cards[i]

    def play(self, a, b):
        va, vb = self.peek(a), self.peek(b)
        self.moves += 1
        if va == vb:
            self.open_found.update((a, b))
            return True
        return False

    def remaining(self):
        return [i for i in range(self.n) if i not in self.open_found]


def perfect_memory_moves(n_pairs, seed=1):
    g = Pairs(n_pairs, seed)
    known = {}
    while not g.done:
        rest = g.remaining()
        by_val = {}
        for i in rest:
            if i in known:
                by_val.setdefault(known[i], []).append(i)
        pair = next((v for v in by_val.values() if len(v) == 2), None)
        if pair:
            g.play(pair[0], pair[1])
            continue
        unknown = [i for i in rest if i not in known]
        a = unknown[0]
        known[a] = g.peek(a)
        mate = next((i for i in rest if i != a and known.get(i) == known[a]), None)
        if mate is not None:
            g.play(a, mate)
        else:
            b = unknown[1]
            known[b] = g.peek(b)
            g.play(a, b)
    return g.cards, g.moves


# ── engines/mindlab/punchline/punchline.py (тасовка и perfect_moves на голой колоде) ──
def punchline_deck(n_sets, seed):
    rng = random.Random(seed)
    deck = []
    for s in range(n_sets):
        deck += [s] * 3
    rng.shuffle(deck)
    return deck


def punchline_perfect_moves(deck):
    n = len(deck)
    taken = set()
    known = {}
    moves = 0
    while len(taken) != n:
        rest = [i for i in range(n) if i not in taken]
        by_val = {}
        for i in rest:
            if i in known:
                by_val.setdefault(known[i], []).append(i)
        trio = next((v for v in by_val.values() if len(v) == 3), None)
        if trio:
            moves += 1
            taken.update(trio)
            continue
        unknown = [i for i in rest if i not in known]
        picks = unknown[:3]
        for i in picks:
            known[i] = deck[i]
        moves += 1
        if deck[picks[0]] == deck[picks[1]] == deck[picks[2]]:
            taken.update(picks)
    return moves


def main():
    pairs = []
    for n_pairs in (4, 6, 8, 10, 12):
        for seed in range(1, 21):
            deck, moves = perfect_memory_moves(n_pairs, seed)
            pairs.append({'pairs': n_pairs, 'seed': seed, 'deck': deck, 'ideal': moves})
    anchor = next(p for p in pairs if p['pairs'] == 8 and p['seed'] == 1)
    assert anchor['ideal'] == 12, 'якорь движка MindLab (test_pairs.py): 8 пар, seed=1 — 12 ходов'
    triples = []
    for n_sets in (4, 6, 14):
        for seed in range(1, 11):
            deck = punchline_deck(n_sets, seed)
            triples.append({'sets': n_sets, 'seed': seed, 'deck': deck, 'naive': punchline_perfect_moves(deck)})
    # Расклад — одной строкой: файл читает человек, сверяя расхождение, а не только проба.
    def rows(items):
        return ',\n'.join('  ' + json.dumps(e, ensure_ascii=False) for e in items)

    head = {
        'source': 'abstract-games-core 73ec95d: engines/mindlab/kids/pairs.py, engines/mindlab/punchline/punchline.py',
        'anchor': {'pairs': 8, 'seed': 1, 'ideal': 12},
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('{\n')
        for k, v in head.items():
            f.write(f' {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n')
        f.write(' "pairs": [\n' + rows(pairs) + '\n ],\n')
        f.write(' "triples": [\n' + rows(triples) + '\n ]\n}\n')
    print(f'пар: {len(pairs)} раскладов, троек: {len(triples)} → {os.path.relpath(OUT)}')


if __name__ == '__main__':
    main()
