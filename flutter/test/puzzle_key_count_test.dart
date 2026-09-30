import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';

/// РЯД КЛАВИШ ГОЛОВОЛОМКИ — ПО ТЕКУЩЕЙ СТУПЕНИ, У «УГАДАЙ КОД» — ПО ЧИСЛУ ЦВЕТОВ.
///
/// 📍 Два дефекта, найденных 30.09.2026 при переносе лестницы Code Breaker в «Угадай
/// код» (задача f5034811): клавиши считались по ПЕРВОЙ ступени на всех уровнях, а у
/// Guess параметры `c6p4g10Bm` разбирались как «сторона поля» — выходило девять
/// клавиш на шесть цветов. Проба идёт без движка: функция чистая.
void main() {
  PuzzleMode mode(String engine, {List<String> labels = const []}) =>
      PuzzleMode(engineName: engine, titleKey: 'x', steps: const [], digitLabels: labels);

  test('🔴 «Угадай код»: клавиш столько, сколько цветов у ступени', () {
    final g = mode('Guess');
    expect(puzzleKeyCount(g, 'c4p3g8Bm'), 4);
    expect(puzzleKeyCount(g, 'c6p4g10Bm'), 6, reason: 'до починки было 9');
    expect(puzzleKeyCount(g, 'c8p5g12Bm'), 8);
  });

  test('размер поля — у текущей ступени: Keen 6×6 даёт шесть клавиш, Solo 3×3 — девять', () {
    expect(puzzleKeyCount(mode('Keen'), '6dh'), 6);
    expect(puzzleKeyCount(mode('Solo'), '3x3db'), 9);
    expect(puzzleKeyCount(mode('Unequal'), '5de'), 5);
    expect(puzzleKeyCount(mode('Undead', labels: ['G', 'V', 'Z']), '4x4de'), 3);
    expect(puzzleKeyCount(mode('Keen'), 'непонятно'), 9, reason: 'не разобрал — честные девять, без падения');
  });

  test('🔴 лестница «Угадай код» из Code Breaker: пять ступеней, цветов и мест не меньше, чем раньше', () {
    final modes = jsonDecode(File('assets/puzzles/modes.json').readAsStringSync()) as Map<String, dynamic>;
    final steps = [for (final s in (modes['Guess'] as Map<String, dynamic>)['steps'] as List) (s as Map)['params'] as String];
    expect(steps.length, 5);
    int n(String p, String letter) => int.parse(RegExp('$letter(\\d+)').firstMatch(p)!.group(1)!);
    for (var i = 1; i < steps.length; i++) {
      expect(n(steps[i], 'c') >= n(steps[i - 1], 'c') && n(steps[i], 'p') >= n(steps[i - 1], 'p'), isTrue,
          reason: '${steps[i - 1]} → ${steps[i]}: ступень легче предыдущей');
    }
    for (final p in steps) {
      // Пределы движка (`guess.c` validate_params): цветов 2–10, мест не меньше двух.
      expect(n(p, 'c'), inInclusiveRange(2, 10), reason: p);
      expect(n(p, 'p'), greaterThanOrEqualTo(2), reason: p);
    }
  });
}
