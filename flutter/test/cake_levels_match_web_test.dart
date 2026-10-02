import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 УРОВНИ «ТОРТОВ» В ПРИЛОЖЕНИИ = УРОВНИ ВЕБА, БАЙТ В БАЙТ.
///
/// 02.10.2026, задача 87ca926a. Расклады и пути «Тортов» и «Пиццы» доказаны решателем веба и
/// лежат в `frontend/src/games/cake-sort/core/`. В Flutter их кладёт побайтной копией
/// `flutter/tools/embed-cake-levels.mjs`. До этого копию делала разовая проба переноса, и
/// пересборка раскладов в вебе молча расходилась бы с тем, чем играет приложение.
///
/// ⚠️ СРАВНЕНИЕ ПОБАЙТНОЕ, А НЕ ПО СМЫСЛУ. Копия обязана быть копией: «тот же JSON другим
/// форматированием» значит, что её правили руками, а руками доказанные расклады не правят.
void main() {
  const pairs = {
    'assets/levels/cake_sort.json': '../frontend/src/games/cake-sort/core/levels.json',
    'assets/levels/cake_solutions.json': '../frontend/src/games/cake-sort/core/solutions.json',
  };

  for (final MapEntry(key: copy, value: source) in pairs.entries) {
    test('$copy — побайтная копия $source', () {
      final web = File(source);
      if (!web.existsSync()) {
        markTestSkipped('нет ../frontend — прогон вне общего дерева');
        return;
      }
      final a = File(copy).readAsBytesSync();
      final b = web.readAsBytesSync();
      var firstDiff = -1;
      for (var i = 0; i < a.length && i < b.length; i++) {
        if (a[i] != b[i]) {
          firstDiff = i;
          break;
        }
      }
      if (firstDiff < 0 && a.length != b.length) firstDiff = a.length < b.length ? a.length : b.length;
      expect(firstDiff, -1,
          reason: 'копия разошлась с вебом с байта $firstDiff (${a.length} против ${b.length} байт) — '
              'запусти из корня дерева: node flutter/tools/embed-cake-levels.mjs');
    });
  }
}
