import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/draughts_combo/game.dart';
import 'package:psygames_flutter/games/draughts_combo/ladder.dart';
import 'package:psygames_flutter/games/draughts_combo/lesson.dart';
import 'package:psygames_flutter/games/draughts_combo/solver.dart';
import 'package:psygames_flutter/games/draughts_common/rules.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// «ШАШКИ: КОМБИНАЦИИ» БЕЗ ПИКСЕЛЕЙ: корпус, решатель, подход, разбор.
///
/// 🔴 ОРАКУЛ ЗАДАЧИ — ГЕНЕРАТОР, А ОРАКУЛ ПРАВИЛ — pydraughts (`draughts_rules_test`).
/// Здесь: каждая задача корпуса заново проверяется тем же решателем — ключ тот же,
/// единственный, выигрыш тот же, первый ход — жертва.
void main() {
  final corpus = ComboCorpus.parse(
    File('assets/draughts_combo/puzzles.json').readAsStringSync(),
  );

  setUpAll(() async => L.load('ru'));

  test('каждая задача: ключ единственный, жертва, выигрыш как у генератора', () {
    expect(corpus.puzzles.length, greaterThanOrEqualTo(24 * 8));
    final bad = <String>[];
    for (final p in corpus.puzzles) {
      final v = comboAt(p.position, p.whiteMoves);
      if (v == null || v.key.notation != p.key || v.gain != p.gain) {
        bad.add(p.code);
      }
    }
    expect(bad, isEmpty, reason: 'первые: ${bad.take(3)}');
  });

  test('длина минимальна: короче комбинации у задачи нет', () {
    for (final p in corpus.puzzles.where((p) => p.whiteMoves > 1).take(60)) {
      for (var w = 1; w < p.whiteMoves; w++) {
        expect(comboAt(p.position, w), isNull, reason: '${p.code} за $w');
      }
    }
  });

  test('подход: ключевой ход засчитан, ответ чёрных — сам, задача решена', () {
    var clock = 0;
    for (final level in [1, 4, 7, 10, 13, 16, 19, 22, 24]) {
      final deck = comboDeckFor(corpus, level, seed: 3);
      final run = ComboRun(level: level, deck: deck, now: () => clock);
      for (var i = 0; i < deck.length; i++) {
        final p = run.puzzle;
        var guard = 0;
        while (run.verdict == null && guard++ < 40) {
          if (run.waitingReply) {
            clock += ComboRun.replyMs + 10;
            run.tick();
            continue;
          }
          final solver = ComboSolver();
          final left = (p.whiteMoves - run.made - 1).clamp(0, 9);
          final base = comboScore(p.position);
          // За горизонтом (добивание) ход судится по взятиям — как у решателя.
          final tail = run.made >= p.whiteMoves;
          final m = draughtsLegalMoves(run.position).firstWhere((m) {
            final after = draughtsApply(run.position, m);
            final v = tail ? solver.tail(after) : solver.value(after, left);
            return v - base >= p.gain;
          });
          run.tap(m.from);
          run.tap(m.to);
        }
        expect(run.verdict, ComboVerdict2.solved, reason: '${p.code} ступень $level');
        clock += 2000;
        run.tick();
      }
      expect(run.result?.solved, deck.length);
    }
  });

  test('неверный первый ход — «не выигрывает», «Заново» возвращает позицию', () {
    var clock = 0;
    final deck = comboDeckFor(corpus, 1, seed: 3);
    final run = ComboRun(level: 1, deck: deck, now: () => clock);
    final p = run.puzzle;
    final wrong = draughtsLegalMoves(p.position).firstWhere((m) => m.notation != p.key);
    run.tap(wrong.from);
    run.tap(wrong.to);
    expect(run.verdict, ComboVerdict2.wrong);
    run.restart();
    expect(run.verdict, isNull);
    expect(run.position.code, p.code);
    expect(run.retries, 1);
  });

  test('разбор: линия решателя, безымянных шагов ≤ 15 %, каждый приём живой', () {
    var steps = 0, fallback = 0;
    final used = <String, int>{};
    for (final p in corpus.puzzles) {
      final s = comboLessonSteps(p);
      expect(s, isNotEmpty, reason: p.code);
      for (final x in s) {
        used[x.techniqueKey!] = (used[x.techniqueKey!] ?? 0) + 1;
        if (drFallbackKeys.contains(x.techniqueKey)) fallback++;
      }
      steps += s.length - 2; // без вводной и итога
      expect(s.every((x) => !x.text!.contains('{')), isTrue);
    }
    // ignore: avoid_print
    print('шашки: шагов $steps, безымянных $fallback; приёмы $used');
    expect(fallback / steps, lessThanOrEqualTo(0.15));
    for (final k in ['teachDrSacrifice', 'teachDrForced', 'teachDrStrike', 'teachDrCrown']) {
      expect(used[k] ?? 0, greaterThan(0), reason: k);
    }
  });
}
