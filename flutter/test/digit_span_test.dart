import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/digit_span/model.dart';

/// СВЕРКА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS, а не с собственной формулой.
///
/// Правила «Цифрового ряда» живут прямо в экране `app/games/digit-span.tsx`, и
/// перенос легко «проверить» тем же выражением, которое и переносил — такая проба
/// зелёная всегда и не стоит ничего. Поэтому значения ВЫГРУЖЕНЫ прогоном самой
/// TS-функции (`levelParams` на L1…L60 и `expectedDigits` на восьми рядах) и лежат
/// в `test/fixtures/digit-span-reference.json`. Dart обязан совпасть с ними.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/digit-span-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 потолок объёма совпадает с живым кодом', () {
    expect(dsVolumeTop, ref['volumeTop']);
  });

  test('🔴 уровень задаёт то же самое на всех 60 ступенях', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 60);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = LevelParams.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.startLen, e['startLen'], reason: '$at длина ряда');
      expect(p.showMs, e['showMs'], reason: '$at показ');
      expect(p.gapMs, e['gapMs'], reason: '$at пауза');
      expect(p.reverse, e['reverse'], reason: '$at обратный ввод');
      expect(p.holdMs, e['holdMs'], reason: '$at задержка');
      expect(p.surpriseDir, e['surpriseDir'], reason: '$at направление после показа');
    }
  });

  test('🔴 ожидаемый ответ совпадает по всем трём направлениям', () {
    for (final raw in ref['seqs'] as List) {
      final c = raw as Map<String, dynamic>;
      final dir = Direction.values.firstWhere((d) => d.name == c['dir']);
      final got = expectedDigits((c['seq'] as List).cast<int>(), dir);
      expect(got, (c['expected'] as List).cast<int>(),
          reason: 'ряд ${c['seq']} направление ${c['dir']}');
    }
  });

  test('🔴 сложность выше потолка объёма растёт не длиной', () {
    // Ровно та беда, которую раздел чинил 07.09.2026: с L14 длина и скорость
    // упирались, и уровни переставали различаться. Проба держит починку.
    final a = LevelParams.of(dsVolumeTop + 1);
    final b = LevelParams.of(dsVolumeTop + 5);
    expect(a.startLen, b.startLen, reason: 'длина выше потолка не растёт');
    expect(a.showMs, b.showMs, reason: 'показ уже на дне');
    expect(b.holdMs, greaterThan(a.holdMs), reason: 'растёт задержка');
    expect(a.surpriseDir && b.surpriseDir, isTrue, reason: 'направление объявляется после показа');
  });

  group('партия', () {
    test('ряд набран верно — победа; одна цифра не та — нет', () {
      final g = DigitSpanGame(level: 1, direction: Direction.forward, sequence: [1, 2, 5, 5]);
      for (final d in [1, 2, 5, 5]) {
        expect(g.enter(d), isTrue);
      }
      expect(g.isWon, isTrue);
      expect(g.firstWrong, -1);

      final bad = DigitSpanGame(level: 1, direction: Direction.forward, sequence: [1, 2, 5, 5]);
      for (final d in [1, 2, 5, 8]) {
        bad.enter(d);
      }
      expect(bad.isWon, isFalse);
      expect(bad.firstWrong, 3);
    });

    test('🔴 обратный ввод проверяется по обратному ряду, а не по показанному', () {
      final g = DigitSpanGame(level: 11, direction: Direction.backward, sequence: [1, 2, 5, 5, 9]);
      for (final d in [9, 5, 5, 2, 1]) {
        g.enter(d);
      }
      expect(g.isWon, isTrue);
    });

    test('лишние нажатия не набираются — клавиши гаснут', () {
      final g = DigitSpanGame(level: 1, direction: Direction.forward, sequence: [3, 4]);
      expect(g.enter(3), isTrue);
      expect(g.enter(4), isTrue);
      expect(g.enter(5), isFalse, reason: 'ряд уже набран');
      expect(g.entered.length, 2);
    });

    test('неполный ряд не считается победой, даже если начало верное', () {
      final g = DigitSpanGame(level: 1, direction: Direction.forward, sequence: [7, 1, 3]);
      g.enter(7);
      g.enter(1);
      expect(g.isWon, isFalse);
      expect(g.firstWrong, -1, reason: 'ошибок пока нет, просто не дописан');
    });

    test('шаг назад стирает последнюю цифру', () {
      final g = DigitSpanGame(level: 1, direction: Direction.forward, sequence: [7, 1, 3]);
      g.enter(7);
      g.enter(9);
      g.undo();
      g.enter(1);
      expect(g.entered, [7, 1]);
    });

    test('длина показанного ряда берётся у уровня', () {
      for (final l in [1, 3, 6, 9, 20]) {
        final g = DigitSpanGame(level: l, direction: Direction.forward);
        expect(g.sequence.length, LevelParams.of(l).startLen, reason: 'L$l');
        expect(g.sequence.every((d) => d >= 0 && d <= 9), isTrue);
      }
    });
  });
}
