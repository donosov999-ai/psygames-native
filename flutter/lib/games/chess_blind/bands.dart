/// ПОЛОСЫ ЧИСЛА ФИГУР И ЛЕСТНИЦА СЕРИИ.
///
/// У серии уровень — это полоса по числу фигур, общая для трёх блоков; у партии
/// уровень другой (`ladder.dart`). Перенос с живого TS
/// (`src/games/chess-blind/core/positions.ts`) со сверкой по всем ступеням.
library;

/// Сколько фигур в позиции этой ступени.
class PieceBand {
  const PieceBand(this.min, this.max);

  final int min;
  final int max;
}

/// Полосы ровно те, по которым набран корпус: 400 позиций в каждой.
const List<PieceBand> pieceBands = [
  PieceBand(4, 8),
  PieceBand(9, 14),
  PieceBand(15, 20),
  PieceBand(21, 26),
  PieceBand(27, 32),
];

const int chessMinLevel = 1;

int chessMaxLevel() => pieceBands.length;

int clampLevel(num level) {
  final n = level.isFinite ? level.round() : chessMinLevel;
  return n.clamp(chessMinLevel, chessMaxLevel());
}

PieceBand bandForLevel(num level) =>
    pieceBands[clampLevel(level) - chessMinLevel];

const int knightMinMoves = 2;
const int knightMaxMoves = 3;

/// Уровень → длина маршрута коня. Потолок 3 не выдуман: неверный ответ строится
/// расстоянием N + 2, а пар с расстоянием 6 на доске всего четыре.
int knightMovesForLevel(num level) {
  final half = (chessMaxLevel() / 2).ceil();
  return clampLevel(level) <= half ? knightMinMoves : knightMaxMoves;
}
