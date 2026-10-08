import 'package:flutter/material.dart';

import 'marks.dart';

/// КЛАВИШИ СУДОКУ — ОДНИ НА ВСЕ ЭКРАНЫ РАЗДЕЛА: цифры, «Стереть» и палитра цвета.
///
/// 🔴 ПОЧЕМУ ОБЩИЙ ВИДЖЕТ, А НЕ КОПИЯ В КАЖДОМ ЭКРАНЕ. Отзыв Дениса 18.09 (4b95bced):
/// «Почему тут не как в судоку классический интерфейс?» — фрактал жил на своей копии
/// ряда клавиш, и копия отстала: без карандаша, без цвета, без палитры на месте
/// клавиш. Вынос сюда — ровно то, что сделано со слоем пометок (`marks.dart`): вторая
/// копия разъезжается первой.
///
/// Ряды делятся ПОРОВНУ — правка веб-версии 23.09 (отзывы «почему цифры не в два
/// ряда»). Ключи кнопок — `digit1`…`digitN`, `erase`, `swatch0`…`swatch8`: на них
/// стоят пробы всех экранов раздела.
class SudokuKeys extends StatelessWidget {
  const SudokuKeys({
    super.key,
    required this.n,
    required this.onDigit,
    required this.onErase,
    this.paint,
    required this.onPaint,
    this.label,
    this.icon,
    this.zero = false,
  });

  /// Клавиша «0» (клетки Шрёдингера, цифры 0–9): шлёт код 10 — 0 занят под «Стереть».
  final bool zero;

  /// Сколько цифр: 9 у классики и фрактала, 6 у малых досок.
  final int n;
  final void Function(int) onDigit;
  final VoidCallback onErase;

  /// Выбранный цвет: не `null` — вместо клавиш стоит палитра.
  final int? paint;
  final void Function(int) onPaint;

  /// Надпись клавиши цифры `v` — та же, что на доске (буквы Wordoku и т. п.).
  /// `null` — сама цифра. Клавиша, подписанная иначе, чем клетка, — это игра вслепую.
  final String Function(int)? label;

  /// Картинка клавиши цифры `v` (рисованные наборы веба); `null` — надпись.
  final Widget? Function(int)? icon;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        const keyWidth = 48.0, gap = 6.0;
        final keys = n + 1 + (zero ? 1 : 0);                  // цифры, «0» у Шрёдингера и «Стереть»
        final fit = ((c.maxWidth - 8 + gap) / (keyWidth + gap)).floor().clamp(1, keys);
        final rows = (keys / fit).ceil();
        final perRow = (keys / rows).ceil();
        final width = perRow * keyWidth + (perRow - 1) * gap;

        // 🔴 ПАЛИТРА ВСТАЁТ НА МЕСТО КЛАВИАТУРЫ И ТОЙ ЖЕ ВЫСОТЫ — правило веб-версии
        // (`слотКлавиатуры`). Иначе при переключении режима доска прыгает вверх-вниз,
        // и человек теряет клетку, которую только что смотрел.
        final slot = rows * keyWidth + (rows - 1) * gap;
        if (paint != null) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: slot, maxWidth: width),
                child: Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  alignment: WrapAlignment.center,
                  children: [
                    for (var i = 0; i < sudokuColorCount; i++)
                      SizedBox(
                        width: 40,
                        height: 40,
                        child: Material(
                          color: cellColors[i].withValues(alpha: 0.55),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                            side: BorderSide(
                              color: paint == i
                                  ? Theme.of(context).colorScheme.onSurface
                                  : Theme.of(context).colorScheme.outlineVariant,
                              width: paint == i ? 2 : 1,
                            ),
                          ),
                          child: InkWell(
                            key: Key('swatch$i'),
                            onTap: () => onPaint(i),
                            child: paint == i
                                ? Icon(Icons.check,
                                    size: 16, color: Theme.of(context).colorScheme.onSurface)
                                : null,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Center(
            child: SizedBox(
              width: width,
              child: Wrap(
                spacing: gap,
                runSpacing: gap,
                alignment: WrapAlignment.center,
                children: [
                  if (zero)
                    SizedBox(
                      width: keyWidth,
                      height: keyWidth,
                      child: FilledButton(
                        key: const Key('digit0'),
                        onPressed: () => onDigit(10),
                        style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                        child: const Text('0', style: TextStyle(fontSize: 20)),
                      ),
                    ),
                  for (var v = 1; v <= n; v++)
                    SizedBox(
                      width: keyWidth,
                      height: keyWidth,
                      child: FilledButton(
                        key: Key('digit$v'),
                        onPressed: () => onDigit(v),
                        style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                        child: icon?.call(v) ??
                            Text(label?.call(v) ?? '$v', style: const TextStyle(fontSize: 20)),
                      ),
                    ),
                  SizedBox(
                    width: keyWidth,
                    height: keyWidth,
                    child: OutlinedButton(
                      key: const Key('erase'),
                      onPressed: onErase,
                      style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
                      child: const Icon(Icons.backspace_outlined, size: 18),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
