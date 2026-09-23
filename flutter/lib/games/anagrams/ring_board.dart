import 'dart:math';

import 'package:flutter/material.dart';

import 'board.dart';
import 'ring.dart';

/// Поле слово-квадрата: рамка 5×5 сверху, банк букв колесом снизу.
///
/// 🔴 УГЛОВЫЕ КЛЕТКИ ОБЩИЕ У ДВУХ СЛОВ, и это правило игры, а не рисунок:
/// поставил букву в одно слово — она встала и во второе. Поэтому клетка знает,
/// каким словам принадлежит, а не какому одному.
class RingBoard extends StatelessWidget {
  const RingBoard({
    super.key,
    required this.ring,
    required this.letters,
    required this.picked,
    required this.solved,
    required this.fieldHeight,
    required this.onPick,
    this.wrong = false,
  });

  final Ring ring;

  /// Банк букв в показанном порядке.
  final List<String> letters;

  /// Индексы букв колеса в черновике.
  final List<int> picked;

  /// Уже отгаданные стороны: 'top' | 'right' | 'bottom' | 'left'.
  final Set<String> solved;

  final double fieldHeight;
  final ValueChanged<int> onPick;
  final bool wrong;

  /// Какая буква стоит в клетке рамки, если её сторона уже отгадана.
  String? _letterAt(int r, int c) {
    final last = ringSide - 1;
    if (r == 0 && solved.contains('top')) return ring.top[c];
    if (c == last && solved.contains('right')) return ring.right[r];
    if (r == last && solved.contains('bottom')) return ring.bottom[c];
    if (c == 0 && solved.contains('left')) return ring.left[r];
    return null;
  }

  /// Клетка принадлежит рамке: внутренность квадрата в игре не участвует.
  bool _onFrame(int r, int c) =>
      r == 0 || c == 0 || r == ringSide - 1 || c == ringSide - 1;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const draftH = 26.0;
    const gaps = 16.0;
    final frameH = fieldHeight * 0.44;
    final wheelH = fieldHeight - frameH - draftH - gaps;

    return LayoutBuilder(builder: (context, c) {
      final cell = min(frameH / ringSide, c.maxWidth / ringSide).clamp(18.0, 52.0).toDouble();
      final side = min(wheelH, c.maxWidth);
      return Column(
        children: [
          SizedBox(
            height: frameH,
            child: Center(
              child: SizedBox(
                width: cell * ringSide,
                height: cell * ringSide,
                child: Column(
                  children: [
                    for (var r = 0; r < ringSide; r++)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (var col = 0; col < ringSide; col++) _cell(context, r, col, cell),
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
              key: const ValueKey('ring-draft'),
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

  Widget _cell(BuildContext context, int r, int c, double size) {
    final scheme = Theme.of(context).colorScheme;
    if (!_onFrame(r, c)) return SizedBox(width: size, height: size);
    final letter = _letterAt(r, c);
    const gap = 1.0;   // размер ВМЕСТЕ с отступом, иначе ряд шире рамки
    return Container(
      key: ValueKey('ring-cell-$r-$c'),
      width: size - gap * 2,
      height: size - gap * 2,
      margin: const EdgeInsets.all(gap),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: letter != null ? scheme.primaryContainer : scheme.surface,
        border: Border.all(color: letter != null ? scheme.primary : scheme.outlineVariant),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        letter?.toUpperCase() ?? '',
        style: TextStyle(
          fontSize: size * 0.5,
          fontWeight: FontWeight.w800,
          color: scheme.onPrimaryContainer,
        ),
      ),
    );
  }
}
