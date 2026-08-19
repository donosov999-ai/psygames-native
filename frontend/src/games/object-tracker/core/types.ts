export const OBJECT_TRACKER_GENERATOR_VERSION = 'object-tracker-generator-v1';
export const TRACKER_OBJECT_RADIUS = 0.068;
export const LEVELS = 41;

export type ObjectTrackerLocale = 'ru' | 'en';

export interface TrackerObjectState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TrackerWorld {
  timeMs: number;
  objects: TrackerObjectState[];
  closeApproaches: number;
  closePairs: string[];
}

export interface ObjectTrackerRound {
  id: string;
  seed: string;
  level: number;
  difficulty: number;
  objectCount: number;
  targetCount: number;
  targetIds: string[];
  initialWorld: TrackerWorld;
  objectRadius: typeof TRACKER_OBJECT_RADIUS;
  speed: number;
  speedTier: number;
  durationMs: number;
  durationTier: number;
  closeApproachStrength: number;
  closeApproachTier: number;
  generatorVersion: typeof OBJECT_TRACKER_GENERATOR_VERSION;
}

export interface TrackerWorldValidation {
  valid: boolean;
  insideField: boolean;
  nonOverlapping: boolean;
  finite: boolean;
  minimumGap: number;
  maximumDisplacement: number;
  issues: string[];
}

export interface ObjectTrackerMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof OBJECT_TRACKER_GENERATOR_VERSION;
  details: {
    level: number;
  };
  specific: {
    objectCount: number;
    targetCount: number;
    hits: number;
    misses: number;
    falseSelections: number;
    selectedCount: number;
    speed: number;
    motionDurationMs: number;
    closeApproachStrength: number;
    closeApproaches: number;
    reducedMotion: boolean;
  };
}

export interface ObjectTrackerSessionConfig {
  seed: string;
  level: number;
  reducedMotion?: boolean;
}

export type ObjectTrackerActivePhase = 'preview' | 'moving' | 'selection';
export type ObjectTrackerSessionPhase =
  | 'rules'
  | ObjectTrackerActivePhase
  | 'paused'
  | 'result'
  | 'disposed';

export interface ObjectTrackerSession {
  config: Required<ObjectTrackerSessionConfig>;
  round: ObjectTrackerRound;
  world: TrackerWorld;
  phase: ObjectTrackerSessionPhase;
  pausedFrom: ObjectTrackerActivePhase | null;
  selectedIds: string[];
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  result: ObjectTrackerMetrics | null;
}
