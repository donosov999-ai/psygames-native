import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pattern/model.dart';

/// СВЕРКА ПРАВИЛ «ПАТТЕРНОВ» С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/pattern-reference.json` выгружен прогоном веб-ядра на ОДНОМ
/// зерне: 26 уровней по пять рядов, сырые выборки генераторов, прочтения и
/// честность девяти рядов, наборы вариантов ответа и замер утечки.
///
/// ⚠️ Ряд собирается цепочкой бросков, поэтому расхождение в любом генераторе
/// ломает все последующие ряды уровня — сверка идёт побайтно, а не «похоже».
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/pattern-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 партия та же, что в вебе: десять проб и порог 0,7', () {
    // ⚠️ ЭТИ ДВА ЧИСЛА ДОЛГО НЕ БЫЛИ ЗАКРЕПЛЕНЫ НИЧЕМ: мутация «проб 10 → 5» не
    // краснела, потому что экранная проба сама брала константу и честно играла
    // пять проб. Значения перенесены из веб-экрана: app/games/pattern.tsx:103
    // (`num('trials', 10)`) и :154 (`newHits / trials >= 0.7`).
    expect(trialsPerRound, 10);
    expect(passHitRate, 0.7);
  });

  test('🔴 смесь начинается там же и масштаб растёт так же', () {
    expect(mixFrom, ref['mixFrom']);
    for (final raw in ref['rows'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(mixScale(e['level'] as int), e['mixScale'], reason: 'L${e['level']} масштаб');
      expect(levelLabelKey(e['level'] as int), e['label'], reason: 'L${e['level']} подпись класса');
    }
  });

  test('🔴 26 уровней отдают те же ряды: числа, ответ, класс, правило подсказки', () {
    var checked = 0;
    for (final raw in ref['rows'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final rng = createRng('pattern|$level');
      final want = (e['seqs'] as List).cast<Map<String, dynamic>>();
      for (var i = 0; i < want.length; i += 1) {
        final got = makeSequence(level, rng);
        final at = 'L$level ряд $i';
        expect(got.items, want[i]['items'], reason: '$at числа');
        expect(got.answer, want[i]['answer'], reason: '$at ответ');
        expect(got.classKey, want[i]['classKey'], reason: '$at класс');
        expect(got.ruleKey, want[i]['ruleKey'], reason: '$at правило');
        expect(jsonEncode(got.ruleParams), jsonEncode(want[i]['ruleParams']), reason: '$at числа подсказки');
        checked += 1;
      }
    }
    expect(checked, 130, reason: '26 уровней по пять рядов');
  });

  test('🔴 сами генераторы совпадают и без заслона', () {
    for (final raw in ref['picks'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final rng = createRng('pick|$level');
      for (final rawSeq in (e['seqs'] as List)) {
        final want = rawSeq as Map<String, dynamic>;
        final got = pickSequence(level, rng);
        expect(got.items, want['items'], reason: 'L$level выборка');
        expect(got.answer, want['answer'], reason: 'L$level ответ выборки');
        expect(got.classKey, want['classKey'], reason: 'L$level класс выборки');
      }
    }
  });

  test('🔴 ряд читается теми же правилами — заслон неоднозначности перенесён целиком', () {
    for (final raw in ref['reads'] as List) {
      final e = raw as Map<String, dynamic>;
      final items = (e['items'] as List).cast<int>();
      final got = readings(items);
      final want = (e['readings'] as List).cast<Map<String, dynamic>>();
      expect(got.length, want.length, reason: '$items число прочтений');
      for (var i = 0; i < want.length; i += 1) {
        expect(got[i].rule, want[i]['rule'], reason: '$items прочтение $i');
        expect(got[i].surplus, want[i]['surplus'], reason: '$items запас $i');
        expect(got[i].answer, want[i]['answer'], reason: '$items ответ прочтения $i');
      }
      final first = want.isEmpty ? 0 : want.first['answer'] as int;
      expect(fair(items, first), e['fairProof'], reason: '$items честность');
    }
  });

  test('🔴 два известных неоднозначных ряда к игроку не выходят — и ловят их РАЗНЫЕ заслоны', () {
    // ⚠️ Проба сперва требовала, чтобы оба ряда читались двумя ответами, и краснела.
    // Красный был прав: у [4,5,7,10] второе правило — четыре свободных числа
    // переплетённых рядов, оно ничего не доказывает и в прочтения не попадает.
    // Поэтому заслон его НЕ ловит, и в ядре ради него оставлен явный список.
    final ambiguous = readings([2, 3, 5, 8]).map((r) => r.answer).toSet();
    expect(ambiguous.length > 1, isTrue, reason: '[2,3,5,8] читается двумя ответами: $ambiguous');
    expect(fair([2, 3, 5, 8], 13), isFalse, reason: 'заслон ловит его сам');

    final second = readings([4, 5, 7, 10]).map((r) => r.answer).toSet();
    expect(second, {14}, reason: '[4,5,7,10] числами подтверждает только один ответ');
    expect(fair([4, 5, 7, 10], 10), isFalse,
        reason: 'ответ 10 расходится с единственным подтверждённым прочтением');

    // И главное: ни один из 130 сверенных рядов ими не оказался.
    for (final raw in ref['rows'] as List) {
      for (final s in ((raw as Map<String, dynamic>)['seqs'] as List)) {
        final items = ((s as Map<String, dynamic>)['items'] as List).join(',');
        expect(items == '2,3,5,8' || items == '4,5,7,10', isFalse, reason: 'ряд $items вышел к игроку');
      }
    }
  });

  test('🔴 РАСКЛАДКА РЯДА: клетки и кегль считаются теми же числами, что в вебе', () {
    for (final raw in ref['cells'] as List) {
      final e = raw as Map<String, dynamic>;
      final labels = (e['labels'] as List).cast<String>();
      final got = cellSize((e['width'] as num).toDouble(), labels);
      final want = e['out'] as Map<String, dynamic>;
      final at = 'ширина ${e['width']}, ряд $labels';
      expect(got.font, (want['font'] as num).toDouble(), reason: '$at кегль');
      expect(got.pad, (want['pad'] as num).toDouble(), reason: '$at поля');
      expect(got.gap, (want['gap'] as num).toDouble(), reason: '$at зазор');
      expect(got.cell, (want['cell'] as num).toDouble(), reason: '$at клетка');
      expect(got.fits, want['fits'], reason: '$at влезает ли');
    }
  });

  test('🔴 варианты ответа собираются теми же числами', () {
    for (final raw in ref['optionSets'] as List) {
      final e = raw as Map<String, dynamic>;
      final answer = e['answer'] as int;
      final rng = createRng('opt|$answer');
      for (final rawSet in (e['sets'] as List)) {
        final want = (rawSet as List).cast<int>();
        final got = makeOptions(answer, rng);
        expect(got, want, reason: 'ответ $answer: набор');
        expect(got.contains(answer), isTrue, reason: 'ответ $answer обязан быть среди вариантов');
        expect(got.toSet().length, got.length, reason: 'варианты не повторяются');
      }
    }
  });

  test('🔴 варианты НЕ выдают ответ: «ближайший к среднему» угадывает как случайный', () {
    for (final raw in ref['leak'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final rng = createRng('leak|$level');
      final n = e['n'] as int;
      var nearMean = 0;
      var lastStep = 0;
      for (var i = 0; i < n; i += 1) {
        final s = makeSequence(level, rng);
        final opts = makeOptions(s.answer, rng);
        final mean = opts.reduce((a, b) => a + b) / opts.length;
        var byMean = opts.first;
        for (final v in opts) {
          if ((v - mean).abs() < (byMean - mean).abs()) byMean = v;
        }
        if (byMean == s.answer) nearMean += 1;
        final guess = s.items.last + (s.items.last - s.items[s.items.length - 2]);
        var byStep = opts.first;
        for (final v in opts) {
          if ((v - guess).abs() < (byStep - guess).abs()) byStep = v;
        }
        if (byStep == s.answer) lastStep += 1;
      }
      expect(nearMean / n, closeTo((e['nearMeanRate'] as num).toDouble(), 1e-12),
          reason: 'L$level: утечка через среднее считается так же, как в вебе');
      expect(lastStep / n, closeTo((e['lastStepRate'] as num).toDouble(), 1e-12),
          reason: 'L$level: прикидка «последний + шаг» считается так же');
      // 🔴 Главное: по одним числам вариантов ответ не угадывается чаще случайного.
      expect(nearMean / n < 0.30, isTrue,
          reason: 'L$level: «ближайший к среднему» угадывает ${nearMean / n} при случайных 0,25');
    }
  });
}
