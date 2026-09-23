import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/model.dart';

/// СВЕРКА ПРАВИЛ ШУЛЬТЕ С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/schulte-reference.json` выгружен прогоном самого веб-кода
/// (`levelParams`, `maxGridFor`, `centerOutOrder`, `schulteTable`): 22 ступени,
/// 18 потолков письменностей, 4 порядка «от центра» и 9 раскладок. Проверять
/// перенос той же формулой, которой переносил, нельзя — такая проба зелёная всегда.
///
/// ⚠️ Броски случайности сверяются не общим генератором, а СПИСКОМ чисел: в
/// эталоне лежат те самые доли, которые тянул веб, и рядом — что из них вышло.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/schulte-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  ContentMode modeOf(String s) => switch (s) {
        'numbers' => ContentMode.numbers,
        'letters' => ContentMode.letters,
        _ => ContentMode.mixed,
      };
  Direction dirOf(String s) => switch (s) {
        'forward' => Direction.forward,
        'backward' => Direction.backward,
        _ => Direction.centerOut,
      };

  test('🔴 лестница кончается там же, где в вебе', () {
    expect(schulteLevelsTop, ref['levelsTop']);
  });

  test('🔴 ступень задаёт то же самое на всех 22 уровнях', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 22);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = LevelParams.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.gridSize, e['gridSize'], reason: '$at сторона поля');
      expect(p.contentMode, modeOf(e['contentMode'] as String), reason: '$at содержимое');
      expect(p.direction, dirOf(e['direction'] as String), reason: '$at направление');
      expect(p.colorMode, e['colorMode'], reason: '$at цвет');
      expect(p.surpriseStart, e['surpriseStart'], reason: '$at позднее правило');
      expect(p.moving, e['moving'], reason: '$at подвижные клетки');
    }
  });

  test('🔴 потолок стороны под письменность совпадает (греческий держит 6×6)', () {
    for (final raw in ref['maxGrid'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(
        maxGridFor(modeOf(e['mode'] as String), e['alphabet'] as int),
        e['max'],
        reason: '${e['mode']} при алфавите ${e['alphabet']}',
      );
    }
  });

  test('🔴 порядок «от центра наружу» совпадает поэлементно', () {
    for (final raw in ref['centerOut'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(centerOutOrder(e['n'] as int), e['order'], reason: 'n=${e['n']}');
    }
  });

  test('🔴 раскладка и цели совпадают на тех же бросках — все девять случаев', () {
    final tables = ref['tables'] as List;
    expect(tables.length, 9);
    for (final raw in tables) {
      final e = raw as Map<String, dynamic>;
      final draws = (e['draws'] as List).cast<num>().map((n) => n.toDouble()).toList();
      var i = 0;
      final got = schulteTable(
        size: e['size'] as int,
        contentMode: modeOf(e['contentMode'] as String),
        direction: dirOf(e['direction'] as String),
        alphabet: e['alphabet'] as String,
        lettersFirst: e['lettersFirst'] as bool,
        random: () => draws[i++ % draws.length],
      );
      final at = '${e['size']}×${e['size']} ${e['contentMode']} ${e['direction']}'
          '${e['lettersFirst'] == true ? ' с буквы' : ''}';
      expect(got.sequence, e['sequence'], reason: '$at — порядок целей');
      expect(got.items, e['items'], reason: '$at — раскладка');
    }
  });

  group('партия уровня', () {
    SchulteGame game(int level, {int seed = 5}) =>
        SchulteGame(level: level, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', rnd: Random(seed));

    test('верные нажатия по порядку доводят до конца', () {
      final g = game(1);
      expect(g.total, 25);
      PressResult? last;
      for (var step = 0; step < 25; step += 1) {
        last = g.press(g.items.indexOf(g.target));
      }
      expect(last, PressResult.finished);
      expect(g.done, isTrue);
      expect(g.errors, 0);
    });

    test('🔴 чужая клетка — ошибка, и цель не двигается', () {
      final g = game(1);
      final wrong = g.items.indexOf(g.sequence[3]);
      expect(g.press(wrong), PressResult.miss);
      expect(g.errors, 1);
      expect(g.index, 0, reason: 'иначе выигрывала бы стратегия «жать подряд»');
    });

    test('🔴 до объявления правила нажатие не считается ни верным, ни ошибочным', () {
      final g = game(16);
      final res = g.press(g.items.indexOf(g.target), ruleRevealed: false);
      expect(res, PressResult.ignored);
      expect(g.errors, 0);
      expect(g.index, 0);
    });

    test('🔴 на убегающей цели клетки после верного нажатия меняются местами', () {
      final g = game(18);
      expect(g.params.moving, isTrue);
      final before = List<Object>.from(g.items);
      g.press(g.items.indexOf(g.target));
      expect(g.items, isNot(equals(before)), reason: 'L18 — ось «подвижные клетки»');
      expect(g.items.toSet(), before.toSet(), reason: 'меняются местами, а не подменяются');
    });

    test('🔴 бедная письменность обрезает сторону — партия обязана кончаться', () {
      // Греческий: 24 знака. Горбов на 7×7 требует 25 букв — поле уходит на 6×6.
      final g = SchulteGame(level: 13, alphabet: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ', rnd: Random(1));
      expect(g.size, lessThanOrEqualTo(maxGridFor(ContentMode.mixed, 24)));
      expect(g.sequence.length, g.items.length);
      expect(g.items.toSet().length, g.items.length, reason: 'повторов на поле нет');
    });
  });
}
