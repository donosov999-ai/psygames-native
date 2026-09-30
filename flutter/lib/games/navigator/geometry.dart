/// ГЕОМЕТРИЯ «НАВИГАТОРА» — ПЕРЕНОС `core/geometry.ts` ОДИН В ОДИН.
///
/// ⚠️ ДВЕ ТОНКОСТИ JS ПРОТИВ DART, ОБЕ УЧТЕНЫ.
/// · `%` в JS сохраняет знак делимого (−30 % 360 = −30), в Dart — нет (330). Формула
///   `((v % 360) + 360) % 360` даёт одно и то же в обоих, поэтому оставлена как есть.
/// · `Math.round` в JS уводит ровную половину ВВЕРХ; здесь `jsRound` из общего модуля.
///   На целочисленной сетке пеленг ровно 22,5° недостижим, но расхождение молча сдвинуло бы
///   сектор «домой» — лучше не проверять эту удачу.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart';
import 'types.dart';

GridCell _delta(Cardinal d) => switch (d) {
  Cardinal.north => const GridCell(0, -1),
  Cardinal.east => const GridCell(1, 0),
  Cardinal.south => const GridCell(0, 1),
  Cardinal.west => const GridCell(-1, 0),
};

double normalizeDegrees(double value) => ((value % 360) + 360) % 360;

String cellKey(GridCell cell) => '${cell.x},${cell.y}';

bool isCellInside(GridCell cell, int gridSize) =>
    cell.x >= 0 && cell.y >= 0 && cell.x < gridSize && cell.y < gridSize;

GridCell moveCell(GridCell cell, Cardinal direction) {
  final d = _delta(direction);
  return GridCell(cell.x + d.x, cell.y + d.y);
}

/// Соседи в порядке север, восток, юг, запад — как `CARDINAL_DIRECTIONS` в TS. Порядок
/// значим: от него зависит перемешивание, а значит и вся раздача.
List<GridCell> cardinalNeighbors(GridCell cell, int gridSize) => [
  for (final d in Cardinal.values)
    if (isCellInside(moveCell(cell, d), gridSize)) moveCell(cell, d),
];

Cardinal? directionBetween(GridCell from, GridCell to) {
  final dx = to.x - from.x, dy = to.y - from.y;
  if (dx == 0 && dy == -1) return Cardinal.north;
  if (dx == 1 && dy == 0) return Cardinal.east;
  if (dx == 0 && dy == 1) return Cardinal.south;
  if (dx == -1 && dy == 0) return Cardinal.west;
  return null;
}

Cardinal rotateCardinal(Cardinal direction, int rotation) =>
    Cardinal.values[(direction.index + rotation ~/ 90) % 4];

Cardinal unrotateCardinal(Cardinal direction, int rotation) =>
    rotateCardinal(direction, normalizeDegrees((360 - rotation).toDouble()).toInt());

GridCell rotateCell(GridCell cell, int gridSize, int rotation) => switch (rotation) {
  90 => GridCell(gridSize - 1 - cell.y, cell.x),
  180 => GridCell(gridSize - 1 - cell.x, gridSize - 1 - cell.y),
  270 => GridCell(cell.y, gridSize - 1 - cell.x),
  _ => cell,
};

Turn? turnBetween(Cardinal facing, Cardinal next) {
  final delta = (next.index - facing.index + 4) % 4;
  if (delta == 0) return Turn.straight;
  if (delta == 1) return Turn.right;
  if (delta == 3) return Turn.left;
  return null;
}

Cardinal turnDirection(Cardinal facing, Turn turn) {
  final delta = turn == Turn.left ? 3 : turn == Turn.right ? 1 : 0;
  return Cardinal.values[(facing.index + delta) % 4];
}

double bearingDegrees(GridCell from, GridCell to) =>
    normalizeDegrees(math.atan2((to.x - from.x).toDouble(), -(to.y - from.y).toDouble()) * 180 / math.pi);

double angularDifference(double left, double right) {
  final delta = (normalizeDegrees(left) - normalizeDegrees(right)).abs();
  return math.min(delta, 360 - delta);
}

double homeSectorAngle(HomeSector sector) => sector.index * 45.0;

HomeSector homeSectorForBearing(double bearing) =>
    HomeSector.values[jsRound(normalizeDegrees(bearing) / 45).toInt() % HomeSector.values.length];

HomeSector rotateHomeSector(HomeSector sector, int rotation) =>
    homeSectorForBearing(homeSectorAngle(sector) + rotation);

HomeSector unrotateHomeSector(HomeSector sector, int rotation) =>
    homeSectorForBearing(homeSectorAngle(sector) - rotation);
