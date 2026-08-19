import { angularDifference, homeSectorAngle } from './geometry';
import type {
  HomeSector,
  NavigatorMetrics,
  NavigatorRound,
} from './types';

export interface NavigatorScoreState {
  durationMs: number;
  routeHits: number;
  extraSteps: number;
  turnHits: number;
  selectedHomeSector: HomeSector | null;
}

export function isPassed(metrics: NavigatorMetrics): boolean {
  if (metrics.specific.mode === 'home-direction') {
    return metrics.specific.angularErrorDeg !== null
      && metrics.specific.angularErrorDeg <= 22.5;
  }
  return metrics.accuracy >= 0.8;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scoreNavigatorCompletion(
  round: NavigatorRound,
  state: NavigatorScoreState,
): NavigatorMetrics {
  const angularErrorDeg = round.mode === 'home-direction' && state.selectedHomeSector
    ? angularDifference(
      homeSectorAngle(state.selectedHomeSector),
      round.homeBearingDeg,
    )
    : null;
  const routeAccuracy = round.mode === 'route-recall'
    ? round.routeSteps / Math.max(1, round.routeSteps + state.extraSteps)
    : round.mode === 'turn-sequence'
      ? state.turnHits / round.routeSteps
      : null;
  const accuracy = routeAccuracy ?? clamp(1 - (angularErrorDeg ?? 180) / 180, 0, 1);
  const errors = round.mode === 'route-recall'
    ? state.extraSteps
    : round.mode === 'turn-sequence'
      ? round.routeSteps - state.turnHits
      : state.selectedHomeSector === round.correctHomeSector ? 0 : 1;
  const score = Math.round(clamp(
    accuracy * 1_000 + round.difficulty * 5 - errors * 35,
    0,
    1_500,
  ));

  return {
    accuracy,
    durationMs: Math.max(0, Math.round(state.durationMs)),
    difficulty: round.difficulty,
    errors,
    score,
    seed: round.seed,
    generatorVersion: round.generatorVersion,
    details: {
      level: round.level,
    },
    specific: {
      mode: round.mode,
      gridSize: round.gridSize,
      routeSteps: round.routeSteps,
      routeAccuracy,
      extraSteps: round.mode === 'route-recall' ? state.extraSteps : 0,
      angularErrorDeg,
      routeHits: round.mode === 'route-recall' ? state.routeHits : 0,
      turnHits: round.mode === 'turn-sequence' ? state.turnHits : 0,
      turnTotal: round.mode === 'turn-sequence' ? round.routeSteps : 0,
      selectedHomeSector: state.selectedHomeSector,
      correctHomeSector: round.correctHomeSector,
      mapRotation: round.mapRotation,
      landmarkCount: round.landmarks.length,
      falseBranchCount: round.falseBranches.length,
      hideMapDuringRecall: round.hideMapDuringRecall,
      delaySteps: round.delaySteps,
    },
  };
}
