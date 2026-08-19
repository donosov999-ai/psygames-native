export const DOTS_CONNECT_GENERATOR_VERSION = 'dots-connect-generator-v1';
export const LEVELS = 40;

export type DotsLocale = 'ru' | 'en';

export interface Cell {
  row: number;
  col: number;
}

export interface DotsPair {
  id: string;
  color: string;
  symbol: string;
  endpoints: readonly [Cell, Cell];
}

export type DotsConstruction = 'hamiltonian-cycle' | 'serpentine-path';

export interface DotsPuzzle {
  id: string;
  seed: string;
  level: number;
  size: number;
  pairCount: number;
  difficulty: number;
  construction: DotsConstruction;
  generatorVersion: typeof DOTS_CONNECT_GENERATOR_VERSION;
  pairs: DotsPair[];
}

export type DotsPaths = Record<string, Cell[]>;
export type DotsSolution = DotsPaths;

export interface GeneratedDotsPuzzle extends DotsPuzzle {
  solution: DotsSolution;
}

export interface SolutionValidation {
  valid: boolean;
  complete: boolean;
  coveredCells: number;
  totalCells: number;
  issues: string[];
}

export interface DotsMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof DOTS_CONNECT_GENERATOR_VERSION;
  details: {
    level: number;
  };
  specific: {
    gridSize: number;
    pairCount: number;
    forwardMoves: number;
    backtracks: number;
    undoCount: number;
    invalidMoves: number;
    optimalEdges: number;
    pathEfficiency: number;
    coverage: number;
  };
}

export interface DotsSessionConfig {
  seed: string;
  level: number;
}

export type DotsDrawingPhase = 'training' | 'playing';

export type DotsSessionPhase =
  | 'rules'
  | DotsDrawingPhase
  | 'training-complete'
  | 'paused'
  | 'result'
  | 'disposed';

export interface DotsSession {
  config: Required<DotsSessionConfig>;
  trainingPuzzle: GeneratedDotsPuzzle;
  puzzle: GeneratedDotsPuzzle;
  phase: DotsSessionPhase;
  pausedFrom: DotsDrawingPhase | null;
  paths: DotsPaths;
  activePairId: string | null;
  history: DotsPaths[];
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  forwardMoves: number;
  backtracks: number;
  undoCount: number;
  invalidMoves: number;
  result: DotsMetrics | null;
}
