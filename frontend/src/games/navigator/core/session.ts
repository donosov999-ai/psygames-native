import { navigatorModeForLevel, generateNavigatorRound } from './generator';
import { unrotateCardinal, unrotateHomeSector } from './geometry';
import {
  cardinalFromKey,
  cardinalFromSwipe,
  homeSectorFromKey,
  homeSectorFromSwipe,
  turnFromKey,
  turnFromSwipe,
} from './input';
import { scoreNavigatorCompletion } from './scoring';
import {
  LEVELS,
  type CardinalDirection,
  type HomeSector,
  type NavigatorActivePhase,
  type NavigatorSession,
  type NavigatorSessionConfig,
  type TurnInstruction,
} from './types';

function isActivePhase(phase: NavigatorSession['phase']): phase is NavigatorActivePhase {
  return phase === 'study' || phase === 'delay' || phase === 'recall';
}

function freshRound(session: NavigatorSession, now: number): NavigatorSession {
  return {
    ...session,
    phase: 'study',
    pausedFrom: null,
    delayIndex: 0,
    routeIndex: 0,
    currentCell: { ...session.round.route[0]! },
    routeHits: 0,
    extraSteps: 0,
    turnIndex: 0,
    turnHits: 0,
    selectedHomeSector: null,
    startedAt: now,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  };
}

export function createNavigatorSession(config: NavigatorSessionConfig): NavigatorSession {
  const level = Math.min(LEVELS, Math.max(1, Math.floor(config.level)));
  const mode = config.mode ?? navigatorModeForLevel(level);
  const safeConfig: Required<NavigatorSessionConfig> = {
    seed: config.seed,
    level,
    mode,
  };
  const round = generateNavigatorRound(safeConfig.seed, safeConfig.level, safeConfig.mode);
  return {
    config: safeConfig,
    round,
    phase: 'rules',
    pausedFrom: null,
    delayIndex: 0,
    routeIndex: 0,
    currentCell: { ...round.route[0]! },
    routeHits: 0,
    extraSteps: 0,
    turnIndex: 0,
    turnHits: 0,
    selectedHomeSector: null,
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  };
}

export function startNavigatorRound(session: NavigatorSession, now: number): NavigatorSession {
  if (session.phase !== 'rules') return session;
  return freshRound(session, now);
}

export function completeNavigatorStudy(session: NavigatorSession): NavigatorSession {
  if (session.phase !== 'study') return session;
  return {
    ...session,
    phase: session.round.delaySteps > 0 ? 'delay' : 'recall',
    delayIndex: 0,
  };
}

export function advanceNavigatorDelay(session: NavigatorSession): NavigatorSession {
  if (session.phase !== 'delay') return session;
  const nextIndex = session.delayIndex + 1;
  return {
    ...session,
    delayIndex: nextIndex,
    phase: nextIndex >= session.round.delaySteps ? 'recall' : 'delay',
  };
}

function finishNavigator(session: NavigatorSession, now: number): NavigatorSession {
  const startedAt = session.startedAt ?? now;
  return {
    ...session,
    phase: 'result',
    result: scoreNavigatorCompletion(session.round, {
      durationMs: Math.max(0, now - startedAt - session.pausedMs),
      routeHits: session.routeHits,
      extraSteps: session.extraSteps,
      turnHits: session.turnHits,
      selectedHomeSector: session.selectedHomeSector,
    }),
  };
}

export function inputNavigatorRouteDirection(
  session: NavigatorSession,
  screenDirection: CardinalDirection,
  now: number,
): NavigatorSession {
  if (session.phase !== 'recall' || session.round.mode !== 'route-recall') return session;
  const logicalDirection = unrotateCardinal(screenDirection, session.round.mapRotation);
  const expected = session.round.routeDirections[session.routeIndex];
  if (logicalDirection !== expected) return { ...session, extraSteps: session.extraSteps + 1 };
  const nextIndex = session.routeIndex + 1;
  const updated: NavigatorSession = {
    ...session,
    routeIndex: nextIndex,
    routeHits: session.routeHits + 1,
    currentCell: { ...session.round.route[nextIndex]! },
  };
  return nextIndex >= session.round.routeSteps ? finishNavigator(updated, now) : updated;
}

export function inputNavigatorTurn(
  session: NavigatorSession,
  turn: TurnInstruction,
  now: number,
): NavigatorSession {
  if (session.phase !== 'recall' || session.round.mode !== 'turn-sequence') return session;
  const expected = session.round.turns[session.turnIndex];
  const nextIndex = session.turnIndex + 1;
  const updated: NavigatorSession = {
    ...session,
    turnIndex: nextIndex,
    turnHits: session.turnHits + (turn === expected ? 1 : 0),
  };
  return nextIndex >= session.round.routeSteps ? finishNavigator(updated, now) : updated;
}

export function inputNavigatorHomeSector(
  session: NavigatorSession,
  screenSector: HomeSector,
  now: number,
): NavigatorSession {
  if (session.phase !== 'recall' || session.round.mode !== 'home-direction') return session;
  const logicalSector = unrotateHomeSector(screenSector, session.round.mapRotation);
  return finishNavigator({ ...session, selectedHomeSector: logicalSector }, now);
}

export function handleNavigatorKey(
  session: NavigatorSession,
  key: string,
  now: number,
): NavigatorSession {
  if (session.phase !== 'recall') return session;
  if (session.round.mode === 'route-recall') {
    const direction = cardinalFromKey(key);
    return direction ? inputNavigatorRouteDirection(session, direction, now) : session;
  }
  if (session.round.mode === 'turn-sequence') {
    const turn = turnFromKey(key);
    return turn ? inputNavigatorTurn(session, turn, now) : session;
  }
  const sector = homeSectorFromKey(key);
  return sector ? inputNavigatorHomeSector(session, sector, now) : session;
}

export function handleNavigatorSwipe(
  session: NavigatorSession,
  deltaX: number,
  deltaY: number,
  now: number,
): NavigatorSession {
  if (session.phase !== 'recall') return session;
  if (session.round.mode === 'route-recall') {
    const direction = cardinalFromSwipe(deltaX, deltaY);
    return direction ? inputNavigatorRouteDirection(session, direction, now) : session;
  }
  if (session.round.mode === 'turn-sequence') {
    const turn = turnFromSwipe(deltaX, deltaY);
    return turn ? inputNavigatorTurn(session, turn, now) : session;
  }
  const sector = homeSectorFromSwipe(deltaX, deltaY);
  return sector ? inputNavigatorHomeSector(session, sector, now) : session;
}

export function pauseNavigatorSession(session: NavigatorSession, now: number): NavigatorSession {
  if (!isActivePhase(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    pauseStartedAt: now,
  };
}

export function resumeNavigatorSession(session: NavigatorSession, now: number): NavigatorSession {
  if (session.phase !== 'paused' || !session.pausedFrom) return session;
  const pauseDuration = session.pauseStartedAt === null
    ? 0
    : Math.max(0, now - session.pauseStartedAt);
  return {
    ...session,
    phase: session.pausedFrom,
    pausedFrom: null,
    pauseStartedAt: null,
    pausedMs: session.pausedMs + pauseDuration,
  };
}

export function restartNavigatorSession(session: NavigatorSession, now: number): NavigatorSession {
  if (session.phase === 'rules') return createNavigatorSession(session.config);
  return freshRound(session, now);
}

export function disposeNavigatorSession(session: NavigatorSession): NavigatorSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    selectedHomeSector: null,
    startedAt: null,
    pauseStartedAt: null,
    result: null,
  };
}

export function navigatorSessionFingerprint(session: NavigatorSession): string {
  return JSON.stringify({
    roundId: session.round.id,
    phase: session.phase,
    delayIndex: session.delayIndex,
    routeIndex: session.routeIndex,
    currentCell: session.currentCell,
    routeHits: session.routeHits,
    extraSteps: session.extraSteps,
    turnIndex: session.turnIndex,
    turnHits: session.turnHits,
    selectedHomeSector: session.selectedHomeSector,
  });
}
