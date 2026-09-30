import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sdmt/model.dart';

/// СВЕРКА ПРАВИЛ SDMT С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/sdmt-reference.json` выгружен прогоном веб-кода: параметры
/// 20 уровней, по четыре легенды на шести уровнях с одним зерном и раскладка
/// стимула и пада цифр на шести экранах.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/sdmt-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 набор значков тот же и в том же порядке', () {
    expect(sdmtSymbols, (ref['symbols'] as List).cast<String>());
    expect(sdmtBossEvery, ref['bossEvery']);
    // Огонь заменён на месяц после отчёта 10.09 — проверяем, что замена не откатилась.
    expect(sdmtSymbols.contains('flame'), isFalse, reason: 'огонь и капля на 22 точках неразличимы');
    expect(sdmtSymbols.contains('moon'), isTrue);
    expect(sdmtSymbols.toSet().length, 9, reason: 'девять РАЗНЫХ значков');
  });

  test('🔴 20 уровней: длительность, число значков и цель раунда', () {
    for (final raw in ref['params'] as List) {
      final e = raw as Map<String, dynamic>;
      final p = levelParams(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.durationSec, e['durationSec'], reason: '$at длительность');
      expect(p.symbolCount, e['symbolCount'], reason: '$at значков в легенде');
      expect(p.targetHits, e['targetHits'], reason: '$at цель раунда');
    }
    // Оси растут, а не замирают: сравниваем концы обещанной лестницы.
    expect(levelParams(15).symbolCount, 9);
    expect(levelParams(15).durationSec, 45);
    expect(levelParams(15).targetHits > levelParams(1).targetHits, isTrue);
  });

  test('🔴 легенда собирается теми же числами — и перемешаны ОБА её конца', () {
    for (final raw in ref['keymaps'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final rnd = createRng('sdmt|$level');
      for (final rawMap in (e['maps'] as List)) {
        final want = (rawMap as List).cast<Map<String, dynamic>>();
        final got = buildKeymap(e['count'] as int, rnd);
        expect(got.length, want.length, reason: 'L$level размер легенды');
        for (var i = 0; i < want.length; i += 1) {
          expect(got[i].sym, want[i]['sym'], reason: 'L$level значок $i');
          expect(got[i].digit, want[i]['digit'], reason: 'L$level цифра $i');
        }
      }
    }
  });

  test('🔴 легенда НЕ выучивается: на ста партиях ни порядок, ни цифры не повторяются', () {
    // Вопрос правилу, а не генератору: если бы перемешивался один конец,
    // соответствие значок→цифра застывало бы, и проба это ловит.
    final rnd = createRng('выучивание');
    final orders = <String>{};
    final pairs = <String>{};
    for (var i = 0; i < 100; i += 1) {
      final km = buildKeymap(9, rnd);
      orders.add(km.map((k) => k.sym).join(','));
      pairs.add(km.map((k) => '${k.sym}=${k.digit}').join(','));
    }
    expect(orders.length > 90, isTrue, reason: 'порядок значков меняется почти каждую партию: ${orders.length}/100');
    expect(pairs.length > 90, isTrue, reason: 'соответствие значок→цифра меняется: ${pairs.length}/100');
    // И ещё: у одного значка за сто партий должны побывать разные цифры.
    final digitsOfStar = <int>{};
    final rnd2 = createRng('звезда');
    for (var i = 0; i < 100; i += 1) {
      for (final k in buildKeymap(9, rnd2)) {
        if (k.sym == 'star') digitsOfStar.add(k.digit);
      }
    }
    expect(digitsOfStar.length, 9, reason: 'звезде достались все девять цифр: $digitsOfStar');
  });

  test('🔴 РАСКЛАДКА: стимул и пад цифр считаются теми же числами, три клавиши в ряд', () {
    final c = ref['constants'] as Map<String, dynamic>;
    expect(topOfField, (c['ВЕРХ_ПОЛЯ'] as num).toDouble());
    expect(answerGutters, (c['ПОЛЯ_ОТВЕТА'] as num).toDouble());
    expect(fingerSize, (c['ПАЛЕЦ'] as num).toDouble());
    for (final raw in ref['layout'] as List) {
      final e = raw as Map<String, dynamic>;
      final w = (e['w'] as num).toDouble();
      final h = (e['h'] as num).toDouble();
      final got = sdmtLayout(w, h);
      final at = 'экран ${e['w']}×${e['h']}';
      expect(got.fieldW, (e['sdmtW'] as num).toDouble(), reason: '$at ширина поля');
      expect(got.stim, (e['stim'] as num).toDouble(), reason: '$at стимул');
      expect(got.pad, (e['pad'] as num).toDouble(), reason: '$at клавиша пада');
      expect(got.pad >= fingerSize, isTrue, reason: '$at клавиша не мельче пальца');
      // 🔴 Ради чего правило и переписывали: три клавиши обязаны влезать в ряд.
      expect(got.pad * 3 + 16 + 2 <= w, isTrue,
          reason: '$at три клавиши в ряд не помещаются: ${got.pad}×3');
    }
  });
}
