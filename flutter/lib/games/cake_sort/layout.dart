/// РАСКЛАДКА СТОЛА «ТОРТОВ» — перенос `src/games/cake-sort/core/layout.ts`.
///
/// 🔴 ПОЧЕМУ ПЕРЕНОС, А НЕ СВОЯ АРИФМЕТИКА (третий раз за день, и каждый раз
/// одно и то же): в этих формулах лежат оплаченные правки. Главная —
/// `plateForGrab`: хват тарелки считается ПО КЛЕТКЕ СЕТКИ, а не по кругу, и это
/// подняло охват касания с 61,5 % до 100 % (правка 3c085b4d). Напиши «проверю
/// расстояние до центра» — и треть касаний снова уйдёт в никуда.
library;

import 'dart:math' as math;

import 'model.dart';

/// Зазор между тарелками и поля стола.
const double plateGap = 8;

/// Пол ширины сектора: ниже этого в круг из шести не ткнуть пальцем.
const double sectorMin = 15;

/// Какую долю тарелки занимает сам торт.
const double cakeFill = 0.90;

/// Поля между краем торта и краем тарелки.
const double cakeInset = 3;

class TableLayout {
  const TableLayout({
    required this.cols,
    required this.plate,
    required this.radius,
    required this.sector,
    required this.sectorOuter,
    this.rows = 0,
  });

  final int cols;
  final double plate;
  final double radius;

  /// Ширина сектора по середине — по ней и меряется попадание пальцем.
  final double sector;

  /// Длина дуги сектора по внешнему краю.
  final double sectorOuter;
  final int rows;
}

/// Радиус САМОГО ТОРТА на тарелке такого диаметра.
double cakeRadius(double plate) {
  final r = cakeFill * (plate / 2 - cakeInset);
  return r < 0 ? 0 : r;
}

/// Ширина сектора посередине торта.
double sectorWidth(double plate) {
  final r = cakeRadius(plate);
  return (math.pi * (r / 2)) / (circle / 2);
}

TableLayout tableLayout(double width, int cols) {
  final plate = (width - plateGap * (cols + 1)) / cols;
  return TableLayout(
    cols: cols,
    plate: plate,
    radius: plate / 2,
    sector: sectorWidth(plate),
    sectorOuter: (2 * math.pi * cakeRadius(plate)) / circle,
  );
}

/// Сколько колонок влезает так, чтобы сектор оставался нажимаемым.
int maxCols(double width, [int limit = 8]) {
  var best = 1;
  for (var c = 1; c <= limit; c += 1) {
    if (tableLayout(width, c).sector >= sectorMin) best = c;
  }
  return best;
}

/// Левый край РЯДА: ряд центрируется по числу тарелок В НЁМ — последний бывает
/// неполным, и без этого он прижимался бы влево.
double rowLeft(double boardW, double plate, int inThisRow) {
  final left = (boardW - inThisRow * (plate + plateGap)) / 2;
  return left < 0 ? 0 : left;
}

/// Сколько тарелок стоит в ряду `r`.
int inRow(int r, int cols, int count) {
  final left = count - r * cols;
  final n = left < cols ? left : cols;
  return n < 0 ? 0 : n;
}

/// Тарелка ПОД ТОЧКОЙ: попадание считается по кругу — для того, что рисуется.
int? plateAtPoint(double x, double y, int cols, double plate, int count, [double? boardW]) {
  final step = plate + plateGap;
  final r = ((y - plateGap / 2) / step).floor();
  if (r < 0 || r * cols >= count) return null;
  final row = inRow(r, cols, count);
  final left = boardW == null ? plateGap / 2 : rowLeft(boardW, plate, row) + plateGap / 2;
  final c = ((x - left) / step).floor();
  if (c < 0 || c >= row) return null;
  final i = r * cols + c;
  if (i < 0 || i >= count) return null;
  final cx = left + c * step + plate / 2;
  final cy = plateGap / 2 + r * step + plate / 2;
  final dx = x - cx;
  final dy = y - cy;
  final radius = plate / 2 + plateGap / 2;
  return dx * dx + dy * dy <= radius * radius ? i : null;
}

/// Тарелка ДЛЯ ХВАТА: по КЛЕТКЕ сетки, без проверки круга.
///
/// 📍 Замер правки 3c085b4d: охват касания 61,5 % → 100 %. Тарелка круглая, а
/// палец приходит в угол клетки — и при проверке «внутри ли круга» каждый
/// третий хват пропадал молча, что читается как «не перетаскивается».
int? plateForGrab(double x, double y, int cols, double plate, int count, [double? boardW]) {
  final step = plate + plateGap;
  final r = ((y - plateGap / 2) / step).floor();
  if (r < 0 || r * cols >= count) return null;
  final row = inRow(r, cols, count);
  final left = boardW == null ? plateGap / 2 : rowLeft(boardW, plate, row) + plateGap / 2;
  final c = ((x - left) / step).floor();
  if (c < 0 || c >= row) return null;
  final i = r * cols + c;
  return i >= 0 && i < count ? i : null;
}

/// Стол под ширину И ВЫСОТУ: сперва колонки, при которых и влезает, и сектор
/// остаётся нажимаемым; если таких нет — лишь бы влезало; если и так нет —
/// сколько можно.
TableLayout tableFit(double width, double height, int plates, {int limit = 8, int min = 2}) {
  final fitting = <int>[];
  final onlyFits = <int>[];
  final low = math.max(1, math.min(min, plates));
  final high = math.min(limit, math.max(1, plates));
  for (var c = low; c <= high; c += 1) {
    final l = tableLayout(width, c);
    if (l.plate <= 0) continue;
    final rows = (plates / c).ceil();
    final need = rows * (l.plate + plateGap) + plateGap;
    if (need <= height) onlyFits.add(c);
    if (need <= height && l.sector >= sectorMin) fitting.add(c);
  }
  final c = fitting.isNotEmpty
      ? fitting.first
      : onlyFits.isNotEmpty
          ? onlyFits.first
          : math.min(limit, math.max(low, plates));
  final l = tableLayout(width, c);
  return TableLayout(
    cols: l.cols,
    plate: l.plate,
    radius: l.radius,
    sector: l.sector,
    sectorOuter: l.sectorOuter,
    rows: (plates / c).ceil(),
  );
}
