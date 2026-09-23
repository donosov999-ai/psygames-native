/// ПОЛЕ РЕЖИМОВ: «Небоскрёбы» и «Неравенства».
///
/// 🔴 ПОДСКАЗКИ НЕБОСКРЁБОВ — В КЛЕТКАХ ТОГО ЖЕ ШАГА, ЧТО ДОСКА. Это и есть отзыв
/// Дениса f61a4f5c «перенести визуализацию небоскрёбов Тэтхэма в наши небоскрёбы».
/// Замер живого движка Тэтхэма (Towers 5×5, наш мост на dart:ffi): поле 348×348 при
/// доске 5×5 — то есть СЕМЬ клеток по 48 точек, доска плюс кольцо подсказок, и все
/// клетки одного размера; 170 прямоугольников, 60 текстов, ни одной линии.
/// У веб-версии подсказки нарисованы мелкими плашками сбоку (`edgeClue`, ширина
/// `cellSize − 4` при своей высоте) — они читаются как что-то приклеенное к доске, а
/// не как её край. Здесь сетка одна: (n+2)×(n+2), кольцо — подсказки, середина — доска.
///
/// 🔴 ЗНАКИ НЕРАВЕНСТВ РИСУЮТСЯ МЕЖДУ КЛЕТКАМИ, А НЕ В НИХ. Знак принадлежит ПАРЕ
/// соседей: нарисованный внутри клетки, он читался бы как её свойство, и человек искал
/// бы, к какой из двух он относится. Кодировка та же, что в правилах: 1 — левая/верхняя
/// меньше, 2 — больше.
library;

import 'package:flutter/material.dart';

import 'marks.dart';
import 'modes.dart';

/// Доска режима: сетка, подсказки и знаки. Ввод — тычком в клетку доски.
class ModeBoard extends StatelessWidget {
  const ModeBoard({
    super.key,
    required this.board,
    required this.mode,
    required this.grid,
    required this.given,
    required this.marks,
    required this.colors,
    required this.selected,
    required this.height,
    required this.onTap,
  });

  final SideBoard board;
  final SideMode mode;
  final List<List<int>> grid;
  final List<List<bool>> given;

  /// Пометки и раскраска — те же, что у классики: режим это тот же экран.
  final List<List<int>> marks;
  final List<List<int>> colors;
  final ({int r, int c})? selected;
  final double height;
  final void Function(int r, int c) onTap;

  /// Сколько клеток в ряду вместе с кольцом подсказок.
  int get _span => mode == SideMode.towers ? board.n + 2 : board.n;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, c) {
        // Сторона — от МЕНЬШЕГО из высоты каркаса и ширины: та же арифметика, что у
        // главной доски. Кольцо подсказок входит в сторону, а не вылезает за неё.
        final side = ((height < c.maxWidth ? height : c.maxWidth) - 16).clamp(0.0, 640.0);
        final cell = side / _span;
        return Center(
          child: SizedBox(
            width: side,
            height: side,
            child: Stack(
              children: [
                Column(
                  children: [
                    for (var row = 0; row < _span; row++)
                      SizedBox(
                        height: cell,
                        child: Row(
                          children: [
                            for (var col = 0; col < _span; col++)
                              _slot(context, scheme, row, col, cell),
                          ],
                        ),
                      ),
                  ],
                ),
                if (mode == SideMode.unequal) ..._signs(scheme, cell),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Одно место сетки: клетка доски или подсказка кольца.
  Widget _slot(BuildContext context, ColorScheme scheme, int row, int col, double cell) {
    if (mode == SideMode.towers) {
      final inner = row > 0 && row <= board.n && col > 0 && col <= board.n;
      if (!inner) return _clue(scheme, row, col, cell);
      return _cell(scheme, row - 1, col - 1, cell);
    }
    return _cell(scheme, row, col, cell);
  }

  /// Подсказка кольца: сколько зданий видно с этой стороны. Углы пусты.
  Widget _clue(ColorScheme scheme, int row, int col, double cell) {
    final t = board.geometry.towers;
    int? value;
    if (t != null) {
      if (row == 0 && col > 0 && col <= board.n) value = t.top[col - 1];
      if (row == board.n + 1 && col > 0 && col <= board.n) value = t.bottom[col - 1];
      if (col == 0 && row > 0 && row <= board.n) value = t.left[row - 1];
      if (col == board.n + 1 && row > 0 && row <= board.n) value = t.right[row - 1];
    }
    return SizedBox(
      width: cell,
      height: cell,
      child: Center(
        child: Text(
          value == null || value == 0 ? '' : '$value',
          key: Key('clue_${row}_$col'),
          style: TextStyle(
            fontSize: cell * 0.42,
            fontWeight: FontWeight.w700,
            color: scheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }

  Widget _cell(ColorScheme scheme, int r, int c, double cell) {
    final v = grid[r][c];
    final isGiven = given[r][c];
    final isSel = selected != null && selected!.r == r && selected!.c == c;
    final mask = r < marks.length && c < marks[r].length ? marks[r][c] : 0;
    final paint = r < colors.length && c < colors[r].length ? colors[r][c] : noSudokuColor;
    return SizedBox(
      width: cell,
      height: cell,
      child: Material(
        color: isSel
            ? scheme.primaryContainer
            : (paint >= 0 && paint < sudokuColorCount
                ? cellColors[paint].withValues(alpha: 0.35)
                : scheme.surface),
        child: InkWell(
          key: Key('cell_${r}_$c'),
          onTap: () => onTap(r, c),
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                top: _side(scheme, r % board.br == 0),
                left: _side(scheme, c % board.bc == 0),
                bottom: _side(scheme, r == board.n - 1),
                right: _side(scheme, c == board.n - 1),
              ),
            ),
            child: Center(
              child: v == 0 && mask != 0
                  ? PencilMarksLayer(
                      key: Key('marks_${r}_$c'),
                      mask: mask,
                      value: v,
                      cell: cell,
                      color: scheme.onSurfaceVariant,
                    )
                  : Text(
                      v == 0 ? '' : '$v',
                      style: TextStyle(
                        fontSize: cell * 0.5,
                        fontWeight: isGiven ? FontWeight.w800 : FontWeight.w500,
                        color: isGiven ? scheme.onSurface : scheme.primary,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }

  BorderSide _side(ColorScheme scheme, bool thick) => BorderSide(
        color: thick ? scheme.onSurface : scheme.outlineVariant,
        width: thick ? 1.6 : 0.5,
      );

  /// Знаки неравенств — поверх сетки, ровно в стыках клеток.
  List<Widget> _signs(ColorScheme scheme, double cell) {
    final u = board.geometry.unequal;
    if (u == null) return const [];
    final out = <Widget>[];
    final size = cell * 0.44;

    for (var r = 0; r < board.n; r++) {
      for (var c = 0; c < board.n; c++) {
        final h = c < board.n - 1 ? u.h[r][c] : 0;
        if (h != 0) {
          out.add(Positioned(
            left: (c + 1) * cell - size / 2,
            top: r * cell + (cell - size) / 2,
            width: size,
            height: size,
            child: _sign(scheme, h == 1 ? '‹' : '›', size),
          ));
        }
        final v = r < board.n - 1 ? u.v[r][c] : 0;
        if (v != 0) {
          out.add(Positioned(
            left: c * cell + (cell - size) / 2,
            top: (r + 1) * cell - size / 2,
            width: size,
            height: size,
            child: _sign(scheme, v == 1 ? '⌃' : '⌄', size),
          ));
        }
      }
    }
    return out;
  }

  Widget _sign(ColorScheme scheme, String glyph, double size) => DecoratedBox(
        decoration: BoxDecoration(color: scheme.surface, shape: BoxShape.circle),
        child: Center(
          child: Text(
            glyph,
            style: TextStyle(
              fontSize: size * 0.9,
              height: 1,
              fontWeight: FontWeight.w900,
              color: scheme.tertiary,
            ),
          ),
        ),
      );
}
