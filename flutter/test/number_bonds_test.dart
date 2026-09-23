import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/number_bonds/model.dart';

/// СВЕРКА ПРАВИЛ «СОСТАВА ЧИСЛА» С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/number-bonds-reference.json` выгружен прогоном веб-ядра:
/// параметры 30 уровней (включая открытый хвост за таблицей), по шесть задач на
/// двенадцати уровнях с одним зерном, выбор размера решения по весам и перенос
/// прогресса старой лестницы.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/number-bonds-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 параметры 30 уровней совпадают, включая открытый хвост за таблицей', () {
    expect(nbMaxLevel, ref['maxLevel']);
    for (final raw in ref['params'] as List) {
      final e = raw as Map<String, dynamic>;
      final p = levelParams(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.pool, e['pool'], reason: '$at фишек на поле');
      expect(p.maxV, e['maxV'], reason: '$at потолок фишки');
      expect(p.trials, e['trials'], reason: '$at задач в раунде');
      expect(p.windowMs, e['windowMs'], reason: '$at окно');
      expect(p.targetMax, e['targetMax'], reason: '$at потолок цели');
      final want = (e['sizeWeights'] as Map<String, dynamic>)
          .map((k, v) => MapEntry(int.parse(k), (v as num).toDouble()));
      expect(p.sizeWeights.length, want.length, reason: '$at сколько размеров решения');
      for (final entry in want.entries) {
        expect(p.sizeWeights[entry.key], closeTo(entry.value, 1e-12), reason: '$at вес ${entry.key}');
      }
    }
  });

  test('🔴 детские уровни без таймера и с потолком цели — вход в игру не сломан', () {
    for (final level in [1, 2, 3]) {
      final p = levelParams(level);
      expect(p.windowMs, 0, reason: 'L$level без окна');
      expect(p.sizeWeights.keys.toList(), [2], reason: 'L$level только пары');
    }
    expect(levelParams(1).targetMax, 10, reason: 'состав до 10');
    expect(levelParams(2).targetMax, 20, reason: 'состав до 20');
    expect(levelParams(4).windowMs > 0, isTrue, reason: 'с четвёртого окно появляется');
  });

  test('🔴 размер решения по весам выпадает тем же', () {
    for (final raw in ref['sizes'] as List) {
      final e = raw as Map<String, dynamic>;
      final weights = (e['weights'] as Map<String, dynamic>)
          .map((k, v) => MapEntry(int.parse(k), (v as num).toDouble()));
      final rnd = createRng(e['seed'] as String);
      final want = (e['picks'] as List).cast<int>();
      for (var i = 0; i < want.length; i += 1) {
        expect(pickSolSize(weights, rnd), want[i], reason: 'веса ${e['weights']}, бросок $i');
      }
    }
  });

  test('🔴 задачи раздаются те же — цель и фишки побайтно', () {
    var checked = 0;
    for (final raw in ref['puzzles'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final cfg = levelParams(level);
      final rnd = createRng('bonds|$level');
      for (final rawP in (e['list'] as List)) {
        final want = rawP as Map<String, dynamic>;
        final got = makePuzzle(cfg, rnd);
        expect(got.target, want['target'], reason: 'L$level цель');
        expect(got.chips, (want['chips'] as List).cast<int>(), reason: 'L$level фишки');
        checked += 1;
      }
    }
    expect(checked, 72, reason: 'двенадцать уровней по шесть задач');
  });

  test('🔴 задача РЕШАЕМА и честна: решение есть, фишек столько же, цели среди них нет', () {
    // Независимая проверка: вопрос ЗАДАЧЕ, а не генератору. Перебором ищем набор
    // фишек, дающий цель, — и проверяем, что среди фишек нет самой цели (иначе
    // «решение» из одной фишки обесценило бы уровень).
    for (final level in [1, 3, 6, 10, 14, 20, 26]) {
      final cfg = levelParams(level);
      final rnd = createRng('честность|$level');
      for (var i = 0; i < 30; i += 1) {
        final p = makePuzzle(cfg, rnd);
        expect(p.chips.length, cfg.pool, reason: 'L$level фишек ровно $cfg.pool');
        expect(p.chips.contains(p.target), isFalse, reason: 'L$level цель ${p.target} лежит фишкой');
        if (cfg.targetMax != null) {
          expect(p.target <= cfg.targetMax!, isTrue, reason: 'L$level цель выше потолка состава');
        }
        // Есть ли подмножество из ≥2 фишек с суммой цели.
        var found = false;
        final n = p.chips.length;
        for (var mask = 1; mask < (1 << n) && !found; mask += 1) {
          var sum = 0;
          var used = 0;
          for (var b = 0; b < n; b += 1) {
            if (mask & (1 << b) != 0) {
              sum += p.chips[b];
              used += 1;
            }
          }
          if (used >= bondsMinPicked && sum == p.target) found = true;
        }
        expect(found, isTrue, reason: 'L$level задача без решения: цель ${p.target}, фишки ${p.chips}');
      }
    }
  });

  test('🔴 перенос прогресса старой лестницы не сжигает уровень', () {
    for (final raw in ref['migrate'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(migrateOldLevel(e['from'] as int), e['to'], reason: 'со старого ${e['from']}');
    }
  });

  test('🔴 РАСКЛАДКА: фишки укладываются в отданную высоту, иначе ужимаются', () {
    // Поле в каркасе получает высоту ЧИСЛОМ — фишка обязана ужиматься, а не
    // уезжать под липкий низ (та же семья дефектов, что чинилась у «Паттернов»).
    for (final h in [420.0, 240.0, 150.0]) {
      final size = chipSize(328, h, 12);
      final perRow = ((328 + 10) / (size + 10)).floor();
      final rows = (12 / perRow).ceil();
      expect(rows * size + (rows - 1) * 10 <= h || size == 44, isTrue,
          reason: 'высота $h: фишка $size, рядов $rows — не влезает');
      expect(size >= 44, isTrue, reason: 'фишка не мельче 44 точек: палец');
    }
    expect(chipSize(328, 420, 12), 60, reason: 'на просторном поле фишка как в вебе — 60');

    // ⚠️ И ГЛАВНОЕ: берётся МАКСИМАЛЬНАЯ из влезающих, а не запасная. Без этой
    // проверки мутация «оставить только размер 60» проходила мимо: фишка падала
    // сразу до запасных 44, и проба «влезает и не мельче пальца» была довольна.
    // Числа при ширине 328 и зазоре 10: 60 → три ряда по 200, 54 → 182, 48 → 164.
    expect(chipSize(328, 190, 12), 54, reason: '60 не влезает в 190, а 54 влезает — берём 54');
    expect(chipSize(328, 170, 12), 48, reason: '54 не влезает в 170, а 48 влезает — берём 48');
  });
}
