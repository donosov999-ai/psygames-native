import type { DotsMetrics, DotsPuzzle } from './types';

export const DOTS_CONNECT_PASS_ACCURACY = 0.8;

/**
 * Completion already requires full board coverage. Requiring 0.8 accuracy also
 * limits corrections to at most 25% of the optimal edge count, so a level is
 * cleared after an independently controlled solve rather than brute-force play.
 */
export function isPassed(metrics: DotsMetrics): boolean {
  return metrics.accuracy >= DOTS_CONNECT_PASS_ACCURACY
    && metrics.specific.coverage === 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface DotsScoringInput {
  durationMs: number;
  forwardMoves: number;
  backtracks: number;
  undoCount: number;
  invalidMoves: number;
}

export function scoreDotsCompletion(
  puzzle: DotsPuzzle,
  input: DotsScoringInput,
): DotsMetrics {
  const optimalEdges = puzzle.size * puzzle.size - puzzle.pairCount;
  const corrections = input.backtracks + input.undoCount + input.invalidMoves;
  const accuracy = clamp(optimalEdges / Math.max(1, optimalEdges + corrections), 0, 1);
  const pathEfficiency = clamp(
    optimalEdges / Math.max(optimalEdges, input.forwardMoves),
    0,
    1,
  );
  return {
    accuracy: round(accuracy),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    difficulty: puzzle.difficulty,
    errors: corrections,
    score: Math.round(accuracy * 100),
    seed: puzzle.seed,
    generatorVersion: puzzle.generatorVersion,
    details: {
      level: puzzle.level,
    },
    specific: {
      gridSize: puzzle.size,
      pairCount: puzzle.pairCount,
      forwardMoves: input.forwardMoves,
      backtracks: input.backtracks,
      undoCount: input.undoCount,
      invalidMoves: input.invalidMoves,
      optimalEdges,
      pathEfficiency: round(pathEfficiency),
      coverage: 1,
    },
  };
}
