import { generateFacesNamesPuzzle, personById } from './generator';
import { scoreFacesNamesCompletion } from './scoring';
import type {
  FacesNamesActivePhase,
  FacesNamesSession,
  FacesNamesSessionConfig,
  FacesNamesTrial,
  InterferencePrompt,
  SyntheticPerson,
} from './types';

function isActivePhase(phase: FacesNamesSession['phase']): phase is FacesNamesActivePhase {
  return [
    'study',
    'interference',
    'recognition',
    'name-recall',
    'fact-recall',
  ].includes(phase);
}

function freshRound(session: FacesNamesSession, now: number): FacesNamesSession {
  return {
    ...session,
    phase: 'study',
    pausedFrom: null,
    studyIndex: 0,
    interferenceIndex: 0,
    trialIndex: 0,
    answers: [],
    interferenceCorrect: 0,
    invalidInteractions: 0,
    startedAt: now,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  };
}

export function createFacesNamesSession(config: FacesNamesSessionConfig): FacesNamesSession {
  const safeConfig: Required<FacesNamesSessionConfig> = {
    seed: config.seed,
    level: Math.max(1, Math.floor(config.level)),
  };
  return {
    config: safeConfig,
    puzzle: generateFacesNamesPuzzle(safeConfig.seed, safeConfig.level),
    phase: 'rules',
    pausedFrom: null,
    studyIndex: 0,
    interferenceIndex: 0,
    trialIndex: 0,
    answers: [],
    interferenceCorrect: 0,
    invalidInteractions: 0,
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  };
}

export function currentStudiedPerson(session: FacesNamesSession): SyntheticPerson | null {
  const id = session.puzzle.studiedPersonIds[session.studyIndex];
  return id ? personById(session.puzzle, id) : null;
}

export function currentInterferencePrompt(session: FacesNamesSession): InterferencePrompt | null {
  return session.puzzle.interferencePrompts[session.interferenceIndex] ?? null;
}

export function currentFacesNamesTrial(session: FacesNamesSession): FacesNamesTrial | null {
  return session.puzzle.trials[session.trialIndex] ?? null;
}

function invalidInteraction(session: FacesNamesSession): FacesNamesSession {
  return { ...session, invalidInteractions: session.invalidInteractions + 1 };
}

export function startFacesNamesRound(session: FacesNamesSession, now: number): FacesNamesSession {
  if (session.phase !== 'rules') return session;
  return freshRound(session, now);
}

export function advanceFacesNamesStudy(session: FacesNamesSession): FacesNamesSession {
  if (session.phase !== 'study') return session;
  if (session.studyIndex + 1 < session.puzzle.studiedPersonIds.length) {
    return { ...session, studyIndex: session.studyIndex + 1 };
  }
  return { ...session, phase: 'interference', interferenceIndex: 0 };
}

export function answerFacesNamesInterference(
  session: FacesNamesSession,
  selected: number,
): FacesNamesSession {
  if (session.phase !== 'interference') return session;
  const prompt = currentInterferencePrompt(session);
  if (!prompt || !prompt.options.includes(selected)) return invalidInteraction(session);
  const nextCorrect = session.interferenceCorrect + (selected === prompt.answer ? 1 : 0);
  if (session.interferenceIndex + 1 < session.puzzle.interferencePrompts.length) {
    return {
      ...session,
      interferenceIndex: session.interferenceIndex + 1,
      interferenceCorrect: nextCorrect,
    };
  }
  return {
    ...session,
    phase: 'recognition',
    trialIndex: 0,
    interferenceCorrect: nextCorrect,
  };
}

export function selectRecognizedFace(
  session: FacesNamesSession,
  personId: string,
): FacesNamesSession {
  if (session.phase !== 'recognition') return session;
  const trial = currentFacesNamesTrial(session);
  if (!trial || !trial.recognitionPersonIds.includes(personId)) return invalidInteraction(session);
  return {
    ...session,
    phase: 'name-recall',
    answers: [...session.answers, {
      trialId: trial.id,
      targetPersonId: trial.targetPersonId,
      recognizedPersonId: personId,
      recognitionCorrect: personId === trial.targetPersonId,
      selectedNamePersonId: null,
      nameCorrect: null,
      selectedFactId: null,
      factCorrect: null,
    }],
  };
}

function finishOrAdvance(session: FacesNamesSession, now: number): FacesNamesSession {
  if (session.trialIndex + 1 < session.puzzle.trials.length) {
    return {
      ...session,
      phase: 'recognition',
      trialIndex: session.trialIndex + 1,
    };
  }
  const startedAt = session.startedAt ?? now;
  return {
    ...session,
    phase: 'result',
    result: scoreFacesNamesCompletion(session.puzzle, session.answers, {
      durationMs: Math.max(0, now - startedAt - session.pausedMs),
      interferenceCorrect: session.interferenceCorrect,
      invalidInteractions: session.invalidInteractions,
    }),
  };
}

export function selectRecalledName(
  session: FacesNamesSession,
  personId: string,
  now: number,
): FacesNamesSession {
  if (session.phase !== 'name-recall') return session;
  const trial = currentFacesNamesTrial(session);
  const answer = session.answers[session.answers.length - 1];
  if (!trial || !answer || answer.trialId !== trial.id || !trial.namePersonIds.includes(personId)) {
    return invalidInteraction(session);
  }
  const answers = session.answers.map((candidate, index) => (
    index === session.answers.length - 1
      ? {
        ...candidate,
        selectedNamePersonId: personId,
        nameCorrect: personId === trial.targetPersonId,
      }
      : candidate
  ));
  const updated = { ...session, answers };
  return session.puzzle.factRecallEnabled
    ? { ...updated, phase: 'fact-recall' }
    : finishOrAdvance(updated, now);
}

export function selectRecalledFact(
  session: FacesNamesSession,
  factId: string,
  now: number,
): FacesNamesSession {
  if (session.phase !== 'fact-recall') return session;
  const trial = currentFacesNamesTrial(session);
  const target = trial ? personById(session.puzzle, trial.targetPersonId) : null;
  const answer = session.answers[session.answers.length - 1];
  if (!trial || !target || !answer || answer.trialId !== trial.id || !trial.factIds.includes(factId)) {
    return invalidInteraction(session);
  }
  const answers = session.answers.map((candidate, index) => (
    index === session.answers.length - 1
      ? {
        ...candidate,
        selectedFactId: factId,
        factCorrect: factId === target.factId,
      }
      : candidate
  ));
  return finishOrAdvance({ ...session, answers }, now);
}

export function pauseFacesNamesSession(session: FacesNamesSession, now: number): FacesNamesSession {
  if (!isActivePhase(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    pauseStartedAt: now,
  };
}

export function resumeFacesNamesSession(session: FacesNamesSession, now: number): FacesNamesSession {
  if (session.phase !== 'paused' || !session.pausedFrom) return session;
  const pausedDuration = session.pauseStartedAt === null ? 0 : Math.max(0, now - session.pauseStartedAt);
  return {
    ...session,
    phase: session.pausedFrom,
    pausedFrom: null,
    pauseStartedAt: null,
    pausedMs: session.pausedMs + pausedDuration,
  };
}

export function restartFacesNamesSession(session: FacesNamesSession, now: number): FacesNamesSession {
  if (session.phase === 'rules') return createFacesNamesSession(session.config);
  return freshRound(session, now);
}

export function disposeFacesNamesSession(session: FacesNamesSession): FacesNamesSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    answers: [],
    startedAt: null,
    pauseStartedAt: null,
  };
}

export function facesNamesSessionFingerprint(session: FacesNamesSession): string {
  return JSON.stringify({
    phase: session.phase,
    studyIndex: session.studyIndex,
    interferenceIndex: session.interferenceIndex,
    trialIndex: session.trialIndex,
    answers: session.answers,
  });
}
