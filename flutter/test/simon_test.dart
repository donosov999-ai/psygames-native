import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/simon/model.dart';

/// СВЕРКА «ЦВЕТ ПРОТИВ ПОЗИЦИИ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/simon.tsx` в
/// `test/fixtures/simon-reference.json` вместе с очередью случайных чисел:
/// levelParams L1…L15 и makeTrial. Проверять перенос той же формулой, которой
/// переносил, нельзя — такая проба зелёная всегда.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/simon-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  double Function() queue(List<double> values) {
    var i = 0;
    return () => values[i++ % values.length];
  }

  test('🔴 доля конфликтных — та же константа, что в живом коде', () {
    expect(simonIncongruentProb, ref['incongruentProb']);
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = SimonLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём проб');
      expect(l.windowMs, row['windowMs'], reason: '$at: окно ответа');
      expect(l.preMinMs, row['preMinMs'], reason: '$at: пауза перед стимулом');
      expect(l.preJitterMs, row['preJitterMs'], reason: '$at: дрожание паузы');
    }
  });

  test('🔴 темп растёт монотонно: окно, пауза и дрожание только вниз, объём только вверх', () {
    for (var l = 2; l <= 15; l++) {
      final a = SimonLevel.of(l - 1);
      final b = SimonLevel.of(l);
      expect(b.windowMs <= a.windowMs, isTrue, reason: 'L$l: окно выросло');
      expect(b.preMinMs <= a.preMinMs, isTrue, reason: 'L$l: пауза выросла');
      expect(b.preJitterMs <= a.preJitterMs, isTrue, reason: 'L$l: дрожание выросло');
      expect(b.trials >= a.trials, isTrue, reason: 'L$l: объём упал');
    }
    expect(SimonLevel.of(15).windowMs, 920);
    expect(SimonLevel.of(15).preMinMs, 250);
    expect(SimonLevel.of(15).preJitterMs, 200);
  });

  test('🔴 пробы рождаются те же и в том же порядке, что в живом TS', () {
    final qv = (ref['очередьСлучайных'] as List).cast<num>().map((e) => e.toDouble()).toList();
    final rnd = queue(qv);
    final rows = (ref['trials'] as List).cast<Map<String, dynamic>>();
    for (var i = 0; i < rows.length; i++) {
      final want = rows[i];
      final got = makeTrial(rnd);
      final at = 'проба ${i + 1} (r=${want['r']})';
      expect(got.color.name, want['color'], reason: '$at: цвет квадрата');
      expect(got.position.name, want['position'], reason: '$at: сторона вспышки');
      expect(got.kind.name, want['kind'], reason: '$at: вид пробы');
    }
  });

  test('🔴 ровно 0,5 — красный и согласованная проба: сравнение строгое', () {
    // Обе строки есть в эталоне. Нестрогое сравнение перевернуло бы и цвет, и вид.
    final t = makeTrial(queue([0.5, 0.5]));
    expect(t.color, SimonColor.red);
    expect(t.kind, SimonKind.congruent);
    expect(t.position, SimonSide.right, reason: 'у согласованной сторона совпадает с верной кнопкой');
  });

  test('🔴 правило игры: синий — левая кнопка, красный — правая', () {
    expect(correctSide(SimonColor.blue), SimonSide.left);
    expect(correctSide(SimonColor.red), SimonSide.right);
    // У конфликтной пробы сторона ПРОТИВОПОЛОЖНА верной кнопке — в этом вся проба.
    final t = makeTrial(queue([0.1, 0.1]));
    expect(t.kind, SimonKind.incongruent);
    expect(t.color, SimonColor.blue);
    expect(t.position, SimonSide.right, reason: 'синий слева по правилу, а вспыхнул справа');
  });

  test('🔴 партия берёт случайность в порядке: цвет → конфликтность → пауза', () {
    final g = SimonGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5]), nowMs: () => 0);
    g.nextTrial();
    expect(g.trial!.color, SimonColor.blue, reason: 'первый розыгрыш — цвет');
    expect(g.trial!.kind, SimonKind.incongruent, reason: 'второй розыгрыш — конфликтность');
    // L1: пауза 500 + floor(0,5 · 600) = 800.
    expect(g.preDelayMs, 800, reason: 'третий розыгрыш — пауза перед стимулом');
  });

  test('🔴 время реакции считается от ПОКАЗА стимула, а не от рождения пробы', () {
    var clock = 0;
    final g = SimonGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    clock += 800;                 // пауза перед стимулом
    g.showStimulus();
    clock += 390;                 // столько думал человек
    expect(g.answer(SimonSide.left), SimonOutcome.hit);
    expect(g.meanRtMs, 390, reason: 'пауза перед стимулом в время реакции попадать не должна');
  });

  test('🔴 до показа стимула ответ не принимается', () {
    final g = SimonGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5]), nowMs: () => 0);
    g.nextTrial();
    expect(g.answer(SimonSide.left), SimonOutcome.miss);
    expect(g.hits, 0);
  });

  test('🔴 эффект Саймона — разность средних, и копится только с ВЕРНЫХ проб', () {
    var clock = 0;
    // Очередь: конфликтная (синий справа), согласованная (синий слева), конфликтная.
    final g = SimonGame(
      level: 1,
      rnd: _Queue([0.1, 0.1, 0.5, 0.1, 0.9, 0.5, 0.1, 0.1, 0.5]),
      nowMs: () => clock,
    );
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 700; g.answer(SimonSide.left);   // конфл., верно
    g.nextTrial(); g.showStimulus(); clock += 500; g.answer(SimonSide.left);   // соглас., верно
    g.nextTrial(); g.showStimulus(); clock += 9000; g.answer(SimonSide.right); // конфл., ОШИБКА
    expect(g.hits, 2);
    expect(g.errors, 1);
    expect(g.simonEffectMs, 200, reason: '700 − 500; ошибочная проба во время не идёт');
    expect(g.meanRtMs, 600);
  });

  test('🔴 без одной из половин эффект пустой, а не ноль', () {
    var clock = 0;
    final g = SimonGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 700; g.answer(SimonSide.left);
    expect(g.simonEffectMs, isNull);
  });

  test('🔴 просрочка окна — ошибка, и время реакции с неё не копится', () {
    var clock = 0;
    final g = SimonGame(level: 1, rnd: _Queue([0.1, 0.1, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    g.showStimulus();
    clock += 9000;
    expect(g.timeout(), SimonOutcome.miss);
    expect(g.errors, 1);
    expect(g.misses, 1);
    expect(g.meanRtMs, isNull);
  });

  test('🔴 очки — формулой веб-версии, со штрафом за положительный эффект', () {
    var clock = 0;
    final g = SimonGame(
      level: 1,
      rnd: _Queue([0.1, 0.1, 0.5, 0.1, 0.9, 0.5]),
      nowMs: () => clock,
    );
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 700; g.answer(SimonSide.left);
    g.nextTrial(); g.showStimulus(); clock += 500; g.answer(SimonSide.left);
    // h·80 − e·60 − среднее·0,05 − эффект·0,3 = 160 − 0 − 30 − 60 = 70
    expect(g.score, max(0, (2 * 80 - 0 * 60 - 600 * 0.05 - 200 * 0.3).round()));
    expect(g.score, 70);
  });
}

/// Случайность заданной очередью: и порядок, и значения под контролем пробы.
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
