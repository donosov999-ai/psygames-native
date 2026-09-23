/// КАРАНДАШНЫЕ ПОМЕТКИ И РАСКРАСКА КЛЕТОК — ОБЩИЙ СЛОЙ ВСЕХ СУДОКУ.
///
/// Перенос с живого веб-слоя (`frontend/src/services/pencilMarks.ts` VER 2 и
/// `sudoku-coloring.ts` VER 1) — вместе с причинами, по которым там всё устроено
/// именно так. Нативный экран 23.09 уехал к людям БЕЗ пометок и цвета, и это сразу
/// прочиталось как «интерфейс обеднел»: Денис, кадр 24.09 — «где интерфейс прежний,
/// с которым мы так долго возились».
///
/// ⚠️ ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ ПОЛЯ ЭКРАНА. Пометки нужны ТРЁМ играм раздела:
/// классике, самураю (пять сеток 21×21) и фракталу (десять сеток — там без них
/// вообще никак). Написанные в одном экране, они переписываются потом дважды и
/// расходятся в мелочах. Здесь чистое ядро без виджетов: маска, переключение,
/// геометрия слота. Экран добавляет только вид.
///
/// ⚠️ ЧЕГО ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ — АВТОЗАПОЛНЕНИЯ. «Проставить все возможные цифры»
/// выглядит удобством, но это раздача первой ступени лестницы техник даром: голый
/// одиночка — это ровно «в клетке остался один кандидат». Пометки — бухгалтерия
/// игрока, а не подсказка.
///
/// ФОРМАТ ПОМЕТОК: маска девяти бит на клетку, бит (d−1) поднят = цифра d помечена.
/// Одно число вместо списка — потому что состояние уезжает в незаконченную партию
/// целиком, а десять сеток по 81 клетке списками дали бы километр JSON.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Сколько цифр помещается в маску. Больше девяти биты не держат, и судоку больше не бывает.
const pencilMaxDigit = 9;

/// Пустые пометки сетки N×N.
List<List<int>> emptyPencilMarks(int n) => [for (var r = 0; r < n; r++) List<int>.filled(n, 0)];

/// Помечена ли цифра в клетке.
bool hasPencilMark(List<List<int>> marks, int r, int c, int digit) {
  if (digit < 1 || digit > pencilMaxDigit) return false;
  if (r < 0 || r >= marks.length || c < 0 || c >= marks[r].length) return false;
  return (marks[r][c] & (1 << (digit - 1))) != 0;
}

/// Цифры клетки по возрастанию — для отрисовки.
List<int> pencilDigits(int mask) => [
      for (var d = 1; d <= pencilMaxDigit; d++)
        if (mask & (1 << (d - 1)) != 0) d,
    ];

/// Переключить одну пометку. Повторное нажатие той же цифры снимает её.
int togglePencilMark(int mask, int digit) {
  if (digit < 1 || digit > pencilMaxDigit) return mask;
  return mask ^ (1 << (digit - 1));
}

/// Ввод в карандашный слой одной клетки: 0 (ластик) чистит клетку ЦЕЛИКОМ,
/// цифра — переключается.
///
/// Ластик именно на всю клетку: снимать девять пометок по одной — девять нажатий
/// там, где на бумаге одно движение. Снять одну — повторный тап по той же цифре.
int pencilInput(int mask, int digit) => digit == 0 ? 0 : togglePencilMark(mask, digit);

/// Что реально ВИДНО в клетке: поставленная цифра ГАСИТ пометки, но НЕ СТИРАЕТ их.
///
/// ⚠️ Разница не косметическая, она про отмену. Стирай цифра пометки — откат хода
/// вернул бы клетку, но не вернул бы стёртое, и отмена оказалась бы половинчатой.
/// Здесь же цифру убрали (сами или отменой) — кандидаты снова на месте, ровно те.
List<int> visiblePencilDigits(int mask, int value) => value != 0 ? const [] : pencilDigits(mask);

/// Куда уходит нажатие цифры.
enum PencilRoute { ignore, pencil, digit }

PencilRoute routeDigitPress({
  required bool pencil,
  required bool hasSelection,
  required bool given,
  bool blocked = false,
}) {
  if (blocked || !hasSelection || given) return PencilRoute.ignore;
  return pencil ? PencilRoute.pencil : PencilRoute.digit;
}

/// Самая толстая рамка клетки судоку — граница блока. Считаем по толстой: слот
/// обязан влезать в ЛЮБУЮ клетку, а не в среднюю.
const pencilCellBorder = 2.0;

/// Сторона одного слота пометки.
///
/// 🔴 ЗАЧЕМ ФУНКЦИЯ, А НЕ `cell / 3`. Слой пометок лежит ВНУТРИ рамки, и три слота
/// по `cell / 3` — это ровно `cell`, то есть на 1–2 точки шире, чем есть места:
/// перенос строки роняет третью цифру вниз.
/// 📍 Замер веб-версии 08.09.2026 (клетка 48, слоты по 16): в первом ряду ДВЕ цифры,
/// всего ПЯТЬ рядов, стопка 80 точек в клетке 48 — вылезала на две трети клетки вниз.
/// Снаружи это выглядело как «пометки не работают». Отчёт тестировщиков faecbd12.
double pencilSlotSize(double cell, [double border = pencilCellBorder]) =>
    math.max(1, ((cell - border) / 3).floorToDouble());

/// Кегль цифры в слоте: та же пропорция, что в вебе (0,7 слота), пол — 6 точек.
double pencilFontSize(double slot) => math.max(6, (slot * 0.7).roundToDouble());

// ─────────────────────────────────────────────────────────────────────────────
// РАСКРАСКА КЛЕТОК
// ─────────────────────────────────────────────────────────────────────────────

/// 🔴 ДЕВЯТЬ ЦВЕТОВ, ПО ОДНОМУ НА ЦИФРУ — отчёт «Релакс» 06.09.2026 (app_feedback
/// 83584e50): «хотелось бы девять цветов, чтобы каждая цифра имела свой цвет».
/// Пяти не хватало ровно потому, что цифр девять.
const sudokuColorCount = 9;

/// «Цвета нет».
const noSudokuColor = -1;

/// Обычная палитра — те же девять значений, что в вебе.
const cellColors = <Color>[
  Color(0xFF8B5CF6), Color(0xFF0EA5E9), Color(0xFF22C55E), Color(0xFFF59E0B), Color(0xFFEC4899),
  Color(0xFFEF4444), Color(0xFF14B8A6), Color(0xFF6366F1), Color(0xFF84CC16),
];

/// ⚠️ ПАЛИТРА ДАЛЬТОНИКА — ЭТО НЕ ТЕ ЖЕ ЦВЕТА ПОБЛЕДНЕЕ. Полный набор Okabe–Ito
/// (восемь различимых при всех трёх типах дальтонизма) плюс серый девятым: девяти
/// НЕЗАВИСИМО различимых оттенков не существует, и серый — честный способ добрать
/// девятый, не притворяясь, что он такой же контрастный.
const cellColorsCb = <Color>[
  Color(0xFF0072B2), Color(0xFFE69F00), Color(0xFF009E73), Color(0xFFD55E00), Color(0xFFCC79A7),
  Color(0xFF56B4E9), Color(0xFFF0E442), Color(0xFF000000), Color(0xFF999999),
];

/// Пустая раскраска сетки N×N.
List<List<int>> emptyCellColors(int n) =>
    [for (var r = 0; r < n; r++) List<int>.filled(n, noSudokuColor)];

/// Повтор выбранного цвета снимает метку; другой цвет заменяет её.
int toggleCellColor(int current, int color) {
  if (color < 0 || color >= sudokuColorCount) return noSudokuColor;
  return current == color ? noSudokuColor : color;
}

/// Слой пометок ВНУТРИ клетки: три ряда по три слота.
///
/// Вид один на все судоку раздела — классику, режимы, самурая и фрактал. Вторая
/// копия разъехалась бы первой: в вебе на этом уже спотыкались (VER 2 модуля).
class PencilMarksLayer extends StatelessWidget {
  const PencilMarksLayer({
    super.key,
    required this.mask,
    required this.value,
    required this.cell,
    required this.color,
  });

  final int mask;
  final int value;
  final double cell;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final digits = visiblePencilDigits(mask, value);
    if (digits.isEmpty) return const SizedBox.shrink();
    final slot = pencilSlotSize(cell);
    final font = pencilFontSize(slot);
    return SizedBox(
      width: slot * 3,
      height: slot * 3,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var row = 0; row < 3; row++)
            SizedBox(
              height: slot,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var col = 0; col < 3; col++)
                    SizedBox(
                      width: slot,
                      height: slot,
                      child: Center(
                        child: Text(
                          digits.contains(row * 3 + col + 1) ? '${row * 3 + col + 1}' : '',
                          style: TextStyle(fontSize: font, height: 1, color: color),
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
