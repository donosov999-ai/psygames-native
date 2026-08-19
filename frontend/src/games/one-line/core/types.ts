export const ONE_LINE_GENERATOR_VERSION = 'one-line-generator-v1';
export const LEVELS = 48;

/**
 * ЯЗЫКИ — ВСЕ ДВЕНАДЦАТЬ, А НЕ ПАРА RU/EN.
 *
 * В лаборатории тип был `'ru' | 'en'`, и это не мелочь типизации: у приложения
 * двенадцать локалей (LanguageContext), и модуль со словарём на два языка выдал
 * бы немцу, японцу и корейцу английский текст посреди переведённого экрана.
 * Список держим ОДИН в один с `type Language` приложения; сверяется гейтом
 * games-module-i18n.
 */
export type OneLineLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяются словари в тестах. */
export const ONE_LINE_LOCALES: readonly OneLineLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];

export interface GraphVertex {
  id: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  a: string;
  b: string;
}

export interface OneLinePuzzle {
  id: string;
  seed: string;
  level: number;
  difficulty: number;
  vertices: GraphVertex[];
  edges: GraphEdge[];
  visualCrossings: number;
  isCircuit: boolean;
  startHintVertexId: string | null;
  generatorVersion: typeof ONE_LINE_GENERATOR_VERSION;
}

export interface EulerSolution {
  vertexIds: string[];
  edgeIds: string[];
}

export interface GeneratedOneLinePuzzle extends OneLinePuzzle {
  solution: EulerSolution;
}

export interface GraphValidation {
  valid: boolean;
  connected: boolean;
  oddVertexIds: string[];
  degrees: Record<string, number>;
  issues: string[];
}

export interface OneLineMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof ONE_LINE_GENERATOR_VERSION;
  details: {
    level: number;
  };
  specific: {
    vertexCount: number;
    edgeCount: number;
    visualCrossings: number;
    isCircuit: boolean;
    undoCount: number;
    hintsUsed: number;
    invalidMoves: number;
    pathEfficiency: number;
  };
}

export interface OneLineSessionConfig {
  seed: string;
  level: number;
}

export type OneLineDrawingPhase = 'training' | 'playing';

export type OneLineSessionPhase =
  | 'rules'
  | OneLineDrawingPhase
  | 'training-complete'
  | 'paused'
  | 'result'
  | 'disposed';

export interface OneLineSession {
  config: Required<OneLineSessionConfig>;
  trainingPuzzle: GeneratedOneLinePuzzle;
  puzzle: GeneratedOneLinePuzzle;
  phase: OneLineSessionPhase;
  pausedFrom: OneLineDrawingPhase | null;
  vertexTrail: string[];
  edgeTrail: string[];
  hintVertexIds: string[];
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  undoCount: number;
  hintsUsed: number;
  invalidMoves: number;
  result: OneLineMetrics | null;
}
