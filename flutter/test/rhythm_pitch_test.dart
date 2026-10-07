import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/rhythm_pitch/core.dart';

/// СВЕРКА ЯДРА «РИТМ И ВЫСОТА» С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ЖИВОГО TS.
///
/// У модуля свой ГСЧ от строки зерна, поэтому сверка — шаг в шаг, без подмен.
///
/// ⚠️ Мутации (каждая обязана краснеть): `>>> 15` вместо `>>> 14` в ГСЧ; FNV без
/// умножения; пауза в ритме с 5-го уровня; допуск без пола 100 мс; округление
/// смещения по-дартовски (от нуля); развязка равенств в выравнивании — сперва
/// пропуск; пауза не вычитается из длительности.
double d(Object? v) => (v as num).toDouble();

void main() {
  final ref = jsonDecode(File('test/fixtures/rhythm-pitch-reference.json').readAsStringSync()) as Map<String, dynamic>;

  test('ГСЧ, зёрна и тасовка — тот же поток чисел', () {
    final rng = createRng('abc');
    for (final v in (ref['rngSeq'] as List)) {
      expect(rng(), d(v));
    }
    for (final raw in (ref['seeds'] as List)) {
      final s = raw as Map<String, dynamic>;
      expect(normalizeSeed('${s['raw']}'), s['normalized']);
      expect(hashSeed('${s['normalized']}'), s['hash']);
    }
    expect(shuffleRng(createRng('shuf'), [0, 1, 2, 3, 4, 5]), ref['shuffled']);
  });

  test('раунды: все 31 уровень в обоих режимах на двух зёрнах', () {
    var n = 0;
    for (final raw in (ref['rounds'] as List)) {
      final c = raw as Map<String, dynamic>;
      final level = (c['level'] as num).toInt();
      if (c.containsKey('auto')) {
        expect(rhythmPitchModeForLevel(level), c['auto']);
        continue;
      }
      n += 1;
      final want = c['round'] as Map<String, dynamic>;
      final got = generateRhythmPitchRound('${c['seed']}', level, '${c['mode']}');
      final at = '${c['seed']} L$level ${c['mode']}';
      expect(got.id, want['id'], reason: at);
      expect(got.difficulty, want['difficulty'], reason: at);
      expect(got.tutorialReplay, want['tutorialReplay'], reason: at);
      expect(validateRhythmPitchRound(got), c['issues'], reason: at);
      switch (got) {
        case RhythmEchoRound r:
          expect(r.beatCount, want['beatCount'], reason: at);
          expect(r.bpm, want['bpm'], reason: at);
          expect(r.unitMs, closeTo(d(want['unitMs']), 1e-9), reason: at);
          expect([for (final b in r.beats) b.onsetMs], [for (final b in (want['beats'] as List)) d((b as Map)['onsetMs'])],
              reason: '$at доли');
          expect([for (final b in r.beats) b.accent], [for (final b in (want['beats'] as List)) (b as Map)['accent']],
              reason: '$at акценты');
          expect([r.pauseCount, r.syncopationCount, r.accentCount],
              [want['pauseCount'], want['syncopationCount'], want['accentCount']], reason: at);
        case PitchPathRound r:
          expect(r.task, want['task'], reason: at);
          expect(r.toneCount, want['toneCount'], reason: at);
          expect(r.intervalSemitones, want['intervalSemitones'], reason: at);
          expect(r.sequence, want['sequence'], reason: '$at путь');
          expect(r.directionAnswer, want['directionAnswer'], reason: at);
          final f = want['frequenciesHz'] as List;
          for (var i = 0; i < f.length; i += 1) {
            expect(r.frequenciesHz[i], closeTo(d(f[i]), 1e-9), reason: '$at частота $i');
          }
      }
    }
    expect(n, 31 * 2 * 2);
  });

  test('выравнивание нажатий и оценка задержки — как в вебе', () {
    for (final raw in (ref['align'] as List)) {
      final c = raw as Map<String, dynamic>;
      final r = alignTapsToBeats([for (final v in c['e'] as List) d(v)], [for (final v in c['o'] as List) d(v)], d(c['t']));
      final w = c['result'] as Map<String, dynamic>;
      expect(r.errorsMs, [for (final v in w['errorsMs'] as List) d(v)]);
      expect([r.missingTaps, r.extraTaps], [w['missingTaps'], w['extraTaps']]);
    }
    for (final raw in (ref['latency'] as List)) {
      final c = raw as Map<String, dynamic>;
      final r = estimateLatencyOffset([for (final v in c['e'] as List) d(v)], [for (final v in c['o'] as List) d(v)]);
      final w = c['result'] as Map<String, dynamic>;
      expect(r.offsetMs, d(w['offsetMs']));
      expect(r.samples, w['samples']);
    }
  });

  void sameMetrics(RpMetrics got, Map<String, dynamic> want, String at) {
    expect(got.accuracy, closeTo(d(want['accuracy']), 1e-12), reason: at);
    expect(got.durationMs, want['durationMs'], reason: at);
    expect(got.errors, want['errors'], reason: at);
    expect(got.score, want['score'], reason: at);
    expect(got.difficulty, want['difficulty'], reason: at);
    (want['specific'] as Map).forEach((k, v) {
      final g = got.specific['$k'];
      if (v is num && g is num) {
        expect(g.toDouble(), closeTo(v.toDouble(), 1e-9), reason: '$at · $k');
      } else {
        expect(g, v, reason: '$at · $k');
      }
    });
  }

  test('оценка ритма и высот — итоги как в вебе', () {
    final rr = generateRhythmPitchRound('daily-2026-09-30', 9, 'rhythm-echo') as RhythmEchoRound;
    for (final raw in (ref['rhythmScores'] as List)) {
      final c = raw as Map<String, dynamic>;
      final taps = [for (final v in c['taps'] as List) d(v)];
      final m = scoreRhythmCompletion(rr, taps, d(c['start']), RpScoreOptions(
        durationMs: 12345.6, calibrationOffsetMs: d(c['offset']), calibrationSamples: 3, replayCount: 1));
      sameMetrics(m, c['completion'] as Map<String, dynamic>, 'ритм, смещение ${c['offset']}, нажатий ${taps.length}');
    }
    // Пол допуска 100 мс: в живом генераторе спит (доля ≥ 375 мс), здесь доля 250 — работает.
    final fast = RhythmEchoRound(id: rr.id, seed: rr.seed, level: rr.level, difficulty: rr.difficulty,
        tutorialReplay: rr.tutorialReplay, beatCount: 3, bpm: rr.bpm, unitMs: 250,
        beats: const [RhythmBeat(0, false), RhythmBeat(250, false), RhythmBeat(500, false)],
        pauseCount: rr.pauseCount, syncopationCount: rr.syncopationCount, accentCount: rr.accentCount);
    final fl = scoreRhythmTiming(fast, const [1040, 1260, 1590], 1000, 0);
    final fw = ref['floorScore'] as Map<String, dynamic>;
    expect(fl.accuracy, closeTo(d(fw['accuracy']), 1e-9), reason: 'пол допуска: точность');
    expect(fl.meanTimingErrorMs, closeTo(d(fw['meanTimingErrorMs']), 1e-9), reason: 'пол допуска: ошибка');
    expect([fl.matchedTaps, fl.missingTaps, fl.extraTaps], [fw['matchedTaps'], fw['missingTaps'], fw['extraTaps']], reason: 'пол допуска: пары');
    // Счёт по интервалам: опоздание старта, пропуск при опоздании, растянутый темп,
    // случайное нажатие до эха, пустой ответ — на 1-м, 21-м и 31-м уровнях.
    final byCase = <String, double>{};
    for (final raw in ref['intervalScores'] as List) {
      final c = raw as Map<String, dynamic>;
      final r = generateRhythmPitchRound('${c['seed']}', c['level'] as int, 'rhythm-echo') as RhythmEchoRound;
      final got = scoreRhythmTiming(r, [for (final v in c['taps'] as List) d(v)], 7000, 25);
      final w = c['timing'] as Map<String, dynamic>;
      final at = 'интервалы ур.${c['level']} ${c['what']}';
      expect(got.accuracy, closeTo(d(w['accuracy']), 1e-9), reason: '$at: точность');
      expect(got.meanTimingErrorMs, closeTo(d(w['meanTimingErrorMs']), 1e-9), reason: '$at: ошибка');
      expect([got.matchedTaps, got.missingTaps, got.extraTaps], [w['matchedTaps'], w['missingTaps'], w['extraTaps']], reason: at);
      byCase['${c['level']} ${c['what']}'] = got.accuracy;
    }
    for (final l in const [1, 21, 31]) {
      expect(byCase['$l late800'], byCase['$l late300'], reason: 'ур.$l: опоздание старта ничего не стоит');
    }
    final pd = generateRhythmPitchRound('daily-2026-09-30', 2, 'pitch-path') as PitchPathRound;
    final ps = generateRhythmPitchRound('daily-2026-09-30', 14, 'pitch-path') as PitchPathRound;
    const o = RpScoreOptions(durationMs: 8000, calibrationOffsetMs: 12.5, calibrationSamples: 4, replayCount: 0);
    final p = ref['pitchScores'] as Map<String, dynamic>;
    sameMetrics(scorePitchCompletion(pd, pd.directionAnswer, const [], o), p['directionRight'] as Map<String, dynamic>, 'направление верно');
    sameMetrics(scorePitchCompletion(pd, pd.directionAnswer == 'higher' ? 'lower' : 'higher', const [], o),
        p['directionWrong'] as Map<String, dynamic>, 'направление неверно');
    sameMetrics(scorePitchCompletion(ps, null, ps.sequence, o), p['sequenceRight'] as Map<String, dynamic>, 'путь верно');
    sameMetrics(scorePitchCompletion(ps, null, [for (var i = 0; i < ps.sequence.length; i += 1) i.isOdd ? (ps.sequence[i] + 1) % 3 : ps.sequence[i]], o),
        p['sequenceHalf'] as Map<String, dynamic>, 'путь наполовину');
  });

  test('🔴 машина состояний: калибровка, пауза, ритм — итог как в вебе', () {
    var s = RpSession.create(seed: 'scenario', level: 9);
    final trace = ref['trace'] as List;
    void check(int i) {
      final w = trace[i] as Map<String, dynamic>;
      final at = '${w['label']}';
      expect(s.phase, w['phase'], reason: at);
      expect(s.calibrationComplete, w['calibrationComplete'], reason: at);
      expect(s.calibrationOffsetMs, d(w['calibrationOffsetMs']), reason: at);
      expect(s.calibrationSamples, w['calibrationSamples'], reason: at);
      expect(s.pausedMs, d(w['pausedMs']), reason: at);
      expect(s.pausedFrom, w['pausedFrom'], reason: at);
      if (w['result'] != null) sameMetrics(s.result!, w['result'] as Map<String, dynamic>, at);
    }

    s = s.start(1000);
    check(0);
    s = s.startCalibration([2000, 2600, 3200, 3800]);
    check(1);
    for (final t in const <double>[2070, 2690, 3240, 3880, 4500]) {
      s = s.recordCalibrationTap(t);
    }
    s = s.completeCalibration();
    check(2);
    s = s.continueAfterCalibration();
    check(3);
    s = s.pause(5000);
    check(4);
    s = s.resume(6500);
    check(5);
    s = s.startPlayback();
    check(6);
    s = s.completePlayback(10000);
    check(7);
    for (final b in (s.round as RhythmEchoRound).beats) {
      s = s.recordRhythmTap(10000 + b.onsetMs + 60);
    }
    s = s.submitRhythm(20000);
    check(8);
    s = s.restart(25000);
    check(9);
    expect([s.rhythmTaps, s.responseStartedAt, s.result, s.startedAt], [isEmpty, null, null, 25000], reason: 'перезапуск');
    expect(RpSession.create(seed: 'scenario', level: 9).restart(1).phase, 'rules', reason: 'перезапуск с правил');
  });

  test('машина состояний: путь высот и направление с повтором — итог как в вебе', () {
    var p = RpSession.create(seed: 'scenario', level: 14, mode: 'pitch-path');
    p = p.start(0).skipCalibration().startPlayback().completePlayback(3000);
    final pr = p.round as PitchPathRound;
    for (final v in pr.sequence) {
      p = p.appendPitchLevel(v);
    }
    p = p.appendPitchLevel(0).removeLastPitchLevel().appendPitchLevel(pr.sequence.last).submitPitchSequence(9000);
    final wp = ref['pitchSession'] as Map<String, dynamic>;
    expect(p.phase, wp['phase']);
    expect(p.pitchSequenceResponse, wp['response']);
    sameMetrics(p.result!, wp['result'] as Map<String, dynamic>, 'путь');

    var dd = RpSession.create(seed: 'scenario', level: 2, mode: 'pitch-path');
    dd = dd.start(0).skipCalibration().startPlayback().completePlayback(1000).replayTutorial();
    final wd = ref['directionSession'] as Map<String, dynamic>;
    expect(dd.phase, wd['replayPhase']);
    dd = dd.completePlayback(2000).selectDirection('higher', 4000);
    expect(dd.replayCount, wd['replayCount']);
    expect(dd.phase, wd['phase']);
    sameMetrics(dd.result!, wd['result'] as Map<String, dynamic>, 'направление');
  });
}
