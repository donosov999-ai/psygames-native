/// ПОДСВЕТКА КЛЕТОК «СУДОКУ» — перенос `cellBackground` (`frontend/src/services/sudoku-overlay.ts`)
/// и цвета цифры веба (`app/games/sudoku.tsx`, клетка доски).
///
/// 🔴 ПОВОД (задача ecf9dc4f, три отчёта тестировщика 04.10, 2.56.12): «нажимаешь на шестёрку —
/// раньше все шестёрки подсвечивались, куда делось», «ошибка никак не подсвечивается»,
/// «правильный и неправильный ответ одного цвета». Это не поломка, а недоперенос: нативный экран
/// с 23.09 знал только «выбрана / нет», и тестировщики потеряли подсветку при переходе Android-сборки
/// с веба на Flutter.
///
/// Порядок слоёв — как у веба, один раз и здесь: ошибка > выбранная > совпадение / линия > краска
/// > тонировка группы > клетка.
library;

import 'package:flutter/material.dart';

import 'variant_decor.dart' show cageTint;

/// Оттенок подсветки совпадений и линии — лаванда шапки судоку (`HIGHLIGHT_ACCENT`).
const sudokuHighlightAccent = Color(0xFF7F7FD5);

/// Выбранная клетка. Тёмная лаванда, а не светлая: на светлой белая цифра не читалась
/// (отчёт Вали, уровень 30, контраст ~2,9:1; стало ~6:1 при любой теме).
const sudokuSelectedFill = Color(0xFF5B4FD1);

/// Неверная цифра: фон клетки и он же на выбранной клетке; цвет самой цифры.
const sudokuWrongFill = Color(0xFFFECACA);
const sudokuWrongSelectedFill = Color(0xFFEF4444);
const sudokuWrongInk = Color(0xFFB91C1C);

/// Что подсветить в клетке.
typedef SudokuCellLook = ({bool selected, bool sameValue, bool sameLine, bool wrong});

/// Подсветка клетки (`r`, `c`) доски `grid` при выборе `selected` и решении `solution`.
///
/// · совпадение — в клетке та же цифра, что в выбранной (выбранная сама не «совпадение»);
/// · линия — строка или столбец выбранной;
/// · ошибка — цифра стоит и расходится с решением (подсказки задания с решением совпадают всегда).
SudokuCellLook sudokuCellLook(
  List<List<int>> grid,
  List<List<int>>? solution,
  ({int r, int c})? selected,
  int r,
  int c,
) {
  final v = grid[r][c];
  final isSel = selected != null && selected.r == r && selected.c == c;
  final selValue = selected == null ? 0 : grid[selected.r][selected.c];
  return (
    selected: isSel,
    sameValue: !isSel && v != 0 && v == selValue,
    sameLine: !isSel && selected != null && (selected.r == r || selected.c == c),
    wrong: v != 0 && solution != null && solution[r][c] != v,
  );
}

/// Фон клетки — `cellBackground` веба.
///
/// `surface` — фон клетки темы, `cageId` — группа-сумма клетки (-1 — нет), `mark` — цвет, которым
/// клетку покрасил игрок (`null` — не красил). Слои — в порядке веба: подсветка, тонировка группы,
/// краска, затем ошибка и выбор поверх всего.
Color sudokuCellBackground(
  SudokuCellLook look, {
  required Color surface,
  required bool dark,
  int cageId = -1,
  Color? mark,
}) {
  var bg = surface;
  if (look.sameValue || look.sameLine) {
    final t = look.sameValue ? (dark ? 0.30 : 0.16) : (dark ? 0.18 : 0.09);
    bg = Color.lerp(bg, sudokuHighlightAccent, t)!;
  }
  bg = cageTint(bg, cageId) ?? bg;
  if (mark != null) bg = Color.lerp(bg, mark, dark ? 0.34 : 0.24)!;
  if (look.wrong) return look.selected ? sudokuWrongSelectedFill : sudokuWrongFill;
  if (look.selected) return sudokuSelectedFill;
  return bg;
}

/// Цвет цифры клетки: на выбранной — белый, неверная — красная, подсказка — цвет текста темы,
/// своя — основной цвет темы.
Color sudokuDigitInk(SudokuCellLook look, {required bool given, required ColorScheme scheme}) {
  if (look.selected) return Colors.white;
  if (look.wrong) return sudokuWrongInk;
  return given ? scheme.onSurface : scheme.primary;
}
