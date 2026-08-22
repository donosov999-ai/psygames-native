export const MEMORY_PALACE_GENERATOR_VERSION = 'memory-palace-generator-v1';
export const LEVELS = 15;
export const RECALL_DIRECTIONS = ['forward', 'reverse'] as const;

/**
 * ЯЗЫКИ — ВСЕ ДВЕНАДЦАТЬ, А НЕ ПАРА RU/EN. В лаборатории тип был `'ru' | 'en'`,
 * и модуль со словарём на два языка выдавал немцу, японцу и корейцу английский
 * текст посреди переведённого экрана. Список держим ОДИН в один с
 * `type Language` приложения; сверяется гейтом games-module-i18n.
 */
export type MemoryPalaceLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяются словари в тестах. */
export const MEMORY_PALACE_LOCALES: readonly MemoryPalaceLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];
export type RecallDirection = typeof RECALL_DIRECTIONS[number];
export type LocusMotif =
  | 'arch'
  | 'water'
  | 'frames'
  | 'steps'
  | 'window'
  | 'shelves'
  | 'rail'
  | 'plant'
  | 'tools'
  | 'spire'
  | 'span'
  | 'stars';
export type ItemShape = 'round' | 'square' | 'diamond' | 'triangle' | 'capsule' | 'arch';

/**
 * 🔴 ПОДПИСЬ МЕСТА И ПРЕДМЕТА — МАТЕРИАЛ УПРАЖНЕНИЯ, А НЕ УКРАШЕНИЕ. Человек
 * запоминает связку «Фонтан → Синяя книга» и потом называет её вслух себе;
 * английское `Fountain` посреди японского экрана ломает не вид, а сам приём.
 * Поэтому подпись обязана быть на ВСЕХ двенадцати языках, а не на паре ru/en.
 */
export type LocalizedLabel = Record<MemoryPalaceLocale, string>;

export interface PalaceLocus {
  id: string;
  order: number;
  label: LocalizedLabel;
  motif: LocusMotif;
  color: string;
}

export interface PalaceItem {
  id: string;
  label: LocalizedLabel;
  shape: ItemShape;
  color: string;
  accent: string;
}

export interface MemoryPalaceRound {
  id: string;
  seed: string;
  level: number;
  difficulty: number;
  generatorVersion: typeof MEMORY_PALACE_GENERATOR_VERSION;
  lociCount: number;
  loci: PalaceLocus[];
  targetItems: PalaceItem[];
  distractorItems: PalaceItem[];
  recallCandidates: PalaceItem[];
  directions: readonly ['forward', 'reverse'];
}

export interface DirectionRecallScore {
  direction: RecallDirection;
  itemKnowledgeHits: number;
  locationHits: number;
  orderPairHits: number;
  orderPairTotal: number;
  responses: number;
}

export interface MemoryPalaceMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof MEMORY_PALACE_GENERATOR_VERSION;
  details: {
    level: number;
  };
  specific: {
    lociCount: number;
    targetItemCount: number;
    distractorCount: number;
    placementChanges: number;
    itemKnowledgeAccuracy: number;
    locationAccuracy: number;
    orderAccuracy: number;
    forwardLocationAccuracy: number;
    reverseLocationAccuracy: number;
    itemKnowledgeHits: number;
    locationHits: number;
    orderPairHits: number;
    orderPairTotal: number;
    directionScores: DirectionRecallScore[];
  };
}

export interface MemoryPalaceSessionConfig {
  seed: string;
  level: number;
}

export type MemoryPalaceActivePhase =
  | 'route'
  | 'place'
  | 'study'
  | 'recall-forward'
  | 'transition'
  | 'recall-reverse';

export type MemoryPalaceSessionPhase =
  | 'rules'
  | MemoryPalaceActivePhase
  | 'paused'
  | 'result'
  | 'disposed';

export interface MemoryPalaceSession {
  config: Required<MemoryPalaceSessionConfig>;
  round: MemoryPalaceRound;
  phase: MemoryPalaceSessionPhase;
  pausedFrom: MemoryPalaceActivePhase | null;
  placements: (string | null)[];
  finalizedPlacements: string[] | null;
  selectedPlacementItemId: string | null;
  /**
   * Выбранное МЕСТО, когда человек начал с него, а не с предмета.
   *
   * 🔴 ОТЧЁТ ВАЛИ 22.08.2026: «нажимаю разное, не запускается, не выбирается».
   * Раскладка требовала строгого порядка — сперва предмет, потом место, — и
   * касание места до выбора предмета молча не делало НИЧЕГО. Человек, который
   * думает «вот сюда положу вазу», упирался в игру, которая не отвечает, и не
   * узнавал почему. Теперь порядок любой.
   */
  selectedPlacementLocusIndex: number | null;
  placementChanges: number;
  recallIndex: number;
  forwardResponses: string[];
  reverseResponses: string[];
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  result: MemoryPalaceMetrics | null;
}
