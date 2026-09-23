import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/flanker/model.dart';

/// СВЕРКА «СТРЕЛОК» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Правила лежат в `frontend/app/games/flanker.tsx`. Проверять перенос той же
/// формулой, которой переносил, нельзя — такая проба зелёная всегда. Поэтому
/// значения ВЫГРУЖЕНЫ прогоном самого TS (levelParams L1…L15, levelCondition,
/// makeTrial на заданной очереди случайных чисел) в
/// `test/fixtures/flanker-reference.json`.
///
/// 🔴 В эталон попал и ПОРЯДОК обращений к случайности: направление центра, потом
/// вид пробы. Перепутанный порядок покраснеет, даже если каждая формула верна.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/flanker-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  double Function() queue(List<double> values) {
    var i = 0;
    return () => values[i++ % values.length];
  }

  test('🔴 доли конфликтных и согласованных — те же константы, что в живом коде', () {
    expect(flankerPCong, ref['pCong']);
    expect(flankerPIncong, ref['pIncong']);
    expect(flankerGapMax, ref['gapMax']);
    expect(flankerGapMin, ref['gapMin']);
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = FlankerLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём проб');
      expect(l.windowMs, row['windowMs'], reason: '$at: окно ответа');
      expect(l.gapPx, (row['gapPx'] as num).toDouble(), reason: '$at: разнос цель↔фланги');
      expect(l.pCong, row['pCong'], reason: '$at: доля согласованных');
      expect(l.pIncong, row['pIncong'], reason: '$at: доля конфликтных');
      expect(flankerRowWidthPx(l.gapPx), (row['rowWidthPx'] as num).toDouble(), reason: '$at: ширина ряда');
    }
  });

  test('🔴 условие уровня меняется монотонно: окно вниз, разнос вниз, объём вверх', () {
    // Лестница обязана вести ВНИЗ по сроку и разносу — иначе «уровень» не трудность.
    for (var l = 2; l <= 15; l++) {
      final a = FlankerLevel.of(l - 1);
      final b = FlankerLevel.of(l);
      expect(b.windowMs <= a.windowMs, isTrue, reason: 'L$l: окно выросло');
      expect(b.gapPx <= a.gapPx, isTrue, reason: 'L$l: разнос вырос');
      expect(b.trials >= a.trials, isTrue, reason: 'L$l: объём упал');
    }
    expect(FlankerLevel.of(1).windowMs - FlankerLevel.of(15).windowMs, 2000);
    expect(FlankerLevel.of(1).gapPx - FlankerLevel.of(15).gapPx, 24);
  });

  test('🔴 ряд стимулов влезает в телефон 360 px на каждом уровне', () {
    // То же требование, что стережёт веб-гейт: при разносе 34 px ряд 336 px
    // вылезал за экран, и это ровно та жалоба «экран разъезжается».
    for (var l = 1; l <= 15; l++) {
      final w = flankerRowWidthPx(FlankerLevel.of(l).gapPx);
      expect(w <= 360, isTrue, reason: 'L$l: ряд $w px шире телефона 360 px');
    }
  });

  test('🔴 пробы рождаются те же и в том же порядке, что в живом TS', () {
    final qv = (ref['очередьСлучайных'] as List).cast<num>().map((e) => e.toDouble()).toList();
    final rnd = queue(qv);
    final rows = (ref['trials'] as List).cast<Map<String, dynamic>>();
    for (var i = 0; i < rows.length; i++) {
      final want = rows[i];
      final got = makeTrial(flankerPCong, flankerPIncong, rnd);
      final at = 'проба ${i + 1} (r=${want['r']})';
      expect(got.center.name, want['center'], reason: '$at: направление центра');
      expect(got.kind.name, want['kind'], reason: '$at: вид пробы');
      if (want['flankers'] == null) {
        expect(got.flankers, isNull, reason: '$at: у нейтральной флангов нет');
      } else {
        expect(got.flankers!.map((d) => d.name).toList(), (want['flankers'] as List).cast<String>(),
            reason: '$at: фланги');
      }
    }
  });

  test('🔴 граница видов считается сложением долей, а не зашитым 0,85', () {
    // 0,40 + 0,45 в двоичной плавающей точке = 0,8500000000000001, поэтому ровно
    // 0,85 даёт КОНФЛИКТНУЮ пробу. В эталоне эта строка есть; зашитое 0.85 дало бы
    // нейтральную, и перенос разошёлся бы с веб-версией именно здесь.
    final t = makeTrial(flankerPCong, flankerPIncong, queue([0.0, 0.85]));
    expect(t.kind, FlankerKind.incongruent);
    final above = makeTrial(flankerPCong, flankerPIncong, queue([0.0, 0.851]));
    expect(above.kind, FlankerKind.neutral);
    // И нижняя граница: ровно 0,40 — уже не согласованная.
    expect(makeTrial(flankerPCong, flankerPIncong, queue([0.0, 0.40])).kind, FlankerKind.incongruent);
    expect(makeTrial(flankerPCong, flankerPIncong, queue([0.0, 0.399])).kind, FlankerKind.congruent);
  });

  test('🔴 партия берёт случайность в порядке: центр → вид → подготовительный интервал', () {
    // Третий розыгрыш идёт на интервал 500 + floor(r*600). Перепутанный порядок
    // сдвинул бы и вид пробы, и длительность ожидания.
    final g = FlankerGame(level: 1, rnd: _Queue([0.1, 0.05, 0.5]), nowMs: () => 0);
    g.nextTrial();
    expect(g.trial!.center, FlankerDirection.left, reason: 'первый розыгрыш — центр');
    expect(g.trial!.kind, FlankerKind.congruent, reason: 'второй розыгрыш — вид пробы');
    expect(g.preDelayMs, 800, reason: 'третий розыгрыш — подготовительный интервал');
  });

  test('🔴 время реакции считается от ПОКАЗА стимула, а не от рождения пробы', () {
    var clock = 0;
    final g = FlankerGame(level: 1, rnd: _Queue([0.1, 0.05, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    clock += 800;              // подготовительный интервал прошёл
    g.showStimulus();
    clock += 420;              // столько думал человек
    expect(g.answer(FlankerDirection.left), FlankerOutcome.hit);
    expect(g.meanRtMs, 420, reason: 'ожидание перед стимулом в время реакции попадать не должно');
  });

  test('🔴 до показа стимула ответ не принимается', () {
    final g = FlankerGame(level: 1, rnd: _Queue([0.1, 0.05, 0.5]), nowMs: () => 0);
    g.nextTrial();
    expect(g.answer(FlankerDirection.left), FlankerOutcome.miss);
    expect(g.hits, 0);
    expect(g.meanRtMs, isNull, reason: 'угадывать вслепую — не ответ');
  });

  test('🔴 эффект фланкера — разность средних, и копится только с ВЕРНЫХ проб', () {
    var clock = 0;
    // Очередь даёт по порядку: согласованную, конфликтную, конфликтную.
    final g = FlankerGame(
      level: 1,
      rnd: _Queue([0.1, 0.05, 0.5, 0.1, 0.5, 0.5, 0.1, 0.5, 0.5]),
      nowMs: () => clock,
    );
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 400; g.answer(FlankerDirection.left);   // соглас., верно
    g.nextTrial(); g.showStimulus(); clock += 600; g.answer(FlankerDirection.left);   // конфл., верно
    g.nextTrial(); g.showStimulus(); clock += 5000; g.answer(FlankerDirection.right); // конфл., ОШИБКА
    expect(g.hits, 2);
    expect(g.errors, 1);
    expect(g.flankerEffectMs, 200, reason: '600 − 400; ошибочная проба во время не идёт');
    expect(g.meanRtMs, 500, reason: 'среднее по верным: (400 + 600) / 2');
  });

  test('🔴 нейтральные пробы в разность не подмешиваются', () {
    // Эффект — разность ДВУХ половин. Нейтральная проба (чёрточки вместо флангов)
    // не относится ни к одной: свали её к согласованным — и разность поедет,
    // оставшись на вид тем же числом.
    var clock = 0;
    final g = FlankerGame(
      level: 1,
      rnd: _Queue([0.1, 0.05, 0.5, 0.1, 0.5, 0.5, 0.1, 0.99, 0.5]),
      nowMs: () => clock,
    );
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 400; g.answer(FlankerDirection.left);
    g.nextTrial(); g.showStimulus(); clock += 600; g.answer(FlankerDirection.left);
    g.nextTrial(); expect(g.trial!.kind, FlankerKind.neutral); g.showStimulus(); clock += 1000; g.answer(FlankerDirection.left);
    expect(g.flankerEffectMs, 200, reason: 'нейтральная 1000 мс не должна попасть ни в одну половину');
    expect(g.meanRtMs, 667, reason: 'в среднее время нейтральная входит: (400 + 600 + 1000) / 3');
  });

  test('🔴 без одной из половин эффект пустой, а не ноль', () {
    var clock = 0;
    final g = FlankerGame(level: 1, rnd: _Queue([0.1, 0.05, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 400; g.answer(FlankerDirection.left);
    expect(g.flankerEffectMs, isNull, reason: 'ноль означал бы «конфликт не мешает» — это другое утверждение');
    expect(g.meanRtMs, 400);
  });

  test('🔴 просрочка окна — ошибка, и время реакции с неё не копится', () {
    var clock = 0;
    final g = FlankerGame(level: 1, rnd: _Queue([0.1, 0.05, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    g.showStimulus();
    clock += 9000;
    expect(g.timeout(), FlankerOutcome.miss);
    expect(g.errors, 1, reason: 'пропуск обязан считаться ошибкой, а не пропускаться молча');
    expect(g.misses, 1);
    expect(g.meanRtMs, isNull);
    // Повторная просрочка той же пробы ничего не добавляет.
    expect(g.timeout(), FlankerOutcome.miss);
    expect(g.errors, 1);
  });

  test('🔴 точность считается от полного объёма партии, а не от отвеченных проб', () {
    var clock = 0;
    final g = FlankerGame(level: 1, rnd: _Queue([0.1, 0.05, 0.5]), nowMs: () => clock, trialsOverride: 4);
    g.begin();
    for (var i = 0; i < 2; i++) {
      g.nextTrial();
      g.showStimulus();
      clock += 300;
      g.answer(g.trial!.center);
    }
    expect(g.accuracy, 0.5, reason: '2 верных из 4 проб партии');
  });

  test('🔴 очки — формулой веб-версии, иначе статистика разойдётся при переезде', () {
    var clock = 0;
    final g = FlankerGame(level: 1, rnd: _Queue([0.1, 0.05, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 400; g.answer(FlankerDirection.left);
    g.nextTrial(); g.showStimulus(); clock += 400; g.answer(FlankerDirection.right); // ошибка
    // h·80 − e·60 − среднее·0,05 = 80 − 60 − 20 = 0
    expect(g.score, max(0, (1 * 80 - 1 * 60 - 400 * 0.05).round()));
    expect(g.score, 0);
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
