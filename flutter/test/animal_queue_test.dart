import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/animal_queue/model.dart';
import 'package:psygames_flutter/games/animal_queue/puzzle.dart';
import 'package:psygames_flutter/shell/board_solver.dart';

/// «ОЧЕРЕДЬ ЗВЕРЕЙ»: перенос движка MindLab `sequencing/queueing.py` обязан вести
/// себя, как исходник. Первые три пробы — те же, что `test_queue.py` движка.
void main() {
  test('законный ход — тот, чьи «раньше» уже стоят (test_legal)', () {
    var q = AnimalQueue(['a', 'b', 'c'], [(before: 0, after: 1), (before: 1, after: 2)]);
    expect(q.legal(), [0]);
    q = q.play(0)!;
    expect(q.legal(), [1]);
    expect(q.play(2), isNull, reason: 'движок бросал исключение — экран получает null');
  });

  test('счётчик порядков (test_count)', () {
    expect(countOrders(3, [(before: 0, after: 1), (before: 1, after: 2)]), 1);
    expect(countOrders(3, [(before: 0, after: 1)], cap: 10), 3);
  });

  test('🔴 генератор даёт ЕДИНСТВЕННЫЙ порядок, и законными ходами он проходится (test_generate)', () {
    final bad = <String>[];
    for (var n = 3; n <= animalFaces.length; n += 1) {
      for (var seed = 1; seed <= 60; seed += 1) {
        final g = generateQueue(n, Random(seed));
        if (g == null) {
          bad.add('n$n seed$seed: не собрано');
          continue;
        }
        if (countOrders(n, g.game.clues) != 1) bad.add('n$n seed$seed: порядок не единственный');
        var q = g.game;
        while (!q.done) {
          final l = q.legal();
          if (l.isEmpty) {
            bad.add('n$n seed$seed: тупик');
            break;
          }
          q = q.play(l.first)!;
        }
        if (q.done && q.queue.join(',') != g.order.join(',')) bad.add('n$n seed$seed: собралось не то');
      }
    }
    expect(bad, isEmpty);
  });

  test('звери одной партии разные, и лестница растёт от трёх до шести', () {
    for (var level = 1; level <= 8; level += 1) {
      final n = queueSizeFor(level);
      final g = generateQueue(n, Random(level))!;
      expect(g.game.animals.toSet().length, n, reason: 'L$level: повтор зверя');
    }
    expect(queueSizeFor(1), 3);
    expect(queueSizeFor(4), 6);
    expect(queueSizeFor(20), 6, reason: 'пул движка — шесть зверей');
  });

  test('🔴 разбор общим решателем каркаса доходит до собранной очереди', () {
    final g = generateQueue(5, Random(7))!;
    final moves = BoardSolver.solve(const AnimalQueuePuzzle(), g.game);
    expect(moves, g.order, reason: 'решатель обязан найти ровно ответ');
  });
}
