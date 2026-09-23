import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/stop_signal/model.dart';

/// СВЕРКА «СТОП-СИГНАЛА» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `src/games/stop-signal/core/{ladder,ssrt,persist}.ts`
/// в `test/fixtures/stopsignal-reference.json`: параметры уровней, шаги лестницы,
/// зажим задержки, окно проб, разбор хранилища и СЕМЬ наборов проб — по одному на
/// каждое условие применимости SSRT плюс годный случай.
void main() {
  late Map<String, dynamic> ref;
  late Map<String, dynamic> consts;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/stopsignal-reference.json').readAsStringSync()) as Map<String, dynamic>;
    consts = ref['константы'] as Map<String, dynamic>;
  });

  StopSignalTrial fromJson(Map<String, dynamic> t) => StopSignalTrial(
        isStop: t['isStop'] as bool,
        ssdMs: t['ssdMs'] as int?,
        rtMs: t['rtMs'] as int?,
        goWindowMs: t['goWindowMs'] as int,
      );

  test('🔴 константы лестницы и порогов — те же, что в живом коде', () {
    expect(ssdStartMs, consts['SSD_START_MS']);
    expect(ssdStepMs, consts['SSD_STEP_MS']);
    expect(ssdMinMs, consts['SSD_MIN_MS']);
    expect(ssdMaxMs, consts['SSD_MAX_MS']);
    expect(stopProb, consts['STOP_PROB']);
    expect(poolMaxTrials, consts['POOL_MAX_TRIALS']);
    expect(stopSignalMaxLevel, consts['MAX_LEVEL']);
    expect(pRespondMin, consts['P_RESPOND_MIN']);
    expect(pRespondMax, consts['P_RESPOND_MAX']);
    expect(minStopTrials, consts['MIN_STOP_TRIALS']);
    expect(maxOmissionRate, consts['MAX_OMISSION_RATE']);
    // Ключ хранилища общий с веб-версией: иначе у человека станет две лестницы.
    expect(ladderKey, consts['LADDER_KEY']);
  });

  test('🔴 параметры уровней совпадают с эталоном, и про задержку в них НЕТ НИЧЕГО', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = StopSignalLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём');
      expect(l.goWindowMs, row['goWindowMs'], reason: '$at: окно ответа');
      expect(l.fixMinMs, row['fixMinMs'], reason: '$at: пауза до GO');
      expect(l.fixJitterMs, row['fixJitterMs'], reason: '$at: разброс паузы');
      expect(l.interTrialMs, row['interTrialMs'], reason: '$at: пауза между пробами');
      expect(l.stopProbability, row['stopProb'], reason: '$at: доля стоп-проб — константа');
      expect(row.containsKey('ssd'), isFalse, reason: '$at: поле задержки в уровне = вернулся дефект');
    }
    // Все три оси идут вниз строго монотонно и упираются в концы разом на L15.
    for (var l = 2; l <= 15; l++) {
      final a = StopSignalLevel.of(l - 1);
      final b = StopSignalLevel.of(l);
      expect(b.goWindowMs < a.goWindowMs, isTrue, reason: 'L$l: окно не сузилось');
      expect(b.fixMinMs < a.fixMinMs, isTrue, reason: 'L$l: пауза не сжалась');
      expect(b.interTrialMs < a.interTrialMs, isTrue, reason: 'L$l: пауза между пробами не сжалась');
    }
    expect(StopSignalLevel.of(15).goWindowMs, 700);
    expect(StopSignalLevel.of(15).fixMinMs, 350);
    expect(StopSignalLevel.of(15).interTrialMs, 320);
  });

  test('🔴 лестница шагает один вверх / один вниз и зажимается по краям', () {
    for (final row in (ref['лестница'] as List).cast<Map<String, dynamic>>()) {
      expect(nextSsd(row['ssd'] as int, row['inhibited'] as bool), row['next'],
          reason: 'ступень ${row['ssd']} при удержании ${row['inhibited']}');
    }
    for (final row in (ref['зажим'] as List).cast<Map<String, dynamic>>()) {
      expect(clampSsd(row['ms'] as int), row['clamped'], reason: 'зажим ${row['ms']}');
    }
  });

  test('🔴 SSRT и ПРИЧИНА ОТКАЗА совпадают с живым кодом на всех семи наборах', () {
    for (final row in (ref['оценки'] as List).cast<Map<String, dynamic>>()) {
      final trials = (row['trials'] as List).map((t) => fromJson((t as Map).cast<String, dynamic>())).toList();
      final want = (row['out'] as Map).cast<String, dynamic>();
      final got = estimateSsrt(trials);
      final at = row['имя'];
      expect(got.ssrtMs, want['ssrtMs'], reason: '$at: само число');
      expect(got.trustworthy, want['trustworthy'], reason: '$at: доверие');
      expect(got.doubt?.name, want['doubt'], reason: '$at: причина отказа');
      expect(got.pRespond, closeTo(want['pRespond'] as num, 1e-9), reason: '$at: доля срывов');
      expect(got.meanSsdMs, want['meanSsdMs'], reason: '$at: средняя задержка');
      expect(got.meanGoRtMs, want['meanGoRtMs'], reason: '$at: среднее GO');
      expect(got.nthGoRtMs, want['nthGoRtMs'], reason: '$at: n-я реакция');
      expect(got.stopTrials, want['stopTrials']);
      expect(got.failedStops, want['failedStops']);
      expect(got.goOmissions, want['goOmissions']);
    }
  });

  test('🔴 пропуск GO идёт в расчёт как САМЫЙ МЕДЛЕННЫЙ ответ, а не выбрасывается', () {
    // Два набора отличаются только тем, что в одном пропуск GO, в другом его нет.
    final base = [
      for (var i = 0; i < 23; i++) StopSignalTrial(isStop: false, ssdMs: null, rtMs: 320 + i * 10, goWindowMs: 1400),
      for (var i = 0; i < 6; i++) StopSignalTrial(isStop: true, ssdMs: 200 + i * 10, rtMs: null, goWindowMs: 1400),
      for (var i = 0; i < 6; i++) StopSignalTrial(isStop: true, ssdMs: 200 + i * 10, rtMs: 300 + i * 10, goWindowMs: 1400),
    ];
    final withOmission = [
      ...base,
      const StopSignalTrial(isStop: false, ssdMs: null, rtMs: null, goWindowMs: 1400),
    ];
    final withFastGo = [
      ...base,
      const StopSignalTrial(isStop: false, ssdMs: null, rtMs: 300, goWindowMs: 1400),
    ];
    final a = estimateSsrt(withOmission);
    final b = estimateSsrt(withFastGo);
    expect(a.goOmissions, 1);
    expect(a.nthGoRtMs! > b.nthGoRtMs!, isTrue,
        reason: 'пропуск замещается окном 1400 мс и сдвигает порядковую статистику вправо');
  });

  test('🔴 окно проб переживает партию и режется по потолку', () {
    final want = (ref['окно'] as Map).cast<String, dynamic>();
    final pool = [
      for (var i = 0; i < (want['poolBefore'] as int); i++)
        const StopSignalTrial(isStop: false, ssdMs: null, rtMs: 400, goWindowMs: 1400),
    ];
    final run = [
      const StopSignalTrial(isStop: false, ssdMs: null, rtMs: 410, goWindowMs: 1400),
      const StopSignalTrial(isStop: true, ssdMs: 250, rtMs: null, goWindowMs: 1400),
      const StopSignalTrial(isStop: true, ssdMs: 250, rtMs: 300, goWindowMs: 1400),
    ];
    final merged = appendTrials(pool, run);
    expect(merged.length, want['mergedLength']);
    expect(merged.last.isStop, want['lastIsStop'], reason: 'режется НАЧАЛО окна, а не конец');
    expect(countStopTrials(merged), want['stopsInMerged']);
  });

  test('🔴 мусор в хранилище даёт ПУСТУЮ лестницу, а не падение', () {
    for (final row in (ref['разбор'] as List).cast<Map<String, dynamic>>()) {
      final want = (row['out'] as Map).cast<String, dynamic>();
      final got = parseLadder(row['raw'] as String?);
      expect(got.ssdMs, want['ssdMs'], reason: 'разбор «${row['raw']}»');
      expect(got.trials.length, (want['trials'] as List).length, reason: 'разбор «${row['raw']}»: проб');
    }
    // И туда-обратно: сохранённое читается тем же, чем писалось.
    final state = LadderState(ssdMs: 350, trials: [
      const StopSignalTrial(isStop: true, ssdMs: 300, rtMs: null, goWindowMs: 1200),
      const StopSignalTrial(isStop: false, ssdMs: null, rtMs: 420, goWindowMs: 1200),
    ]);
    final back = parseLadder(serializeLadder(state));
    expect(back.ssdMs, 350);
    expect(back.trials.length, 2);
    expect(back.trials.first.isStop, isTrue);
    expect(back.trials.last.rtMs, 420);
  });

  test('🔴 партия ведёт лестницу: удержался — вверх, сорвался — вниз, даже до сигнала', () {
    var clock = 0;
    // 0.0 → стоп-проба, 0.5 → пауза фиксации
    final g = StopSignalGame(level: 1, startSsd: 250, rnd: _Queue([0.0, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    expect(g.isStopTrial, isTrue);
    g.showGo();
    expect(g.closeTrial(), StopOutcome.inhibited);
    expect(g.ssdMs, 300, reason: 'удержался — задержка растёт');

    g.nextTrial();
    g.showGo();
    clock += 120;   // нажал ДО того, как знак «стоп» показался
    expect(g.press(), StopOutcome.failedStop);
    expect(g.ssdMs, 250, reason: 'любое нажатие в стоп-пробе ведёт лестницу вниз');
    // Ступень пробы записана даже при преждевременном нажатии.
    expect(g.runTrials.last.ssdMs, 300);
    expect(g.runTrials.last.rtMs, 120);
  });

  test('🔴 точность и очки — формулами веб-версии', () {
    // 0.9 → GO-проба, 0.0 → стоп-проба
    var clock = 0;
    final g = StopSignalGame(
      level: 1,
      rnd: _Queue([0.9, 0.5, 0.9, 0.5, 0.0, 0.5, 0.9, 0.5]),
      nowMs: () => clock,
      trialsOverride: 4,
    );
    g.begin();
    g.nextTrial(); g.showGo(); clock += 400; g.press();     // GO верно
    g.nextTrial(); g.showGo(); g.closeTrial();               // GO пропущен
    g.nextTrial(); g.showGo(); g.closeTrial();               // стоп удержан
    g.nextTrial(); g.showGo(); clock += 500; g.press();      // GO верно
    expect(g.hits, 2);
    expect(g.misses, 1);
    expect(g.inhibited, 1);
    expect(g.accuracy, 0.75, reason: '(2 попадания + 1 удержание) из четырёх');
    expect(g.score, max(0, 2 * 50 + 1 * 100 - 1 * 60));
    expect(g.score, 140);
    expect(g.meanGoRtMs, 450);
  });

  test('🔴 партия отдаёт пробы в том виде, в каком их ждёт расчёт SSRT', () {
    var clock = 0;
    final g = StopSignalGame(level: 1, rnd: _Queue([0.9, 0.5, 0.0, 0.5]), nowMs: () => clock, trialsOverride: 2);
    g.begin();
    g.nextTrial(); g.showGo(); clock += 380; g.press();
    g.nextTrial(); g.showGo(); g.closeTrial();
    expect(g.runTrials.length, 2);
    expect(g.runTrials[0].isStop, isFalse);
    expect(g.runTrials[0].ssdMs, isNull, reason: 'у GO-пробы задержки нет');
    expect(g.runTrials[0].goWindowMs, g.params.goWindowMs);
    expect(g.runTrials[1].isStop, isTrue);
    expect(g.runTrials[1].rtMs, isNull, reason: 'удержался — ответа не было');
    expect(g.runTrials[1].ssdMs, 250);
  });
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
