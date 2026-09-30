import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/inhibition/model.dart';

/// СВЕРКА «ТОРМОЖЕНИЯ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/inhibition.tsx` (VER 4) в
/// `test/fixtures/inhibition-reference.json`: лестница L1…L15, обе доли и замер
/// доли запретных по 200 000 розыгрышей.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/inhibition-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 обе доли и потолок лестницы — те же, что в живом коде', () {
    expect(inhibitionStopProb, ref['stopProb']);
    expect(inhibitionNogoProb, ref['nogoProb'], reason: 'доля запретных разошлась с go-no-go');
    expect(inhibitionMaxLevel, ref['maxLevel']);
    // ⚠️ Обе доли равны канону 25 % (Verbruggen 2019). Совпадение между собой
    // НЕ случайно: в веб-версии доля запретных берётся импортом из go-no-go,
    // чтобы два экрана с одним game_type не могли разойтись.
    expect(inhibitionStopProb, 0.25);
    expect(inhibitionNogoProb, 0.25);
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = InhibitionLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём проб');
      expect(l.stopProb, row['stopProb'], reason: '$at: доля стоп-проб');
      expect(l.ssdMs, row['ssd'], reason: '$at: задержка стоп-сигнала');
      expect(l.goWindowMs, row['goWindow'], reason: '$at: окно ответа');
      expect(l.condition, (row['condition'] as Map).cast<String, Object?>(),
          reason: '$at: условие, при котором снята мера');
    }
  });

  test('🔴 доля стоп-проб НЕ ось сложности: 0,25 на всех пятнадцати', () {
    for (var l = 1; l <= inhibitionMaxLevel; l++) {
      expect(InhibitionLevel.of(l).stopProb, 0.25, reason: 'L$l: доля поехала');
    }
    // Замер 16.09.2026 на прежней формуле min(0.35, 0.20 + (L−1)·0.011):
    // стоп-проб на партию 4,0 (L1) → 11,2 (L15). Сейчас — ровно по объёму.
    expect(InhibitionLevel.of(1).trials * inhibitionStopProb, 5.0);
    expect(InhibitionLevel.of(15).trials * inhibitionStopProb, 8.0);
  });

  test('🔴 три оси растут и каждая доходит до края', () {
    for (var l = 2; l <= inhibitionMaxLevel; l++) {
      final a = InhibitionLevel.of(l - 1);
      final b = InhibitionLevel.of(l);
      expect(b.ssdMs >= a.ssdMs, isTrue, reason: 'L$l: задержка упала');
      expect(b.goWindowMs <= a.goWindowMs, isTrue, reason: 'L$l: окно выросло');
      expect(b.trials >= a.trials, isTrue, reason: 'L$l: проб стало меньше');
    }
    expect(InhibitionLevel.of(1).ssdMs, 150);
    expect(InhibitionLevel.of(15).ssdMs, 480);
    expect(InhibitionLevel.of(1).goWindowMs, 1300);
    expect(InhibitionLevel.of(15).goWindowMs, 852);
    expect(InhibitionLevel.of(1).trials, 20);
    expect(InhibitionLevel.of(15).trials, 32);
  });

  test('🔴 потолки держатся и за потолком лестницы', () {
    // Без min/max задержка ушла бы выше 480, а окно — ниже 850.
    expect(150 + (25 - 1) * 24, greaterThan(480));
    expect(1300 - (25 - 1) * 32, lessThan(850));
    expect(InhibitionLevel.of(25).ssdMs, 480);
    expect(InhibitionLevel.of(25).goWindowMs, 850);
    // ⚠️ Потолок задержки срабатывает уже НА L15 (480 ровно), а пол окна — нет:
    // на L15 окно 852, до 850 оно не доходит вовсе.
    expect(InhibitionLevel.of(15).ssdMs, 480);
    expect(InhibitionLevel.of(15).goWindowMs, 852);
  });

  test('🔴 «Микс» чередует парадигмы через раунд, а не бросает монету', () {
    // Случайный выбор дал бы партии с перекосом, и два человека с одинаковым
    // числом ошибок ошибались бы в разном.
    for (var r = 0; r < 12; r++) {
      expect(pickTrialKind(SubMode.mixed, r), r.isEven ? TrialKind.gng : TrialKind.ss, reason: 'раунд $r');
      expect(pickTrialKind(SubMode.goNoGo, r), TrialKind.gng);
      expect(pickTrialKind(SubMode.stopSignal, r), TrialKind.ss);
    }
    final kinds = [for (var r = 0; r < 32; r++) pickTrialKind(SubMode.mixed, r)];
    expect(kinds.where((k) => k == TrialKind.gng).length, 16, reason: 'перекос в «Миксе»');
  });

  test('🔴 доля запретных держится на замере: 0,25 ± 0,01 на 200 000 розыгрышей', () {
    // Эталон живого TS — там ровно такой же прогон.
    expect(ref['замер доли запретных']['доля'], closeTo(0.25, 0.01));
    final rnd = Random(4);
    const n = 200000;
    var nogo = 0;
    for (var i = 0; i < n; i++) {
      if (pickGngStimulus(rnd.nextDouble) == GngStim.nogo) nogo++;
    }
    expect(nogo / n, closeTo(0.25, 0.01), reason: 'вышло ${nogo / n}');
  });

  test('🔴 Go/No-Go: жать на «go» — попадание, на «нельзя» — ошибка торможения', () {
    var now = 0;
    final g = InhibitionGame(level: 1, rnd: Random(2), nowMs: () => now, trialsOverride: 40);
    g.begin();
    var hits = 0, fas = 0;
    while (g.nextTrial()) {
      now += 400;
      // Жмём ВСЕГДА: на запретных это ошибка торможения.
      final out = g.press();
      if (out == InhibitionOutcome.hit) hits++;
      if (out == InhibitionOutcome.falseAlarm) fas++;
    }
    expect(hits + fas, 40, reason: 'какая-то проба не получила исхода');
    expect(fas, greaterThan(0), reason: 'ни одной запретной на 40 пробах');
    expect(hits, greaterThan(0));
    expect(g.misses, 0);
    expect(g.correctRejections, 0);
    expect(g.rts.length, hits, reason: 'время записано и с ошибок');
    expect(g.meanRtMs, 400);
    expect(g.inhibitionCommission, fas);
  });

  test('🔴 Go/No-Go: не жать на «нельзя» — верное торможение, на «go» — пропуск', () {
    var now = 0;
    final g = InhibitionGame(level: 1, rnd: Random(2), nowMs: () => now, trialsOverride: 40);
    g.begin();
    var miss = 0, cr = 0;
    while (g.nextTrial()) {
      now += 1400;
      final out = g.timeout();
      if (out == InhibitionOutcome.miss) miss++;
      if (out == InhibitionOutcome.correctReject) cr++;
    }
    expect(miss + cr, 40);
    expect(cr, greaterThan(0));
    expect(miss, greaterThan(0));
    expect(g.falseAlarms, 0);
    expect(g.rts, isEmpty, reason: 'время записано без нажатия');
    // Точность считается по ЧЕТЫРЁМ исходам: верных = попадания + торможения.
    expect(g.accuracy, cr / 40);
  });

  test('🔴 Стоп-сигнал: нажал после стоп-сигнала — ошибка, не нажал — верное торможение', () {
    var now = 0;
    final g = InhibitionGame(level: 1, mode: SubMode.stopSignal, rnd: Random(6), nowMs: () => now, trialsOverride: 60);
    g.begin();
    var fa = 0, cr = 0, hit = 0;
    while (g.nextTrial()) {
      now += g.fixationMs();
      g.showSsGo();
      if (g.isStopTrial) {
        now += g.params.ssdMs;
        g.showSsStop();
        // На половине стоп-проб жмём, на половине держимся.
        if (fa <= cr) {
          now += 120;
          expect(g.press(), InhibitionOutcome.falseAlarm);
          fa++;
        } else {
          now += g.params.goWindowMs;
          expect(g.timeout(), InhibitionOutcome.correctReject);
          cr++;
        }
      } else {
        now += 300;
        expect(g.press(), InhibitionOutcome.hit);
        // ⚠️ Именно 300, а не 300 + пауза: отсчёт идёт от «жми». Проба, которая
        // сверяет только ЧИСЛО записанных времён, подмены начала не видит.
        expect(g.rts.last, 300, reason: 'в время реакции попала пауза перед «жми»');
        hit++;
      }
    }
    expect(fa + cr + hit, 60);
    expect(fa, greaterThan(0));
    expect(cr, greaterThan(0));
    expect(g.misses, 0);
    // ⚠️ Время реакции копится только с обычных проб: на стоп-пробе нажатие —
    // это ОШИБКА, и его время не про скорость.
    expect(g.rts.length, hit);
  });

  test('🔴 нажатие до «жми» не засчитывается, и второе нажатие тоже', () {
    var now = 0;
    final g = InhibitionGame(level: 1, mode: SubMode.stopSignal, rnd: Random(3), nowMs: () => now, trialsOverride: 2);
    g.begin();
    g.nextTrial();
    expect(g.press(), isNull, reason: 'нажатие до сигнала «жми»');
    expect(g.total, 0);
    now += 700;
    g.showSsGo();
    now += 250;
    final first = g.press();
    expect(first, isNotNull);
    expect(g.press(), isNull, reason: 'второе нажатие в той же пробе');
    expect(g.timeout(), isNull, reason: 'просрочка после ответа');
    expect(g.total, 1);
  });

  test('🔴 стоп-сигнал не зажигается, если человек уже ответил', () {
    var now = 0;
    final g = InhibitionGame(level: 1, mode: SubMode.stopSignal, rnd: Random(9), nowMs: () => now, trialsOverride: 20);
    g.begin();
    var checked = 0;
    while (g.nextTrial() && checked < 3) {
      now += g.fixationMs();
      g.showSsGo();
      if (!g.isStopTrial) continue;
      now += 60;
      g.press();
      g.showSsStop();
      expect(g.ssSignal, isNot(SsSignal.stop), reason: 'сигнал зажёгся после ответа — отменять нечего');
      checked++;
    }
    expect(checked, 3, reason: 'стоп-проб не набралось');
  });

  test('🔴 пауза перед «жми» имеет разброс: ровная пауза учит жать по счёту', () {
    final g = InhibitionGame(level: 1, mode: SubMode.stopSignal, rnd: Random(12), nowMs: () => 0);
    final xs = [for (var i = 0; i < 400; i++) g.fixationMs()];
    expect(xs.reduce(min), greaterThanOrEqualTo(600));
    expect(xs.reduce(max), lessThan(1000));
    expect(xs.toSet().length, greaterThan(200), reason: 'пауза почти не гуляет');
  });

  test('🔴 пауза между пробами Go/No-Go имеет разброс и идёт от сида партии', () {
    // Ровная пауза учит жать по счёту — ровно та же причина, что у паузы перед
    // «жми». А своя `Random()` внутри экрана сделала бы партию неповторимой по
    // ВРЕМЕНИ, даже если стимулы повторимы, и пробы экрана снова бы поплыли.
    List<int> gaps(int seed) {
      final g = InhibitionGame(level: 1, rnd: Random(seed), nowMs: () => 0);
      return [for (var i = 0; i < 300; i++) g.gngGapMs()];
    }

    final xs = gaps(77);
    expect(xs.reduce(min), greaterThanOrEqualTo(500));
    expect(xs.reduce(max), lessThan(800));
    expect(xs.toSet().length, greaterThan(150), reason: 'пауза почти не гуляет');
    expect(gaps(77), xs, reason: 'один сид дал две разные последовательности пауз');
    expect(gaps(78), isNot(xs), reason: 'разные сиды дали одни паузы');
  });

  test('🔴 очки и точность считаются формулой веб-версии', () {
    var now = 0;
    final g = InhibitionGame(level: 1, rnd: Random(2), nowMs: () => now, trialsOverride: 20);
    g.begin();
    while (g.nextTrial()) {
      now += 400;
      if (g.gngStim == GngStim.go) {
        g.press();
      } else {
        now += 1400;
        g.timeout();
      }
    }
    expect(g.falseAlarms, 0);
    expect(g.misses, 0);
    expect(g.accuracy, 1.0);
    expect(g.score, g.hits * 10 + g.correctRejections * 5);
    expect(g.finished, isTrue);
  });

  test('🔴 точность пустой партии — 0, а не деление на ноль', () {
    final g = InhibitionGame(level: 1, rnd: Random(1), nowMs: () => 0);
    expect(g.total, 0);
    expect(g.accuracy, 0);
    expect(g.meanRtMs, isNull, reason: 'среднее без проб — прочерк, а не ноль');
  });
}
