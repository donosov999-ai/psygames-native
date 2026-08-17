import { roundNumber } from './expression';
import {
  MATH_SLIDER_GENERATOR_VERSION,
  type BiasDirection,
  type MathSliderMetrics,
  type MathSliderQuestion,
  type TrialScore,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Score is lexicographic: 0.1 percentage point of accuracy always beats the
 * entire speed tie-break. Speed can only order otherwise equal accuracy units.
 */
export function scoreEstimate(
  question: MathSliderQuestion,
  estimate: number,
  elapsedMs: number,
): TrialScore {
  if (!Number.isFinite(estimate)) throw new TypeError('Estimate must be finite');
  if (!(question.scale.width > 0)) throw new RangeError('Scale width must be positive');

  const safeElapsedMs = Math.max(0, elapsedMs);
  const signedError = roundNumber(estimate - question.answer, 8);
  const absoluteError = Math.abs(signedError);
  const normalizedError = absoluteError / question.scale.width;
  const normalizedSignedError = signedError / question.scale.width;
  const accuracy = clamp(1 - normalizedError, 0, 1);
  const targetMs = 14_000 + question.difficulty * 8_000;
  const speedFactor = clamp((targetMs - safeElapsedMs) / targetMs, 0, 1);
  const accuracyUnits = Math.round(accuracy * 1_000);
  const speedTieBreak = Math.round(speedFactor * 9);

  return {
    questionId: question.id,
    answer: question.answer,
    estimate: roundNumber(estimate, 8),
    elapsedMs: safeElapsedMs,
    absoluteError: roundNumber(absoluteError, 8),
    signedError,
    normalizedError: roundNumber(normalizedError, 8),
    normalizedSignedError: roundNumber(normalizedSignedError, 8),
    accuracy: roundNumber(accuracy, 8),
    speedFactor: roundNumber(speedFactor, 8),
    speedTieBreak,
    score: accuracyUnits * 10 + speedTieBreak,
    outsideTarget: normalizedError > 0.1,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function aggregateMathSliderMetrics(
  questions: readonly MathSliderQuestion[],
  trials: readonly TrialScore[],
  seed: string,
): MathSliderMetrics {
  if (questions.length === 0 || questions.length !== trials.length) {
    throw new RangeError('A completed game needs one score for every question');
  }

  const meanSignedNormalized = mean(trials.map((trial) => trial.normalizedSignedError));
  const biasDirection: BiasDirection = Math.abs(meanSignedNormalized) <= 0.01
    ? 'balanced'
    : meanSignedNormalized > 0 ? 'over' : 'under';

  return {
    accuracy: roundNumber(mean(trials.map((trial) => trial.accuracy)), 8),
    durationMs: Math.round(trials.reduce((sum, trial) => sum + trial.elapsedMs, 0)),
    difficulty: roundNumber(mean(questions.map((question) => question.difficulty)), 8),
    errors: trials.filter((trial) => trial.outsideTarget).length,
    score: Math.round(mean(trials.map((trial) => trial.score))),
    seed,
    generatorVersion: MATH_SLIDER_GENERATOR_VERSION,
    specific: {
      trialCount: trials.length,
      meanAbsoluteNormalizedError: roundNumber(mean(trials.map((trial) => trial.normalizedError)), 8),
      meanSignedError: roundNumber(mean(trials.map((trial) => trial.signedError)), 8),
      meanSignedNormalizedError: roundNumber(meanSignedNormalized, 8),
      biasDirection,
      overestimates: trials.filter((trial) => trial.signedError > 0).length,
      underestimates: trials.filter((trial) => trial.signedError < 0).length,
      exactEstimates: trials.filter((trial) => trial.signedError === 0).length,
      speedTieBreakTotal: trials.reduce((sum, trial) => sum + trial.speedTieBreak, 0),
    },
  };
}
