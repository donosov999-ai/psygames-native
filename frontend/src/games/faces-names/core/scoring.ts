import type {
  FacesNamesMetrics,
  FacesNamesPuzzle,
  RecallAnswer,
} from './types';

export const FACES_NAMES_PASS_ACCURACY = 0.75;

/**
 * Overall recall must reach 75%, while face and exact-name recall must each stay
 * above 60%. Facts are secondary but, when enabled, still need at least 50%.
 * This prevents a strong component from hiding a collapsed name association.
 */
export function isPassed(metrics: FacesNamesMetrics): boolean {
  const factAccuracy = metrics.specific.factRecallAccuracy;
  return metrics.accuracy >= FACES_NAMES_PASS_ACCURACY
    && metrics.specific.faceRecognitionAccuracy >= 0.6
    && metrics.specific.nameRecallAccuracy >= 0.6
    && (factAccuracy === null || factAccuracy >= 0.5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface FacesNamesScoringInput {
  durationMs: number;
  interferenceCorrect: number;
  invalidInteractions: number;
}

export function scoreFacesNamesCompletion(
  puzzle: FacesNamesPuzzle,
  answers: readonly RecallAnswer[],
  input: FacesNamesScoringInput,
): FacesNamesMetrics {
  const faceRecognitionCorrect = answers.filter((answer) => answer.recognitionCorrect).length;
  const nameRecallCorrect = answers.filter((answer) => answer.nameCorrect === true).length;
  const factAnswers = answers.filter((answer) => answer.factCorrect !== null);
  const factRecallCorrect = factAnswers.filter((answer) => answer.factCorrect === true).length;
  const faceRecognitionTotal = answers.length;
  const nameRecallTotal = answers.length;
  const factRecallTotal = factAnswers.length;
  const faceRecognitionAccuracy = faceRecognitionTotal === 0 ? 0 : faceRecognitionCorrect / faceRecognitionTotal;
  const nameRecallAccuracy = nameRecallTotal === 0 ? 0 : nameRecallCorrect / nameRecallTotal;
  const factRecallAccuracy = factRecallTotal === 0 ? null : factRecallCorrect / factRecallTotal;
  const components = [faceRecognitionAccuracy, nameRecallAccuracy];
  if (factRecallAccuracy !== null) components.push(factRecallAccuracy);
  const accuracy = clamp(
    components.reduce((sum, value) => sum + value, 0) / Math.max(1, components.length),
    0,
    1,
  );
  const wrongRecall = (faceRecognitionTotal - faceRecognitionCorrect)
    + (nameRecallTotal - nameRecallCorrect)
    + (factRecallTotal - factRecallCorrect);
  const errors = wrongRecall + input.invalidInteractions;
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
      personCount: puzzle.studiedPersonIds.length,
      faceRecognitionCorrect,
      faceRecognitionTotal,
      faceRecognitionAccuracy: round(faceRecognitionAccuracy),
      nameRecallCorrect,
      nameRecallTotal,
      nameRecallAccuracy: round(nameRecallAccuracy),
      factRecallCorrect,
      factRecallTotal,
      factRecallAccuracy: factRecallAccuracy === null ? null : round(factRecallAccuracy),
      interferenceRounds: puzzle.interferencePrompts.length,
      interferenceCorrect: Math.max(0, Math.min(puzzle.interferencePrompts.length, input.interferenceCorrect)),
      meanFaceSimilarity: puzzle.meanFaceSimilarity,
      meanNameSimilarity: puzzle.meanNameSimilarity,
      meanRecognitionDistractorSimilarity: puzzle.meanRecognitionDistractorSimilarity,
      invalidInteractions: input.invalidInteractions,
    },
  };
}
