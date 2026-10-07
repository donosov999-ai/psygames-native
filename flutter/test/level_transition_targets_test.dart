import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

/// 🔴 ЦЕЛИ СТУПЕНЕЙ-ПЕРЕХОДОВ ЛЕСТНИЦЫ «СУДОКУ» — ОТКРЫВАЮТСЯ И ОТДАЮТ ИТОГ (задача 4e3d3443).
///
/// Список — все адреса `game`/`bossGame` из `ladder-80-204.json` (LEVELS_PLAN v4, раздел
/// sudoku-levels, 02.10.2026). Файл лестницы живёт вне репозитория, поэтому адреса здесь
/// списком: новая игра в лестнице — строка сюда.
///
/// 📍 ЗАЧЕМ. Переход узнаёт итог только от [LevelLadder] (`win`/`fail`) или от
/// `LevelLadder.reportOutcome`. Замер 02.10.2026: «Бездна» не делала ни того ни другого —
/// босс 128 и 176 не узнал бы победы никогда. Экран, который молчит, ступенью быть не может.
const targets = <String, String>{
  '/games/cats': 'cats',
  '/games/puzzles?mode=Towers': 'puzzles',
  '/games/puzzles?mode=Unequal': 'puzzles',
  '/games/puzzles?mode=Keen': 'puzzles',
  '/games/puzzles?mode=Solo': 'puzzles',
  '/games/puzzles?mode=Undead': 'puzzles',
  '/games/puzzles?mode=Singles': 'puzzles',
  '/games/puzzles?mode=Filling': 'puzzles',
  '/games/sudoku-samurai': 'samurai',
  '/games/sudoku-fractal': 'fractal',
  '/games/sudoku-fractal-deep': 'deep',
};

void main() {
  for (final e in targets.entries) {
    test('${e.key} — нативный экран, и он отдаёт итог', () {
      final route = HybridApp.routeOf(e.key);
      expect(route, e.key, reason: 'адрес лестницы не находит экран — ступень сыграется в вебе или не откроется');
      expect(HybridApp.native.containsKey(route), isTrue);

      final src = Directory('lib/games/${e.value}')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .map((f) => f.readAsStringSync())
          .join('\n');
      final viaLadder = RegExp(r'LevelLadder\(').hasMatch(src) && RegExp(r'\.win\(').hasMatch(src);
      final direct = src.contains('LevelLadder.reportOutcome(');
      expect(viaLadder || direct, isTrue,
          reason: 'lib/games/${e.value}: ни лестницы с win, ни reportOutcome — итог ступени не придёт');
    });
  }
}
