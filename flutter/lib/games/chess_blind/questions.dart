/// ВОПРОСЫ ПАРТИИ по позиции ПОСЛЕ всех ходов вслепую.
///
/// Перенос с живого TS (`src/games/chess-blind/core/questions.ts`) со сверкой
/// того, что от случая НЕ зависит: сколько фигур однозначны, сколько вопросов
/// выйдет и с каких клеток «розыск» вообще может спросить. Порядок вопросов
/// случаен по устройству игры — сверять его нечем и незачем.
library;

import 'dart:math';

import 'ladder.dart';
import 'options.dart';

/// Фигура на доске: вид, цвет и клетка.
class PuzzlePiece {
  const PuzzlePiece({
    required this.sq,
    required this.type,
    required this.white,
  });

  /// 0..63.
  final int sq;

  /// K, Q, R, B, N, P.
  final String type;
  final bool white;

  String get comboKey => '$type${white ? 'w' : 'b'}';
}

/// Вопрос: клетка, верный ответ и варианты. У «розыска» вариантов НЕТ вовсе —
/// там отвечают касанием по доске, а не выбором из списка.
class Question {
  const Question({
    required this.sq,
    required this.type,
    required this.white,
    this.options = const [],
  });

  final int sq;
  final String type;
  final bool white;
  final List<String> options;
}

/// Сколько фигур стоят в единственном экземпляре своего вида и цвета.
///
/// Та же величина, которой отбирается позиция (`puzzleMinUnique`): считать её
/// двумя способами значило бы дать им разъехаться.
int uniquePieceCount(List<PuzzlePiece> pieces) {
  final counts = <String, int>{};
  for (final p in pieces) {
    counts[p.comboKey] = (counts[p.comboKey] ?? 0) + 1;
  }
  return counts.values.where((v) => v == 1).length;
}

/// Клетки, с которых «розыск» вообще может спросить: только однозначные фигуры.
///
/// 🔴 ЗДЕСЬ ЖИВЁТ МЕСТО, ГДЕ ОБЕЩАНИЕ ЛЕСТНИЦЫ СТАНОВИТСЯ ФАКТОМ. Замер
/// 07.09.2026 по корпусу 2000 позиций: лестница обещала пять вопросов, а
/// однозначных фигур в позиции хватало не всегда — в 104 случаях из 149 партия
/// молча шла на 3–4 вопроса, счётчик показывал «3/5», и доля верных делилась на
/// пять. Недобор НЕ ПАДАЕТ И НЕ РУГАЕТСЯ, поэтому его и надо мерить.
List<int> locatableSquares(List<PuzzlePiece> pieces) {
  final counts = <String, int>{};
  for (final p in pieces) {
    counts[p.comboKey] = (counts[p.comboKey] ?? 0) + 1;
  }
  final out = [
    for (final p in pieces)
      if (counts[p.comboKey] == 1) p.sq,
  ]..sort();
  return out;
}

/// Вопросы партии. `random` подменяется в пробах: порядок случаен, состав — нет.
List<Question> buildQuestions({
  required List<PuzzlePiece> pieces,
  required PuzzleQuizType quizType,
  required int questions,
  required int level,
  Random? random,
}) {
  final rnd = random ?? Random();
  List<T> shuffled<T>(List<T> source) {
    final copy = [...source];
    for (var i = copy.length - 1; i > 0; i--) {
      final j = rnd.nextInt(i + 1);
      final tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  if (quizType == PuzzleQuizType.pick) {
    final take = questions < pieces.length ? questions : pieces.length;
    return shuffled(pieces)
        .take(take)
        .map(
          (p) => Question(
            sq: p.sq,
            type: p.type,
            white: p.white,
            // Варианты — по лестнице (число и доля одноцветных), верный среди
            // них в случайном месте. Перенос 24.09 держал здесь ОДИН верный
            // вариант, и экран ставил его первой кнопкой.
            options: [
              for (final c in buildOptions(
                pieces,
                (type: p.type, white: p.white),
                level,
                rnd,
              ))
                comboKey(c),
            ],
          ),
        )
        .toList();
  }

  final eligible = locatableSquares(pieces).toSet();
  final uniques = pieces.where((p) => eligible.contains(p.sq)).toList();
  final take = questions < uniques.length ? questions : uniques.length;
  return shuffled(uniques)
      .take(take)
      .map((p) => Question(sq: p.sq, type: p.type, white: p.white))
      .toList();
}
