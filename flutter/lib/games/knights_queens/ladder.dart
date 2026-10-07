/// ЛЕСТНИЦЫ «КОНЯ И ФЕРЗЕЙ»: ДВЕ, ПО ОДНОЙ НА РЕЖИМ.
///
/// Корпус — `assets/knights_queens/{queens,tours}.json` из
/// `tools/knights_queens_corpus.py`. В каждом режиме 24 ступени: 8 групп × треть по
/// мере трудности (лёгкая, средняя, трудная).
///
/// Ферзи: группы — N 4, 5, 6 (с подсветкой битых полей), 6, 7, 8 (без подсветки), 7 и 8
/// с единственным решением. Мера — P, вероятность дойти до конца случайной
/// расстановкой по рядам (точно, перебором).
///
/// Конь: группы — доски 3×4, 4×5, 5×5, 5×6, 6×6, 7×7, 8×8, 8×8 с препятствиями и
/// финишем. Мера — W, доля успехов правила Варнсдорфа со случайным выбором среди
/// равных (300 прогонов). У 3×4 разных задач всего 12 — подход там короче пяти.
///
/// 🔴 ДВЕ ЛЕСТНИЦЫ, А НЕ ОДНА: режимы учат разному (расстановка без боя и маршрут
/// по всем полям), и ступень, заработанная ферзями, не говорит ничего о коне. Так
/// же устроен «Цифровой ряд» — лестница на способ подачи.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

import 'queens.dart';
import 'tour.dart';

const int kqLevels = 24;
const int kqDeck = 5;
const int kqPassClean = 4;
const int kqFailAtMost = 2;

enum KqMode { queens, tour }

/// Ступени ферзей с подсветкой битых полей: группы 0–2 (N 4–6).
bool queensHighlight(int level) => (level.clamp(1, kqLevels) - 1) ~/ 3 < 3;

/// Секунд на задачу. Ферзи — 90 на любой доске; конь — по числу полей: обход
/// 8×8 — это 63 прыжка, и 90 секунд на него были бы гонкой, а не задачей.
int kqSeconds(KqMode mode, {int free = 0}) =>
    mode == KqMode.queens ? 90 : 30 + 2 * free;

class QueensPuzzle {
  const QueensPuzzle({
    required this.id,
    required this.n,
    required this.code,
    required this.randomSuccess,
    required this.solutions,
    required this.group,
    required this.band,
  });
  final int id;
  final int n;
  final String code;
  final double randomSuccess;
  final int solutions;
  final int group;
  final int band;

  QueensBoard get board => QueensBoard.parse(n, code);
}

class TourPuzzle {
  const TourPuzzle({
    required this.id,
    required this.rows,
    required this.cols,
    required this.code,
    required this.warnsdorff,
    required this.reference,
    required this.group,
    required this.band,
  });
  final int id;
  final int rows;
  final int cols;
  final String code;

  /// W — доля успехов правила Варнсдорфа со случайным выбором среди равных.
  final double warnsdorff;

  /// Эталонный обход генератора — для разбора.
  final List<int> reference;
  final int group;
  final int band;

  TourBoard get board => TourBoard.parse(rows, cols, code);
}

class KqCorpus {
  const KqCorpus(this.queens, this.tours);
  final List<QueensPuzzle> queens;
  final List<TourPuzzle> tours;

  static KqCorpus parse(String queensRaw, String toursRaw) {
    final q = (jsonDecode(queensRaw) as Map<String, dynamic>)['puzzles'] as List;
    final t = (jsonDecode(toursRaw) as Map<String, dynamic>)['puzzles'] as List;
    return KqCorpus(
      [
        for (var i = 0; i < q.length; i++)
          QueensPuzzle(
            id: i,
            n: (q[i] as List)[0] as int,
            code: (q[i] as List)[1] as String,
            randomSuccess: ((q[i] as List)[2] as num).toDouble(),
            solutions: (q[i] as List)[3] as int,
            group: (q[i] as List)[4] as int,
            band: (q[i] as List)[5] as int,
          ),
      ],
      [
        for (var i = 0; i < t.length; i++)
          TourPuzzle(
            id: i,
            rows: (t[i] as List)[0] as int,
            cols: (t[i] as List)[1] as int,
            code: (t[i] as List)[2] as String,
            warnsdorff: ((t[i] as List)[3] as num).toDouble(),
            reference: ((t[i] as List)[4] as List).cast<int>(),
            group: (t[i] as List)[5] as int,
            band: (t[i] as List)[6] as int,
          ),
      ],
    );
  }

  /// Байтами, как у «Найди ход»: так проба не зависит от порога `loadString`.
  static Future<KqCorpus> load() async {
    Future<String> read(String path) async {
      final data = await rootBundle.load(path);
      return utf8.decode(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      );
    }

    return parse(
      await read('assets/knights_queens/queens.json'),
      await read('assets/knights_queens/tours.json'),
    );
  }
}

/// Ступень: группа и треть.
({int group, int band}) kqStep(int level) {
  final l = level.clamp(1, kqLevels);
  return (group: (l - 1) ~/ 3, band: (l - 1) % 3);
}

List<QueensPuzzle> queensDeckFor(
  KqCorpus corpus,
  int level, {
  required int seed,
  int count = kqDeck,
}) {
  final s = kqStep(level);
  final fit = corpus.queens
      .where((p) => p.group == s.group && p.band == s.band)
      .toList()
    ..shuffle(Random(seed));
  return fit.take(count).toList();
}

List<TourPuzzle> toursDeckFor(
  KqCorpus corpus,
  int level, {
  required int seed,
  int count = kqDeck,
}) {
  final s = kqStep(level);
  final fit = corpus.tours
      .where((p) => p.group == s.group && p.band == s.band)
      .toList()
    ..shuffle(Random(seed));
  return fit.take(count).toList();
}
