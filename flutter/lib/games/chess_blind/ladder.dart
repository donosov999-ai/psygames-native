/// ЛЕСТНИЦА «ДОСКИ В УМЕ» — пятнадцать… нет, двадцать пять ступеней, четыре ручки.
///
/// Перенос с живого TS (`src/games/chess-blind/core/puzzle.ts`) СО СВЕРКОЙ:
/// эталон снят прогоном самого TS в `test/fixtures/chess-blind-reference.json`,
/// и проба требует совпадения по всем 25 ступеням. Числа здесь не переписаны на
/// глаз — они обязаны совпасть с тем, что видит человек в веб-версии, иначе
/// прогресс поедет двумя путями.
library;

/// О чём спрашивает квиз: `pick` — что стоит на поле, `locate` — где стоит фигура.
enum PuzzleQuizType { pick, locate }

/// Ручки трудности одной ступени.
class PuzzleLevelParams {
  const PuzzleLevelParams({
    required this.pieces,
    required this.exposeSec,
    required this.moves,
    required this.quizType,
    required this.questions,
    required this.optionCount,
    required this.sameColorShare,
  });

  /// Сколько фигур ПРОСИТ уровень. Фактическое число — в полосе ±1: позиция
  /// берётся из корпуса живых партий, а не собирается под заказ.
  final int pieces;

  /// Сколько секунд позиция видна до маскировки.
  final int exposeSec;

  /// Сколько ходов фишки делают уже замаскированными.
  final int moves;

  final PuzzleQuizType quizType;
  final int questions;

  /// Сколько вариантов ответа. НОЛЬ на «розыске» значит «не применимо»:
  /// там отвечают касанием по доске, а не выбором из списка.
  final int optionCount;

  /// Доля вопросов, где варианты — фигуры ОДНОГО цвета.
  final double sameColorShare;
}

const int puzzleMinLevel = 1;
const int puzzleMaxLevel = 25;

// Столбцы держатся вместе, чтобы ступень читалась строкой, а не пятью прыжками.
const List<int> _pieces = [
  4, 6, 8, 10, 12, 6, 6, 6, 8, 8, 10, 10, 12, 10, 12, //
  12, 14, 14, 16, 16, 18, 18, 20, 20, 22,
];
const List<int> _exposeSec = [
  8, 8, 7, 6, 5, 8, 8, 8, 8, 8, 8, 7, 7, 6, 6, //
  6, 6, 5, 5, 5, 5, 4, 4, 4, 4,
];

/// 🔴 ХОД ВСЛЕПУЮ СТОИТ НА ПЕРВОЙ СТУПЕНИ, А НЕ НА ШЕСТОЙ.
///
/// Замер по базе партий 10.09.2026: дальше 4-го уровня не заходил НИКТО
/// (13 партий, 4 человека), а ходы вслепую начинались с 6-го — то есть механика,
/// ради которой игра названа, не была увидена ни одним игравшим.
const List<int> _blindMoves = [
  1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 8, 8, 10, 12, //
  13, 14, 15, 16, 17, 18, 19, 20, 22, 24,
];
const List<int> _questions = [
  3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, //
  4, 4, 4, 4, 5, 5, 5, 5, 5, 5,
];
const List<int> _options = [
  6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 0, 0, 0, 0, 0, //
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
const List<double> _sameColor = [
  0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, //
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

/// Уровень в допустимых границах: мусор и края — это ближайшая ступень, а не
/// падение.
int clampPuzzleLevel(num level) {
  final n = level.isFinite ? level.round() : puzzleMinLevel;
  return n.clamp(puzzleMinLevel, puzzleMaxLevel);
}

/// Ручки трудности ступени. Единственный источник — таблицы выше.
PuzzleLevelParams puzzleLevelParams(num level) {
  final at = clampPuzzleLevel(level);
  final i = at - puzzleMinLevel;
  return PuzzleLevelParams(
    pieces: _pieces[i],
    exposeSec: _exposeSec[i],
    moves: _blindMoves[i],
    // Розыск включается с одиннадцатой ступени.
    quizType: at >= 11 ? PuzzleQuizType.locate : PuzzleQuizType.pick,
    questions: _questions[i],
    optionCount: _options[i],
    sameColorShare: _sameColor[i],
  );
}

/// Сколько фигур обязаны стоять в единственном экземпляре, чтобы вопросы были
/// однозначны.
int puzzleMinUnique(PuzzleQuizType quizType, [int questions = 3]) =>
    quizType == PuzzleQuizType.locate ? (questions < 2 ? 2 : questions) : 2;
