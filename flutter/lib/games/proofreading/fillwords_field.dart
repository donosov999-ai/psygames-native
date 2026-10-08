/// Поле филвордов в «Корректуре» — перенос разметки веба (`proofreading.tsx`, ветка `fwPlaying`).
///
/// Сетка букв ведётся пальцем; найденное слово остаётся на поле СВОИМ цветом (видно, что уже
/// съедено), подсказка — заливкой всего пути слова, а не рамкой: рамку на светлой клетке не
/// видно. Список слов — колонкой слева от поля, найденные вычёркиваются (по выбору человека).
///
/// ⚠️ КЛЕТКА ПОД ПАЛЬЦЕМ СЧИТАЕТСЯ ПО ШАГУ СЕТКИ, а не по видимой плитке: зазор плитки внутри
/// шага, и деление на видимую ширину копило бы сдвиг на целую клетку к правому краю (веб,
/// `traceCellFromPoint`).
library;

import 'dart:math';

import 'package:flutter/material.dart';

import '../fillwords/core/fillwords.dart';
import 'fillwords_round.dart';

/// Цвета веба: линия пальца — цвет игры (`GRADIENT[0]`), подсказка — бирюза.
const Color fwTraceColor = Color(0xFFA8EDEA);
const Color fwHintColor = Color(0xFF99F6E4);

class FwField extends StatelessWidget {
  const FwField({
    super.key,
    required this.round,
    required this.showWords,
    required this.taskLine,
    required this.height,
    required this.onTouch,
    required this.onDrag,
    required this.onRelease,
  });

  final FwRound round;
  final bool showWords;

  /// «Что делать» — над полем, как у лабораторных модулей.
  final String taskLine;
  final double height;
  final ValueChanged<int> onTouch;
  final ValueChanged<int> onDrag;
  final VoidCallback onRelease;

  @override
  Widget build(BuildContext context) {
    final p = round.puzzle;
    final s = round.session;
    return SizedBox(
      height: height,
      child: LayoutBuilder(builder: (context, box) {
        const taskH = 32.0;
        // Ширина — правилом ядра (`widthForField`), как у веба: список сбоку забирает до 120.
        final listW = showWords ? min(120, (box.maxWidth * 0.3).round()).toDouble() : 0.0;
        final gridW = min(widthForField(box.maxWidth, showWords), box.maxWidth - listW);
        final byWidth = (gridW / p.cols).floorToDouble();
        final byHeight = ((box.maxHeight - taskH - 8) / p.rows).floorToDouble();
        // Пол 22 и потолок 72 — веба (`сеткаКорректуры`).
        final cell = max(22.0, min(min(byWidth, byHeight), 72.0));
        int cellAt(Offset o) {
          final col = (o.dx / cell).floor().clamp(0, p.cols - 1);
          final row = (o.dy / cell).floor().clamp(0, p.rows - 1);
          return row * p.cols + col;
        }

        final theme = Theme.of(context);
        final grid = Listener(
          key: const Key('fw-grid'),
          behavior: HitTestBehavior.opaque,
          onPointerDown: (e) => onTouch(cellAt(e.localPosition)),
          onPointerMove: (e) => onDrag(cellAt(e.localPosition)),
          onPointerUp: (_) => onRelease(),
          onPointerCancel: (_) => onRelease(),
          child: SizedBox(
            width: cell * p.cols,
            height: cell * p.rows,
            child: Column(children: [
              for (var r = 0; r < p.rows; r++)
                Row(children: [
                  for (var c = 0; c < p.cols; c++) _cell(r * p.cols + c, cell, s, theme),
                ]),
            ]),
          ),
        );
        return Column(children: [
          SizedBox(
            height: taskH,
            child: Center(
              child: Text(taskLine,
                  key: const Key('fw-task'),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (showWords)
                SizedBox(
                  width: listW,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var i = 0; i < p.words.length; i++)
                        Text(
                          p.words[i].word,
                          key: Key('fw-word-$i'),
                          style: TextStyle(
                            decoration: s.found.contains(i) ? TextDecoration.lineThrough : TextDecoration.none,
                            color: s.found.contains(i)
                                ? theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.55)
                                : theme.colorScheme.onSurface,
                          ),
                        ),
                    ],
                  ),
                ),
              grid,
            ],
          ),
        ]);
      }),
    );
  }

  Widget _cell(int index, double cell, FillwordsSession s, ThemeData theme) {
    final owner = s.owner[index];
    final traced = round.trace.contains(index);
    // Клетку уже разобранного слова подсвечивать нечем — подсказка про неразобранные.
    final hinted = round.hint != null && round.hint!.cells.contains(index) && owner < 0;
    final Color bg = traced
        ? fwTraceColor
        : hinted
            ? fwHintColor
            : (owner >= 0 ? Color(tintForFoundOrder(s.found.indexOf(owner))) : theme.colorScheme.surface);
    final Color? ink = traced ? const Color(0xFF333333) : (owner >= 0 ? const Color(fillwordsInk) : null);
    return SizedBox(
      width: cell,
      height: cell,
      child: Padding(
        padding: const EdgeInsets.all(1),
        child: Container(
          key: Key('fw-cell-$index'),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(width: 0.5, color: theme.dividerColor),
          ),
          child: Text(
            s.puzzle.letters[index],
            style: TextStyle(
              fontSize: min(cell * 0.5, 24),
              color: ink,
              fontWeight: traced || owner >= 0 ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}
