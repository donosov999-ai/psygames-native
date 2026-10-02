import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/solitaire_chess/game.dart';
import 'package:psygames_flutter/games/solitaire_chess/ladder.dart';
import 'package:psygames_flutter/games/solitaire_chess/puzzle.dart';

/// «ШАХМАТНЫЙ ПАСЬЯНС» БЕЗ ПИКСЕЛЕЙ: правила, корпус, лестница, подход.
///
/// 🔴 ОРАКУЛ — ГЕНЕРАТОР. Корпус записан питоновским `tools/solitaire_chess_corpus.py`
/// вместе с числом решений и вероятностью P каждой доски. Dart обязан получить ТЕ ЖЕ
/// числа на всех 720 досках — иначе правила разошлись (пешка не туда, ферзь не так).
void main() {
  final corpus = SolitaireCorpus.parse(
    File('assets/solitaire_chess/puzzles.json').readAsStringSync(),
  );

  test('720 досок: решения и P совпали с генератором', () {
    expect(corpus.puzzles.length, 720);
    var diff = 0;
    for (final p in corpus.puzzles) {
      final a = SolitaireAnalysis.of(p.board);
      if (a.solutions != p.solutions ||
          (a.randomSuccess - p.randomSuccess).abs() > 0.00006) {
        diff++;
      }
    }
    expect(diff, 0, reason: 'досок с другим числом решений или P');
  });

  test('правила: только взятия, пешка бьёт вверх, короля берут', () {
    // P на c3 (ряд 1): бьёт b4 и d4 (ряд 0), но не вниз.
    final b = SolitaireBoard.parse('.N.R..P.....N...');
    expect(b.capturesFrom(6)..sort(), [
      1,
      3,
    ], reason: 'пешка — вверх по диагонали');
    expect(b.capturesFrom(12), isEmpty, reason: 'конь с a1: b3 и c2 пусты');
    final k = SolitaireBoard.parse('K...Q...........');
    expect(k.capturesFrom(4), [0], reason: 'ферзь берёт короля');
    expect(SolitaireBoard.parse('R..B............').capturesFrom(0), [
      3,
    ], reason: 'ладья бьёт по ряду через пустые клетки');
    expect(SolitaireBoard.parse('RN.B............').capturesFrom(0), [
      1,
    ], reason: 'и только первую фигуру на пути');
    final stuck = SolitaireBoard.parse('N..............N');
    expect(stuck.stuck, isTrue);
    expect(SolitaireBoard.parse('...............Q').solved, isTrue);
  });

  test('лестница: 24 ступени, каждая клетка полна, трети честные', () {
    for (var l = 1; l <= solitaireLevels; l++) {
      final deck = solitaireDeckFor(corpus, l, seed: l);
      final s = solitaireStep(l);
      expect(deck.length, solitaireDeck, reason: 'ступень $l');
      expect(
        deck.every((p) => p.pieces == s.pieces && p.band == s.band),
        isTrue,
      );
      expect(
        deck.map((p) => p.id).toSet().length,
        solitaireDeck,
        reason: 'без повторов',
      );
    }
    expect(solitaireStep(1), (pieces: 3, band: 0));
    expect(solitaireStep(24), (pieces: 10, band: 2));
    // Внутри числа фигур трудная треть заметно труднее лёгкой — по медиане P.
    double median(Iterable<double> xs) {
      final l = xs.toList()..sort();
      return l[l.length ~/ 2];
    }

    for (var k = 4; k <= 10; k++) {
      final easy = median(
        corpus.puzzles
            .where((p) => p.pieces == k && p.band == 0)
            .map((p) => p.randomSuccess),
      );
      final hard = median(
        corpus.puzzles
            .where((p) => p.pieces == k && p.band == 2)
            .map((p) => p.randomSuccess),
      );
      expect(
        hard,
        lessThan(easy * 0.8),
        reason: '$k фигур: лёгкая $easy, трудная $hard',
      );
    }
  });

  group('подход', () {
    var clock = 0;
    SolitaireRun run(int level) {
      clock = 0;
      return SolitaireRun(
        level: level,
        deck: solitaireDeckFor(corpus, level, seed: 3),
        now: () => clock,
      );
    }

    void solve(SolitaireRun r) {
      for (final (f, t) in solitaireSolution(r.board)) {
        r.tap(f);
        expect(r.targets, contains(t));
        r.tap(t);
      }
    }

    void next(SolitaireRun r) {
      clock += 1000;
      r.tick();
    }

    test('пять досок решены касаниями с первой попытки — подъём', () {
      final r = run(13);
      for (var i = 0; i < solitaireDeck; i++) {
        expect(r.board.count, solitaireStep(13).pieces);
        solve(r);
        expect(r.verdict, SolitaireVerdict.solved);
        next(r);
      }
      expect(r.result!.clean, 5);
      expect(r.result!.passed, isTrue);
    });

    test(
      'тупик: «Заново» возвращает доску, решение засчитано, но не чистое',
      () {
        final r = run(16); // 8 фигур, лёгкая треть
        // Идти «не тем» взятием, пока не упрёмся: первое взятие, после которого решения нет.
        while (r.verdict != SolitaireVerdict.stuck) {
          final safe = solitaireSafeCaptures(r.board).toSet();
          final bad = r.board.captures.where((m) => !safe.contains(m)).toList();
          final m = bad.isNotEmpty ? bad.first : r.board.captures.first;
          r.tap(m.$1);
          r.tap(m.$2);
        }
        expect(r.board.count, greaterThan(1));
        r.tap(r.board.cells.keys.first);
        expect(r.selected, isNull, reason: 'в тупике доска не отвечает');
        r.restart();
        expect(r.board.code, r.puzzle.code);
        expect(r.restarts, 1);
        solve(r);
        expect(r.verdict, SolitaireVerdict.solved);
        next(r);
        expect(r.attempts.single.solved, isTrue);
        expect(r.attempts.single.clean, isFalse);
      },
    );

    test('подсказка — только с половины срока, показывает начало решения', () {
      final r = run(10);
      expect(r.canHint, isFalse);
      clock += solitaireSeconds * 1000 ~/ 2 - 1000;
      expect(r.canHint, isFalse);
      clock += 1000;
      expect(r.canHint, isTrue);
      r.takeHint();
      final first = solitaireSolution(r.puzzle.board).first.$1;
      expect(r.hintSquare, first);
      expect(r.canHint, isFalse, reason: 'одна подсказка на доску');
      solve(r);
      next(r);
      expect(
        r.attempts.single.clean,
        isFalse,
        reason: 'с подсказкой — не чистое',
      );
    });

    test('время вышло — доска не решена, следующая', () {
      final r = run(4);
      clock += solitaireSeconds * 1000 + 1;
      r.tick();
      expect(r.verdict, SolitaireVerdict.timeout);
      clock += 2000;
      r.tick();
      expect(r.step, 1);
      expect(r.attempts.single.solved, isFalse);
    });

    test('две решённых из пяти — спуск', () {
      final r = run(7);
      for (var i = 0; i < solitaireDeck; i++) {
        if (i < 2) {
          solve(r);
          next(r);
        } else {
          clock += solitaireSeconds * 1000 + 1;
          r.tick();
          clock += 2000;
          r.tick();
        }
      }
      expect(r.result!.solved, 2);
      expect(r.result!.failed, isTrue);
    });
  });
}
