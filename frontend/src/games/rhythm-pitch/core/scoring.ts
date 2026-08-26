/* psygames-rhythm-pitch-scoring · VER 2 · 22.08.2026 */
import type {
  PitchDirection,
  PitchPathRound,
  RhythmEchoRound,
  RhythmPitchMetrics,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isPassed(metrics: RhythmPitchMetrics): boolean {
  return metrics.accuracy >= 0.7;
}

/**
 * Поправка на задержку устройства по настроечным щелчкам.
 *
 * 🔴 НЕПОЛНЫЙ НАБОР НЕЛЬЗЯ РАЗОБРАТЬ — И РАНЬШЕ ЕГО РАЗБИРАЛИ. Нажатия парились со
 * щелчками по номеру, а неполный набор принимался с двух замеров. Человек, не
 * успевший к ПЕРВОМУ щелчку из четырёх, отдавал все остальные на позицию раньше —
 * и получал поправку в пол-такта:
 *
 *     все 4 щелчка       → поправка   0 мс → идеальная партия оценена в 1.000
 *     пропущен первый    → поправка 450 мс → идеальная партия оценена в 0.333
 *     нажал только два   → поправка 500 мс → идеальная партия оценена в 0.625
 *
 * Промах на НАСТРОЙКЕ молча отнимал две трети у каждой следующей партии, и заметить
 * это изнутри игры было нечем.
 *
 * ⚠️ И ЭТО НЕ ЧИНИТСЯ УМНЫМ СОПОСТАВЛЕНИЕМ. «Пропустил первый щелчок» и «у устройства
 * задержка в 450 мс» дают РОВНО ОДИН И ТОТ ЖЕ набор: те же нажатия, тот же интервал,
 * тот же разброс. Разделить их можно только по числу нажатий. Поэтому короткий набор
 * не разбирается вовсе: 0 замеров → настройка не принята → экран просит пройти её
 * заново (`calibrationNeedTaps`), а не тихо подставляет выдумку.
 */
export function estimateLatencyOffset(
  expectedTimesMs: readonly number[],
  observedTapTimesMs: readonly number[],
): { offsetMs: number; samples: number } {
  if (observedTapTimesMs.length !== expectedTimesMs.length) return { offsetMs: 0, samples: 0 };
  const count = Math.min(expectedTimesMs.length, observedTapTimesMs.length);
  const differences = Array.from({ length: count }, (_, index) => (
    (observedTapTimesMs[index] as number) - (expectedTimesMs[index] as number)
  )).filter(Number.isFinite).map((value) => clamp(value, -250, 500)).sort((a, b) => a - b);
  if (differences.length === 0) return { offsetMs: 0, samples: 0 };
  const middle = Math.floor(differences.length / 2);
  const offsetMs = differences.length % 2 === 1
    ? differences[middle] as number
    : ((differences[middle - 1] as number) + (differences[middle] as number)) / 2;
  return { offsetMs: Math.round(offsetMs * 10) / 10, samples: differences.length };
}

export interface RhythmTimingScore {
  accuracy: number;
  meanTimingErrorMs: number;
  missingTaps: number;
  extraTaps: number;
  matchedTaps: number;
}

export interface TapAlignment {
  /** Ошибки по сопоставленным парам «такт ↔ нажатие», мс. */
  errorsMs: number[];
  missingTaps: number;
  extraTaps: number;
}

/**
 * Сопоставление нажатий с тактами БЕЗ ПРИВЯЗКИ К НОМЕРУ.
 *
 * 🔴 ЧТО БЫЛО. Такты сверялись позиционно: `corrected[i]` против `expected[i]`.
 * Один несыгранный удар сдвигал ВСЕ последующие нажатия на позицию, и каждое
 * сравнивалось с чужим тактом — промахиваясь на целый интервал. Восемь тактов
 * из девяти сыграны идеально → точность 0.000. Тот же единственный пропуск
 * последним → 0.833: там сдвигать уже нечего. Оценивалась не игра человека, а
 * МЕСТО его ошибки: ближе к началу — тем страшнее приговор.
 *
 * Порядок сохраняется (и такты, и нажатия идут по времени), поэтому достаточно
 * обычного выравнивания: на каждом шаге либо пара, либо пропущенный такт, либо
 * лишнее нажатие. Пропуск и лишнее стоят `toleranceMs * 1.5` — ровно столько же,
 * сколько стоили раньше, так что «всё точно» и «пропуск в конце» дают прежние
 * числа. Меняется только цена ошибки в СЕРЕДИНЕ: теперь она такая же, как везде.
 *
 * Дальний «мэтч» невыгоден сам собой: если пара стоит дороже, чем пропуск плюс
 * лишнее (3 · tolerance), выравнивание выберет второе — отдельного порога не нужно.
 */
export function alignTapsToBeats(
  expectedMs: readonly number[],
  observedMs: readonly number[],
  toleranceMs: number,
): TapAlignment {
  const beats = expectedMs.length;
  const taps = observedMs.length;
  const skipCost = toleranceMs * 1.5;
  // cost[i][j] — минимальная цена за первые i тактов и j нажатий.
  const cost: number[][] = [];
  const step: number[][] = [];   // 0 — пара, 1 — пропущенный такт, 2 — лишнее нажатие
  for (let i = 0; i <= beats; i++) {
    cost.push(new Array<number>(taps + 1).fill(0));
    step.push(new Array<number>(taps + 1).fill(0));
  }
  for (let i = 1; i <= beats; i++) { cost[i]![0] = i * skipCost; step[i]![0] = 1; }
  for (let j = 1; j <= taps; j++) { cost[0]![j] = j * skipCost; step[0]![j] = 2; }
  for (let i = 1; i <= beats; i++) {
    for (let j = 1; j <= taps; j++) {
      const pair = (cost[i - 1]![j - 1] as number)
        + Math.abs((observedMs[j - 1] as number) - (expectedMs[i - 1] as number));
      const skipBeat = (cost[i - 1]![j] as number) + skipCost;
      const skipTap = (cost[i]![j - 1] as number) + skipCost;
      const best = Math.min(pair, skipBeat, skipTap);
      cost[i]![j] = best;
      step[i]![j] = best === pair ? 0 : (best === skipBeat ? 1 : 2);
    }
  }
  const errorsMs: number[] = [];
  let missingTaps = 0;
  let extraTaps = 0;
  let i = beats;
  let j = taps;
  while (i > 0 || j > 0) {
    const move = step[i]![j] as number;
    if (move === 0) {
      errorsMs.push(Math.abs((observedMs[j - 1] as number) - (expectedMs[i - 1] as number)));
      i--; j--;
    } else if (move === 1) { missingTaps++; i--; } else { extraTaps++; j--; }
  }
  errorsMs.reverse();
  return { errorsMs, missingTaps, extraTaps };
}

export function scoreRhythmTiming(
  round: RhythmEchoRound,
  observedTapTimesMs: readonly number[],
  responseStartedAtMs: number,
  calibrationOffsetMs: number,
): RhythmTimingScore {
  const expected = round.beats.map((beat) => responseStartedAtMs + beat.onsetMs);
  const corrected = observedTapTimesMs.map((tap) => tap - calibrationOffsetMs);
  const toleranceMs = Math.max(100, round.unitMs * 0.3);
  const { errorsMs, missingTaps, extraTaps } = alignTapsToBeats(expected, corrected, toleranceMs);
  const timingPenalty = errorsMs.reduce((total, error) => total + error, 0);
  const countPenalty = (missingTaps + extraTaps) * toleranceMs * 1.5;
  const accuracy = clamp(1 - (timingPenalty + countPenalty) / (round.beatCount * toleranceMs), 0, 1);
  return {
    accuracy,
    meanTimingErrorMs: errorsMs.length === 0 ? toleranceMs : timingPenalty / errorsMs.length,
    missingTaps,
    extraTaps,
    matchedTaps: errorsMs.length,
  };
}

interface CommonScoreOptions {
  durationMs: number;
  calibrationOffsetMs: number;
  calibrationSamples: number;
  replayCount: number;
}

export function scoreRhythmCompletion(
  round: RhythmEchoRound,
  taps: readonly number[],
  responseStartedAtMs: number,
  options: CommonScoreOptions,
): RhythmPitchMetrics {
  const timing = scoreRhythmTiming(round, taps, responseStartedAtMs, options.calibrationOffsetMs);
  const errors = timing.missingTaps + timing.extraTaps
    + timing.matchedTaps - Math.round(timing.accuracy * timing.matchedTaps);
  return {
    accuracy: timing.accuracy,
    durationMs: Math.max(0, Math.round(options.durationMs)),
    difficulty: round.difficulty,
    errors,
    score: Math.round(clamp(timing.accuracy * 1_000 + round.difficulty * 4 - errors * 25, 0, 1_500)),
    seed: round.seed,
    generatorVersion: round.generatorVersion,
    details: {
      level: round.level,
    },
    specific: {
      mode: round.mode,
      calibrationOffsetMs: options.calibrationOffsetMs,
      calibrationSamples: options.calibrationSamples,
      replayCount: options.replayCount,
      timingAccuracy: timing.accuracy,
      meanTimingErrorMs: Math.round(timing.meanTimingErrorMs * 10) / 10,
      missingTaps: timing.missingTaps,
      extraTaps: timing.extraTaps,
      beatCount: round.beatCount,
      bpm: round.bpm,
      pauseCount: round.pauseCount,
      syncopationCount: round.syncopationCount,
      accentCount: round.accentCount,
      pitchTask: null,
      pitchAccuracy: null,
      toneCount: 0,
      pitchLevelCount: 0,
      intervalSemitones: null,
      minimumFrequencyHz: null,
      maximumFrequencyHz: null,
    },
  };
}

export function scorePitchCompletion(
  round: PitchPathRound,
  directionResponse: PitchDirection | null,
  sequenceResponse: readonly number[],
  options: CommonScoreOptions,
): RhythmPitchMetrics {
  const correct = round.task === 'direction'
    ? Number(directionResponse === round.directionAnswer)
    : round.sequence.reduce((total, expected, index) => total + Number(sequenceResponse[index] === expected), 0);
  const total = round.task === 'direction' ? 1 : round.toneCount;
  const accuracy = correct / total;
  const errors = total - correct;
  return {
    accuracy,
    durationMs: Math.max(0, Math.round(options.durationMs)),
    difficulty: round.difficulty,
    errors,
    score: Math.round(clamp(accuracy * 1_000 + round.difficulty * 4 - errors * 30, 0, 1_500)),
    seed: round.seed,
    generatorVersion: round.generatorVersion,
    details: {
      level: round.level,
    },
    specific: {
      mode: round.mode,
      calibrationOffsetMs: options.calibrationOffsetMs,
      calibrationSamples: options.calibrationSamples,
      replayCount: options.replayCount,
      timingAccuracy: null,
      meanTimingErrorMs: null,
      missingTaps: 0,
      extraTaps: 0,
      beatCount: 0,
      bpm: null,
      pauseCount: 0,
      syncopationCount: 0,
      accentCount: 0,
      pitchTask: round.task,
      pitchAccuracy: accuracy,
      toneCount: round.toneCount,
      pitchLevelCount: round.pitchLevelCount,
      intervalSemitones: round.intervalSemitones,
      minimumFrequencyHz: Math.min(...round.frequenciesHz),
      maximumFrequencyHz: Math.max(...round.frequenciesHz),
    },
  };
}
