import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/phoneme_pairs/model.dart';

/// СВЕРКА «ФОНЕМ» С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ВЕБ-ФУНКЦИЙ.
///
/// ⚠️ Мутации (каждая обязана краснеть): слепой режим с 10-го; шум с 5-го; лёгкая
/// половина без пола в две пары (краснеет только на случае из двух пар — см. ниже);
/// пара не переставляется; звучит всегда первое.
void main() {
  final ref = jsonDecode(File('test/fixtures/phoneme-pairs-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final queue = [for (final v in (ref['queue'] as List)) (v as num).toDouble()];
  final data = PhData.fromJson(jsonDecode(File('assets/vocab/phoneme-pairs.json').readAsStringSync()) as Map);
  double Function() rng([int from = 0]) {
    var i = from;
    return () => queue[i++ % queue.length];
  }

  test('лестница по уровням, как в вебе', () {
    for (final raw in (ref['levels'] as List)) {
      final l = raw as Map<String, dynamic>;
      final p = phLevelParams((l['level'] as num).toInt());
      final at = 'уровень ${l['level']}';
      expect(p.trials, l['trials'], reason: at);
      expect(p.easyOnly, l['easyOnly'], reason: at);
      expect(p.showWord, l['showWord'], reason: at);
      expect(p.blind, l['blind'], reason: at);
      expect(p.rate, closeTo((l['rate'] as num).toDouble(), 1e-12), reason: at);
      expect(p.snrDb, l['snrDb'] == null ? isNull : closeTo((l['snrDb'] as num).toDouble(), 1e-12), reason: at);
      expect(p.maxErrors, l['maxErrors'], reason: at);
    }
  });

  for (final raw in (ref['games'] as List)) {
    final g = raw as Map<String, dynamic>;
    test('пробы: ${g['lang']}, уровень ${g['level']}', () {
      final p = phLevelParams((g['level'] as num).toInt());
      final pool = phPool(data.pairs['${g['lang']}']!, p.easyOnly);
      expect(pool.length, g['pool'], reason: 'размер пула');
      final got = buildPhTrials(pool, p.trials, rng((g['shift'] as num).toInt()));
      final want = g['trials'] as List;
      expect(got.length, want.length);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect([got[i].words.$1, got[i].words.$2], w['words'], reason: 'пара $i');
        expect(got[i].correctIdx, w['correctIdx'], reason: 'звучит $i');
      }
    });
  }

  /// 📍 Пол «не меньше двух пар» в живых данных СПИТ: меньше всего пар у
  /// португальского — девять. Мутация «без пола» выживала, поэтому случай из двух
  /// пар, где пол работает, — отдельно.
  test('лёгкая половина — не меньше двух пар', () {
    const two = [('a', 'b'), ('c', 'd')];
    expect(phPool(two, true), hasLength(2));
    expect(phPool(data.pairs['pt']!, true), hasLength(5));
  });

  test('пиньинь к иероглифам доехал, у русского подписи нет', () {
    expect(data.pinyin['山'], 'shān');
    expect(data.pinyin['дом'], isNull);
  });
}
