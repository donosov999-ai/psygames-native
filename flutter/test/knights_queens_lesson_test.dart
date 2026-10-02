import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/knights_queens/ladder.dart';
import 'package:psygames_flutter/games/knights_queens/lesson.dart';
import 'package:psygames_flutter/games/knights_queens/queens.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// РАЗБОР «КОНЯ И ФЕРЗЕЙ»: ШАГ БЕЗ ИМЕНИ ПРИЁМА — ПОКАЗ ОТВЕТА.
///
/// Мерится доля безымянных шагов (`kqFallbackKeys`) по ВСЕМУ корпусу, а не по
/// двум удобным задачам: у пасьянса таких 9 %, порог раздела — 15 %.
void main() {
  final corpus = KqCorpus.parse(
    File('assets/knights_queens/queens.json').readAsStringSync(),
    File('assets/knights_queens/tours.json').readAsStringSync(),
  );

  setUpAll(() async => L.load('ru'));

  test('ферзи: порядок разбора — решение, безымянных шагов ≤ 15 %', () {
    var steps = 0, fallback = 0;
    for (final p in corpus.queens) {
      final (order, keys) = queensExplainedOrder(p.board);
      var b = p.board;
      for (final c in order) {
        b = b.toggle(c);
      }
      expect(b.solved, isTrue, reason: 'разбор доходит до решения: ${p.code}');
      steps += keys.length;
      fallback += keys.where(kqFallbackKeys.contains).length;
    }
    final share = fallback / steps;
    // ignore: avoid_print
    print('ферзи: шагов $steps, безымянных $fallback (${(share * 100).toStringAsFixed(1)} %)');
    expect(share, lessThanOrEqualTo(0.15));
  });

  test('конь: путь разбора — обход, безымянных прыжков ≤ 15 %', () {
    var steps = 0, fallback = 0;
    for (final p in corpus.tours) {
      final (path, keys) = tourExplainedPath(p.board);
      expect(p.board.isTour(path), isTrue, reason: p.code);
      steps += keys.length;
      fallback += keys.where(kqFallbackKeys.contains).length;
    }
    final share = fallback / steps;
    // ignore: avoid_print
    print('конь: прыжков $steps, безымянных $fallback (${(share * 100).toStringAsFixed(1)} %)');
    expect(share, lessThanOrEqualTo(0.15));
  });

  test('каждый приём разбора встречается в корпусе — ни один не мёртвый', () {
    final used = <String, int>{};
    for (final p in corpus.queens) {
      for (final k in queensExplainedOrder(p.board).$2) {
        used[k] = (used[k] ?? 0) + 1;
      }
    }
    for (final p in corpus.tours.take(120)) {
      for (final k in tourExplainedPath(p.board).$2) {
        used[k] = (used[k] ?? 0) + 1;
      }
    }
    // ignore: avoid_print
    print('приёмы: $used');
    for (final k in const [
      'teachKqQOnly',
      'teachKqQOnlySafe',
      'teachKqTOnly',
      'teachKqTForced',
      'teachKqTWarnsdorff',
    ]) {
      expect(used[k] ?? 0, greaterThan(0), reason: k);
    }
  });

  test('«единственное поле» говорится только там, где поле одно', () {
    final b = QueensBoard.parse(4, '................');
    final (order, keys) = queensExplainedOrder(b);
    var placed = <int>[];
    for (var i = 0; i < order.length; i++) {
      if (keys[i] == 'teachKqQOnly') {
        final row = order[i] ~/ 4;
        final free = [
          for (var c = 0; c < 4; c++)
            if (placed.every((q) => !QueensBoard.attacks(q, row * 4 + c, 4))) c,
        ];
        expect(free, hasLength(1));
      }
      placed = [...placed, order[i]];
    }
  });

  test('тексты шагов подставлены: нет «{», у каждого шага есть текст', () {
    for (final mode in KqMode.values) {
      for (var level = 1; level <= kqLevels; level += 7) {
        for (final s in kqLessonForLevel(corpus, mode, level, seed: 3)) {
          expect(s.text, isNotEmpty);
          expect(s.text!.contains('{'), isFalse, reason: s.text);
        }
      }
    }
  });
}
