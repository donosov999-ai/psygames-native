/// РАСКЛАДКА СОСУДОВ — перенос `колонокДля` и `ширинаПробирки` из живого экрана
/// (`app/games/water-sort.tsx`), формула в формулу.
///
/// 🔴 ПОЧЕМУ ПЕРЕНОС, А НЕ СВОЯ АРИФМЕТИКА. Ровно на этом я потерял заход в тот
/// же день на «Сортировке товаров»: вёрстка «по смыслу» потеряла три починки по
/// отчётам тестировщиц и дала товар 33 px в нише 200 px. Здесь та же цена:
///
/// 📍 ЗАМЕР 11.09.2026 по снимку живой партии (375×812, поле под сосудами 687
/// точек): пять сосудов стояли ОДНИМ рядом, сосуд выходил 62×186 — 27 % высоты,
/// и 463 точки над и под полем оставались чёрными. Три колонки в два ряда на том
/// же экране дают сосуд 109 точек вместо 62: плюс 76 % по стороне и вчетверо по
/// площади. Поэтому колонки перебираются, а не назначаются.
///
/// 📍 И ВТОРОЙ ЗАМЕР, 05.09.2026: на 320 pt семь сосудов по 48 требуют 384 pt при
/// 304 доступных — ряд вылезал за край. Уменьшать сосуд нельзя (48 — норма цели
/// нажатия), значит уменьшается ЧИСЛО КОЛОНОК и добавляется ряд.
library;

import 'dart:math' as math;

/// Пол ширины сосуда: норма цели нажатия. Ниже опускаться нельзя — по
/// обрезанному или крошечному сосуду всё равно не попасть.
const double tubeMinWidth = 48;

/// Потолок на первом кадре, пока высота поля ещё не известна.
const double tubeMaxWidthNoHeight = 72;

/// Абсолютный потолок при известной высоте — страховка от нелепости на широком
/// экране, а не рабочее ограничение: обычно раньше упирается высота поля.
const double tubeMaxWidth = 160;

const double tubeGap = 8;

/// Высота к ширине: пропорция самой картинки стекла.
const double glassRatio = 577 / 192;

/// Доля ширины сосуда, которую занимает гайка в столбце.
const double nutInColumn = 0.90;

/// Сколько сосудов в ряду.
///
/// 🔴 КОЛОНКИ ВЫБИРАЮТСЯ ТАК, ЧТОБЫ СОСУД ВЫШЕЛ КРУПНЕЕ ВСЕГО, а не чтобы их было
/// побольше в ряду: перебираем все варианты и берём тот, где меньшее из двух
/// ограничений (ширина ряда и высота на число рядов) наибольшее.
int columnsFor(int n, double available, [double height = 0]) {
  final fitByMin = math.max(1, ((available + tubeGap) / (tubeMinWidth + tubeGap)).floor());
  if (height <= 0) {
    final wanted = n <= 6 ? n : (n / (n / 7).ceil()).ceil();
    return math.max(1, math.min(wanted, fitByMin));
  }
  final widths = <double>[];
  final orphans = <int>[];
  final upTo = math.min(n, fitByMin);
  for (var c = 1; c <= upTo; c += 1) {
    final rows = (n / c).ceil();
    final byWidth = (available - tubeGap * (c - 1)) / c;
    final byHeight = ((height - tubeGap * (rows + 1)) / rows) / glassRatio;
    widths.add(byWidth < byHeight ? byWidth : byHeight);
    orphans.add((c - (n % c)) % c);
  }
  var best = 0.0;
  for (final w in widths) {
    if (w > best) best = w;
  }
  /*
   * ⚠️ ПРИ ПОЧТИ РАВНОМ РАЗМЕРЕ ПРЕДПОЧИТАЕМ РОВНЫЙ РЯД, А НЕ ЛИШНИЙ ПИКСЕЛЬ.
   * Замер на 375×687 с тремя сосудами: два столбца дают 110 точек, три — 109.
   * Разница в точку, а вид разный: 2+1 кладёт сироту вниз, три — ровным рядом.
   */
  final close = <int>[];
  for (var i = 0; i < widths.length; i += 1) {
    if (widths[i] >= best * 0.97) close.add(i);
  }
  if (close.isEmpty) return 1;
  close.sort((a, b) {
    final byOrphans = orphans[a] - orphans[b];
    if (byOrphans != 0) return byOrphans;
    return widths[b].compareTo(widths[a]);
  });
  return close.first + 1;
}

/// Ширина сосуда под ширину И ВЫСОТУ поля.
double tubeWidth(int n, double available, [double height = 0]) {
  final cols = columnsFor(n, available, height);
  final byWidth = ((available - tubeGap * (cols - 1)) / cols).floorToDouble();
  if (height <= 0) {
    return math.max(tubeMinWidth, math.min(tubeMaxWidthNoHeight, byWidth));
  }
  final rows = (n / cols).ceil();
  final byHeight = (((height - tubeGap * (rows + 1)) / rows) / glassRatio).floorToDouble();
  return math.max(tubeMinWidth, math.min(tubeMaxWidth, math.min(byWidth, byHeight)));
}

/// Высота сосуда: пропорция стекла от ширины.
double tubeHeight(double width) => (width * glassRatio).roundToDouble();
