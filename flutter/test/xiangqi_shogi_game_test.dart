import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/game.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/ladder.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/lesson.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/mate.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/view.dart';

/// «СЯНЦИ И СЁГИ» — ПРОБЫ КОРПУСА, ПОДХОДА И РАЗБОРА (задача c33fb91b).
void main() {
  final corpora = {
    for (final m in XsMode.values)
      m: XsCorpus.parse(
        File('assets/xiangqi_shogi/${m == XsMode.xiangqi ? 'xiangqi' : 'shogi'}.json')
            .readAsStringSync(),
        m,
      ),
  };

  for (final mode in XsMode.values) {
    final corpus = corpora[mode]!;
    final name = mode.name;

    test('$name: 8 групп × 3 трети, в каждой ступени хватает на колоду; ходов 1–3', () {
      for (var g = 0; g < 8; g++) {
        for (var b = 0; b < 3; b++) {
          expect(
            corpus.puzzles.where((p) => p.group == g && p.band == b).length,
            greaterThanOrEqualTo(xsDeck),
            reason: 'группа $g, треть $b',
          );
        }
      }
      expect({for (final p in corpus.puzzles) p.moves}, {1, 2, 3});
    });

    test('🔴 $name: задачи передоказаны — мат ровно за N, ключ единственный', () {
      // Мат в 1–2 — все; мат в 3 — по пять из каждой трети (полный перебор — в генераторе).
      final sample = [
        ...corpus.puzzles.where((p) => p.moves < 3),
        for (var g = 6; g < 8; g++)
          for (var b = 0; b < 3; b++)
            ...corpus.puzzles.where((p) => p.group == g && p.band == b).take(5),
      ];
      for (final p in sample) {
        final s = MateSolver(xsBoard(mode, p.fen));
        expect(s.mateIn(p.moves), MateVerdict.yes, reason: '$name ${p.id}');
        if (p.moves > 1) {
          expect(s.mateIn(p.moves - 1), MateVerdict.no, reason: '$name ${p.id}');
        }
        expect(s.winningMoves(p.moves), [p.key], reason: '$name ${p.id}');
      }
    });

    test('🔴 $name: группы 0–1 учат фигуры — ключ ходит фигурой своего вида', () {
      final kinds = mode == XsMode.xiangqi
          ? [['R', 'N', 'C'], ['P', null, null]]
          : [['G', 'S', 'N'], ['L', 'R', 'B']];
      for (var g = 0; g < 2; g++) {
        for (var b = 0; b < 3; b++) {
          final want = kinds[g][b];
          if (want == null) continue;
          for (final p in corpus.puzzles.where((x) => x.group == g && x.band == b)) {
            final mv = XsMove.parse(mode, p.key);
            final piece = xsViewOfFen(mode, p.fen).cells[mv.from!]!;
            expect(piece.kind, want, reason: '$name ${p.id}');
          }
        }
      }
    });

    XsRun runOf(XsPuzzle p, int Function() now) =>
        XsRun(level: 1, deck: [p], now: now, mode: mode);

    /// Сыграть ход касаниями: фигура или рука, поле, при превращении — выбор.
    void tapMove(XsRun run, String m) {
      final mv = XsMove.parse(mode, m);
      if (mv.drop != null) {
        run.tapHand(mv.drop!);
      } else {
        run.tapCell(mv.from!);
      }
      run.tapCell(mv.to);
      if (run.pendingPromotion != null) run.choosePromotion(mv.promote);
    }

    test('🔴 $name: линия решателя касаниями ставит мат (по 2 задачи с каждой ступени)', () {
      for (var g = 0; g < 8; g++) {
        for (var b = 0; b < 3; b++) {
          for (final p in corpus.puzzles.where((x) => x.group == g && x.band == b).take(2)) {
            var t = 0;
            final run = runOf(p, () => t);
            final line = xsLine(p);
            for (var i = 0; i < line.length; i += 2) {
              tapMove(run, line[i]);
              if (run.verdict == XsVerdict.solved) break;
              expect(run.verdict, isNull, reason: '$name ${p.id}, ход $i: ${line[i]}');
              t += XsRun.replyMs + 10;
              run.tick();
            }
            expect(run.verdict, XsVerdict.solved, reason: '$name ${p.id}');
            t += 2000;
            run.tick();
            expect(run.result!.clean, 1);
          }
        }
      }
    });

    test('🔴 $name: ход мимо ключа — «так не мат» (или отказ «нужен шах» в сёги); «Заново»', () {
      var wrong = 0, refused = 0;
      for (final p in corpus.puzzles.where((x) => x.moves == 1).take(40)) {
        final board = xsBoard(mode, p.fen);
        final other = board.moves().firstWhere((m) => m != p.key, orElse: () => '');
        if (other.isEmpty) continue;
        var t = 0;
        final run = runOf(p, () => t);
        tapMove(run, other);
        if (run.refusal == 'check') {
          refused++;
          expect(run.made, 0);
          continue;
        }
        expect(run.verdict, XsVerdict.wrong, reason: '$name ${p.id}: $other');
        run.restart();
        expect(run.verdict, isNull);
        expect(run.made, 0);
        wrong++;
      }
      expect(wrong + refused, greaterThan(20));
    });

    test('🔴 $name: в задаче на 2–3 хода ход мимо ключа — «так не мат» сразу, а не после', () {
      // Ключ единственный — любой другой первый ход мата за N не вынуждает. Ветка «ходы
      // ещё остались» (мат в 1 её не исполняет: после хода их ноль).
      var checked = 0;
      for (final p in corpus.puzzles.where((x) => x.moves >= 2).take(30)) {
        final board = xsBoard(mode, p.fen);
        final pool = mode == XsMode.shogi ? board.checks() : board.moves();
        final other = pool.firstWhere((m) => m != p.key, orElse: () => '');
        if (other.isEmpty) continue;
        var t = 0;
        final run = runOf(p, () => t);
        tapMove(run, other);
        expect(run.verdict, XsVerdict.wrong, reason: '$name ${p.id}: $other');
        expect(run.waitingReply, isFalse);
        checked++;
      }
      expect(checked, greaterThan(15));
    });

    test('$name: подсказка — с половины времени, ключ задачи', () {
      final p = corpus.puzzles.firstWhere((x) => x.group == 2);
      var t = 0;
      final run = runOf(p, () => t);
      run.takeHint();
      expect(run.hint, isNull);
      t = xsSeconds * 500 + 1;
      run.takeHint();
      final mv = XsMove.parse(mode, p.key);
      expect(run.hint!.to, mv.to);
      expect(run.hint!.from, mv.from);
    });

    test('$name: разбор — каждый шаг назван; запасных — меньшинство; последний — мат', () {
      var steps = 0, plain = 0;
      final used = <String, int>{};
      for (final p in corpus.puzzles.where((x) => x.moves < 3)) {
        final keys = xsLineKeys(p);
        expect(keys.last, 'teachXsMate', reason: '$name ${p.id}');
        steps += keys.length;
        plain += keys.where(xsFallbackKeys.contains).length;
        for (final k in keys) {
          used[k] = (used[k] ?? 0) + 1;
        }
      }
      // ignore: avoid_print
      print('$name: шагов $steps, запасных $plain (${(100 * plain / steps).toStringAsFixed(1)} %), $used');
      expect(plain / steps, lessThan(0.25));
      expect(used.keys.every(xsLessonKeys.contains), isTrue);
    });
  }
}
