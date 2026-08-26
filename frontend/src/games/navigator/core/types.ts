/* psygames-navigator-types · VER 2 · 19.08.2026 */
export const NAVIGATOR_GENERATOR_VERSION = 'navigator-generator-v1';
export const LEVELS = 33;
export const NAVIGATOR_MODES = ['route-recall', 'turn-sequence', 'home-direction'] as const;
export const CARDINAL_DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export const TURN_INSTRUCTIONS = ['left', 'straight', 'right'] as const;
export const HOME_SECTORS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

/**
 * ЯЗЫКИ — ВСЕ ДВЕНАДЦАТЬ, А НЕ ПАРА RU/EN. В лаборатории тип был `'ru' | 'en'`,
 * и модуль со словарём на два языка выдавал немцу, японцу и корейцу английские
 * «North-east» на кнопках ответа. Список держим ОДИН в один с `type Language`
 * приложения; сверяется гейтом games-module-i18n.
 */
export type NavigatorLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяются словари в тестах. */
export const NAVIGATOR_LOCALES: readonly NavigatorLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];
export type NavigatorMode = typeof NAVIGATOR_MODES[number];
export type CardinalDirection = typeof CARDINAL_DIRECTIONS[number];
export type TurnInstruction = typeof TURN_INSTRUCTIONS[number];
export type HomeSector = typeof HOME_SECTORS[number];
export type MapRotation = 0 | 90 | 180 | 270;

export interface GridCell {
  x: number;
  y: number;
}

export interface NavigatorLandmark {
  id: string;
  cell: GridCell;
  symbol: 'diamond' | 'circle' | 'triangle' | 'star' | 'square';
}

export interface NavigatorFalseBranch {
  from: GridCell;
  to: GridCell;
}

export interface NavigatorRound {
  id: string;
  seed: string;
  level: number;
  mode: NavigatorMode;
  difficulty: number;
  gridSize: number;
  routeSteps: number;
  route: GridCell[];
  routeDirections: CardinalDirection[];
  startingFacing: CardinalDirection;
  turns: TurnInstruction[];
  landmarks: NavigatorLandmark[];
  falseBranches: NavigatorFalseBranch[];
  mapRotation: MapRotation;
  hideMapDuringRecall: boolean;
  delaySteps: number;
  homeBearingDeg: number;
  correctHomeSector: HomeSector;
  generatorVersion: typeof NAVIGATOR_GENERATOR_VERSION;
}

export interface NavigatorMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof NAVIGATOR_GENERATOR_VERSION;
  details: {
    level: number;
  };
  specific: {
    mode: NavigatorMode;
    gridSize: number;
    routeSteps: number;
    routeAccuracy: number | null;
    extraSteps: number;
    angularErrorDeg: number | null;
    routeHits: number;
    turnHits: number;
    turnTotal: number;
    selectedHomeSector: HomeSector | null;
    correctHomeSector: HomeSector;
    mapRotation: MapRotation;
    landmarkCount: number;
    falseBranchCount: number;
    hideMapDuringRecall: boolean;
    delaySteps: number;
  };
}

export interface NavigatorSessionConfig {
  seed: string;
  level: number;
  mode?: NavigatorMode;
}

export type NavigatorActivePhase = 'study' | 'delay' | 'recall';
export type NavigatorSessionPhase =
  | 'rules'
  | NavigatorActivePhase
  | 'paused'
  | 'result'
  | 'disposed';

export interface NavigatorSession {
  config: Required<NavigatorSessionConfig>;
  round: NavigatorRound;
  phase: NavigatorSessionPhase;
  pausedFrom: NavigatorActivePhase | null;
  delayIndex: number;
  routeIndex: number;
  currentCell: GridCell;
  routeHits: number;
  extraSteps: number;
  turnIndex: number;
  turnHits: number;
  selectedHomeSector: HomeSector | null;
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  result: NavigatorMetrics | null;
}
