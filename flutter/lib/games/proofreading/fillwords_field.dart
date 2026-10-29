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

import '../../shell/tap_latency.dart';
import '../fillwords/core/fillwords.dart';
import 'fillwords_round.dart';

/// Цвета веба: линия пальца — цвет игры (`GRADIENT[0]`), подсказка — бирюза.
const Color fwTraceColor = Color(0xFFA8EDEA);
const Color fwHintColor = Color(0xFF99F6E4);

/// Вид клетки: заливка, цвет буквы (null — цвет темы), жирность.
typedef FwCellLook = ({Color? bg, Color? ink, bool bold});

/// Клетка под пальцем — по ШАГУ сетки (зазор плитки внутри шага).
///
/// 🔴 [inner] — для ведения линии: клетка засчитывается, только когда палец в её середине
/// ([fwInnerShare] стороны), у края — null, линия не меняется. Отчёт игрока e39ce923 (10.10.2026,
/// «не выделяется последнее чтобы финишировать»): на ДИАГОНАЛЬНОМ шаге палец проходит угол и
/// задевает соседнюю клетку того же слова раньше времени — линия сбивается, слово не сдаётся.
/// Замер 29.10 (ru, L1–30, каждое слово последним, палец с дрожью 15 % клетки): без зоны не
/// выделялось 943 из 2685 последних слов (35,1 %), с зоной — 0. Первое касание — без зоны: с
/// какой клетки начать, человек выбирает сам.
int? fwCellAt(Offset o, {required double cell, required int rows, required int cols, bool inner = false}) {
  final col = (o.dx / cell).floor().clamp(0, cols - 1);
  final row = (o.dy / cell).floor().clamp(0, rows - 1);
  if (inner) {
    final cx = (col + 0.5) * cell, cy = (row + 0.5) * cell;
    final half = cell * fwInnerShare / 2;
    if ((o.dx - cx).abs() > half || (o.dy - cy).abs() > half) return null;
  }
  return row * cols + col;
}

/// Доля стороны клетки, в которой засчитывается ведение линии.
const double fwInnerShare = 0.65;

/// Сетка букв ОДНА на филворды и на серию: одно правило клетки под пальцем, один вид плитки.
/// [onTapCell] — блок «Знак» серии: нажатие по клетке, без линии; иначе — ведение линии.
class FwGrid extends StatelessWidget {
  const FwGrid({
    super.key,
    required this.rows,
    required this.cols,
    required this.cell,
    required this.letters,
    required this.look,
    this.keyPrefix = 'fw',
    this.onTouch,
    this.onDrag,
    this.onRelease,
    this.onTapCell,
  });

  final int rows;
  final int cols;
  final double cell;
  final List<String> letters;
  final FwCellLook Function(int index) look;

  /// Префикс ключей: `fw-cell-3`, `ser-cell-3`.
  final String keyPrefix;
  final ValueChanged<int>? onTouch;
  final ValueChanged<int>? onDrag;
  final VoidCallback? onRelease;
  final ValueChanged<int>? onTapCell;

  int _cellAt(Offset o) => fwCellAt(o, cell: cell, rows: rows, cols: cols)!;

  Widget _tile(BuildContext context, int index) {
    final theme = Theme.of(context);
    final l = look(index);
    final tile = SizedBox(
      width: cell,
      height: cell,
      child: Padding(
        padding: const EdgeInsets.all(1),
        child: Container(
          key: Key('$keyPrefix-cell-$index'),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: l.bg ?? theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(width: 0.5, color: theme.dividerColor),
          ),
          child: Text(
            letters[index],
            style: TextStyle(
              fontSize: min(cell * 0.5, 24),
              color: l.ink,
              fontWeight: l.bold ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
    final tap = onTapCell;
    if (tap == null) return tile;
    return TapLatency(
      where: 'Flutter/ProofreadingSeries',
      child: GestureDetector(onTap: () => tap(index), child: tile),
    );
  }

  @override
  Widget build(BuildContext context) {
    final grid = SizedBox(
      width: cell * cols,
      height: cell * rows,
      child: Column(children: [
        for (var r = 0; r < rows; r++) Row(children: [for (var c = 0; c < cols; c++) _tile(context, r * cols + c)]),
      ]),
    );
    if (onTapCell != null) return KeyedSubtree(key: Key('$keyPrefix-grid'), child: grid);
    return Listener(
      key: Key('$keyPrefix-grid'),
      behavior: HitTestBehavior.opaque,
      onPointerDown: (e) => onTouch?.call(_cellAt(e.localPosition)),
      // Ведение линии засчитывает клетку только в её середине — см. [fwCellAt].
      onPointerMove: (e) {
        final c = fwCellAt(e.localPosition, cell: cell, rows: rows, cols: cols, inner: true);
        if (c != null) onDrag?.call(c);
      },
      onPointerUp: (_) => onRelease?.call(),
      onPointerCancel: (_) => onRelease?.call(),
      child: grid,
    );
  }
}

/// Вид клетки филвордов (веб): линия — цвет игры, подсказка — бирюза (только неразобранные),
/// разобранное слово — своим цветом по порядку нахождения.
FwCellLook fwLook(FillwordsSession s, List<int> trace, FillwordsHint? hint, int index) {
  final owner = s.owner[index];
  final traced = trace.contains(index);
  final hinted = hint != null && hint.cells.contains(index) && owner < 0;
  return (
    bg: traced
        ? fwTraceColor
        : hinted
            ? fwHintColor
            : (owner >= 0 ? Color(tintForFoundOrder(s.found.indexOf(owner))) : null),
    ink: traced ? const Color(0xFF333333) : (owner >= 0 ? const Color(fillwordsInk) : null),
    bold: traced || owner >= 0,
  );
}

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
        final theme = Theme.of(context);
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
              FwGrid(
                rows: p.rows,
                cols: p.cols,
                cell: cell,
                letters: p.letters,
                look: (i) => fwLook(s, round.trace, round.hint, i),
                onTouch: onTouch,
                onDrag: onDrag,
                onRelease: onRelease,
              ),
            ],
          ),
        ]);
      }),
    );
  }
}
