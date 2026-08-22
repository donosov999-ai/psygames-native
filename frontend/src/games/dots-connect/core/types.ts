/**
 * ⚠️ ВЕРСИЯ ГЕНЕРАТОРА ПОДНЯТА ДО v2 — РАСКЛАДКИ ДРУГИЕ.
 *
 * v1 резал на куски ОДНУ И ТУ ЖЕ змейку (или один и тот же гамильтонов цикл),
 * v2 трясёт её backbite-ом и режет с нижней границей длины. Одно и то же зерно
 * на одном и том же уровне даёт РАЗНУЮ доску в v1 и v2, поэтому версия обязана
 * смениться: она уезжает в `saveSession` и по ней разбирают старые партии.
 */
export const DOTS_CONNECT_GENERATOR_VERSION = 'dots-connect-generator-v2';
export const LEVELS = 40;

/**
 * Языки собственного словаря модуля. Раньше было `'ru' | 'en'`, и человек с
 * интерфейсом на японском читал внутри партии английские подписи — ровно та
 * дыра, из-за которой заведён гейт `games-module-i18n`. Список совпадает с
 * `LANGUAGES` приложения.
 */
export type DotsLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

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

export type DotsConstruction = 'hamiltonian-cycle' | 'serpentine-path' | 'shaken-hamiltonian-path';

export interface DotsPuzzle {
  id: string;
  seed: string;
  level: number;
  size: number;
  pairCount: number;
  /**
   * Нижняя граница длины пути пары в клетках. Третья ось сложности рядом с
   * размером и числом пар: пара из двух соседних точек соединяется одним
   * движением и подарком не является.
   */
  minPathLength: number;
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
