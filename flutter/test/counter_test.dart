/// ПРАВИЛА «СОБЕРИ СУММУ» СВЕРЯЮТСЯ С ЭТАЛОНОМ, СНЯТЫМ С ЖИВОГО ВЕБ-ЭКРАНА.
///
/// Эталон — flutter/test/fixtures/counter-reference.json, выгружен временной
/// пробой прогоном frontend/app/games/counter.tsx: параметры сорока уровней,
/// deals по зерну и размеры клетки. Пересказа правил тут нет — только сверка.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counter/model.dart';

void main() {
  final ref = jsonDecode(
    File('test/fixtures/counter-reference.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  test('параметры сорока уровней совпадают с вебом', () {
    final rows = (ref['levels'] as List).cast<Map<String, dynamic>>();
    expect(rows.length, 40);
    for (final row in rows) {
      final lvl = row['level'] as int;
      final cfg = counterLevelParams(lvl);
      expect(cfg.gridSize, row['gridSize'], reason: 'сетка L$lvl');
      expect(cfg.roundLimitMs, row['roundLimitMs'], reason: 'окно раунда L$lvl');
      expect(cfg.rounds, row['rounds'], reason: 'раундов L$lvl');
      expect(cfg.cellMax, row['cellMax'], reason: 'потолок клетки L$lvl');
      expect(cfg.tripleShare, closeTo((row['tripleShare'] as num).toDouble(), 1e-12),
          reason: 'доля троек L$lvl');
      expect(cfg.passNeed, row['passNeed'], reason: 'порог прохода L$lvl');
    }
  });

  test('пороги лестницы стоят там же, где в вебе', () {
    expect(counterPassAccuracy, ref['passAccuracy']);
    expect(counterBossEvery, ref['bossEvery']);
    expect(counterMaxLevel, ref['maxLevel']);
    final rules_ = (ref['rules'] as List).cast<Map<String, dynamic>>();
    final triples = rules_.firstWhere((r) => r['key'] == 'triples');
    expect(counterTriplesFromLevel, triples['fromLevel']);
  });

  test('лестница не замирает: за таблицей растут скорость, числа и тройки', () {
    // Ось скорости живёт до пола 4 с, дальше не ускоряется.
    expect(counterLevelParams(16).roundLimitMs, lessThan(counterLevelParams(15).roundLimitMs));
    expect(counterLevelParams(20).roundLimitMs, 4000);
    expect(counterLevelParams(40).roundLimitMs, 4000);
    // За L20 растёт величина чисел — иначе уровни были бы клонами.
    expect(counterLevelParams(21).cellMax, greaterThan(counterLevelParams(20).cellMax));
    expect(counterLevelParams(40).cellMax, greaterThan(counterLevelParams(30).cellMax));
    // Тройки входят долей, а не рубильником.
    expect(counterLevelParams(counterTriplesFromLevel - 1).tripleShare, 0);
    expect(counterLevelParams(counterTriplesFromLevel).tripleShare, closeTo(0.2, 1e-12));
    expect(counterLevelParams(30).tripleShare, 1);
    // Соседние уровни за таблицей отличаются хоть чем-то.
    for (var l = 16; l < 40; l += 1) {
      final a = counterLevelParams(l);
      final b = counterLevelParams(l + 1);
      final differs = a.roundLimitMs != b.roundLimitMs ||
          a.cellMax != b.cellMax ||
          a.tripleShare != b.tripleShare;
      expect(differs, isTrue, reason: 'L$l и L${l + 1} — клоны');
    }
  });

  test('партии по зерну совпадают с вебом до клетки', () {
    final deals = (ref['rounds'] as List).cast<Map<String, dynamic>>();
    expect(deals.length, greaterThanOrEqualTo(21));
    Rng? rng;
    String? current;
    for (final deal in deals) {
      final seed = deal['seed'] as String;
      if (seed != current) {
        rng = createRng(seed);
        current = seed;
      }
      final cfg = counterLevelParams(deal['level'] as int);
      final round = makeCounterRound(cfg.gridSize, cfg.cellMax, cfg.tripleShare, rng!);
      expect(round.numbers, (deal['numbers'] as List).cast<int>(),
          reason: 'числа L${deal['level']} #${deal['index']}');
      expect(round.target, deal['target'],
          reason: 'цель L${deal['level']} #${deal['index']}');
    }
  });

  test('цель всегда достижима, а числа не выходят за потолок клетки', () {
    for (final l in [1, 8, 15, 21, 26, 33, 40]) {
      final cfg = counterLevelParams(l);
      final rng = createRng('проверка-$l');
      for (var i = 0; i < 40; i += 1) {
        final round = makeCounterRound(cfg.gridSize, cfg.cellMax, cfg.tripleShare, rng);
        expect(round.numbers.length, cfg.gridSize * cfg.gridSize);
        for (final n in round.numbers) {
          expect(n, inInclusiveRange(1, cfg.cellMax));
        }
        expect(_reachable(round.numbers, round.target), isTrue,
            reason: 'цель ${round.target} не собирается на L$l');
      }
    }
  });

  test('размер клетки совпадает с вебом и на измеренном месте, и на запасном', () {
    for (final box in (ref['cells'] as List).cast<Map<String, dynamic>>()) {
      final place = box['place'] as Map<String, dynamic>?;
      final size = counterCellSize(
        gridSize: box['gridSize'] as int,
        width: (box['width'] as num).toDouble(),
        height: (box['height'] as num).toDouble(),
        placeW: place == null ? null : (place['w'] as num).toDouble(),
        placeH: place == null ? null : (place['h'] as num).toDouble(),
      );
      expect(size, closeTo((box['cellSize'] as num).toDouble(), 1e-9),
          reason: 'клетка ${box['gridSize']} на ${box['width']}×${box['height']}, место $place');
    }
  });
}

/// Можно ли собрать цель из двух или трёх клеток.
bool _reachable(List<int> nums, int goal) {
  for (var i = 0; i < nums.length; i += 1) {
    for (var j = i + 1; j < nums.length; j += 1) {
      if (nums[i] + nums[j] == goal) return true;
      for (var k = j + 1; k < nums.length; k += 1) {
        if (nums[i] + nums[j] + nums[k] == goal) return true;
      }
    }
  }
  return false;
}
