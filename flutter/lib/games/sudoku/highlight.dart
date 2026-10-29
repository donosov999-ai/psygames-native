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

import '../../shell/design_template.dart';
import '../../shell/game_colors.dart';
import 'variant_decor.dart' show cageTint;

/// 🎨 Цвета подсветки — роли общей палитры игр `GameColors` (дизайн «Аврора», 28.10.2026): в Classic они
/// ровно прежние (лаванда шапки `#7F7FD5`, тёмная лаванда выбора `#5B4FD1`, ошибка `#FECACA` / `#EF4444` /
/// `#B91C1C`), в «Авроре» — её роли. Свои литералы игра больше не держит.
///
/// Выбранная клетка — тёмная лаванда, а не светлая: на светлой белая цифра не читалась
/// (отчёт Вали, уровень 30, контраст ~2,9:1; стало ~6:1 при любой теме).
///
/// Имена ниже — Classic-значения ролей для проб, которые сверяют цвет клетки с прежним.
final _classic = GameColors.classicFor(const ColorScheme.light());
Color get sudokuHighlightAccent => _classic.highlight;
Color get sudokuSelectedFill => _classic.selected;
Color get sudokuWrongFill => _classic.wrongFill;
Color get sudokuWrongSelectedFill => _classic.wrong;
Color get sudokuWrongInk => _classic.wrongInk;

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
/// `colors` — роли палитры (`GameColors.of(context)`), `surface` — фон клетки темы, `cageId` — группа-сумма
/// клетки (-1 — нет), `mark` — цвет, которым клетку покрасил игрок (`null` — не красил). Слои — в порядке
/// веба: подсветка, тонировка группы, краска, затем ошибка и выбор поверх всего.
Color sudokuCellBackground(
  SudokuCellLook look, {
  required GameColors colors,
  required Color surface,
  required bool dark,
  int cageId = -1,
  Color? mark,
  bool ring = false,
}) {
  var bg = surface;
  if (look.sameValue || look.sameLine) {
    final t = look.sameValue ? (dark ? 0.30 : 0.16) : (dark ? 0.18 : 0.09);
    bg = Color.lerp(bg, colors.highlight, t)!;
  }
  bg = cageTint(bg, cageId) ?? bg;
  if (mark != null) bg = Color.lerp(bg, mark, dark ? 0.34 : 0.24)!;
  if (look.wrong) return look.selected ? colors.wrong : colors.wrongFill;
  // «Аврора» (лист 11): выбранная клетка — кольцо [sudokuSelectionRing], а не заливка; под ним лёгкий тон выбора.
  if (look.selected) return ring ? Color.lerp(bg, colors.selected, 0.18)! : colors.selected;
  return bg;
}

/// Под «Авророй» выбор клетки — кольцо, как на листе 11; в Classic — заливка, как было.
bool sudokuSelectionRing(BuildContext context) =>
    Theme.of(context).extension<UiTemplateTheme>()?.template == UiTemplate.aurora;

/// Цвет цифры клетки: на выбранной — `onStrong` (белый в Classic), неверная — `wrongInk`, подсказка —
/// `onCell`, своя — `inkPlaced` (в Classic — цвет текста и основной цвет темы, как раньше).
Color sudokuDigitInk(SudokuCellLook look, {required bool given, required GameColors colors, bool ring = false}) {
  if (look.selected) return ring ? colors.selected : colors.onStrong;
  if (look.wrong) return colors.wrongInk;
  return given ? colors.onCell : colors.inkPlaced;
}
