import 'dart:math';
import 'board.dart';

import 'package:flutter/material.dart';

import 'model.dart';

/// Поле режима «Все слова»: список целей клетками сверху, колесо букв снизу.
///
/// 🔴 ПУСТЫЕ КЛЕТКИ ПОКАЗЫВАЮТ ДЛИНУ КАЖДОГО СЛОВА, И ЭТО ЧАСТЬ ИГРЫ, А НЕ
/// ОФОРМЛЕНИЕ. По ним человек понимает, сколько букв искать; спрятать их значило
/// бы поменять игру — то же решение, что в веб-версии.
///
/// Высота берётся у каркаса числом (`fieldHeight`), а не от окна: окно не знает
/// про шапку, счётчики, ряд значков и липкий низ.
class AllWordsBoard extends StatelessWidget {
  const AllWordsBoard({
    super.key,
    required this.pack,
    required this.letters,
    required this.picked,
    required this.found,
    required this.fieldHeight,
    required this.onPick,
    this.opened = const {},
    this.bonuses = const [],
    this.wrong = false,
  });

  final WordPack pack;
  final List<String> letters;

  /// Индексы букв колеса, уже набранные в черновик.
  final List<int> picked;

  /// Найденные цели.
  final List<String> found;

  final double fieldHeight;
  final ValueChanged<int> onPick;

  /// Сколько первых букв цели открыто подсказкой.
  final Map<String, int> opened;

  /// Слова вне списка целей, но настоящие — идут отдельной строкой.
  final List<String> bonuses;

  final bool wrong;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    /*
     * 🔴 ВЫСОТА ДЕЛИТСЯ ЦЕЛИКОМ, ВКЛЮЧАЯ ЧЕРНОВИК И ЗАЗОРЫ.
     *
     * Первая редакция делила только «список + колесо» и забыла строку черновика
     * (26) и два зазора (8 + 8) — поле переполнялось на 18 точек, и это поймала
     * проба экрана, а не глаз. Ровно поэтому каркас и отдаёт высоту ЧИСЛОМ:
     * считать надо всё, что рисуешь, а не то, что помнишь.
     */
    const draftH = 26.0;
    const gaps = 16.0;
    final listH = fieldHeight * 0.46;
    final wheelH = fieldHeight - listH - draftH - gaps;

    return LayoutBuilder(builder: (context, c) {
      final side = min(wheelH, c.maxWidth);
      return Column(
        children: [
          SizedBox(
            height: listH,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final w in pack.words) _target(context, w),
                  if (bonuses.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        '+ ${bonuses.join(", ")}',
                        key: const ValueKey('all-words-bonuses'),
                        style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w700),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          // Черновик: что набрано прямо сейчас.
          SizedBox(
            height: draftH,
            child: Text(
              [for (final i in picked) letters[i]].join(),
              key: const ValueKey('all-words-draft'),
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
            child: LetterRing(
              letters: letters,
              picked: picked,
              side: side,
              onPick: onPick,
            ),
          ),
        ],
      );
    });
  }

  /// Одна цель: клетки по числу букв. Найденная показывает слово, открытая
  /// подсказкой — первые буквы, остальные пусты.
  Widget _target(BuildContext context, String word) {
    final scheme = Theme.of(context).colorScheme;
    final done = found.contains(word);
    final open = opened[word] ?? 0;
    final runes = word.runes.map(String.fromCharCode).toList();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        key: ValueKey('target-$word'),
        children: [
          for (var i = 0; i < runes.length; i++)
            Container(
              width: 22,
              height: 24,
              margin: const EdgeInsets.only(right: 3),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: done ? scheme.primaryContainer : Colors.transparent,
                border: Border.all(
                  color: done ? scheme.primary : scheme.outlineVariant,
                ),
                borderRadius: BorderRadius.circular(5),
              ),
              child: Text(
                done || i < open ? runes[i].toUpperCase() : '',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: done ? scheme.onPrimaryContainer : scheme.primary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
