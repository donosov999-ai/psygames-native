/* psygames-object-tracker-scoring · VER 1 · 19.08.2026 */
import type {
  ObjectTrackerMetrics,
  ObjectTrackerRound,
} from './types';

export interface ObjectTrackerScoreOptions {
  durationMs: number;
  closeApproaches: number;
  reducedMotion: boolean;
}

export function isPassed(metrics: ObjectTrackerMetrics): boolean {
  return metrics.accuracy >= 0.6 && metrics.specific.falseSelections <= 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scoreObjectTrackerCompletion(
  round: ObjectTrackerRound,
  selectedIds: readonly string[],
  options: ObjectTrackerScoreOptions,
): ObjectTrackerMetrics {
  const targetIds = new Set(round.targetIds);
  const objectIds = new Set(round.initialWorld.objects.map((object) => object.id));
  const uniqueSelections = [...new Set(selectedIds)].filter((id) => objectIds.has(id));
  const hits = uniqueSelections.filter((id) => targetIds.has(id)).length;
  const misses = round.targetCount - hits;
  const falseSelections = uniqueSelections.filter((id) => !targetIds.has(id)).length;
  const errors = misses + falseSelections;
  const denominator = hits + errors;
  const accuracy = denominator === 0 ? 0 : hits / denominator;
  const score = Math.round(clamp(
    accuracy * 1_000
      + round.difficulty * 4
      + Math.min(50, options.closeApproaches) * 2
      - errors * 40,
    0,
    2_000,
  ));

  return {
    accuracy,
    durationMs: Math.max(0, Math.round(options.durationMs)),
    difficulty: round.difficulty,
    errors,
    score,
    seed: round.seed,
    generatorVersion: round.generatorVersion,
    details: {
      level: round.level,
    },
    specific: {
      objectCount: round.objectCount,
      targetCount: round.targetCount,
      hits,
      misses,
      falseSelections,
      selectedCount: uniqueSelections.length,
      speed: round.speed,
      motionDurationMs: round.durationMs,
      closeApproachStrength: round.closeApproachStrength,
      closeApproaches: Math.max(0, Math.floor(options.closeApproaches)),
      reducedMotion: options.reducedMotion,
    },
  };
}
