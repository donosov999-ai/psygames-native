/* psygames-fillwords-core · VER 1 · 22.08.2026 */
/**
 * Единая дверь в ядро филвордов: экран берёт всё отсюда и не лазит по файлам
 * модуля. Так внутреннюю раскладку файлов можно менять, не трогая игру.
 */
export type {
  CellIndex,
  FillwordsHint,
  FillwordsPuzzle,
  FillwordsRejectReason,
  FillwordsSession,
  FillwordsTrace,
  PlantedWord,
} from './types';

export { createRng, normalizeSeed, type FillwordsRng } from './rng';

export {
  FILLWORDS_LOCALES,
  FILLWORDS_MAX_WORD,
  FILLWORDS_MIN_WORD,
  isFillwordsLocale,
  normalizeWord,
  wordPool,
  wordsOfLength,
  type FillwordsPool,
} from './words';

export {
  areAdjacent,
  assertFullCoverage,
  fillwordsLevel,
  generateFillwords,
  type FillwordsLevelCfg,
  type FillwordsRequest,
} from './generator';

export {
  FILLWORDS_INK,
  FILLWORDS_TINTS,
  applyTrace,
  createFillwordsSession,
  isCleared,
  lettersLeft,
  resolveTrace,
  stepTrace,
  takeHint,
  tintForFoundOrder,
  traceIsWalkable,
  unfoundWordIndexes,
} from './session';

export {
  FILLWORDS_UI_LOCALES,
  getFillwordsStrings,
  interpolate,
  type FillwordsStrings,
} from './i18n';
