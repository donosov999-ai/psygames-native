import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 СТОРОЖ: «ПЕРЕТАЩИ В КОРЗИНУ» ЖИВЁТ В КАРКАСЕ, А НЕ В ИГРЕ (`shell/drop_baskets.dart`, задача 2d300f4e).
///
/// Канон (`APP_CHROME_DESIGN_STANDARD_REF.md`, правило Дениса 11.11.2026): элемент нескольких игр —
/// один компонент каркаса, копия «чуть по-другому» запрещена. Игры из списка ниже обязаны брать
/// `DropBasketsScope` / `DropCard` / `DropBasket` и не заводить свои `Draggable` и `DragTarget`:
/// иначе поведение хвата, подсветки и возврата снова разойдётся (как было до #496 — слова
/// цеплялись с задержкой, а соседняя игра вообще не тянулась).
///
/// Новая игра сортировки по корзинам (следующая — WCST) подключается к общему компоненту и
/// добавляется в этот список.
const sharedDropGames = ['semantic_sort', 'kids_sort'];

void main() {
  final own = RegExp(r'\b(Draggable|LongPressDraggable|DragTarget)\s*<');

  for (final game in sharedDropGames) {
    test('🔴 $game: перетаскивание — только через shell/drop_baskets.dart', () {
      final dir = Directory('lib/games/$game');
      expect(
        dir.existsSync(),
        isTrue,
        reason: 'нет папки $game (запускать из flutter/)',
      );
      final offenders = <String>[];
      var uses = 0;
      for (final f
          in dir
              .listSync(recursive: true)
              .whereType<File>()
              .where((f) => f.path.endsWith('.dart'))) {
        final text = f.readAsStringSync();
        if (own.hasMatch(text)) offenders.add(f.path);
        if (RegExp(r'\bDrop(BasketsScope|Card|Basket)\s*<').hasMatch(text)) {
          uses++;
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'своё перетаскивание вместо общего компонента: $offenders',
      );
      expect(
        uses,
        greaterThan(0),
        reason: '$game обязан подключать компонент каркаса',
      );
    });
  }

  test('сам компонент — единственное место с Draggable и DragTarget для корзин в каркасе', () {
    final text = File('lib/shell/drop_baskets.dart').readAsStringSync();
    expect(
      text,
      contains('Draggable<I>('),
      reason: 'карточка берётся сразу, без LongPress',
    );
    expect(
      text.contains('LongPressDraggable'),
      isFalse,
      reason: 'задержка хвата вернула бы жалобу «плохо цепляются»',
    );
  });
}
