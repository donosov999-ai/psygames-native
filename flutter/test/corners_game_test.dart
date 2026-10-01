import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corners/game.dart';
import 'package:psygames_flutter/games/corners/ladder.dart';
import 'package:psygames_flutter/games/corners/lesson.dart';
import 'package:psygames_flutter/games/corners/rules.dart';

/// «УГОЛКИ» — ПРОБЫ КОРПУСА, ПОДХОДА И РАЗБОРА (задача 30b5a5aa).
void main() {
  final corpus = CornersCorpus.parse(
    File('assets/corners/puzzles.json').readAsStringSync(),
  );

  test('корпус: 8 групп, в каждой хватает на колоду', () {
    final groups = {for (final p in corpus.puzzles) p.group};
    expect(groups, {0, 1, 2, 3, 4, 5, 6, 7});
    for (final g in groups) {
      expect(
        corpus.puzzles.where((p) => p.group == g).length,
        greaterThanOrEqualTo(cornersDeck * 2),
        reason: 'группа $g',
      );
    }
  });

  test('🔴 линия каждой задачи законна, длиной в минимум и приводит в цель', () {
    for (final p in corpus.puzzles) {
      var pos = p.startMask;
      expect(p.line.length, p.minimum, reason: 'задача ${p.id}');
      for (final m in p.line) {
        expect(p.board.moves(pos), contains(m), reason: 'задача ${p.id}');
        pos = CornersBoard.apply(pos, m);
      }
      expect(p.board.solved(pos), isTrue, reason: 'задача ${p.id}');
    }
  });

  test('🔴 минимум доказан заново перебором (6×6 с 6 фишками — одна задача)', () {
    var checked = 0;
    for (final p in corpus.puzzles) {
      if (p.group == 7 && checked > 0 && p != corpus.puzzles.firstWhere((x) => x.group == 7)) {
        continue;
      }
      expect(cornersMinMoves(p.board, p.startMask), p.minimum, reason: 'задача ${p.id}');
      checked++;
    }
    expect(checked, greaterThan(130));
  });

  test('лестница: запас над минимумом убывает по третям 2 → 1 → 0', () {
    final p = corpus.puzzles.first;
    expect(cornersLimit(p, 1), p.minimum + 2);
    expect(cornersLimit(p, 2), p.minimum + 1);
    expect(cornersLimit(p, 3), p.minimum);
    expect(cornersStep(24), (group: 7, band: 2));
  });

  CornersRun runOf(CornersPuzzle p, int level, int Function() now) =>
      CornersRun(level: level, deck: [p], now: now);

  test('подход: линия решателя касаниями — решено и чисто', () {
    final p = corpus.puzzles.firstWhere((x) => x.group == 2);
    var t = 0;
    final run = runOf(p, 9, () => t);
    for (final (from, to) in p.line) {
      run.tap(from);
      expect(run.targets, contains(to));
      run.tap(to);
    }
    expect(run.verdict, CornersVerdict2.solved);
    t += 2000;
    run.tick();
    expect(run.finished, isTrue);
    expect(run.result!.clean, 1);
  });

  test('🔴 ходы кончились — «Где ошибка?» называет первый ход, после которого не успеть', () {
    final p = corpus.puzzles.firstWhere((x) => x.group == 2);
    var t = 0;
    // Ровно минимум ходов (треть 3) и первый ход — шаг ВНИЗ по краю, в сторону.
    final run = runOf(p, 9, () => t);
    expect(run.limit, p.minimum);
    final first = p.board.moves(p.startMask).firstWhere((m) {
      final after = CornersBoard.apply(p.startMask, m);
      return CornersSearch(p.board).reachable(after, p.minimum - 1) == CornersVerdict.no;
    });
    run.tap(first.$1);
    run.tap(first.$2);
    expect(run.firstMistake(), 1, reason: 'ошибка — первый же ход');
    // Доиграть до конца лимита любыми ходами.
    while (run.verdict == null) {
      final m = p.board.moves(run.pieces).first;
      run.tap(m.$1);
      run.tap(m.$2);
    }
    expect(run.verdict, CornersVerdict2.outOfMoves);
    expect(run.firstMistake(), 1);
    run.undo();
    expect(run.verdict, isNull, reason: 'отмена возвращает в игру');
  });

  test('подсказка: только с половины времени, ход линии из текущей позиции', () {
    final p = corpus.puzzles.firstWhere((x) => x.group == 1);
    var t = 0;
    final run = runOf(p, 4, () => t);
    expect(run.canHint, isFalse);
    t = cornersSeconds * 500 + 1;
    expect(run.canHint, isTrue);
    run.takeHint();
    final h = run.hint!;
    expect(p.board.moves(run.pieces), contains(h));
    final after = CornersBoard.apply(run.pieces, h);
    expect(CornersSearch(p.board).reachable(after, run.limit - 1), CornersVerdict.yes);
  });

  test('разбор: каждый шаг назван приёмом; простых шагов — меньшинство', () {
    var steps = 0, plain = 0;
    final used = <String>{};
    for (final p in corpus.puzzles) {
      final keys = cornersLineKeys(p);
      steps += keys.length;
      plain += keys.where(cnFallbackKeys.contains).length;
      used.addAll(keys);
    }
    // ignore: avoid_print
    print('шагов $steps, простых $plain (${(100 * plain / steps).toStringAsFixed(1)} %), приёмы $used');
    expect(plain / steps, lessThan(0.5));
    expect(used, containsAll(['teachCnChain', 'teachCnJump', 'teachCnHome']));
  });
}
