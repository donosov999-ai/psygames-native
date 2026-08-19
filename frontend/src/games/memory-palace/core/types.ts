export const MEMORY_PALACE_GENERATOR_VERSION = 'memory-palace-generator-v1';
export const LEVELS = 15;
export const RECALL_DIRECTIONS = ['forward', 'reverse'] as const;

export type MemoryPalaceLocale = 'ru' | 'en';
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

export interface LocalizedLabel {
  ru: string;
  en: string;
}

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
  placementChanges: number;
  recallIndex: number;
  forwardResponses: string[];
  reverseResponses: string[];
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  result: MemoryPalaceMetrics | null;
}
