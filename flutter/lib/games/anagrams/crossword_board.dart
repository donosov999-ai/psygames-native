import 'dart:math';

import 'package:flutter/material.dart';

import 'board.dart';
import 'crossword.dart';

/// Поле кроссворда: сетка сверху, колесо букв снизу.
///
/// 🔴 КЛЕТКА СЕТКИ СЧИТАЕТСЯ ОТ ВЫСОТЫ, КОТОРУЮ ДАЛ КАРКАС, И ОТ ШИРИНЫ — по
/// меньшей из двух. Сетка бывает и 9×5, и 5×9; считать только по ширине значило бы
/// уронить высокую сетку за нижний край, а только по высоте — за боковой.
///
/// ⚠️ Высота делится ЦЕЛИКОМ, включая черновик и зазоры. На «Всех словах» я уже
/// забыл про них и получил переполнение на 18 точек — поймала проба экрана.
class CrosswordBoard extends StatelessWidget {
  const CrosswordBoard({
    super.key,
    required this.crossword,
    required this.letters,
    required this.picked,
    required this.revealed,
    required this.fieldHeight,
    required this.onPick,
    this.wrong = false,
  });

  final Crossword crossword;
  final List<String> letters;

  /// Индексы букв колеса в черновике.
  final List<int> picked;

  /// Клетки, открытые находками и подсказками. Ключ — `r * cols + c`.
  final Set<int> revealed;

  final double fieldHeight;
  final ValueChanged<int> onPick;
  final bool wrong;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const draftH = 26.0;
    const gaps = 16.0;
    final gridH = fieldHeight * 0.44;
    final wheelH = fieldHeight - gridH - draftH - gaps;

    return LayoutBuilder(builder: (context, c) {
      // Клетка — по меньшей стороне: сетка не должна вылезать ни вбок, ни вниз.
      final cell = min(gridH / crossword.rows, c.maxWidth / crossword.cols)
          .clamp(8.0, 34.0)
          .toDouble();
      final side = min(wheelH, c.maxWidth);

      return Column(
        children: [
          SizedBox(
            height: gridH,
            child: Center(
              child: SizedBox(
                width: cell * crossword.cols,
                height: cell * crossword.rows,
                child: Column(
                  children: [
                    for (var r = 0; r < crossword.rows; r++)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (var col = 0; col < crossword.cols; col++)
                            _cell(context, r, col, cell),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: draftH,
            child: Text(
              [for (final i in picked) letters[i]].join(),
              key: const ValueKey('crossword-draft'),
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: 2,
                color: wrong ? scheme.error : scheme.onSurface,
              ),
            ),
          ),
          SizedBox(
            width: side,
            height: side,
            child: LetterRing(letters: letters, picked: picked, side: side, onPick: onPick),
          ),
        ],
      );
    });
  }

  /// Клетка сетки: пустая — фон, занятая — рамка, открытая — буква.
  Widget _cell(BuildContext context, int r, int col, double size) {
    final scheme = Theme.of(context).colorScheme;
    final k = r * crossword.cols + col;
    final letter = crossword.letters[k];
    if (letter == null) return SizedBox(width: size, height: size);
    final open = revealed.contains(k);
    /*
     * ⚠️ РАЗМЕР ВМЕСТЕ С ОТСТУПОМ, А НЕ ПЛЮС ОТСТУП. Первая редакция давала клетке
     * ровно `size` и ещё 0,5 поля с каждой стороны — ряд из `cols` клеток
     * становился на `cols` точек шире сетки и переполнял строку на 1…3 точки.
     * Поймала проба экрана; глазом такое не видно.
     */
    const gap = 0.5;
    return Container(
      key: ValueKey('cell-$k'),
      width: size - gap * 2,
      height: size - gap * 2,
      margin: const EdgeInsets.all(gap),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: open ? scheme.primaryContainer : scheme.surface,
        border: Border.all(color: open ? scheme.primary : scheme.outlineVariant),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Text(
        open ? letter : '',
        style: TextStyle(
          fontSize: size * 0.55,
          fontWeight: FontWeight.w800,
          color: scheme.onPrimaryContainer,
        ),
      ),
    );
  }
}
