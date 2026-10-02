import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/knights_queens/ladder.dart';
import 'package:psygames_flutter/games/knights_queens/queens.dart';
import 'package:psygames_flutter/games/knights_queens/tour.dart';

/// «КОНЬ И ФЕРЗИ» БЕЗ ПИКСЕЛЕЙ: правила, корпус, лестницы.
///
/// 🔴 ОРАКУЛ — ГЕНЕРАТОР. Корпус записан питоновским `tools/knights_queens_corpus.py`
/// с числом решений и P каждой задачи ферзей и эталонным обходом каждой доски коня.
/// Dart обязан получить ТЕ ЖЕ числа ферзей на всех 480 задачах и признать законным
/// каждый эталонный обход — иначе правила разошлись.
void main() {
  final corpus = KqCorpus.parse(
    File('assets/knights_queens/queens.json').readAsStringSync(),
    File('assets/knights_queens/tours.json').readAsStringSync(),
  );

  group('ферзи', () {
    test('480 задач: решения и P совпали с генератором', () {
      expect(corpus.queens.length, 480);
      var diff = 0;
      for (final p in corpus.queens) {
        final (sols, prob) = queensAnalyse(p.board);
        if (sols != p.solutions || (prob - p.randomSuccess).abs() > 0.000006) {
          diff++;
        }
        expect(p.board.solutions.length, p.solutions,
            reason: 'перечень решений = их число (${p.code})');
      }
      expect(diff, 0, reason: 'задач с другим числом решений или P');
    });

    test('правила: бьёт ряд, столбец, диагональ; дыра и заданный не трогаются', () {
      expect(QueensBoard.attacks(0, 3, 4), isTrue, reason: 'ряд');
      expect(QueensBoard.attacks(1, 13, 4), isTrue, reason: 'столбец');
      expect(QueensBoard.attacks(0, 15, 4), isTrue, reason: 'диагональ');
      expect(QueensBoard.attacks(0, 6, 4), isFalse, reason: 'ход конём — не бой');
      final b = QueensBoard.parse(4, 'Q..#............');
      expect(b.toggle(0).placed, isEmpty, reason: 'заданного не снять');
      expect(b.toggle(3).placed, isEmpty, reason: 'на дыру не поставить');
      expect(b.attacked(5), isTrue, reason: 'заданный бьёт с начала');
    });

    test('решение 4×4 засчитано, конфликт — нет', () {
      var b = QueensBoard.parse(4, '................');
      for (final c in [1, 7, 8, 14]) {
        b = b.toggle(c);
      }
      expect(b.solved, isTrue);
      expect(b.toggle(14).toggle(15).solved, isFalse);
      expect(b.toggle(14).toggle(15).conflicts, contains(15));
    });

    test('«Где ошибка?» — первый ферзь, после которого решений нет', () {
      // У 4×4 решения два: {1,7,8,14} и {2,4,11,13}. Ставим 1 (верно), 4 (верно для
      // второго, но вместе с 1 — ни в одном) — ошибка на втором ферзе.
      var b = QueensBoard.parse(4, '................');
      b = b.toggle(1).toggle(4).toggle(14);
      expect(b.firstMistake(), 4);
      expect(QueensBoard.parse(4, '................').toggle(2).firstMistake(),
          isNull);
    });
  });

  group('конь', () {
    test('каждый эталонный обход корпуса законен', () {
      expect(corpus.tours.length, greaterThan(300));
      var bad = 0;
      for (final p in corpus.tours) {
        if (!p.board.isTour(p.reference)) bad++;
      }
      expect(bad, 0);
    });

    test('перебор находит обход на каждой 10-й доске корпуса', () {
      var miss = 0;
      for (var i = 0; i < corpus.tours.length; i += 10) {
        final p = corpus.tours[i];
        final s = TourSearch(p.board);
        if (s.run([p.board.start]) != TourOutcome.found ||
            !p.board.isTour(s.tour)) {
          miss++;
        }
      }
      expect(miss, 0);
    });

    test('финиш заданный — только последним; препятствие не прыжок', () {
      // 3×4, старт 0, финиш 11: на предпоследнем шаге 11 доступна, раньше — нет.
      final b = TourBoard.parse(3, 4, 'S..........E');
      expect(b.nextMoves([0]), isNot(contains(11)));
      final blocked = TourBoard.parse(3, 4, 'S.....#.....');
      expect(blocked.jumps(0), isNot(contains(6)));
      expect(blocked.free, 11);
    });

    test('«Где ошибка?» находит ход, после которого обход невозможен', () {
      // Ищем по доскам 5×5 и длинам верного начала первый прыжок, после которого
      // обхода нет; «Где ошибка?» обязан назвать именно этот ход.
      TourBoard? b;
      List<int> good = const [];
      int? wrong;
      for (final p in corpus.tours.where((t) => t.rows == 5 && t.cols == 5)) {
        for (var k = 2; k <= 12 && wrong == null; k++) {
          final prefix = p.reference.sublist(0, k);
          for (final y in p.board.nextMoves(prefix)) {
            if (TourSearch(p.board).run([...prefix, y]) ==
                TourOutcome.impossible) {
              (b, good, wrong) = (p.board, prefix, y);
              break;
            }
          }
        }
        if (wrong != null) break;
      }
      expect(wrong, isNotNull, reason: 'на 5×5 тупиковый прыжок найдётся');
      expect(tourFirstMistake(b!, [...good, wrong!]), good.length);
      expect(tourFirstMistake(b, good), isNull);
    });
  });

  group('лестницы', () {
    test('24 ступени у каждого режима, подход собирается', () {
      for (var level = 1; level <= kqLevels; level++) {
        expect(queensDeckFor(corpus, level, seed: level), hasLength(kqDeck));
        expect(toursDeckFor(corpus, level, seed: level), isNotEmpty);
      }
    });

    test('мера трудности падает от трети к трети внутри группы', () {
      for (var g = 0; g < 8; g++) {
        double medQ(int band) {
          final xs = corpus.queens
              .where((p) => p.group == g && p.band == band)
              .map((p) => p.randomSuccess)
              .toList()
            ..sort();
          return xs[xs.length ~/ 2];
        }

        expect(medQ(0) >= medQ(1) && medQ(1) >= medQ(2), isTrue,
            reason: 'ферзи, группа $g');
      }
    });

    test('подсветка битых полей — только на первых девяти ступенях', () {
      expect([for (var l = 1; l <= 24; l++) queensHighlight(l)].where((x) => x).length, 9);
      expect(queensHighlight(9), isTrue);
      expect(queensHighlight(10), isFalse);
    });
  });
}
