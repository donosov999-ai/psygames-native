import { generateObjectTrackerRound } from './generator';
import { advanceTrackerWorld, cloneTrackerWorld } from './physics';
import { scoreObjectTrackerCompletion } from './scoring';
import type {
  ObjectTrackerActivePhase,
  ObjectTrackerSession,
  ObjectTrackerSessionConfig,
} from './types';

function isActivePhase(phase: ObjectTrackerSession['phase']): phase is ObjectTrackerActivePhase {
  return phase === 'preview' || phase === 'moving' || phase === 'selection';
}

function freshRound(session: ObjectTrackerSession, now: number): ObjectTrackerSession {
  return {
    ...session,
    world: cloneTrackerWorld(session.round.initialWorld),
    phase: 'preview',
    pausedFrom: null,
    selectedIds: [],
    startedAt: now,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  };
}

export function createObjectTrackerSession(config: ObjectTrackerSessionConfig): ObjectTrackerSession {
  const safeConfig: Required<ObjectTrackerSessionConfig> = {
    seed: config.seed,
    level: Math.max(1, Math.floor(config.level)),
    reducedMotion: config.reducedMotion ?? false,
  };
  const round = generateObjectTrackerRound(safeConfig.seed, safeConfig.level);
  return {
    config: safeConfig,
    round,
    world: cloneTrackerWorld(round.initialWorld),
    phase: 'rules',
    pausedFrom: null,
    selectedIds: [],
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  };
}

export function startObjectTrackerRound(
  session: ObjectTrackerSession,
  now: number,
): ObjectTrackerSession {
  if (session.phase !== 'rules') return session;
  return freshRound(session, now);
}

export function configureObjectTrackerReducedMotion(
  session: ObjectTrackerSession,
  reducedMotion: boolean,
): ObjectTrackerSession {
  if (session.config.reducedMotion === reducedMotion) return session;
  return {
    ...session,
    config: { ...session.config, reducedMotion },
  };
}

export function startTrackerMovement(session: ObjectTrackerSession): ObjectTrackerSession {
  if (session.phase !== 'preview') return session;
  return {
    ...session,
    phase: session.world.timeMs >= session.round.durationMs ? 'selection' : 'moving',
  };
}

export function advanceTrackerMovement(
  session: ObjectTrackerSession,
  deltaMs: number,
): ObjectTrackerSession {
  if (session.phase !== 'moving') return session;
  const world = advanceTrackerWorld(session.round, session.world, deltaMs);
  return {
    ...session,
    world,
    phase: world.timeMs >= session.round.durationMs ? 'selection' : 'moving',
  };
}

export function toggleTrackedObject(
  session: ObjectTrackerSession,
  objectId: string,
): ObjectTrackerSession {
  if (session.phase !== 'selection') return session;
  if (!session.world.objects.some((object) => object.id === objectId)) return session;
  const selected = new Set(session.selectedIds);
  if (selected.has(objectId)) selected.delete(objectId);
  else if (selected.size < session.round.targetCount) selected.add(objectId);
  return { ...session, selectedIds: [...selected].sort() };
}

export function submitTrackerSelection(
  session: ObjectTrackerSession,
  now: number,
): ObjectTrackerSession {
  if (session.phase !== 'selection' || session.selectedIds.length !== session.round.targetCount) {
    return session;
  }
  const startedAt = session.startedAt ?? now;
  return {
    ...session,
    phase: 'result',
    result: scoreObjectTrackerCompletion(session.round, session.selectedIds, {
      durationMs: Math.max(0, now - startedAt - session.pausedMs),
      closeApproaches: session.world.closeApproaches,
      reducedMotion: session.config.reducedMotion,
    }),
  };
}

export function pauseObjectTrackerSession(
  session: ObjectTrackerSession,
  now: number,
): ObjectTrackerSession {
  if (!isActivePhase(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    pauseStartedAt: now,
  };
}

export function resumeObjectTrackerSession(
  session: ObjectTrackerSession,
  now: number,
): ObjectTrackerSession {
  if (session.phase !== 'paused' || !session.pausedFrom) return session;
  const pausedDuration = session.pauseStartedAt === null
    ? 0
    : Math.max(0, now - session.pauseStartedAt);
  return {
    ...session,
    phase: session.pausedFrom,
    pausedFrom: null,
    pauseStartedAt: null,
    pausedMs: session.pausedMs + pausedDuration,
  };
}

export function restartObjectTrackerSession(
  session: ObjectTrackerSession,
  now: number,
): ObjectTrackerSession {
  if (session.phase === 'rules') return createObjectTrackerSession(session.config);
  return freshRound(session, now);
}

export function disposeObjectTrackerSession(session: ObjectTrackerSession): ObjectTrackerSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    selectedIds: [],
    startedAt: null,
    pauseStartedAt: null,
    result: null,
  };
}

export function objectTrackerSessionFingerprint(session: ObjectTrackerSession): string {
  return JSON.stringify({
    roundId: session.round.id,
    phase: session.phase,
    world: session.world,
    selectedIds: session.selectedIds,
  });
}
