import { generateOneLinePuzzle } from './generator';
import { scoreOneLineCompletion } from './scoring';
import type {
  GeneratedOneLinePuzzle,
  OneLineDrawingPhase,
  OneLinePuzzle,
  OneLineSession,
  OneLineSessionConfig,
} from './types';
import { validateEulerGraph, validateEulerSolution } from './validator';

function isDrawingPhase(phase: OneLineSession['phase']): phase is OneLineDrawingPhase {
  return phase === 'training' || phase === 'playing';
}

function emptyRound(
  session: OneLineSession,
  phase: OneLineDrawingPhase,
  now: number | null,
): OneLineSession {
  return {
    ...session,
    phase,
    pausedFrom: null,
    vertexTrail: [],
    edgeTrail: [],
    hintVertexIds: [],
    startedAt: phase === 'playing' ? now : null,
    pauseStartedAt: null,
    pausedMs: 0,
    undoCount: 0,
    hintsUsed: 0,
    invalidMoves: 0,
    result: null,
  };
}

export function createOneLineSession(config: OneLineSessionConfig): OneLineSession {
  const safeConfig: Required<OneLineSessionConfig> = {
    seed: config.seed,
    level: Math.max(1, Math.floor(config.level)),
  };
  return {
    config: safeConfig,
    trainingPuzzle: generateOneLinePuzzle(`${safeConfig.seed}-training`, 1),
    puzzle: generateOneLinePuzzle(safeConfig.seed, safeConfig.level),
    phase: 'rules',
    pausedFrom: null,
    vertexTrail: [],
    edgeTrail: [],
    hintVertexIds: [],
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    undoCount: 0,
    hintsUsed: 0,
    invalidMoves: 0,
    result: null,
  };
}

export function getCurrentOneLinePuzzle(session: OneLineSession): GeneratedOneLinePuzzle {
  if (session.phase === 'training' || session.phase === 'training-complete') {
    return session.trainingPuzzle;
  }
  if (session.phase === 'paused' && session.pausedFrom === 'training') {
    return session.trainingPuzzle;
  }
  return session.puzzle;
}

function invalidMove(session: OneLineSession): OneLineSession {
  return { ...session, invalidMoves: session.invalidMoves + 1 };
}

function edgeBetween(
  puzzle: OneLinePuzzle,
  from: string,
  to: string,
  used: ReadonlySet<string>,
): string | null {
  return puzzle.edges.find((edge) => (
    !used.has(edge.id)
    && ((edge.a === from && edge.b === to) || (edge.a === to && edge.b === from))
  ))?.id ?? null;
}

function finishIfComplete(session: OneLineSession, now: number): OneLineSession {
  const puzzle = getCurrentOneLinePuzzle(session);
  if (session.edgeTrail.length !== puzzle.edges.length) return session;
  if (!validateEulerSolution(puzzle, {
    vertexIds: session.vertexTrail,
    edgeIds: session.edgeTrail,
  })) return invalidMove(session);
  if (session.phase === 'training') {
    return { ...session, phase: 'training-complete', hintVertexIds: [] };
  }
  if (session.phase !== 'playing' || session.startedAt === null) return session;
  return {
    ...session,
    phase: 'result',
    hintVertexIds: [],
    result: scoreOneLineCompletion(session.puzzle, {
      durationMs: Math.max(0, now - session.startedAt - session.pausedMs),
      undoCount: session.undoCount,
      hintsUsed: session.hintsUsed,
      invalidMoves: session.invalidMoves,
    }),
  };
}

export function startOneLineTraining(session: OneLineSession): OneLineSession {
  if (session.phase !== 'rules') return session;
  return emptyRound(session, 'training', null);
}

export function advanceFromOneLineTraining(session: OneLineSession, now: number): OneLineSession {
  if (session.phase !== 'training-complete') return session;
  return emptyRound(session, 'playing', now);
}

export function selectOneLineVertex(
  session: OneLineSession,
  vertexId: string,
  now: number,
): OneLineSession {
  if (!isDrawingPhase(session.phase)) return session;
  const puzzle = getCurrentOneLinePuzzle(session);
  if (!puzzle.vertices.some((vertex) => vertex.id === vertexId)) return invalidMove(session);
  if (session.vertexTrail.length === 0) {
    const validation = validateEulerGraph(puzzle);
    if (validation.oddVertexIds.length === 2 && !validation.oddVertexIds.includes(vertexId)) {
      return invalidMove(session);
    }
    return { ...session, vertexTrail: [vertexId], hintVertexIds: [] };
  }

  const from = session.vertexTrail[session.vertexTrail.length - 1] as string;
  if (from === vertexId) return session;
  const edgeId = edgeBetween(puzzle, from, vertexId, new Set(session.edgeTrail));
  if (!edgeId) return invalidMove(session);
  return finishIfComplete({
    ...session,
    vertexTrail: [...session.vertexTrail, vertexId],
    edgeTrail: [...session.edgeTrail, edgeId],
    hintVertexIds: [],
  }, now);
}

export function hintOneLineMove(session: OneLineSession): OneLineSession {
  if (!isDrawingPhase(session.phase)) return session;
  const puzzle = getCurrentOneLinePuzzle(session);
  const validation = validateEulerGraph(puzzle);
  let hintVertexIds: string[];
  if (session.vertexTrail.length === 0) {
    hintVertexIds = validation.oddVertexIds.length === 2
      ? validation.oddVertexIds
      : puzzle.vertices.filter((vertex) => (validation.degrees[vertex.id] ?? 0) > 0).map((vertex) => vertex.id);
  } else {
    const current = session.vertexTrail[session.vertexTrail.length - 1] as string;
    const used = new Set(session.edgeTrail);
    hintVertexIds = [...new Set(puzzle.edges.flatMap((edge) => {
      if (used.has(edge.id)) return [];
      if (edge.a === current) return [edge.b];
      if (edge.b === current) return [edge.a];
      return [];
    }))].sort();
  }
  return {
    ...session,
    hintVertexIds,
    hintsUsed: session.hintsUsed + 1,
  };
}

export function undoOneLineMove(session: OneLineSession): OneLineSession {
  if (!isDrawingPhase(session.phase) || session.vertexTrail.length === 0) return session;
  return {
    ...session,
    vertexTrail: session.vertexTrail.slice(0, -1),
    edgeTrail: session.edgeTrail.slice(0, Math.max(0, session.edgeTrail.length - 1)),
    hintVertexIds: [],
    undoCount: session.undoCount + 1,
  };
}

export function pauseOneLineSession(session: OneLineSession, now: number): OneLineSession {
  if (!isDrawingPhase(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    hintVertexIds: [],
    pauseStartedAt: now,
  };
}

export function resumeOneLineSession(session: OneLineSession, now: number): OneLineSession {
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

export function restartOneLineSession(session: OneLineSession, now: number): OneLineSession {
  if (session.phase === 'rules') return createOneLineSession(session.config);
  const training = session.phase === 'training'
    || session.phase === 'training-complete'
    || (session.phase === 'paused' && session.pausedFrom === 'training');
  return emptyRound(session, training ? 'training' : 'playing', training ? null : now);
}

export function disposeOneLineSession(session: OneLineSession): OneLineSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    vertexTrail: [],
    edgeTrail: [],
    hintVertexIds: [],
    startedAt: null,
    pauseStartedAt: null,
  };
}

export function oneLineSessionFingerprint(session: OneLineSession): string {
  return `${session.vertexTrail.join('>')}|${session.edgeTrail.join('>')}`;
}
