import { generateDotsPuzzle } from './generator';
import {
  cellKey,
  clonePaths,
  isAdjacent,
  pathOwnerAt,
  sameCell,
} from './grid';
import { scoreDotsCompletion } from './scoring';
import { validateDotsSolution } from './validator';
import type {
  Cell,
  DotsDrawingPhase,
  DotsPair,
  DotsPaths,
  DotsPuzzle,
  DotsSession,
  DotsSessionConfig,
} from './types';

function isDrawingPhase(phase: DotsSession['phase']): phase is DotsDrawingPhase {
  return phase === 'training' || phase === 'playing';
}

function emptyRound(session: DotsSession, phase: DotsDrawingPhase, now: number | null): DotsSession {
  return {
    ...session,
    phase,
    pausedFrom: null,
    paths: {},
    activePairId: null,
    history: [],
    startedAt: phase === 'playing' ? now : null,
    pauseStartedAt: null,
    pausedMs: 0,
    forwardMoves: 0,
    backtracks: 0,
    undoCount: 0,
    invalidMoves: 0,
    result: null,
  };
}

export function createDotsSession(config: DotsSessionConfig): DotsSession {
  const safeConfig: Required<DotsSessionConfig> = {
    seed: config.seed,
    level: Math.max(1, Math.floor(config.level)),
  };
  return {
    config: safeConfig,
    trainingPuzzle: generateDotsPuzzle(`${safeConfig.seed}-training`, 1),
    puzzle: generateDotsPuzzle(safeConfig.seed, safeConfig.level),
    phase: 'rules',
    pausedFrom: null,
    paths: {},
    activePairId: null,
    history: [],
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    forwardMoves: 0,
    backtracks: 0,
    undoCount: 0,
    invalidMoves: 0,
    result: null,
  };
}

export function getCurrentPuzzle(session: DotsSession): DotsPuzzle {
  if (session.phase === 'training' || session.phase === 'training-complete') {
    return session.trainingPuzzle;
  }
  if (session.phase === 'paused' && session.pausedFrom === 'training') {
    return session.trainingPuzzle;
  }
  return session.puzzle;
}

function endpointPairAt(puzzle: DotsPuzzle, cell: Cell): DotsPair | null {
  return puzzle.pairs.find((pair) => pair.endpoints.some((endpoint) => sameCell(endpoint, cell))) ?? null;
}

function withHistory(session: DotsSession, paths: DotsPaths): Pick<DotsSession, 'history' | 'paths'> {
  return {
    history: [...session.history, clonePaths(session.paths)].slice(-128),
    paths,
  };
}

function invalidMove(session: DotsSession): DotsSession {
  return { ...session, invalidMoves: session.invalidMoves + 1 };
}

function finishIfComplete(session: DotsSession, now: number): DotsSession {
  const puzzle = getCurrentPuzzle(session);
  if (!validateDotsSolution(puzzle, session.paths).complete) return session;
  if (session.phase === 'training') {
    return { ...session, phase: 'training-complete', activePairId: null };
  }
  if (session.phase !== 'playing' || session.startedAt === null) return session;
  return {
    ...session,
    phase: 'result',
    activePairId: null,
    result: scoreDotsCompletion(session.puzzle, {
      durationMs: Math.max(0, now - session.startedAt - session.pausedMs),
      forwardMoves: session.forwardMoves,
      backtracks: session.backtracks,
      undoCount: session.undoCount,
      invalidMoves: session.invalidMoves,
    }),
  };
}

export function startTraining(session: DotsSession): DotsSession {
  if (session.phase !== 'rules') return session;
  return emptyRound(session, 'training', null);
}

/**
 * СРАЗУ В ПАРТИЮ, МИНУЯ ПРАВИЛА И ТРЕНИРОВКУ.
 *
 * ⚠️ ЭТО ДОБАВЛЕНО ПРИ СТЫКОВКЕ, В ЛАБОРАТОРНОМ МОДУЛЕ ЭТОГО НЕТ. Там путь один:
 * rules → training → playing, и он верен для первого знакомства — правила этой
 * игры («занять ВСЮ сетку», «пути не пересекаются») по доске не угадываются.
 * Но в приложении уровней сорок, и после каждого пройденного LevelCleared зовёт
 * следующий: без этой двери человек решал бы одну и ту же тренировочную сетку
 * 4×4 сорок раз подряд. Тренировка учит один раз, а не каждый заход.
 */
export function startRound(session: DotsSession, now: number): DotsSession {
  if (session.phase !== 'rules') return session;
  return emptyRound(session, 'playing', now);
}

export function advanceFromTraining(session: DotsSession, now: number): DotsSession {
  if (session.phase !== 'training-complete') return session;
  return emptyRound(session, 'playing', now);
}

export function beginPath(session: DotsSession, cell: Cell): DotsSession {
  if (!isDrawingPhase(session.phase)) return session;
  const puzzle = getCurrentPuzzle(session);
  const existingOwner = pathOwnerAt(session.paths, cell);
  if (existingOwner) {
    const existingPath = session.paths[existingOwner] as Cell[];
    const index = existingPath.findIndex((candidate) => sameCell(candidate, cell));
    const endpointPair = endpointPairAt(puzzle, cell);
    if (index === existingPath.length - 1) {
      // An unfinished tail resumes in place. A completed tail endpoint starts a
      // fresh redraw from that end, so both ends of a finished color are editable.
      if (existingPath.length === 1 || endpointPair?.id !== existingOwner) {
        return { ...session, activePairId: existingOwner };
      }
      const nextPaths = clonePaths(session.paths);
      nextPaths[existingOwner] = [{ ...cell }];
      return {
        ...session,
        ...withHistory(session, nextPaths),
        activePairId: existingOwner,
        backtracks: session.backtracks + existingPath.length - 1,
      };
    }
    const removed = existingPath.length - index - 1;
    const nextPaths = clonePaths(session.paths);
    nextPaths[existingOwner] = existingPath.slice(0, index + 1).map((candidate) => ({ ...candidate }));
    return {
      ...session,
      ...withHistory(session, nextPaths),
      activePairId: existingOwner,
      backtracks: session.backtracks + removed,
    };
  }

  const pair = endpointPairAt(puzzle, cell);
  if (!pair) return session;
  const existingPath = session.paths[pair.id] ?? [];
  const nextPaths = clonePaths(session.paths);
  nextPaths[pair.id] = [{ ...cell }];
  return {
    ...session,
    ...withHistory(session, nextPaths),
    activePairId: pair.id,
    backtracks: session.backtracks + Math.max(0, existingPath.length - 1),
  };
}

export function extendPath(session: DotsSession, cell: Cell, now: number): DotsSession {
  if (!isDrawingPhase(session.phase) || !session.activePairId) return session;
  const pairId = session.activePairId;
  const path = session.paths[pairId];
  const tail = path?.[path.length - 1];
  if (!path || !tail) return invalidMove(session);
  if (sameCell(tail, cell)) return session;
  if (!isAdjacent(tail, cell)) return invalidMove(session);
  const puzzle = getCurrentPuzzle(session);
  const pair = puzzle.pairs.find((candidate) => candidate.id === pairId);
  if (!pair) return invalidMove(session);

  const ownIndex = path.findIndex((candidate) => sameCell(candidate, cell));
  if (ownIndex >= 0) {
    if (ownIndex === path.length - 1) return session;
    const removed = path.length - ownIndex - 1;
    const nextPaths = clonePaths(session.paths);
    nextPaths[pairId] = path.slice(0, ownIndex + 1).map((candidate) => ({ ...candidate }));
    return {
      ...session,
      ...withHistory(session, nextPaths),
      backtracks: session.backtracks + removed,
    };
  }

  const oppositeEndpointReached = path.length > 1
    && pair.endpoints.some((endpoint) => sameCell(endpoint, tail));
  if (oppositeEndpointReached) return invalidMove(session);

  const occupiedBy = pathOwnerAt(session.paths, cell);
  if (occupiedBy && occupiedBy !== pairId) return invalidMove(session);
  const endpointOwner = endpointPairAt(puzzle, cell)?.id;
  if (endpointOwner && endpointOwner !== pairId) return invalidMove(session);

  const nextPaths = clonePaths(session.paths);
  nextPaths[pairId] = [...path, { ...cell }];
  return finishIfComplete({
    ...session,
    ...withHistory(session, nextPaths),
    forwardMoves: session.forwardMoves + 1,
  }, now);
}

export function endPath(session: DotsSession): DotsSession {
  if (!isDrawingPhase(session.phase) || !session.activePairId) return session;
  return { ...session, activePairId: null };
}

export function undoPath(session: DotsSession): DotsSession {
  if (!isDrawingPhase(session.phase) || session.history.length === 0) return session;
  const prior = session.history[session.history.length - 1] as DotsPaths;
  return {
    ...session,
    paths: clonePaths(prior),
    history: session.history.slice(0, -1),
    activePairId: null,
    undoCount: session.undoCount + 1,
  };
}

export function pauseSession(session: DotsSession, now: number): DotsSession {
  if (!isDrawingPhase(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    activePairId: null,
    pauseStartedAt: now,
  };
}

export function resumeSession(session: DotsSession, now: number): DotsSession {
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

export function restartSession(session: DotsSession, now: number): DotsSession {
  if (session.phase === 'rules') return createDotsSession(session.config);
  const training = session.phase === 'training'
    || session.phase === 'training-complete'
    || (session.phase === 'paused' && session.pausedFrom === 'training');
  return emptyRound(session, training ? 'training' : 'playing', training ? null : now);
}

export function disposeSession(session: DotsSession): DotsSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    activePairId: null,
    history: [],
    startedAt: null,
    pauseStartedAt: null,
  };
}

export function occupiedPairAt(session: DotsSession, cell: Cell): string | null {
  return pathOwnerAt(session.paths, cell);
}

export function endpointPairIdAt(session: DotsSession, cell: Cell): string | null {
  return endpointPairAt(getCurrentPuzzle(session), cell)?.id ?? null;
}

export function sessionFingerprint(session: DotsSession): string {
  return Object.entries(session.paths)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pairId, path]) => `${pairId}:${path.map(cellKey).join(';')}`)
    .join('|');
}
