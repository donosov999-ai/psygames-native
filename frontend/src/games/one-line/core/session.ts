import { generateOneLinePuzzle } from './generator';
import {
  ONE_LINE_START_SCORE,
  oneLineScoreAt,
  oneLineTimeIsUp,
  scoreOneLineCompletion,
} from './scoring';
import type {
  GeneratedOneLinePuzzle,
  OneLineDrawingPhase,
  OneLinePuzzle,
  OneLineSession,
  OneLineSessionConfig,
} from './types';
import {
  edgeAllowsDirection,
  edgeHasUsesLeft,
  edgeUseCounts,
  nextMoveFrom,
  totalEdgeUses,
  validateEulerGraph,
  validateEulerSolution,
} from './validator';

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
    hintDeadEnd: false,
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
    hintDeadEnd: false,
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

/**
 * Каким ребром можно пройти отсюда туда. Учитывает и остаток проходов (двойное
 * ребро закрывается только со второго раза), и направление (по одностороннему
 * назад хода нет вовсе).
 */
function edgeBetween(
  puzzle: OneLinePuzzle,
  from: string,
  to: string,
  counts: ReadonlyMap<string, number>,
): string | null {
  return puzzle.edges.find((edge) => (
    edgeHasUsesLeft(edge, counts) && edgeAllowsDirection(edge, from, to)
  ))?.id ?? null;
}

function finishIfComplete(session: OneLineSession, now: number): OneLineSession {
  const puzzle = getCurrentOneLinePuzzle(session);
  // Считаем ПРОХОДЫ, а не рёбра: двойное закрывается только со второго раза.
  if (session.edgeTrail.length !== totalEdgeUses(puzzle.edges)) return session;
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
    hintDeadEnd: false,
    result: scoreOneLineCompletion(session.puzzle, {
      durationMs: Math.max(0, now - session.startedAt - session.pausedMs),
      undoCount: session.undoCount,
      hintsUsed: session.hintsUsed,
      invalidMoves: session.invalidMoves,
    }),
  };
}

/**
 * Сколько партия уже идёт. Пауза не считается — иначе прочитанные правила съедали бы
 * счёт, и «Правила» превращались бы в наказание за любопытство.
 */
export function elapsedOneLineMs(session: OneLineSession, now: number): number {
  if (session.startedAt === null) return 0;
  // На паузе часы стоят: замирают на том мгновении, когда её включили.
  const running = session.phase === 'paused' && session.pauseStartedAt !== null
    ? session.pauseStartedAt
    : now;
  return Math.max(0, running - session.startedAt - session.pausedMs);
}

/** Что показывать на счётчике прямо сейчас. Тренировочный круг не торопим. */
export function oneLineScoreNow(session: OneLineSession, now: number): number {
  if (session.phase !== 'playing') return ONE_LINE_START_SCORE;
  return Math.max(0, Math.round(oneLineScoreAt(elapsedOneLineMs(session, now))));
}

/**
 * ВРЕМЯ ВЫШЛО — ПАРТИЯ ОКОНЧЕНА, НО УРОВЕНЬ НЕ ПОНИЖАЕТСЯ.
 *
 * ⚠️ ЗДЕСЬ ОДНО ОСОЗНАННОЕ ОТСТУПЛЕНИЕ ОТ ОБРАЗЦА, И ВОТ ПОЧЕМУ. У образца
 * лестницы уровней нет вовсе: проиграл — переиграл тот же уровень, потерял только
 * очки. У нас лестница есть, и обычный провал уровень понижает. Сложи одно с
 * другим — и человек, который сел ДУМАТЬ над трудной фигурой, окажется наказан
 * откатом назад именно за то, что думал. Это ровно та беда, из-за которой длинные
 * партии вынесли в отдельную политику провала (см. `services/failure`).
 *
 * Поэтому цена медленной партии — обнулённый счёт, а не потерянный уровень.
 */
export function expireOneLineSession(session: OneLineSession, now: number): OneLineSession {
  if (session.phase !== 'playing' || session.startedAt === null) return session;
  const elapsed = elapsedOneLineMs(session, now);
  if (!oneLineTimeIsUp(elapsed)) return session;
  return {
    ...session,
    phase: 'result',
    hintVertexIds: [],
    hintDeadEnd: false,
    result: scoreOneLineCompletion(session.puzzle, {
      durationMs: elapsed,
      undoCount: session.undoCount,
      hintsUsed: session.hintsUsed,
      invalidMoves: session.invalidMoves,
      timedOut: true,
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
  const edgeId = edgeBetween(puzzle, from, vertexId, edgeUseCounts(session.edgeTrail));
  if (!edgeId) return invalidMove(session);
  return finishIfComplete({
    ...session,
    vertexTrail: [...session.vertexTrail, vertexId],
    edgeTrail: [...session.edgeTrail, edgeId],
    hintVertexIds: [],
    hintDeadEnd: false,
  }, now);
}

export function hintOneLineMove(session: OneLineSession): OneLineSession {
  if (!isDrawingPhase(session.phase)) return session;
  const puzzle = getCurrentOneLinePuzzle(session);
  const validation = validateEulerGraph(puzzle);
  let hintVertexIds: string[];
  /** Из этого места фигуру уже не закрыть — честнее сказать, чем молчать. */
  let deadEnd = false;
  if (session.vertexTrail.length === 0) {
    hintVertexIds = validation.oddVertexIds.length === 2
      ? validation.oddVertexIds
      : puzzle.vertices.filter((vertex) => (validation.degrees[vertex.id] ?? 0) > 0).map((vertex) => vertex.id);
  } else {
    /**
     * ОДИН ХОД, А НЕ СПИСОК СОСЕДЕЙ. Прежняя подсказка подсвечивала всех, до кого
     * есть ребро; на плотной фигуре это половина доски, и почти все подсвеченные
     * ходы ведут в тупик. Человек платил за подсказку и получал перечисление того,
     * что и так видит. Теперь ход ищется решателем ОТ ТЕКУЩЕГО МЕСТА — работает и
     * после того, как человек свернул со «своего» маршрута.
     */
    const hint = nextMoveFrom(puzzle, session.vertexTrail, session.edgeTrail);
    deadEnd = hint.deadEnd;
    hintVertexIds = hint.vertexId ? [hint.vertexId] : [];
  }
  return {
    ...session,
    hintVertexIds,
    hintDeadEnd: deadEnd,
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
    hintDeadEnd: false,
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
    hintDeadEnd: false,
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
    hintDeadEnd: false,
    startedAt: null,
    pauseStartedAt: null,
  };
}

export function oneLineSessionFingerprint(session: OneLineSession): string {
  return `${session.vertexTrail.join('>')}|${session.edgeTrail.join('>')}`;
}
