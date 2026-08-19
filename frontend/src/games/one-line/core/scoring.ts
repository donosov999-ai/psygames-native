import type { OneLineMetrics, OneLinePuzzle } from './types';

export const ONE_LINE_PASS_ACCURACY = 0.8;

/**
 * A result already proves that every edge was consumed in one continuous trail.
 * At 0.8 accuracy, weighted corrections (undo/invalid = 1, hint = 0.5) may use
 * at most 25% of the graph's edge count, allowing recovery without brute force.
 */
export function isPassed(metrics: OneLineMetrics): boolean {
  return metrics.accuracy >= ONE_LINE_PASS_ACCURACY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface OneLineScoringInput {
  durationMs: number;
  undoCount: number;
  hintsUsed: number;
  invalidMoves: number;
}

export function scoreOneLineCompletion(
  puzzle: OneLinePuzzle,
  input: OneLineScoringInput,
): OneLineMetrics {
  const edgeCount = puzzle.edges.length;
  const errors = input.undoCount + input.invalidMoves;
  const weightedCorrections = errors + input.hintsUsed * 0.5;
  const accuracy = clamp(edgeCount / Math.max(1, edgeCount + weightedCorrections), 0, 1);
  const pathEfficiency = clamp(
    edgeCount / Math.max(edgeCount, edgeCount + input.undoCount + input.invalidMoves),
    0,
    1,
  );
  return {
    accuracy: round(accuracy),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    difficulty: puzzle.difficulty,
    errors,
    score: Math.round(accuracy * 100),
    seed: puzzle.seed,
    generatorVersion: puzzle.generatorVersion,
    details: {
      level: puzzle.level,
    },
    specific: {
      vertexCount: puzzle.vertices.length,
      edgeCount,
      visualCrossings: puzzle.visualCrossings,
      isCircuit: puzzle.isCircuit,
      undoCount: input.undoCount,
      hintsUsed: input.hintsUsed,
      invalidMoves: input.invalidMoves,
      pathEfficiency: round(pathEfficiency),
    },
  };
}
