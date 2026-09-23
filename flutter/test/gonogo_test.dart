import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/gonogo/model.dart';

/// СВЕРКА «ЖМИ И ДЕРЖИСЬ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/go-no-go.tsx` в
/// `test/fixtures/gonogo-reference.json`: levelParams L1…L15, levelCondition и
/// pickStim на заданной очереди случайных чисел.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/gonogo-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 доля запретных проб и потолок лестницы — те же, что в живом коде', () {
    expect(nogoProb, ref['nogoProb']);
    expect(gonogoMaxLevel, ref['maxLevel']);
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = GoNoGoLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём проб');
      expect(l.windowMs, row['windowMs'], reason: '$at: окно ответа');
      expect(l.itiMinMs, row['itiMinMs'], reason: '$at: межпробная пауза');
      expect(l.itiJitterMs, row['itiJitterMs'], reason: '$at: разброс паузы');
    }
  });

  test('🔴 все три оси идут вниз и упираются в полы РАЗОМ на L15', () {
    for (var l = 2; l <= 15; l++) {
      final a = GoNoGoLevel.of(l - 1);
      final b = GoNoGoLevel.of(l);
      expect(b.windowMs <= a.windowMs, isTrue, reason: 'L$l: окно выросло');
      expect(b.itiMinMs <= a.itiMinMs, isTrue, reason: 'L$l: пауза выросла');
      expect(b.itiJitterMs <= a.itiJitterMs, isTrue, reason: 'L$l: разброс вырос');
      expect(b.trials >= a.trials, isTrue, reason: 'L$l: объём упал');
    }
    // На L14 все три ещё двигаются — мёртвых ступеней нет.
    expect(GoNoGoLevel.of(14).windowMs != GoNoGoLevel.of(13).windowMs, isTrue);
    expect(GoNoGoLevel.of(15).windowMs, 550);
    expect(GoNoGoLevel.of(15).itiMinMs, 280);
    expect(GoNoGoLevel.of(15).itiJitterMs, 180);
  });

  test('🔴 стимулы те же, что в живом TS, и граница 0,25 строгая', () {
    final rows = (ref['stims'] as List).cast<Map<String, dynamic>>();
    for (final want in rows) {
      final r = (want['r'] as num).toDouble();
      final got = pickStim(() => r);
      expect(got.name, want['stim'], reason: 'розыгрыш $r');
    }
    // Явно: ровно 0,25 — это GO (строка есть в эталоне).
    expect(pickStim(() => 0.25), GoNoGoStim.go);
    expect(pickStim(() => 0.2499), GoNoGoStim.nogo);
  });

  test('🔴 нажатие на цель — попадание, время реакции идёт в копилку', () {
    var clock = 0;
    final g = GoNoGoGame(level: 1, rnd: _Queue([0.9, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    expect(g.stimulus, GoNoGoStim.go);
    clock += 380;
    expect(g.respond(), GoNoGoOutcome.hit);
    expect(g.hits, 1);
    expect(g.meanRtMs, 380);
  });

  test('🔴 нажатие на запрет — ложная тревога, и она НЕ путается с пропуском', () {
    var clock = 0;
    final g = GoNoGoGame(level: 1, rnd: _Queue([0.1, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    expect(g.stimulus, GoNoGoStim.nogo);
    clock += 300;
    expect(g.respond(), GoNoGoOutcome.falseAlarm);
    expect(g.falseAlarms, 1);
    expect(g.misses, 0, reason: 'нажал, а не пропустил — это разные ошибки');
    expect(g.meanRtMs, isNull, reason: 'время реакции копится только с нажатий на цель');
  });

  test('🔴 молчание на цели — пропуск, молчание на запрете — верное удержание', () {
    final g = GoNoGoGame(level: 1, rnd: _Queue([0.9, 0.5, 0.1, 0.5]), nowMs: () => 0);
    g.begin();
    g.nextTrial();
    expect(g.closeTrial(), GoNoGoOutcome.miss);
    g.nextTrial();
    expect(g.closeTrial(), GoNoGoOutcome.correctRejection);
    expect(g.misses, 1);
    expect(g.correctRejections, 1);
    expect(g.falseAlarms, 0);
  });

  test('🔴 точность считается по ВСЕМ четырём исходам, а не по нажатиям', () {
    /**
     * ⚠️ РАСКЛАД ПОДОБРАН ТАК, ЧТОБЫ ДВЕ ФОРМУЛЫ РАСХОДИЛИСЬ. Первая редакция брала
     * по одному исходу каждого вида: тогда «верные из всех проб» и «попадания из
     * нажатий» дают ОДНО И ТО ЖЕ 0,5, и проба спокойно проходила подмену формулы —
     * мутация это показала. Здесь 2 попадания, 1 удержание, 1 пропуск, 0 ложных:
     * верно — 0,75, а подмена дала бы 1,0.
     */
    final g = GoNoGoGame(level: 1, rnd: _Queue([0.9, 0.5, 0.9, 0.5, 0.1, 0.5, 0.9, 0.5]), nowMs: () => 0);
    g.begin();
    g.nextTrial(); g.respond(); g.closeTrial();          // попадание
    g.nextTrial(); g.respond(); g.closeTrial();          // попадание
    g.nextTrial(); g.closeTrial();                        // верное удержание
    g.nextTrial(); g.closeTrial();                        // пропуск
    expect(g.total, 4);
    expect(g.hits, 2);
    expect(g.correctRejections, 1);
    expect(g.misses, 1);
    expect(g.falseAlarms, 0);
    expect(g.accuracy, 0.75, reason: '(2 попадания + 1 удержание) из четырёх проб');
  });

  test('🔴 межпробная пауза берётся из уровня и попадает в диапазон', () {
    final g = GoNoGoGame(level: 1, rnd: _Queue([0.9, 0.0]), nowMs: () => 0);
    g.nextTrial();
    g.closeTrial();
    expect(g.itiMs, 600, reason: 'L1: нижняя граница паузы при розыгрыше 0');
    final g2 = GoNoGoGame(level: 1, rnd: _Queue([0.9, 0.999]), nowMs: () => 0);
    g2.nextTrial();
    g2.closeTrial();
    expect(g2.itiMs, 999, reason: 'L1: 600 + floor(0,999 · 400)');
  });

  test('🔴 очки — формулой веб-версии: попадание +10, ложная тревога −10', () {
    final g = GoNoGoGame(level: 1, rnd: _Queue([0.9, 0.5, 0.1, 0.5]), nowMs: () => 0);
    g.begin();
    g.nextTrial(); g.respond(); g.closeTrial();
    g.nextTrial(); g.respond(); g.closeTrial();
    expect(g.score, 0, reason: '10 − 10');
    expect(g.hits, 1);
    expect(g.falseAlarms, 1);
  });

  test('🔴 повторное нажатие в той же пробе ничего не добавляет', () {
    final g = GoNoGoGame(level: 1, rnd: _Queue([0.9, 0.5]), nowMs: () => 0);
    g.begin();
    g.nextTrial();
    expect(g.respond(), GoNoGoOutcome.hit);
    expect(g.respond(), isNull);
    expect(g.hits, 1);
  });
}

/// Случайность заданной очередью.
class _Queue implements Random {
  _Queue(this.values);
  final List<double> values;
  int i = 0;

  @override
  double nextDouble() => values[i++ % values.length];

  @override
  int nextInt(int max) => (nextDouble() * max).floor();

  @override
  bool nextBool() => nextDouble() < 0.5;
}
