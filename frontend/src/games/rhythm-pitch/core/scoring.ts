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

export function estimateLatencyOffset(
  expectedTimesMs: readonly number[],
  observedTapTimesMs: readonly number[],
): { offsetMs: number; samples: number } {
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

export function scoreRhythmTiming(
  round: RhythmEchoRound,
  observedTapTimesMs: readonly number[],
  responseStartedAtMs: number,
  calibrationOffsetMs: number,
): RhythmTimingScore {
  const expected = round.beats.map((beat) => responseStartedAtMs + beat.onsetMs);
  const corrected = observedTapTimesMs.map((tap) => tap - calibrationOffsetMs);
  const matchedTaps = Math.min(expected.length, corrected.length);
  const absoluteErrors = Array.from({ length: matchedTaps }, (_, index) => (
    Math.abs((corrected[index] as number) - (expected[index] as number))
  ));
  const missingTaps = Math.max(0, expected.length - corrected.length);
  const extraTaps = Math.max(0, corrected.length - expected.length);
  const toleranceMs = Math.max(100, round.unitMs * 0.3);
  const timingPenalty = absoluteErrors.reduce((total, error) => total + error, 0);
  const countPenalty = (missingTaps + extraTaps) * toleranceMs * 1.5;
  const accuracy = clamp(1 - (timingPenalty + countPenalty) / (round.beatCount * toleranceMs), 0, 1);
  return {
    accuracy,
    meanTimingErrorMs: absoluteErrors.length === 0
      ? toleranceMs
      : absoluteErrors.reduce((total, error) => total + error, 0) / absoluteErrors.length,
    missingTaps,
    extraTaps,
    matchedTaps,
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
