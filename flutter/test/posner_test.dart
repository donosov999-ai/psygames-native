import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/posner/model.dart';

/// СВЕРКА «ПОЗИЦИИ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/posner.tsx` в
/// `test/fixtures/posner-reference.json`: levelParams L1…L15, levelCondition и
/// makeTrial на заданной очереди случайных чисел вместе с числом взятых розыгрышей.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/posner-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 доля верных подсказок и потолок лестницы — те же, что в живом коде', () {
    expect(validRatio, ref['validRatio']);
    expect(posnerMaxLevel, ref['maxLevel']);
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = PosnerLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём проб');
      expect(l.windowMs, row['windowMs'], reason: '$at: окно ответа');
      expect(l.soaMinMs, row['soaMinMs'], reason: '$at: нижняя граница SOA');
      expect(l.soaMaxMs, row['soaMaxMs'], reason: '$at: верхняя граница SOA');
    }
  });

  test('🔴 растёт именно РАЗБРОС паузы: низ вниз, верх вверх, окно вниз', () {
    for (var l = 2; l <= 15; l++) {
      final a = PosnerLevel.of(l - 1);
      final b = PosnerLevel.of(l);
      expect(b.windowMs <= a.windowMs, isTrue, reason: 'L$l: окно выросло');
      expect(b.soaMinMs <= a.soaMinMs, isTrue, reason: 'L$l: низ SOA вырос');
      expect(b.soaMaxMs >= a.soaMaxMs, isTrue, reason: 'L$l: верх SOA упал');
    }
    final first = PosnerLevel.of(1);
    final last = PosnerLevel.of(15);
    expect(last.soaMaxMs - last.soaMinMs > first.soaMaxMs - first.soaMinMs, isTrue,
        reason: 'момент появления мишени обязан становиться менее предсказуемым');
  });

  test('🔴 пробы рождаются те же, и число взятых розыгрышей совпадает', () {
    for (final row in (ref['trials'] as List).cast<Map<String, dynamic>>()) {
      final taken = (row['взятые'] as List).cast<num>().map((e) => e.toDouble()).toList();
      var i = 0;
      final got = makeTrial(() => taken[i++]);
      expect(i, taken.length, reason: 'розыгрышей взято ${taken.length}, а функция взяла $i');
      expect(got.validity.name, row['validity'], reason: 'вид подсказки при $taken');
      expect(got.targetSide.name, row['targetSide'], reason: 'сторона мишени при $taken');
      expect(got.cueDir?.name, row['cueDir'], reason: 'куда показывает подсказка при $taken');
    }
  });

  test('🔴 границы видов подсказки те же, что в живом коде', () {
    /**
     * ⚠️ ЗДЕСЬ СУММА ДОЛЕЙ РОВНО РАВНА 0,85 (проверено: 0.7 + 0.15 === 0.85 и в JS,
     * и в Dart), поэтому подмена «зашить 0.85» РАВНОСИЛЬНА — мутация её не краснит,
     * и это свойство чисел, а не слепота пробы. У соседа-фланкера те же на вид доли
     * ведут себя иначе: 0.40 + 0.45 === 0.8500000000000001, и там подмена ловится.
     * Сложение оставлено: зашитое число разъедется, если доли когда-нибудь поменяют.
     */
    expect(makeTrial(_queue([0.85, 0.9])).validity, CueValidity.invalid);
    expect(makeTrial(_queue([0.8499, 0.1])).validity, CueValidity.neutral);
    expect(makeTrial(_queue([0.70, 0.1])).validity, CueValidity.neutral);
    expect(makeTrial(_queue([0.6999, 0.9])).validity, CueValidity.valid);
  });

  test('🔴 у обманной подсказки сторона ПРОТИВОПОЛОЖНА мишени, у нейтральной её нет', () {
    final invalid = makeTrial(_queue([0.9, 0.1]));
    expect(invalid.validity, CueValidity.invalid);
    expect(invalid.targetSide, PosnerSide.left);
    expect(invalid.cueDir, PosnerSide.right);
    final neutral = makeTrial(_queue([0.8, 0.9]));
    expect(neutral.validity, CueValidity.neutral);
    expect(neutral.cueDir, isNull);
  });

  test('🔴 партия берёт случайность в порядке: вид → сторона → пауза до подсказки → SOA', () {
    final g = PosnerGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5, 0.5]), nowMs: () => 0);
    g.nextTrial();
    expect(g.trial!.validity, CueValidity.valid);
    expect(g.trial!.targetSide, PosnerSide.left);
    expect(g.cueDelayMs, 800, reason: 'третий розыгрыш — пауза до подсказки: 600 + floor(0,5·400)');
    expect(g.soaMs, 200, reason: 'четвёртый — SOA: 150 + floor(0,5·(250−150))');
  });

  test('🔴 время реакции считается от показа МИШЕНИ, а не от подсказки', () {
    var clock = 0;
    final g = PosnerGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    clock += 800;           // ждали подсказку
    g.showCue();
    clock += 100;           // подсказка повисела
    g.hideCue();
    clock += 200;           // пауза SOA
    g.showTarget();
    clock += 410;           // столько думал человек
    expect(g.answer(PosnerSide.left), PosnerOutcome.hit);
    expect(g.meanRtMs, 410, reason: 'ожидание до мишени в время реакции попадать не должно');
  });

  test('🔴 до показа мишени ответ не принимается', () {
    final g = PosnerGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5, 0.5]), nowMs: () => 0);
    g.nextTrial();
    g.showCue();
    expect(g.answer(PosnerSide.left), PosnerOutcome.miss);
    expect(g.hits, 0);
  });

  test('🔴 выигрыш от подсказки — разность средних, и копится только с ВЕРНЫХ ответов', () {
    var clock = 0;
    // Очередь на три пробы: валидная, обманная, обманная (третью отвечаем неверно).
    final g = PosnerGame(
      level: 1,
      rnd: _Queue([0.1, 0.1, 0.5, 0.5, 0.9, 0.1, 0.5, 0.5, 0.9, 0.1, 0.5, 0.5]),
      nowMs: () => clock,
    );
    g.begin();
    g.nextTrial(); g.showTarget(); clock += 400; g.answer(PosnerSide.left);    // валидная, верно
    g.nextTrial(); g.showTarget(); clock += 520; g.answer(PosnerSide.left);    // обманная, верно
    g.nextTrial(); g.showTarget(); clock += 900; g.answer(PosnerSide.right);   // обманная, ОШИБКА
    expect(g.hits, 2);
    expect(g.errors, 1);
    expect(g.validityEffectMs, 120, reason: '520 − 400; ошибочная проба в разность не идёт');
    expect(g.meanRtMs, 460);
  });

  test('🔴 нейтральные пробы в разность не подмешиваются', () {
    // Выигрыш — разность ДВУХ половин: валидные и обманные. Нейтральная проба
    // (подсказки нет вовсе) не относится ни к одной; свали её к валидным — и
    // разность поедет, оставшись на вид тем же числом.
    var clock = 0;
    final g = PosnerGame(
      level: 1,
      // валидная · нейтральная · обманная
      rnd: _Queue([0.1, 0.1, 0.5, 0.5, 0.8, 0.1, 0.5, 0.5, 0.9, 0.1, 0.5, 0.5]),
      nowMs: () => clock,
    );
    g.begin();
    g.nextTrial(); g.showTarget(); clock += 400; g.answer(g.trial!.targetSide);
    g.nextTrial();
    expect(g.trial!.validity, CueValidity.neutral);
    g.showTarget(); clock += 1000; g.answer(g.trial!.targetSide);
    g.nextTrial(); g.showTarget(); clock += 520; g.answer(g.trial!.targetSide);
    expect(g.validityEffectMs, 120, reason: 'нейтральная 1000 мс не должна попасть ни в одну половину');
    expect(g.meanRtMs, 640, reason: 'в среднее время нейтральная входит: (400 + 1000 + 520) / 3');
  });

  test('🔴 без одной из половин выигрыш пустой, а не ноль', () {
    var clock = 0;
    final g = PosnerGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial(); g.showTarget(); clock += 400; g.answer(PosnerSide.left);
    expect(g.validityEffectMs, isNull, reason: 'ноль означал бы «подсказка не помогает»');
  });

  test('🔴 просрочка окна — ошибка, и точность считается от полного объёма', () {
    final g = PosnerGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5, 0.5]), nowMs: () => 0, trialsOverride: 4);
    g.begin();
    g.nextTrial(); g.showTarget();
    expect(g.timeout(), PosnerOutcome.miss);
    expect(g.errors, 1);
    g.nextTrial(); g.showTarget(); g.answer(PosnerSide.left);
    expect(g.accuracy, 0.25, reason: '1 верная из четырёх проб партии');
  });

  test('🔴 очки — формулой веб-версии', () {
    var clock = 0;
    final g = PosnerGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial(); g.showTarget(); clock += 400; g.answer(PosnerSide.left);
    expect(g.score, max(0, (1 * 80 - 0 * 60 - 400 * 0.05).round()));
    expect(g.score, 60);
  });
}

double Function() _queue(List<double> values) {
  var i = 0;
  return () => values[i++ % values.length];
}

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
