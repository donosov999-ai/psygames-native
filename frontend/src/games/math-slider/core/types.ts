export const MATH_SLIDER_GENERATOR_VERSION = 'math-slider-generator-v1';

export type MathSliderLocale = 'ru' | 'en';

export type BinaryOperator = '+' | '-' | '*' | '/';

export type MathExpression =
  | { type: 'literal'; value: number }
  | {
      type: 'binary';
      operator: BinaryOperator;
      left: MathExpression;
      right: MathExpression;
    }
  | { type: 'percent-of'; percent: number; base: number }
  | { type: 'discount'; price: number; percent: number }
  | {
      type: 'proportion';
      leftNumerator: number;
      leftDenominator: number;
      rightDenominator: number;
    };

export type ExpressionKind =
  | 'integer-addition'
  | 'signed-subtraction'
  | 'mixed-small-multiplication'
  | 'decimal-arithmetic'
  | 'percentage'
  | 'discount'
  | 'proportion';

export interface MathSliderScale {
  min: number;
  max: number;
  width: number;
  majorStep: number;
  keyboardStep: number;
  tickCount: number;
  ticks: number[];
  precision: number;
}

export interface MathSliderQuestion {
  id: string;
  index: number;
  level: number;
  kind: ExpressionKind;
  expression: MathExpression;
  answer: number;
  scale: MathSliderScale;
  difficulty: number;
  expressionDifficulty: number;
  scaleDifficulty: number;
  seed: string;
  generatorVersion: typeof MATH_SLIDER_GENERATOR_VERSION;
}

export interface TrialScore {
  questionId: string;
  answer: number;
  estimate: number;
  elapsedMs: number;
  absoluteError: number;
  signedError: number;
  normalizedError: number;
  normalizedSignedError: number;
  accuracy: number;
  speedFactor: number;
  speedTieBreak: number;
  score: number;
  outsideTarget: boolean;
}

export type BiasDirection = 'over' | 'under' | 'balanced';

export interface MathSliderMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof MATH_SLIDER_GENERATOR_VERSION;
  specific: {
    trialCount: number;
    meanAbsoluteNormalizedError: number;
    meanSignedError: number;
    meanSignedNormalizedError: number;
    biasDirection: BiasDirection;
    overestimates: number;
    underestimates: number;
    exactEstimates: number;
    speedTieBreakTotal: number;
  };
}

export interface MathSliderSessionConfig {
  seed: string;
  level: number;
  trialCount?: number;
}

export type ActiveSessionPhase =
  | 'training'
  | 'training-feedback'
  | 'playing'
  | 'feedback';

export type MathSliderSessionPhase =
  | 'rules'
  | ActiveSessionPhase
  | 'paused'
  | 'result'
  | 'disposed';

export interface MathSliderSession {
  config: Required<MathSliderSessionConfig>;
  trainingQuestion: MathSliderQuestion;
  questions: MathSliderQuestion[];
  phase: MathSliderSessionPhase;
  pausedFrom: ActiveSessionPhase | null;
  currentIndex: number;
  estimate: number;
  trialStartedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  trainingScore: TrialScore | null;
  trials: TrialScore[];
  result: MathSliderMetrics | null;
}
