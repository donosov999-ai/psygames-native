import { generateMemoryPalaceRound } from './generator';
import { scoreMemoryPalaceCompletion } from './scoring';
import {
  LEVELS,
  type MemoryPalaceActivePhase,
  type MemoryPalaceSession,
  type MemoryPalaceSessionConfig,
  type PalaceItem,
  type PalaceLocus,
  type RecallDirection,
} from './types';

function isActivePhase(phase: MemoryPalaceSession['phase']): phase is MemoryPalaceActivePhase {
  return phase === 'route'
    || phase === 'place'
    || phase === 'study'
    || phase === 'recall-forward'
    || phase === 'transition'
    || phase === 'recall-reverse';
}

export function createMemoryPalaceSession(config: MemoryPalaceSessionConfig): MemoryPalaceSession {
  const safeConfig = {
    seed: config.seed,
    level: Math.min(LEVELS, Math.max(1, Math.floor(config.level))),
  };
  const round = generateMemoryPalaceRound(safeConfig.seed, safeConfig.level);
  return {
    config: safeConfig,
    round,
    phase: 'rules',
    pausedFrom: null,
    placements: Array.from({ length: round.lociCount }, () => null),
    finalizedPlacements: null,
    selectedPlacementItemId: null,
    placementChanges: 0,
    recallIndex: 0,
    forwardResponses: [],
    reverseResponses: [],
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  };
}

export function startMemoryPalaceRound(
  session: MemoryPalaceSession,
  now: number,
): MemoryPalaceSession {
  if (session.phase !== 'rules') return session;
  return { ...session, phase: 'route', startedAt: now };
}

export function continueToPlacement(session: MemoryPalaceSession): MemoryPalaceSession {
  if (session.phase !== 'route') return session;
  return { ...session, phase: 'place', selectedPlacementItemId: null };
}

export function selectPlacementItem(
  session: MemoryPalaceSession,
  itemId: string,
): MemoryPalaceSession {
  if (session.phase !== 'place' || !session.round.targetItems.some((item) => item.id === itemId)) {
    return session;
  }
  return {
    ...session,
    selectedPlacementItemId: session.selectedPlacementItemId === itemId ? null : itemId,
  };
}

export function placeSelectedItemAtLocus(
  session: MemoryPalaceSession,
  locusIndex: number,
): MemoryPalaceSession {
  const selected = session.selectedPlacementItemId;
  if (session.phase !== 'place'
    || selected === null
    || !Number.isInteger(locusIndex)
    || locusIndex < 0
    || locusIndex >= session.round.lociCount) return session;
  const placements = [...session.placements];
  const currentIndex = placements.indexOf(selected);
  if (currentIndex === locusIndex) return { ...session, selectedPlacementItemId: null };
  const targetOccupant = placements[locusIndex] ?? null;
  if (currentIndex >= 0) placements[currentIndex] = targetOccupant;
  placements[locusIndex] = selected;
  const isRevision = currentIndex >= 0 || targetOccupant !== null;
  return {
    ...session,
    placements,
    selectedPlacementItemId: null,
    placementChanges: session.placementChanges + Number(isRevision),
  };
}

export function memoryPalacePlacementComplete(session: MemoryPalaceSession): boolean {
  return session.placements.length === session.round.lociCount
    && session.placements.every((itemId) => itemId !== null)
    && new Set(session.placements).size === session.round.lociCount;
}

export function confirmMemoryPalacePlacements(session: MemoryPalaceSession): MemoryPalaceSession {
  if (session.phase !== 'place' || !memoryPalacePlacementComplete(session)) return session;
  return {
    ...session,
    phase: 'study',
    selectedPlacementItemId: null,
    finalizedPlacements: session.placements as string[],
  };
}

export function startMemoryPalaceRecall(session: MemoryPalaceSession): MemoryPalaceSession {
  if (session.phase !== 'study' || !session.finalizedPlacements) return session;
  return {
    ...session,
    phase: 'recall-forward',
    recallIndex: 0,
    forwardResponses: [],
    reverseResponses: [],
    result: null,
  };
}

export function currentRecallDirection(session: MemoryPalaceSession): RecallDirection | null {
  if (session.phase === 'recall-forward') return 'forward';
  if (session.phase === 'recall-reverse') return 'reverse';
  return null;
}

export function currentRecallLocus(session: MemoryPalaceSession): PalaceLocus | null {
  const direction = currentRecallDirection(session);
  if (!direction) return null;
  const index = direction === 'forward'
    ? session.recallIndex
    : session.round.lociCount - 1 - session.recallIndex;
  return session.round.loci[index] ?? null;
}

export function currentRecallResponses(session: MemoryPalaceSession): readonly string[] {
  return session.phase === 'recall-reverse'
    ? session.reverseResponses
    : session.phase === 'recall-forward'
      ? session.forwardResponses
      : [];
}

export function selectRecallItem(
  session: MemoryPalaceSession,
  itemId: string,
  now: number,
): MemoryPalaceSession {
  const direction = currentRecallDirection(session);
  if (!direction || !session.finalizedPlacements) return session;
  if (!session.round.recallCandidates.some((item) => item.id === itemId)) return session;
  const responses = currentRecallResponses(session);
  if (responses.includes(itemId)) return session;
  const updatedResponses = [...responses, itemId];
  if (direction === 'forward') {
    if (updatedResponses.length < session.round.lociCount) {
      return {
        ...session,
        forwardResponses: updatedResponses,
        recallIndex: updatedResponses.length,
      };
    }
    return {
      ...session,
      phase: 'transition',
      forwardResponses: updatedResponses,
      recallIndex: 0,
    };
  }
  if (updatedResponses.length < session.round.lociCount) {
    return {
      ...session,
      reverseResponses: updatedResponses,
      recallIndex: updatedResponses.length,
    };
  }
  const result = scoreMemoryPalaceCompletion(
    session.round,
    session.finalizedPlacements,
    session.forwardResponses,
    updatedResponses,
    {
      durationMs: Math.max(0, now - (session.startedAt ?? now) - session.pausedMs),
      placementChanges: session.placementChanges,
    },
  );
  return {
    ...session,
    phase: 'result',
    reverseResponses: updatedResponses,
    recallIndex: updatedResponses.length,
    result,
  };
}

export function continueToReverseRecall(session: MemoryPalaceSession): MemoryPalaceSession {
  if (session.phase !== 'transition') return session;
  return { ...session, phase: 'recall-reverse', recallIndex: 0 };
}

export function findPalaceItem(
  session: MemoryPalaceSession,
  itemId: string | null,
): PalaceItem | null {
  if (!itemId) return null;
  return session.round.recallCandidates.find((item) => item.id === itemId) ?? null;
}

export function pauseMemoryPalaceSession(
  session: MemoryPalaceSession,
  now: number,
): MemoryPalaceSession {
  if (!isActivePhase(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    pauseStartedAt: now,
    selectedPlacementItemId: null,
  };
}

export function resumeMemoryPalaceSession(
  session: MemoryPalaceSession,
  now: number,
): MemoryPalaceSession {
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

export function restartMemoryPalaceSession(
  session: MemoryPalaceSession,
  now: number,
): MemoryPalaceSession {
  if (session.phase === 'rules') return createMemoryPalaceSession(session.config);
  return {
    ...session,
    phase: 'route',
    pausedFrom: null,
    placements: Array.from({ length: session.round.lociCount }, () => null),
    finalizedPlacements: null,
    selectedPlacementItemId: null,
    placementChanges: 0,
    recallIndex: 0,
    forwardResponses: [],
    reverseResponses: [],
    startedAt: now,
    pauseStartedAt: null,
    pausedMs: 0,
    result: null,
  };
}

export function disposeMemoryPalaceSession(session: MemoryPalaceSession): MemoryPalaceSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    placements: [],
    finalizedPlacements: null,
    selectedPlacementItemId: null,
    recallIndex: 0,
    forwardResponses: [],
    reverseResponses: [],
    startedAt: null,
    pauseStartedAt: null,
    result: null,
  };
}

export function memoryPalaceSessionFingerprint(session: MemoryPalaceSession): string {
  return JSON.stringify({
    roundId: session.round.id,
    phase: session.phase,
    placements: session.placements,
    finalizedPlacements: session.finalizedPlacements,
    selectedPlacementItemId: session.selectedPlacementItemId,
    placementChanges: session.placementChanges,
    recallIndex: session.recallIndex,
    forwardResponses: session.forwardResponses,
    reverseResponses: session.reverseResponses,
  });
}
