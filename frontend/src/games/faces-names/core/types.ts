export const FACES_NAMES_GENERATOR_VERSION = 'faces-names-generator-v1';
export const LEVELS = 33;

/**
 * ЯЗЫКИ — ВСЕ ДВЕНАДЦАТЬ, А НЕ ПАРА RU/EN.
 *
 * В лаборатории тип был `'ru' | 'en'`, и это не мелочь типизации: у приложения
 * двенадцать локалей (LanguageContext), и модуль со словарём на два языка выдал
 * бы немцу, японцу и корейцу английский текст посреди переведённого экрана —
 * ровно тот класс ошибки, ради которого написан ci-i18n-hardcode-guard. Список
 * держим ОДИН в один с `type Language` приложения.
 */
export type FacesNamesLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок здесь неважен, важна полнота: по нему сверяются словари в тестах. */
export const FACES_NAMES_LOCALES: readonly FacesNamesLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];
export type FaceShape = 'oval' | 'round' | 'long' | 'angular';
export type HairStyle = 'crop' | 'wave' | 'curve' | 'parted';

export interface SyntheticFaceSpec {
  assetId: string;
  source: 'procedural-synthetic';
  family: number;
  variant: number;
  backgroundColor: string;
  faceTone: string;
  hairColor: string;
  accentColor: string;
  faceShape: FaceShape;
  hairStyle: HairStyle;
  eyeSpacing: number;
  glasses: boolean;
  mouthCurve: number;
  fingerprint: string;
}

export interface SyntheticPerson {
  id: string;
  face: SyntheticFaceSpec;
  name: string;
  factId: string;
}

export interface InterferencePrompt {
  id: string;
  left: number;
  right: number;
  answer: number;
  options: number[];
}

export interface FacesNamesTrial {
  id: string;
  targetPersonId: string;
  recognitionPersonIds: string[];
  namePersonIds: string[];
  factIds: string[];
}

export interface FacesNamesPuzzle {
  id: string;
  seed: string;
  level: number;
  difficulty: number;
  people: SyntheticPerson[];
  studiedPersonIds: string[];
  trials: FacesNamesTrial[];
  interferencePrompts: InterferencePrompt[];
  factRecallEnabled: boolean;
  immediateRecall: boolean;
  meanFaceSimilarity: number;
  meanNameSimilarity: number;
  meanRecognitionDistractorSimilarity: number;
  generatorVersion: typeof FACES_NAMES_GENERATOR_VERSION;
}

export interface FacesNamesValidation {
  valid: boolean;
  issues: string[];
}

export interface RecallAnswer {
  trialId: string;
  targetPersonId: string;
  recognizedPersonId: string;
  recognitionCorrect: boolean;
  selectedNamePersonId: string | null;
  nameCorrect: boolean | null;
  selectedFactId: string | null;
  factCorrect: boolean | null;
}

export interface FacesNamesMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof FACES_NAMES_GENERATOR_VERSION;
  details: {
    level: number;
  };
  specific: {
    personCount: number;
    faceRecognitionCorrect: number;
    faceRecognitionTotal: number;
    faceRecognitionAccuracy: number;
    nameRecallCorrect: number;
    nameRecallTotal: number;
    nameRecallAccuracy: number;
    factRecallCorrect: number;
    factRecallTotal: number;
    factRecallAccuracy: number | null;
    interferenceRounds: number;
    interferenceCorrect: number;
    meanFaceSimilarity: number;
    meanNameSimilarity: number;
    meanRecognitionDistractorSimilarity: number;
    invalidInteractions: number;
  };
}

export interface FacesNamesSessionConfig {
  seed: string;
  level: number;
}

export type FacesNamesActivePhase =
  | 'study'
  | 'interference'
  | 'recognition'
  | 'name-recall'
  | 'fact-recall';

export type FacesNamesSessionPhase =
  | 'rules'
  | FacesNamesActivePhase
  | 'paused'
  | 'result'
  | 'disposed';

export interface FacesNamesSession {
  config: Required<FacesNamesSessionConfig>;
  puzzle: FacesNamesPuzzle;
  phase: FacesNamesSessionPhase;
  pausedFrom: FacesNamesActivePhase | null;
  studyIndex: number;
  interferenceIndex: number;
  trialIndex: number;
  answers: RecallAnswer[];
  interferenceCorrect: number;
  invalidInteractions: number;
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  result: FacesNamesMetrics | null;
}
