import { generateMathSliderQuestions, generateTrainingQuestion } from './generator';
import { aggregateMathSliderMetrics, scoreEstimate } from './scoring';
import type {
  ActiveSessionPhase,
  MathSliderQuestion,
  MathSliderSession,
  MathSliderSessionConfig,
} from './types';

function midpoint(question: MathSliderQuestion): number {
  return question.scale.min + question.scale.width / 2;
}

function isInputPhase(phase: MathSliderSession['phase']): phase is 'training' | 'playing' {
  return phase === 'training' || phase === 'playing';
}

function isPausable(phase: MathSliderSession['phase']): phase is ActiveSessionPhase {
  return phase === 'training'
    || phase === 'training-feedback'
    || phase === 'playing'
    || phase === 'feedback';
}

export function createMathSliderSession(
  config: MathSliderSessionConfig,
): MathSliderSession {
  const safeConfig: Required<MathSliderSessionConfig> = {
    seed: config.seed,
    level: Math.max(1, Math.floor(config.level)),
    trialCount: Math.min(20, Math.max(1, Math.floor(config.trialCount ?? 8))),
  };
  const questions = generateMathSliderQuestions(
    safeConfig.seed,
    safeConfig.level,
    safeConfig.trialCount,
  );
  const trainingQuestion = generateTrainingQuestion(safeConfig.seed);
  return {
    config: safeConfig,
    trainingQuestion,
    questions,
    phase: 'rules',
    pausedFrom: null,
    currentIndex: 0,
    estimate: midpoint(trainingQuestion),
    trialStartedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    trainingScore: null,
    trials: [],
    result: null,
  };
}

export function getCurrentQuestion(session: MathSliderSession): MathSliderQuestion | null {
  if (session.phase === 'training' || session.phase === 'training-feedback') {
    return session.trainingQuestion;
  }
  if (session.phase === 'paused' && session.pausedFrom?.startsWith('training')) {
    return session.trainingQuestion;
  }
  return session.questions[session.currentIndex] ?? null;
}

export function startTraining(session: MathSliderSession, now: number): MathSliderSession {
  if (session.phase !== 'rules') return session;
  return {
    ...session,
    phase: 'training',
    estimate: midpoint(session.trainingQuestion),
    trialStartedAt: now,
    pausedMs: 0,
    trainingScore: null,
  };
}

export function setEstimate(session: MathSliderSession, estimate: number): MathSliderSession {
  if (!isInputPhase(session.phase)) return session;
  const question = getCurrentQuestion(session);
  if (!question || !Number.isFinite(estimate)) return session;
  const clamped = Math.min(question.scale.max, Math.max(question.scale.min, estimate));
  return { ...session, estimate: clamped };
}

export function confirmEstimate(session: MathSliderSession, now: number): MathSliderSession {
  if (!isInputPhase(session.phase) || session.trialStartedAt === null) return session;
  const question = getCurrentQuestion(session);
  if (!question) return session;
  const elapsedMs = Math.max(0, now - session.trialStartedAt - session.pausedMs);
  const score = scoreEstimate(question, session.estimate, elapsedMs);
  if (session.phase === 'training') {
    return { ...session, phase: 'training-feedback', trainingScore: score };
  }
  return { ...session, phase: 'feedback', trials: [...session.trials, score] };
}

export function advanceSession(session: MathSliderSession, now: number): MathSliderSession {
  if (session.phase === 'training-feedback') {
    const first = session.questions[0];
    if (!first) return session;
    return {
      ...session,
      phase: 'playing',
      currentIndex: 0,
      estimate: midpoint(first),
      trialStartedAt: now,
      pausedMs: 0,
    };
  }
  if (session.phase !== 'feedback') return session;
  const nextIndex = session.currentIndex + 1;
  if (nextIndex >= session.questions.length) {
    return {
      ...session,
      phase: 'result',
      result: aggregateMathSliderMetrics(session.questions, session.trials, session.questions[0]?.seed ?? session.config.seed),
      trialStartedAt: null,
      pausedMs: 0,
    };
  }
  const nextQuestion = session.questions[nextIndex] as MathSliderQuestion;
  return {
    ...session,
    phase: 'playing',
    currentIndex: nextIndex,
    estimate: midpoint(nextQuestion),
    trialStartedAt: now,
    pausedMs: 0,
  };
}

export function pauseSession(session: MathSliderSession, now: number): MathSliderSession {
  if (!isPausable(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    pauseStartedAt: now,
  };
}

export function resumeSession(session: MathSliderSession, now: number): MathSliderSession {
  if (session.phase !== 'paused' || !session.pausedFrom) return session;
  const pauseDuration = session.pauseStartedAt === null ? 0 : Math.max(0, now - session.pauseStartedAt);
  return {
    ...session,
    phase: session.pausedFrom,
    pausedFrom: null,
    pauseStartedAt: null,
    pausedMs: session.pausedMs + pauseDuration,
  };
}

export function restartSession(session: MathSliderSession): MathSliderSession {
  return createMathSliderSession(session.config);
}

export function disposeSession(session: MathSliderSession): MathSliderSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    pauseStartedAt: null,
    trialStartedAt: null,
  };
}
