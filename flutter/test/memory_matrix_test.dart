import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/memory_matrix/model.dart';

/// СВЕРКА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// Значения выгружены прогоном самих функций `levelParams` (L1…L40) и
/// `cellsNeeded` (7 уровней × 3 круга × 2 режима) в
/// `test/fixtures/mm-reference.json`. Проверять перенос той же формулой,
/// которой переносил, смысла нет — такая проба зелёная всегда.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/mm-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 пороги совпадают с живым кодом', () {
    expect(mmVolumeTop, ref['volumeTop']);
    expect(decoyRoom, ref['decoyRoom']);
  });

  test('🔴 уровень задаёт то же самое на всех 40 ступенях', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 40);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = LevelParams.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.gridSize, e['gridSize'], reason: '$at сторона поля');
      expect(p.baseFlashes, e['baseFlashes'], reason: '$at клеток запомнить');
      expect(p.flashMs, e['flashMs'], reason: '$at показ');
      expect(p.seriesCount, e['seriesCount'], reason: '$at серий');
      expect(p.holdMs, e['holdMs'], reason: '$at задержка');
      expect(p.decoys, e['decoys'], reason: '$at ложных вспышек');
    }
  });

  test('🔴 сколько клеток показать — совпадает по кругам и режимам', () {
    for (final raw in ref['cells'] as List) {
      final e = raw as Map<String, dynamic>;
      final got = cellsNeeded(e['level'] as int, e['round'] as int, e['mode'] as String);
      final at = 'L${e['level']} круг ${e['round']} ${e['mode']}';
      expect(got.need, e['need'], reason: '$at нужных');
      expect(got.decoys, e['decoys'], reason: '$at ложных');
      expect(got.free, e['free'], reason: '$at свободных');
    }
  });

  test('🔴 выше потолка объёма растут помехи, а не поле', () {
    final a = LevelParams.of(mmVolumeTop);
    final b = LevelParams.of(mmVolumeTop + 5);
    expect(a.gridSize, b.gridSize, reason: 'поле уже максимальное');
    expect(a.flashMs, b.flashMs, reason: 'показ уже на дне');
    expect(b.decoys, greaterThan(a.decoys), reason: 'растут ложные вспышки');
    expect(b.holdMs, greaterThan(a.holdMs), reason: 'растёт задержка');
  });

  group('партия', () {
    test('отмечены ровно нужные клетки — победа', () {
      final g = MemoryMatrixGame(level: 1, target: {0, 4, 8});
      for (final c in [0, 4, 8]) {
        g.tap(c);
      }
      expect(g.isWon, isTrue);
    });

    test('🔴 лишняя отметка губительна так же, как пропуск', () {
      final g = MemoryMatrixGame(level: 1, target: {0, 4, 8});
      for (final c in [0, 4, 8, 1]) {
        g.tap(c);
      }
      expect(g.isWon, isFalse, reason: 'иначе выигрывала бы стратегия «отметить всё поле»');

      final mass = MemoryMatrixGame(level: 1, target: {0, 4, 8});
      for (var c = 0; c < mass.total; c++) {
        mass.tap(c);
      }
      expect(mass.isWon, isFalse);
    });

    test('повторное нажатие снимает отметку — промах исправляется на месте', () {
      final g = MemoryMatrixGame(level: 1, target: {0, 4, 8});
      g.tap(1);
      expect(g.picked.contains(1), isTrue);
      g.tap(1);
      expect(g.picked.contains(1), isFalse);
    });

    test('🔴 ложные вспышки не пересекаются с нужными', () {
      final rnd = Random(7);
      for (final level in [16, 18, 21, 30]) {
        final g = MemoryMatrixGame(level: level, rnd: rnd);
        expect(g.target.intersection(g.decoys), isEmpty, reason: 'L$level');
        expect(g.decoys.length, LevelParams.of(level).decoys, reason: 'L$level число помех');
        expect(g.target.length, cellsNeeded(level, 1, 'static').need, reason: 'L$level число нужных');
      }
    });

    test('клетки партии лежат внутри поля', () {
      final g = MemoryMatrixGame(level: 20, rnd: Random(3));
      for (final c in {...g.target, ...g.decoys}) {
        expect(c, inInclusiveRange(0, g.total - 1));
      }
    });
  });
}
