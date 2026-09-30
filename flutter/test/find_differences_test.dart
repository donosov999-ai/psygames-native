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
}
