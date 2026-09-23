import 'dart:math';

import 'package:flutter/material.dart';

/// Поле классических анаграмм: набранное слово сверху, колесо букв снизу.
///
/// 🔴 ВСЁ СЧИТАЕТСЯ ОТ ВЫСОТЫ, КОТОРУЮ ДАЛ КАРКАС (`fieldHeight`), а не от окна.
/// Окно не знает про шапку, счётчики, ряд значков и липкий низ — в веб-версии на
/// этом дважды уезжала доска за экран.
class AnagramBoard extends StatelessWidget {
  const AnagramBoard({
    super.key,
    required this.target,
    required this.letters,
    required this.picked,
    required this.fieldHeight,
    required this.onPick,
    this.revealed = 0,
    this.wrong = false,
  });

  /// Загаданное слово — нужно только для числа клеток и подсказанных букв.
  final String target;

  /// Буквы на колесе в порядке показа.
  final List<String> letters;

  /// Что человек уже набрал: индексы букв колеса.
  final List<int> picked;

  final double fieldHeight;

  /// Нажали букву колеса (индекс). Уже взятые не приходят.
  final ValueChanged<int> onPick;

  /// Сколько первых букв открыто подсказкой.
  final int revealed;

  /// Слово сдано и не принято — клетки краснеют.
  final bool wrong;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final runes = target.runes.map(String.fromCharCode).toList();

    // Делёж высоты: клетки ответа сверху, колесо — остальное, но не больше ширины.
    final slotH = min(64.0, fieldHeight * 0.18);
    final wheelH = fieldHeight - slotH - 24;

    return LayoutBuilder(builder: (context, c) {
      final side = min(wheelH, c.maxWidth);
      final r = side / 2 - min(30.0, side / 8);
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            height: slotH,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < runes.length; i++)
                  Container(
                    key: ValueKey('slot-$i'),
                    width: min(44.0, (c.maxWidth - 16) / runes.length - 6),
                    height: slotH * 0.9,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: wrong
                            ? scheme.error
                            : (i < revealed ? scheme.primary : scheme.outlineVariant),
                        width: i < revealed ? 2 : 1.5,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      i < picked.length
                          ? letters[picked[i]]
                          : (i < revealed ? runes[i] : ''),
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: i < picked.length ? scheme.onSurface : scheme.primary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: side,
            height: side,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: side,
                  height: side,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
                  ),
                ),
                for (var i = 0; i < letters.length; i++)
                  _tile(context, i, letters.length, r, side),
              ],
            ),
          ),
        ],
      );
    });
  }

  Widget _tile(BuildContext context, int i, int n, double r, double side) {
    final scheme = Theme.of(context).colorScheme;
    // Первая буква сверху, дальше по часовой — как в веб-версии.
    final a = -pi / 2 + 2 * pi * i / n;
    final d = min(56.0, side / 3.2);
    final used = picked.contains(i);
    return Transform.translate(
      offset: Offset(r * cos(a), r * sin(a)),
      child: Semantics(
        label: letters[i],
        button: true,
        enabled: !used,
        child: SizedBox(
          width: d,
          height: d,
          child: Material(
            key: ValueKey('letter-$i'),
            color: used ? scheme.surfaceContainerHighest : scheme.surface,
            shape: CircleBorder(
              side: BorderSide(color: used ? scheme.outlineVariant : scheme.outline),
            ),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: used ? null : () => onPick(i),
              child: Center(
                child: Text(
                  letters[i],
                  style: TextStyle(
                    fontSize: d * 0.42,
                    fontWeight: FontWeight.w800,
                    color: used ? scheme.outline : scheme.onSurface,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
