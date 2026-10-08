import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/find_differences/model.dart';

/// СВЕРКА ПРАВИЛ «НАЙДИ ОТЛИЧИЯ» С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/find-differences-reference.json` выгружен прогоном веб-кода:
/// параметры 40 уровней и по три раунда на семи уровнях с одним зерном —
/// обе сцены целиком и список изменённых объектов.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/find-differences-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 верх лестницы и постоянные те же', () {
    expect(findDifferencesLevels, ref['levelsTop']);
    expect(spriteCount, ref['spriteCount']);
    expect(roundsPerLevel, ref['roundsPerLevel']);
  });

  test('🔴 40 уровней: отличия, объекты, время и алфавит зверей', () {
    for (final raw in ref['params'] as List) {
      final e = raw as Map<String, dynamic>;
      final p = levelParams(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.diffCount, e['diffCount'], reason: '$at отличий');
      expect(p.objectCount, e['objectCount'], reason: '$at объектов');
      expect(p.roundTimeSec, e['roundTimeSec'], reason: '$at секунд на раунд');
      expect(p.rounds, e['rounds'], reason: '$at раундов');
      expect(p.spriteAlphabet, e['spriteAlphabet'], reason: '$at алфавит зверей');
    }
    // 🔴 Четвёртая ось живёт там, где первые три уже упёрлись в потолок.
    expect(levelParams(15).diffCount, levelParams(31).diffCount, reason: 'отличия упёрлись');
    expect(levelParams(15).objectCount, levelParams(31).objectCount, reason: 'объекты упёрлись');
    expect(levelParams(15).roundTimeSec, levelParams(31).roundTimeSec, reason: 'время упёрлось');
    expect(levelParams(31).spriteAlphabet < levelParams(15).spriteAlphabet, isTrue,
        reason: 'а алфавит продолжает сужаться: ${levelParams(31).spriteAlphabet}');
    expect(levelParams(99).spriteAlphabet, 3, reason: 'ниже трёх видов не опускаемся');
  });

  test('🔴 сцены раздаются те же — обе картинки и список отличий побайтно', () {
    var checked = 0;
    for (final raw in ref['scenes'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final p = levelParams(level);
      final rnd = createRng('fd|$level');
      for (final rawRound in (e['rounds'] as List)) {
        final want = rawRound as Map<String, dynamic>;
        final scene = generateScene(320, 240, p.objectCount, p.spriteAlphabet, rnd);
        final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd);
        final wantScene = (want['scene'] as List).map((r) => (r as List)).toList();
        final wantAltered = (want['altered'] as List).map((r) => (r as List)).toList();
        expect(scene.length, wantScene.length, reason: 'L$level объектов в сцене');
        for (var i = 0; i < wantScene.length; i += 1) {
          expect(scene[i].sprite, wantScene[i][0], reason: 'L$level зверь $i');
          expect(scene[i].x, closeTo((wantScene[i][1] as num).toDouble(), 1e-6), reason: 'L$level x$i');
          expect(scene[i].y, closeTo((wantScene[i][2] as num).toDouble(), 1e-6), reason: 'L$level y$i');
          expect(scene[i].size, closeTo((wantScene[i][3] as num).toDouble(), 1e-9), reason: 'L$level размер $i');
          expect(alt.shapes[i].sprite, wantAltered[i][0], reason: 'L$level зверь $i во второй сцене');
          expect(alt.shapes[i].size, closeTo((wantAltered[i][3] as num).toDouble(), 1e-9),
              reason: 'L$level размер $i во второй сцене');
          expect(alt.shapes[i].rot, wantAltered[i][4], reason: 'L$level поворот $i во второй сцене');
        }
        expect(alt.diffIdx, (want['diffIdx'] as List).cast<int>(), reason: 'L$level какие объекты изменены');
        checked += 1;
      }
    }
    expect(checked, 21, reason: 'семь уровней по три раунда');
  });

  test('🔴 объекты НЕ налезают друг на друга ни в одной сцене', () {
    // Вопрос сцене, а не генератору: наложение закрыло бы нажатие по объекту.
    for (final level in [1, 5, 13, 15, 19, 25, 31]) {
      final p = levelParams(level);
      final rnd = createRng('наложения|$level');
      for (var run = 0; run < 20; run += 1) {
        final scene = generateScene(320, 240, p.objectCount, p.spriteAlphabet, rnd);
        for (var i = 0; i < scene.length; i += 1) {
          for (var j = i + 1; j < scene.length; j += 1) {
            expect(tooClose(scene[i], scene[j], padding: 0), isFalse,
                reason: 'L$level: объекты $i и $j перекрылись');
          }
        }
      }
    }
  });

  test('🔴 отличий РОВНО столько, сколько обещает уровень, и каждое — настоящее', () {
    for (final level in [1, 7, 15, 25, 31]) {
      final p = levelParams(level);
      final rnd = createRng('отличия|$level');
      for (var run = 0; run < 20; run += 1) {
        final scene = generateScene(320, 240, p.objectCount, p.spriteAlphabet, rnd);
        final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd);
        expect(alt.diffIdx.length, p.diffCount, reason: 'L$level отличий обещано ${p.diffCount}');
        expect(alt.diffIdx.toSet().length, p.diffCount, reason: 'L$level отличия не повторяются');
        for (var i = 0; i < scene.length; i += 1) {
          final changed = scene[i].sprite != alt.shapes[i].sprite ||
              scene[i].size != alt.shapes[i].size ||
              scene[i].rot != alt.shapes[i].rot;
          if (alt.diffIdx.contains(i)) {
            expect(changed, isTrue, reason: 'L$level объект $i помечен отличием, но не изменён');
          } else {
            expect(changed, isFalse, reason: 'L$level объект $i изменён, но отличием не помечен');
          }
        }
      }
    }
  });

  test('🔴 подмена зверя НЕ выходит за алфавит — иначе отличие выдаёт себя само', () {
    // Именно это ломает четвёртую ось: чужой вид виден, не сравнивая картинки.
    for (final level in [19, 25, 31, 40]) {
      final p = levelParams(level);
      final rnd = createRng('алфавит|$level');
      for (var run = 0; run < 30; run += 1) {
        final scene = generateScene(320, 240, p.objectCount, p.spriteAlphabet, rnd);
        final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd);
        for (final s in [...scene, ...alt.shapes]) {
          expect(s.sprite < p.spriteAlphabet, isTrue,
              reason: 'L$level: зверь ${s.sprite} вне алфавита ${p.spriteAlphabet}');
        }
      }
    }
  });

  test('🔴 ПОТОЛКА НЕТ: с 34-го отличие тоньше до пола, а раундов больше на КАЖДОМ уровне', () {
    // Правило Дениса 06.09.2026. К 33-му на верху все четыре оси; время дальше не трогаем —
    // вечерний слот запрещает наказание временем. Растёт величина отличия.
    for (var l = 1; l <= fdSubtleFrom; l += 1) {
      expect(fdSubtlety(l), 1, reason: 'L$l: отличия прежней величины');
      expect(levelParams(l).subtlety, 1);
      expect(fdExtraRoundsMean(l), 0, reason: 'L$l: прежние три раунда');
    }
    var prev = 1.0;
    for (var l = fdSubtleFrom + 1; l <= 400; l += 1) {
      final k = fdSubtlety(l);
      expect(k, lessThan(prev), reason: 'L$l тоньше, чем L${l - 1}');
      expect(k, greaterThan(fdSubtleFloor), reason: 'L$l: отличие не меньше пола');
      prev = k;
    }
    expect(levelParams(fdSubtleFrom + 1).subtlety, closeTo(0.25 + 0.75 * 0.92, 1e-12));
    // Без пола отличие размера стало бы меньше полуточки к 75-му, а поворот — к 86–95-му:
    // картинки совпали бы до пикселя. С полом на любом уровне отличие видно глазом.
    final far = fdSubtlety(100000);
    expect(16 * far, greaterThanOrEqualTo(4), reason: 'размер меняется хотя бы на 4 точки');
    expect(90 * far, greaterThanOrEqualTo(22.5), reason: 'поворот хотя бы на 22,5°');
    var mean = fdExtraRoundsMean(fdSubtleFrom);
    for (var l = fdSubtleFrom + 1; l <= 10000; l += 1) {
      expect(fdExtraRoundsMean(l), greaterThan(mean), reason: 'L$l: раундов в среднем больше — соседи не совпадают');
      mean = fdExtraRoundsMean(l);
    }
    expect(fdExtraRoundsMean(57), 3, reason: 'на раунд больше каждые 8 уровней: к 57-му их 6 вместо 3');

    // Тонкие отличия: подмена зверя — только запасная, размер и поворот — на долю прежнего.
    var sprites = 0, sizes = 0, rots = 0;
    for (var seed = 0; seed < 60; seed += 1) {
      for (final level in [34, 50, 80]) {
        final p = levelParams(level);
        final rnd = createRng('тонко-$seed-$level');
        final scene = generateScene(340, 300, p.objectCount, p.spriteAlphabet, rnd);
        final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd, subtlety: p.subtlety);
        for (final i in alt.diffIdx) {
          final a = scene[i], b = alt.shapes[i];
          if (a.sprite != b.sprite) sprites += 1;
          if (a.size != b.size) {
            sizes += 1;
            expect((a.size - b.size).abs(), closeTo(16 * p.subtlety, 1e-9), reason: 'L$level размер на 16·k');
          }
          if (a.rot != b.rot) {
            rots += 1;
            final d = (b.rot - a.rot) % 360;
            expect(d == 90 * p.subtlety || (d - 180 * p.subtlety).abs() < 1e-9 || (d - 90 * p.subtlety).abs() < 1e-9,
                isTrue, reason: 'L$level поворот на 90·k или 180·k, а не $d');
          }
        }
      }
    }
    expect(sizes + rots, greaterThan(0));
    expect(sprites, lessThan((sizes + rots) ~/ 10), reason: 'подмена зверя — редкая запасная, а не треть отличий');
  });

  test('🔴 лишние раунды честные: целая часть всегда, дробная — долей партий; до 34-го бросков нет', () {
    var calls = 0;
    final base = createRng('раунды');
    double counted() {
      calls += 1;
      return base();
    }
    for (var l = 1; l <= fdSubtleFrom; l += 1) {
      expect(fdDrawExtraRounds(l, counted), 0);
    }
    expect(calls, 0, reason: 'до 34-го генератор не тронут — раздача прежняя байт в байт');
    for (final level in [34, 37, 45, 77, 200]) {
      final mean = fdExtraRoundsMean(level);
      var sum = 0;
      const draws = 4000;
      for (var i = 0; i < draws; i += 1) {
        final d = fdDrawExtraRounds(level, counted);
        expect(d == mean.floor() || d == mean.floor() + 1, isTrue, reason: 'L$level: $d при среднем $mean');
        sum += d;
      }
      expect(sum / draws, closeTo(mean, 0.03), reason: 'L$level: среднее по $draws партиям');
    }
  });

  test('🔴 карточка «Отличия тоньше» встаёт на тот же уровень, что и пятая ось', () {
    final rules = jsonDecode(File('assets/level_rules.json').readAsStringSync()) as Map<String, dynamic>;
    final ranges = ((rules['games'] as Map)['find_differences'] as List).cast<List>();
    expect(ranges.first, [1, fdSubtleFrom, null]);
    expect(ranges.last, [fdSubtleFrom + 1, null, 'subtle']);
  });
}
