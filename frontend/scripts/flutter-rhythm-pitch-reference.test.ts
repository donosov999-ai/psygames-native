/* psygames-flutter-rhythm-pitch-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «РИТМ И ВЫСОТА» ИЗ ЖИВОГО TS — прогоном ядра
 * `src/games/rhythm-pitch/core` (ГСЧ, генератор, проверка, оценка, машина
 * состояний). Случайность у модуля своя, от строки зерна, — поэтому эталон
 * сверяется шаг в шаг без подмен. Словарь модуля выгружается ассетом.
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-rhythm-pitch-reference.test.ts'
 */
import {
  hashSeed, createRng, normalizeSeed, shuffle,
  generateRhythmPitchRound, rhythmPitchModeForLevel, validateRhythmPitchRound,
  estimateLatencyOffset, alignTapsToBeats, scoreRhythmTiming, scoreRhythmCompletion, scorePitchCompletion, isPassed,
  createRhythmPitchSession, startRhythmPitchRound, startCalibrationPlayback, recordCalibrationTap,
  completeCalibrationPlayback, continueAfterCalibration, skipCalibration, startAudioRoundPlayback,
  completeAudioRoundPlayback, recordRhythmTap, submitRhythmResponse, selectPitchDirection, appendPitchLevel,
  removeLastPitchLevel, submitPitchSequence, replayTutorialAudio, pauseRhythmPitchSession, resumeRhythmPitchSession,
  restartRhythmPitchSession,
  LEVELS,
  type RhythmEchoRound, type PitchPathRound,
} from '@/src/games/rhythm-pitch/core';
import {
  getRhythmPitchStrings, getRhythmPitchModeLabel, getPitchLevelLabel, getPitchDirectionLabel,
  RHYTHM_PITCH_LOCALES, RHYTHM_PITCH_MODES, PITCH_LEVELS,
} from '@/src/games/rhythm-pitch/core';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/rhythm-pitch-reference.json');
const ASSET = path.resolve(__dirname, '../../flutter/assets/vocab/rhythm-pitch-i18n.json');

describe('эталоны «Ритм и высота» для переноса на Flutter', () => {
  it('выгружает', () => {
    const rng = createRng('abc');
    const rngSeq = Array.from({ length: 8 }, () => rng());
    const seeds = ['  Hello World_Seed  ', 'a--b', '', 'x'].map((s) => ({ raw: s, normalized: normalizeSeed(s), hash: hashSeed(normalizeSeed(s)) }));
    const shuffled = shuffle(createRng('shuf'), [0, 1, 2, 3, 4, 5]);

    const rounds: unknown[] = [];
    for (const seed of ['daily-2026-09-30', 'Rhythm Seed']) {
      for (let level = 1; level <= LEVELS; level += 1) {
        for (const mode of ['rhythm-echo', 'pitch-path'] as const) {
          const r = generateRhythmPitchRound(seed, level, mode);
          rounds.push({ seed, level, mode, round: r, issues: validateRhythmPitchRound(r) });
        }
        rounds.push({ seed, level, auto: rhythmPitchModeForLevel(level) });
      }
    }

    const align = [
      { e: [0, 500, 1000, 1500], o: [10, 490, 1020, 1480], t: 150 },
      { e: [0, 500, 1000, 1500], o: [10, 1020, 1480], t: 150 },
      { e: [0, 500, 1000], o: [0, 200, 500, 1000, 1700], t: 150 },
      { e: [0, 250, 750, 1000, 2000], o: [], t: 100 },
      // Нажатие в 250 мс при допуске 100: пара (250) дешевле двух пропусков по 1,5 (300), но не по 1,0 (200).
      { e: [0], o: [250], t: 100 },
    ].map((c) => ({ ...c, result: alignTapsToBeats(c.e, c.o, c.t) }));
    const latency = [
      { e: [0, 600, 1200, 1800], o: [80, 690, 1260, 1900] },
      { e: [0, 600, 1200], o: [1000, 1600, -900] },
      { e: [0, 600], o: [30] },
      // Медиана −12,25: JS округляет половину вверх (−12,2), Dart — от нуля (−12,3).
      { e: [0, 0], o: [-12, -12.5] },
    ].map((c) => ({ ...c, result: estimateLatencyOffset(c.e, c.o) }));

    const rr = generateRhythmPitchRound('daily-2026-09-30', 9, 'rhythm-echo') as RhythmEchoRound;
    const taps = rr.beats.map((b, i) => 5000 + b.onsetMs + (i % 2 === 0 ? 30 : -45));
    const rhythmScores = [
      { taps, start: 5000, offset: 0 },
      { taps, start: 5000, offset: 20 },
      { taps: taps.slice(1), start: 5000, offset: 0 },
      { taps: [...taps, 9999], start: 5000, offset: 0 },
    ].map((c) => ({ ...c, timing: scoreRhythmTiming(rr, c.taps, c.start, c.offset),
      completion: scoreRhythmCompletion(rr, c.taps, c.start, { durationMs: 12345.6, calibrationOffsetMs: c.offset, calibrationSamples: 3, replayCount: 1 }) }));
    // Пол допуска 100 мс в живом генераторе СПИТ (темп ≤ 160 → доля ≥ 375 мс → 30 % ≥ 112,5).
    // Синтетический раунд с долей 250 мс — там, где пол работает.
    const fast = { ...rr, unitMs: 250, beatCount: 3, beats: [{ onsetMs: 0, accent: false }, { onsetMs: 250, accent: false }, { onsetMs: 500, accent: false }] } as RhythmEchoRound;
    const floorScore = scoreRhythmTiming(fast, [1040, 1260, 1590], 1000, 0);
    // Счёт по интервалам (VER 3, решение Дениса 30.09): случаи, где подбор сдвига РАБОТАЕТ.
    const intervalScores = ([[1, 'int-a'], [21, 'int-c'], [31, 'int-d']] as const).flatMap(([level, seed]) => {
      const r = generateRhythmPitchRound(seed, level, 'rhythm-echo') as RhythmEchoRound;
      const at = (late: number, k = 1) => r.beats.map((b, i) => 7000 + late + b.onsetMs * k + (i % 2 ? 17 : -9));
      const mid = Math.floor(r.beats.length / 2);
      return [
        { level, seed, what: 'late300', taps: at(300) },
        { level, seed, what: 'late800', taps: at(800) },
        { level, seed, what: 'skipLate', taps: at(500).filter((_, i) => i !== mid) },
        { level, seed, what: 'stretched', taps: at(400, 1.33) },
        { level, seed, what: 'strayFirst', taps: [7000 + 90, ...at(600)] },
        { level, seed, what: 'empty', taps: [] as number[] },
      ].map((c) => ({ ...c, timing: scoreRhythmTiming(r, c.taps, 7000, 25) }));
    });
    const pd = generateRhythmPitchRound('daily-2026-09-30', 2, 'pitch-path') as PitchPathRound;
    const ps = generateRhythmPitchRound('daily-2026-09-30', 14, 'pitch-path') as PitchPathRound;
    const opts = { durationMs: 8000, calibrationOffsetMs: 12.5, calibrationSamples: 4, replayCount: 0 };
    const pitchScores = {
      directionRight: scorePitchCompletion(pd, pd.directionAnswer, [], opts),
      directionWrong: scorePitchCompletion(pd, pd.directionAnswer === 'higher' ? 'lower' : 'higher', [], opts),
      sequenceRight: scorePitchCompletion(ps, null, ps.sequence, opts),
      sequenceHalf: scorePitchCompletion(ps, null, ps.sequence.map((v, i) => (i % 2 ? (v + 1) % 3 : v)), opts),
    };
    const passed = [0.69, 0.7, 0.71].map((a) => ({ a, passed: isPassed({ ...pitchScores.directionRight, accuracy: a }) }));

    // Сценарий машины состояний: калибровка → раунд ритма → ответ; и пауза.
    let s = createRhythmPitchSession({ seed: 'scenario', level: 9 });
    const trace: unknown[] = [];
    const snap = (label: string) => trace.push({ label, phase: s.phase, calibrationComplete: s.calibrationComplete,
      calibrationOffsetMs: s.calibrationOffsetMs, calibrationSamples: s.calibrationSamples, responseStartedAt: s.responseStartedAt,
      rhythmTaps: s.rhythmTaps, replayCount: s.replayCount, pausedMs: s.pausedMs, pausedFrom: s.pausedFrom, result: s.result });
    s = startRhythmPitchRound(s, 1000); snap('start');
    s = startCalibrationPlayback(s, [2000, 2600, 3200, 3800]); snap('calib-play');
    for (const t of [2070, 2690, 3240, 3880, 4500]) s = recordCalibrationTap(s, t);
    s = completeCalibrationPlayback(s); snap('calib-done');
    s = continueAfterCalibration(s); snap('ready');
    s = pauseRhythmPitchSession(s, 5000); snap('paused');
    s = resumeRhythmPitchSession(s, 6500); snap('resumed');
    s = startAudioRoundPlayback(s); snap('playback');
    s = completeAudioRoundPlayback(s, 10000); snap('response');
    const sr = s.round as RhythmEchoRound;
    for (const b of sr.beats) s = recordRhythmTap(s, 10000 + b.onsetMs + 60);
    s = submitRhythmResponse(s, 20000); snap('result');
    // Перезапуск после итога: подстройка остаётся, партия — с «Готовы».
    s = restartRhythmPitchSession(s, 25000); snap('restart');

    let p = createRhythmPitchSession({ seed: 'scenario', level: 14, mode: 'pitch-path' });
    p = startRhythmPitchRound(p, 0); p = skipCalibration(p); p = startAudioRoundPlayback(p); p = completeAudioRoundPlayback(p, 3000);
    const pr = p.round as PitchPathRound;
    for (const v of pr.sequence) p = appendPitchLevel(p, v);
    p = appendPitchLevel(p, 0);
    p = removeLastPitchLevel(p); p = appendPitchLevel(p, pr.sequence[pr.sequence.length - 1]!);
    p = submitPitchSequence(p, 9000);
    let d = createRhythmPitchSession({ seed: 'scenario', level: 2, mode: 'pitch-path' });
    d = startRhythmPitchRound(d, 0); d = skipCalibration(d); d = startAudioRoundPlayback(d); d = completeAudioRoundPlayback(d, 1000);
    d = replayTutorialAudio(d); const replayPhase = d.phase; d = completeAudioRoundPlayback(d, 2000);
    d = selectPitchDirection(d, 'higher', 4000);

    // Словарь модуля — через его же геттеры: таблицы в i18n.ts не экспортируются.
    const dict = Object.fromEntries(RHYTHM_PITCH_LOCALES.map((loc) => [loc, {
      strings: getRhythmPitchStrings(loc),
      modes: Object.fromEntries(RHYTHM_PITCH_MODES.map((m) => [m, getRhythmPitchModeLabel(loc, m)])),
      levels: Object.fromEntries(PITCH_LEVELS.map((l) => [l, getPitchLevelLabel(loc, l)])),
      directions: Object.fromEntries((['higher', 'lower'] as const).map((d) => [d, getPitchDirectionLabel(loc, d)])),
    }]));

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({
      taken: '2026-09-30', tool: 'frontend/scripts/flutter-rhythm-pitch-reference.test.ts',
      rngSeq, seeds, shuffled, rounds, align, latency, rhythmRound: rr, rhythmScores, pitchScores, passed,
      floorScore, intervalScores, trace, pitchSession: { round: pr, result: p.result, phase: p.phase, response: p.pitchSequenceResponse },
      directionSession: { replayPhase, replayCount: d.replayCount, result: d.result, phase: d.phase },
    }, null, 1), 'utf8');
    fs.writeFileSync(ASSET, JSON.stringify({ source: 'frontend/src/games/rhythm-pitch/core/i18n.ts', locales: dict }), 'utf8');
    expect(rounds.length).toBeGreaterThan(0);
  });
});
