import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cpt/model.dart';

/// СВЕРКА CPT С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/cpt.tsx` (VER 4) в
/// `test/fixtures/cpt-reference.json`: лестница L1…L15 по шести полям, число
/// влезающих проб и ЗАМЕР ПОТОКА по 120 000 проб на семи уровнях.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/cpt-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 лестница совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = CptLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.durationSec, row['durationSec'], reason: '$at: длительность');
      expect(l.isiMs, row['isiMs'], reason: '$at: ISI');
      expect(l.mode == CptMode.x ? 'X' : 'AX', row['mode'], reason: '$at: режим');
      expect(l.confusableRatio, closeTo((row['confusableRatio'] as num).toDouble(), 1e-12),
          reason: '$at: доля двойников');
      expect(l.target, row['target'], reason: '$at: мишень');
      expect(l.colorRule, row['colorRule'], reason: '$at: составное правило');
      expect(trialsThatFit(row['level'] as int), row['fits'], reason: '$at: сколько проб влезает');
      // Условие партии сверяется ЦЕЛИКОМ: потеряй оно поле — разбор старых
      // партий станет нечитаемым, а гейт раздела этого не увидит.
      final want = (row['condition'] as Map).cast<String, Object?>();
      expect(l.condition.keys.toSet(), want.keys.toSet(), reason: '$at: набор полей условия');
      for (final k in want.keys) {
        expect(l.condition[k], want[k], reason: '$at: условие, поле $k');
      }
    }
    expect(cptTargetRate, ref['targetRate']);
    expect(cptTargets, (ref['targets'] as List).cast<String>());
    expect(cptMinTrialsForLevel, ref['minTrialsForLevel']);
    expect(cptColorLureRate, ref['colorLureRate']);
  });

  test('🔴 двойники у КАЖДОЙ мишени свои — общий список выдал бы мишень за дистрактор', () {
    final want = (ref['confusables'] as Map).cast<String, dynamic>();
    for (final e in want.entries) {
      expect(cptConfusables[e.key], (e.value as List).cast<String>(), reason: 'двойники ${e.key}');
    }
    // Ни одна мишень не входит в СВОЙ список двойников.
    for (final t in cptTargets) {
      expect(cptConfusables[t]!.contains(t), isFalse, reason: '$t — двойник самой себя');
    }
    // ⚠️ И при этом X входит в список K, а K в список X: это разные буквы, и
    // такое соседство законно. Проверяем именно собственное вхождение.
    expect(cptConfusables['K']!.contains('X'), isTrue);
  });

  test('🔴 мёртвых переходов НЕТ и мишень меняется БЛОКАМИ по три уровня', () {
    expect((ref['мёртвые переходы'] as List), isEmpty, reason: 'эталон уже содержит дубли');
    for (var l = 2; l <= cptMaxLevel; l++) {
      expect(CptLevel.of(l - 1).condition.toString(), isNot(CptLevel.of(l).condition.toString()),
          reason: 'L$l не отличается от L${l - 1}');
    }
    // До L8 — канонная X, дальше блоками: L9–11 K, L12–14 T, L15+ H.
    for (var l = 1; l <= 8; l++) {
      expect(CptLevel.of(l).target, 'X', reason: 'L$l: мишень уехала с X');
    }
    for (final l in [9, 10, 11]) {
      expect(CptLevel.of(l).target, 'K', reason: 'L$l');
    }
    for (final l in [12, 13, 14]) {
      expect(CptLevel.of(l).target, 'T', reason: 'L$l');
    }
    expect(CptLevel.of(15).target, 'H');
    // ⚠️ Крути букву на КАЖДОЙ ступени — человек не успеет к ней привыкнуть, и
    // «удержать правило поверх привычки» превратится в «привычки нет вовсе».
    final edge = (ref['граничные уровни'] as Map).cast<String, dynamic>();
    expect(CptLevel.of(16).target, (edge['16'] as Map)['target']);
    expect(CptLevel.of(20).target, 'H', reason: 'за лестницей мишень обязана замереть');
  });

  test('🔴 двойники включаются с L3, а не с L11', () {
    // Было: ноль на L1–L10 и рост только на верхней трети — механизм был
    // написан и до двух третей лестницы НЕ ДОЕЗЖАЛ.
    expect(CptLevel.of(1).confusableRatio, 0);
    expect(CptLevel.of(2).confusableRatio, 0, reason: 'первые две ступени — учат правилу, не различению');
    expect(CptLevel.of(3).confusableRatio, greaterThan(0));
    for (var l = 4; l <= cptMaxLevel; l++) {
      expect(CptLevel.of(l).confusableRatio, greaterThanOrEqualTo(CptLevel.of(l - 1).confusableRatio),
          reason: 'L$l: доля двойников упала');
    }
    expect(CptLevel.of(15).confusableRatio, 0.5, reason: 'потолок доли двойников');
    expect(CptLevel.of(20).confusableRatio, 0.5, reason: 'потолок держится за лестницей');
  });

  test('🔴 ISI падает тремя блоками и упирается в полы 900 / 850 / 500', () {
    expect(CptLevel.of(1).isiMs, 1500);
    expect(CptLevel.of(5).isiMs, 900);
    expect(CptLevel.of(6).isiMs, 1100, reason: 'смена режима на AX даёт передышку по темпу');
    expect(CptLevel.of(10).isiMs, 860);
    expect(CptLevel.of(11).isiMs, 800);
    expect(CptLevel.of(15).isiMs, 500);
    expect(CptLevel.of(20).isiMs, 500, reason: 'пол ISI держится за лестницей');
  });

  test('🔴 доля подсказок A ВЫВЕДЕНА, а не подобрана', () {
    // a = A_CUE/(1+A_CUE); доля целей = a·AX_COMPLETION = TARGET_RATE.
    final a = cptACueRate / (1 + cptACueRate);
    expect(a * cptAxCompletion, closeTo(cptTargetRate, 1e-12));
    // ⚠️ Если бы A_CUE_RATE равнялась TARGET_RATE (так и было), реальная доля
    // целей вышла бы p²/(1+p) ≈ 0,033 при p = 0,2 — вшестеро меньше.
    final naive = cptTargetRate / (1 + cptTargetRate) * cptAxCompletion;
    expect(naive, lessThan(cptTargetRate / 1.5));
  });

  test('🔴 доля целей ровно 0,2 на КАЖДОМ уровне — замером потока, как в TS', () {
    final want = (ref['замер потока'] as Map).cast<String, dynamic>();
    expect(want['прогонов'], 120000);
    final rnd = Random(20260923);
    const n = 120000;
    for (final lvl in [1, 5, 6, 10, 11, 13, 15]) {
      var prev = '';
      var targets = 0, reds = 0, lures = 0;
      final p = CptLevel.of(lvl);
      for (var i = 0; i < n; i++) {
        final s = makeTrial(lvl, prev, rnd.nextDouble);
        prev = s.letter;
        if (s.isTarget) targets++;
        if (p.colorRule) {
          if (s.color == StimColor.red) reds++;
          if (!s.isTarget && s.letter == p.target) lures++;
        }
      }
      final w = (want['L$lvl'] as Map).cast<String, dynamic>();
      expect(targets / n, closeTo((w['доля целей'] as num).toDouble(), 0.01),
          reason: 'L$lvl: доля целей ${targets / n}');
      // ⚠️ И в X-режиме, и в AX-режиме доля одна и та же, хотя генераторы разные.
      expect(targets / n, closeTo(cptTargetRate, 0.01), reason: 'L$lvl: доля уехала от канона');
      expect(p.target, w['мишень'], reason: 'L$lvl: мишень');
      if (p.colorRule) {
        expect(reds / n, closeTo((w['доля красных'] as num).toDouble(), 0.02), reason: 'L$lvl: доля красных');
        expect(lures / n, closeTo((w['доля цветовых ловушек'] as num).toDouble(), 0.02),
            reason: 'L$lvl: доля цветовых ловушек');
        // Дистракторы тоже бывают красными — иначе «жми на красное» решало бы всё.
        expect(reds / n, greaterThan(cptTargetRate + 0.1), reason: 'L$lvl: красное = мишень, правило выродилось');
      }
    }
  });

  test('🔴 «ink» — такой же цвет стимула, как синий: красный один из ЧЕТЫРЁХ', () {
    // Из-за этого доля красных в потоке 0,388, а не 0,446. Сочти ink «цветом по
    // умолчанию» — и правило «жми на красное» стало бы заметно проще.
    expect(cptNonRed, [StimColor.blue, StimColor.green, StimColor.ink]);
    expect(cptAllColors.length, 4);
    expect(cptAllColors.first, StimColor.red);
  });

  test('🔴 истинная мишень ВСЕГДА красная, а мишенная буква не того цвета — ловушка', () {
    final rnd = Random(5);
    var prev = '', lures = 0, targets = 0, nonRedLures = 0;
    for (var i = 0; i < 20000; i++) {
      final s = makeTrial(13, prev, rnd.nextDouble);
      prev = s.letter;
      if (s.isTarget) {
        targets++;
        expect(s.color, StimColor.red, reason: 'истинная мишень не красная');
      }
      if (!s.isTarget && s.letter == CptLevel.of(13).target) {
        lures++;
        if (s.color != StimColor.red) nonRedLures++;
      }
    }
    expect(targets, greaterThan(1000));
    expect(lures, greaterThan(500), reason: 'мишенных букв без статуса цели не набралось');
    // ⚠️ Мишенная буква НЕ ТОГО цвета — ловушка составного правила. Но есть и
    // вторая, более злая: мишенная буква КРАСНАЯ и без подсказки A. Обе законны,
    // поэтому проверяется наличие обеих, а не «все ловушки не красные».
    expect(nonRedLures, greaterThan(200), reason: 'ловушек «не того цвета» не набралось');
    expect(lures - nonRedLures, greaterThan(0), reason: 'красных мишенных букв без A не бывает вовсе');
  });

  test('🔴 подсказка A цветом НЕ подменяется — иначе доля целей упала бы молча', () {
    final rnd = Random(6);
    var prev = '';
    for (var i = 0; i < 20000; i++) {
      final s = makeTrial(13, prev, rnd.nextDouble);
      // Если бы лур подменял A, буквы A в потоке встречались бы реже, а пара
      // A→мишень разваливалась. Проверяем, что A вообще есть.
      prev = s.letter;
    }
    var cues = 0;
    prev = '';
    for (var i = 0; i < 20000; i++) {
      final s = makeTrial(13, prev, rnd.nextDouble);
      if (s.letter == 'A') cues++;
      prev = s.letter;
    }
    // Доля подсказок ≈ A_CUE/(1+A_CUE) ≈ 0,286.
    expect(cues / 20000, closeTo(cptACueRate / (1 + cptACueRate), 0.03), reason: 'подсказок ${cues / 20000}');
  });

  test('🔴 в AX-режиме мишень БЕЗ подсказки — не цель, а ловушка', () {
    final rnd = Random(8);
    var prev = '';
    var bx = 0, ax = 0;
    for (var i = 0; i < 30000; i++) {
      final s = makeTrial(6, prev, rnd.nextDouble);
      if (s.letter == CptLevel.of(6).target) {
        if (prev == 'A') {
          ax++;
          expect(s.isTarget, isTrue, reason: 'пара A→мишень не засчитана целью');
        } else {
          bx++;
          expect(s.isTarget, isFalse, reason: 'мишень без подсказки засчитана целью');
        }
      }
      prev = s.letter;
    }
    expect(ax, greaterThan(1000));
    expect(bx, greaterThan(500), reason: 'ловушек «мишень без A» не набралось');
  });

  test('🔴 порог проб взят от РЕАЛЬНОГО минимума: самая короткая партия даёт 30', () {
    // Одна проба = ДВА ISI. Прежний порог 40 делал три уровня непроходимыми.
    expect(trialsThatFit(1), 30);
    expect(trialsThatFit(2), 33);
    expect(trialsThatFit(3), 37);
    expect(cptMinTrialsForLevel, 24);
    for (var l = 1; l <= cptMaxLevel; l++) {
      expect(trialsThatFit(l), greaterThan(cptMinTrialsForLevel), reason: 'L$l: уровень непроходим');
    }
    expect(trialsThatFit(15), 90);
  });

  test('🔴 CV-RT считается по ПОПАДАНИЯМ, делителем n', () {
    CptTrial t(int i, bool target, bool responded, int? rt) {
      final x = CptTrial(
          letter: 'X', color: StimColor.ink, isColorLure: false, isTarget: target, trialIndex: i);
      x.responded = responded;
      x.rt = rt;
      return x;
    }

    final m = calcMetrics([
      t(0, true, true, 400),
      t(1, true, true, 600),
      t(2, false, true, 300),
      t(3, false, false, null),
    ]);
    expect(m.hits, 2);
    expect(m.commissions, 1, reason: 'нажатие на не-цель');
    expect(m.omissions, 0);
    expect(m.meanRtMs, 500);
    // std при делителе n: sqrt(((100²)+(100²))/2) = 100 → CV = 0,2.
    expect(m.cvRt, closeTo(0.2, 1e-12));
    // ⚠️ Время нажатия на НЕ-цель (300) в среднее не вошло: оно про ошибку, а не
    // про скорость. Вошло бы — среднее стало бы 433.
    expect(m.meanRtMs, isNot(closeTo(433, 1)));
    expect(m.accuracy, 1.0);
    expect(m.commissionRate, 0.5);
  });

  test('🔴 падение точности и замедление — РАЗНЫЕ величины', () {
    // Человек отвечает одинаково быстро, но к концу пропускает всё больше.
    CptTrial tgt(int i, bool responded) {
      final x = CptTrial(
          letter: 'X', color: StimColor.ink, isColorLure: false, isTarget: true, trialIndex: i);
      x.responded = responded;
      x.rt = responded ? 500 : null;
      return x;
    }

    final trials = [
      for (var i = 0; i < 4; i++) tgt(i, true),
      for (var i = 4; i < 8; i++) tgt(i, true),
      for (var i = 8; i < 12; i++) tgt(i, i < 10),
      for (var i = 12; i < 16; i++) tgt(i, false),
    ];
    final m = calcMetrics(trials);
    expect(m.accuracySlope, isNotNull);
    expect(m.accuracySlope!, lessThan(0), reason: 'падение точности не увидено');
    // Время при этом ровное — замедления нет.
    expect(m.vigilanceSlopeMs, 0);
  });

  test('🔴 меры бдительности требуют ВОСЬМИ целей, иначе прочерк', () {
    CptTrial tgt(int i) {
      final x = CptTrial(
          letter: 'X', color: StimColor.ink, isColorLure: false, isTarget: true, trialIndex: i);
      x.responded = true;
      x.rt = 500;
      return x;
    }

    // По одной-двум целям на четверть вышел бы шум под видом биомаркера.
    expect(calcMetrics([for (var i = 0; i < 7; i++) tgt(i)]).accuracySlope, isNull);
    expect(calcMetrics([for (var i = 0; i < 8; i++) tgt(i)]).accuracySlope, isNotNull);
  });

  test('🔴 оборванная партия уровень НЕ ДВИГАЕТ — ни вверх, ни вниз', () {
    var now = 0;
    final g = CptGame(level: 1, rnd: Random(3), nowMs: () => now);
    g.begin();
    // Дождался первой цели, тапнул, вышел: точность 1/1, ложных тревог ноль.
    var guard = 0;
    while (g.trials.length < 5 && guard++ < 200) {
      now += g.nextIsiMs();
      final s = g.showNext();
      if (s.isTarget) {
        now += 300;
        g.tap();
      }
      now += g.trialWindowMs;
      g.closeTrial();
    }
    expect(g.trials.length, 5);
    expect(g.aborted, isTrue);
    // 🔴 Не «прошёл» и не «провалил» — исхода НЕТ.
    expect(g.passed, isNull, reason: 'оборванная партия выдала исход');
  });

  test('🔴 полная партия: проход по точности И по доле ложных тревог', () {
    var now = 0;
    final g = CptGame(level: 1, rnd: Random(4), nowMs: () => now);
    g.begin();
    var guard = 0;
    while (!g.timeUp && guard++ < 500) {
      now += g.nextIsiMs();
      final s = g.showNext();
      if (s.isTarget) {
        now += 300;
        g.tap();
      }
      now += g.trialWindowMs;
      g.closeTrial();
    }
    expect(g.trials.length, greaterThanOrEqualTo(cptMinTrialsForLevel));
    expect(g.aborted, isFalse);
    final m = g.metrics;
    expect(m.accuracy, 1.0, reason: 'безупречная партия дала промахи');
    expect(m.commissionRate, 0.0);
    expect(g.passed, isTrue);
    // Доля целей в реальной партии — около канона.
    final targets = g.trials.where((t) => t.isTarget).length;
    expect(targets / g.trials.length, closeTo(cptTargetRate, 0.15), reason: 'на короткой партии допуск шире');
  });

  test('🔴 порог точности 0,7: расклад 0,6 не проходит, 0,75 проходит', () {
    // ⚠️ Партии «всё поймал» и «жму на всё» проходят при любом пороге из пары
    // 0,5 / 0,7 и подмены не видят. Берём расклады ПО ОБЕ стороны.
    CptTrial tgt(int i, bool responded) {
      final x = CptTrial(
          letter: 'X', color: StimColor.ink, isColorLure: false, isTarget: true, trialIndex: i);
      x.responded = responded;
      x.rt = responded ? 500 : null;
      return x;
    }

    final six = calcMetrics([for (var i = 0; i < 10; i++) tgt(i, i < 6)]);
    expect(six.accuracy, closeTo(0.6, 1e-12));
    expect(six.accuracy >= cptPassAccuracy, isFalse, reason: '0,6 засчитано проходом');
    final threeQuarters = calcMetrics([for (var i = 0; i < 8; i++) tgt(i, i < 6)]);
    expect(threeQuarters.accuracy, closeTo(0.75, 1e-12));
    expect(threeQuarters.accuracy >= cptPassAccuracy, isTrue, reason: '0,75 не засчитано');
    expect(cptPassAccuracy, 0.7);
  });

  test('🔴 партия «жму на всё» не проходит: ложных тревог слишком много', () {
    var now = 0;
    final g = CptGame(level: 1, rnd: Random(5), nowMs: () => now);
    g.begin();
    var guard = 0;
    while (!g.timeUp && guard++ < 500) {
      now += g.nextIsiMs();
      g.showNext();
      now += 250;
      g.tap();
      now += g.trialWindowMs;
      g.closeTrial();
    }
    final m = g.metrics;
    expect(m.accuracy, 1.0, reason: 'жму на всё — все цели пойманы');
    expect(m.commissionRate, greaterThan(cptMaxCommissionRate));
    expect(g.passed, isFalse, reason: '«жму на всё» засчитано проходом');
  });

  test('🔴 второе нажатие в пробе не засчитывается', () {
    var now = 0;
    final g = CptGame(level: 1, rnd: Random(7), nowMs: () => now);
    g.begin();
    now += g.nextIsiMs();
    g.showNext();
    now += 200;
    expect(g.tap(), isTrue);
    expect(g.tap(), isFalse, reason: 'второе нажатие засчитано');
    expect(g.current!.rt, 200);
    g.closeTrial();
    expect(g.tap(), isFalse, reason: 'нажатие после закрытия пробы');
  });

  test('🔴 пауза между буквами дрожит ±15 % — ровный темп учил бы жать по счёту', () {
    final g = CptGame(level: 1, rnd: Random(9), nowMs: () => 0);
    final xs = [for (var i = 0; i < 400; i++) g.nextIsiMs()];
    expect(xs.reduce(min), greaterThanOrEqualTo((1500 * 0.85).round()));
    expect(xs.reduce(max), lessThanOrEqualTo((1500 * 1.15).round()));
    expect(xs.toSet().length, greaterThan(100), reason: 'пауза почти не гуляет');
    // Окно ответа при этом РОВНОЕ — один ISI уровня.
    expect(g.trialWindowMs, 1500);
  });
}
