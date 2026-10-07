import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/animal_queue/model.dart';
import 'package:psygames_flutter/games/animal_queue/puzzle.dart';
import 'package:psygames_flutter/shell/board_solver.dart';

/// «ОЧЕРЕДЬ ЗВЕРЕЙ»: правила подсказок, генератор и лестница.
///
/// Первые пробы — те же, что `test_queue.py` движка MindLab, на подсказках «раньше»: их
/// поведение доработка 02.10.2026 (задача e95b7e2f) не меняла. Дальше — новые виды
/// подсказок и то, ради чего они заведены: ответ приходится выводить.
void main() {
  QueueClue before(int a, int b) => QueueClue(ClueKind.before, a, b);

  test('законный ход — тот, чьи «раньше» уже стоят (test_legal)', () {
    var q = AnimalQueue(['a', 'b', 'c'], [before(0, 1), before(1, 2)]);
    expect(q.legal(), [0]);
    q = q.play(0)!;
    expect(q.legal(), [1]);
    expect(q.play(2), isNull, reason: 'движок бросал исключение — экран получает null');
  });

  test('счётчик порядков (test_count)', () {
    expect(countOrders(3, [before(0, 1), before(1, 2)]), 1);
    expect(countOrders(3, [before(0, 1)], cap: 10), 3);
  });

  test('каждый вид подсказки значит то, что нарисовано', () {
    // Очередь 2, 0, 1 — от двери.
    const order = [2, 0, 1];
    expect(const QueueClue(ClueKind.first, 2).holds(order), isTrue);
    expect(const QueueClue(ClueKind.first, 0).holds(order), isFalse);
    expect(const QueueClue(ClueKind.last, 1).holds(order), isTrue);
    expect(const QueueClue(ClueKind.last, 0).holds(order), isFalse);
    expect(const QueueClue(ClueKind.next, 2, 0).holds(order), isTrue, reason: '0 сразу за 2');
    expect(const QueueClue(ClueKind.next, 2, 1).holds(order), isFalse, reason: 'между 2 и 1 стоит 0');
    expect(const QueueClue(ClueKind.next, 0, 2).holds(order), isFalse, reason: 'порядок важен');
    expect(before(2, 1).holds(order), isTrue);
    expect(before(1, 2).holds(order), isFalse);
    expect(const QueueClue(ClueKind.apart, 2, 1).holds(order), isTrue, reason: 'между ними 0');
    expect(const QueueClue(ClueKind.apart, 0, 1).holds(order), isFalse, reason: 'стоят рядом');
    expect(const QueueClue(ClueKind.apart, 1, 0).holds(order), isFalse, reason: '«не рядом» не знает порядка');
  });

  test('🔴 ход законный, только если очередь ещё можно достроить', () {
    // «Последний» не пускает зверя на середину очереди из трёх.
    final q = AnimalQueue(['a', 'b', 'c'], const [
      QueueClue(ClueKind.first, 0),
      QueueClue(ClueKind.last, 1),
    ]).play(0)!;
    expect(q.candidates(), [2]);
    // Месту подходят двое, но 1 ведёт в тупик: тогда 2 окажется рядом с последним 3.
    final deep = AnimalQueue(['a', 'b', 'c', 'd'], const [
      QueueClue(ClueKind.first, 0),
      QueueClue(ClueKind.last, 3),
      QueueClue(ClueKind.apart, 2, 3),
    ]).play(0)!;
    expect(deep.candidates(), [1, 2], reason: 'месту подходят оба');
    expect(deep.legal(), [2], reason: 'законен только тот, с кем очередь достраивается');
    expect(deep.play(1), isNull);
  });

  test('🔴 генератор: ответ единственный, подсказки верные, игра проходится законными ходами', () {
    final bad = <String>[];
    for (var level = 1; level <= 20; level += 1) {
      for (var seed = 1; seed <= 15; seed += 1) {
        final g = generateQueue(level, Random(seed * 97 + level));
        final n = g.game.animals.length;
        if (n != queueSizeFor(level)) bad.add('L$level s$seed: зверей $n');
        if (g.game.animals.toSet().length != n) bad.add('L$level s$seed: повтор зверя');
        if (countOrders(n, g.game.clues, cap: 3) != 1) bad.add('L$level s$seed: ответ не единственный');
        final wrongKind = g.game.clues.where((c) => !clueKindsFor(level).contains(c.kind));
        if (wrongKind.isNotEmpty) bad.add('L$level s$seed: вид не по ступени $wrongKind');
        if (!g.game.clues.every((c) => c.holds(g.order))) bad.add('L$level s$seed: подсказка врёт');
        final twins = g.game.clues.where((c) => c.kind == ClueKind.before &&
            g.game.clues.any((d) => d.kind == ClueKind.next && d.a == c.a && d.b == c.b));
        if (twins.isNotEmpty) bad.add('L$level s$seed: «раньше» повторяет сцепку $twins');
        var q = g.game;
        for (final x in g.order) {
          final legal = q.legal();
          if (legal.length != 1 || legal.single != x) {
            bad.add('L$level s$seed: на шаге ${q.queue.length} законно $legal, ответ $x');
            break;
          }
          q = q.play(x)!;
        }
      }
    }
    expect(bad, isEmpty);
  });

  test('🔴 думать приходится: со второй ступени месту подходит не один зверь', () {
    // Замер задачи e95b7e2f: у движка на всех 1800 задачах каждому месту подходил ровно
    // один зверь — очередь читалась с подсказок. Здесь на первой ступени так и должно быть
    // (учатся читать), а дальше нагрузка растёт со ступенью.
    double meanLoad(int level) {
      var sum = 0;
      for (var seed = 1; seed <= 20; seed += 1) {
        final g = generateQueue(level, Random(seed * 31 + level));
        sum += thinkLoad(g.order, g.game.clues);
      }
      return sum / 20;
    }

    expect(meanLoad(1), 0, reason: 'первая ступень читается с подсказок');
    const levels = [2, 4, 8, 12, 16];
    final loads = [for (final level in levels) meanLoad(level)];
    for (var i = 0; i < loads.length; i += 1) {
      expect(loads[i], greaterThanOrEqualTo(1), reason: 'ступень ${levels[i]}: выводить нечего');
    }
    for (var i = 1; i < loads.length; i += 1) {
      expect(loads[i], greaterThan(loads[i - 1]), reason: 'нагрузка не растёт со ступенью: $loads');
    }
  });

  test('лестница: от трёх зверей до десяти, цель нагрузки растёт без потолка', () {
    expect(queueSizeFor(1), 3);
    expect(queueSizeFor(2), 4);
    expect(queueSizeFor(14), 10);
    expect(queueSizeFor(60), 10, reason: 'больше десяти в ряд на телефоне не встаёт');
    expect(thinkTargetFor(1), 0);
    expect(thinkTargetFor(60), greaterThan(thinkTargetFor(30)));
  });

  test('🔴 карточка правила объявляет вид подсказки на той ступени, где он появляется', () {
    // Таблицу пишет TS (`frontend/src/constants/nativeOnlyGames.ts`), механику — Dart.
    final ranges = (jsonDecode(File('assets/level_rules.json').readAsStringSync())['games']
        as Map<String, dynamic>)['animal_queue'] as List;
    int from(String key) => (ranges.firstWhere((r) => (r as List)[2] == key) as List)[0] as int;
    int firstLevel(ClueKind kind) =>
        List.generate(60, (i) => i + 1).firstWhere((l) => clueKindsFor(l).contains(kind));
    expect(from('glued'), firstLevel(ClueKind.next));
    expect(from('last'), firstLevel(ClueKind.last));
    expect(from('apart'), firstLevel(ClueKind.apart));
  });

  test('🔴 разбор общим решателем каркаса доходит до собранной очереди', () {
    final g = generateQueue(6, Random(7));
    final moves = BoardSolver.solve(const AnimalQueuePuzzle(), g.game);
    expect(moves, g.order, reason: 'решатель обязан найти ровно ответ');
  });

  test('причина шага разбора: дверь, сцепка, «подумай»', () {
    final door = AnimalQueue(['a', 'b', 'c'], const [
      QueueClue(ClueKind.first, 1),
      QueueClue(ClueKind.next, 1, 2),
    ]);
    expect(queueLessonKey(door, 1), 'teachQueueDoor');
    expect(queueLessonKey(door.play(1)!, 2), 'teachQueueGlued');
    expect(queueLessonKey(door.play(1)!.play(2)!, 0), 'teachQueueNext');
    final think = AnimalQueue(['a', 'b', 'c', 'd'], const [
      QueueClue(ClueKind.first, 0),
      QueueClue(ClueKind.last, 3),
      QueueClue(ClueKind.apart, 2, 3),
    ]).play(0)!;
    expect(queueLessonKey(think, 2), 'teachQueueThink');
    for (final k in [queueLessonKey(door, 1), queueLessonKey(think, 2)]) {
      expect(queueLessonKeys, contains(k), reason: 'ключ мимо списка не попадёт в словарь');
    }
  });
}
