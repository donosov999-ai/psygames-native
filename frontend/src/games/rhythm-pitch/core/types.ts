/* psygames-rhythm-pitch-types · VER 2 · 19.08.2026 */
export const RHYTHM_PITCH_GENERATOR_VERSION = 'rhythm-pitch-generator-v1';
export const LEVELS = 31;
export const RHYTHM_PITCH_MODES = ['rhythm-echo', 'pitch-path'] as const;
export const PITCH_LEVELS = ['low', 'mid', 'high'] as const;

/**
 * ЯЗЫКИ — ВСЕ ДВЕНАДЦАТЬ, А НЕ ПАРА RU/EN. В лаборатории тип был `'ru' | 'en'`,
 * и модуль со словарём на два языка выдавал немцу, японцу и корейцу английские
 * подписи на кнопках ответа — в игре, где отвечают на слух. Список держим ОДИН
 * в один с `type Language` приложения; сверяется гейтом games-module-i18n.
 */
export type RhythmPitchLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяются словари в тестах. */
export const RHYTHM_PITCH_LOCALES: readonly RhythmPitchLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];
export type RhythmPitchMode = typeof RHYTHM_PITCH_MODES[number];
export type PitchLevel = typeof PITCH_LEVELS[number];
export type PitchDirection = 'higher' | 'lower';
export type PitchTask = 'direction' | 'sequence';

export interface RhythmBeat {
  onsetMs: number;
  accent: boolean;
}

export interface AudioRoundBase {
  id: string;
  seed: string;
  level: number;
  difficulty: number;
  generatorVersion: typeof RHYTHM_PITCH_GENERATOR_VERSION;
  tutorialReplay: boolean;
}

export interface RhythmEchoRound extends AudioRoundBase {
  mode: 'rhythm-echo';
  beatCount: number;
  bpm: number;
  unitMs: number;
  beats: RhythmBeat[];
  pauseCount: number;
  syncopationCount: number;
  accentCount: number;
}

export interface PitchPathRound extends AudioRoundBase {
  mode: 'pitch-path';
  task: PitchTask;
  toneCount: number;
  pitchLevelCount: 2 | 3;
  intervalSemitones: number;
  frequenciesHz: number[];
  sequence: number[];
  directionAnswer: PitchDirection | null;
}

export type RhythmPitchRound = RhythmEchoRound | PitchPathRound;

export interface RhythmPitchMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof RHYTHM_PITCH_GENERATOR_VERSION;
  details: {
    level: number;
  };
  specific: {
    mode: RhythmPitchMode;
    calibrationOffsetMs: number;
    calibrationSamples: number;
    replayCount: number;
    timingAccuracy: number | null;
    meanTimingErrorMs: number | null;
    missingTaps: number;
    extraTaps: number;
    beatCount: number;
    bpm: number | null;
    pauseCount: number;
    syncopationCount: number;
    accentCount: number;
    pitchTask: PitchTask | null;
    pitchAccuracy: number | null;
    toneCount: number;
    pitchLevelCount: number;
    intervalSemitones: number | null;
    minimumFrequencyHz: number | null;
    maximumFrequencyHz: number | null;
  };
}

export interface RhythmPitchSessionConfig {
  seed: string;
  level: number;
  mode?: RhythmPitchMode;
}

export type RhythmPitchActivePhase = 'calibration' | 'ready' | 'playback' | 'response';
export type RhythmPitchSessionPhase =
  | 'rules'
  | RhythmPitchActivePhase
  | 'paused'
  | 'result'
  | 'unavailable'
  | 'disposed';

export interface RhythmPitchSession {
  config: Required<RhythmPitchSessionConfig>;
  round: RhythmPitchRound;
  phase: RhythmPitchSessionPhase;
  pausedFrom: RhythmPitchActivePhase | null;
  volume: number;
  calibrationPlaying: boolean;
  calibrationComplete: boolean;
  calibrationExpectedTimes: number[];
  calibrationTaps: number[];
  calibrationOffsetMs: number;
  calibrationSamples: number;
  responseStartedAt: number | null;
  rhythmTaps: number[];
  pitchDirectionResponse: PitchDirection | null;
  pitchSequenceResponse: number[];
  replayCount: number;
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  audioError: string | null;
  result: RhythmPitchMetrics | null;
}
