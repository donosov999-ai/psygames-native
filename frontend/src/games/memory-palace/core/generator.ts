/* psygames-memory-palace-generator · VER 1 · 19.08.2026 */
import { FIXED_PALACE_ROUTE, PALACE_ITEM_LIBRARY } from './content';
import { createRng, normalizeSeed, shuffle } from './rng';
import {
  MEMORY_PALACE_GENERATOR_VERSION,
  LEVELS,
  memoryPalaceRouteIsShuffled,
  type MemoryPalaceRound,
} from './types';
import { validateMemoryPalaceRound } from './validator';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function memoryPalaceLociCountForLevel(requestedLevel: number): number {
  const level = Math.min(LEVELS, Math.max(1, Math.floor(requestedLevel)));
  return Math.min(12, 5 + Math.floor((level - 1) / 2));
}

export function generateMemoryPalaceRound(
  seed: string,
  requestedLevel: number,
): MemoryPalaceRound {
  const normalizedSeed = normalizeSeed(seed);
  const level = Math.min(LEVELS, Math.max(1, Math.floor(requestedLevel)));
  const lociCount = memoryPalaceLociCountForLevel(level);
  const distractorCount = Math.min(4, 2 + Math.floor((lociCount - 5) / 3));
  const rng = createRng(normalizedSeed + ':' + level + ':' + MEMORY_PALACE_GENERATOR_VERSION);
  /**
   * 🔴 У МАРШРУТА СВОЙ ГЕНЕРАТОР СЛУЧАЙНОСТИ, И ЭТО НЕ УКРАШЕНИЕ. Возьми я
   * общий `rng`, перемешивание маршрута сдвинуло бы всю последующую цепочку
   * вызовов, и НАБОРЫ ПРЕДМЕТОВ поменялись бы на всех уровнях разом — включая
   * первые пять, где маршрут не трогаем вовсе. Отдельная ветка оставляет
   * предметы теми же: правка маршрута меняет только маршрут.
   */
  const routeRng = createRng(normalizedSeed + ':route:' + level + ':' + MEMORY_PALACE_GENERATOR_VERSION);
  const routeForLevel = memoryPalaceRouteIsShuffled(level)
    ? shuffle(routeRng, FIXED_PALACE_ROUTE).slice(0, lociCount)
    : FIXED_PALACE_ROUTE.slice(0, lociCount);
  const shuffledItems = shuffle(rng, PALACE_ITEM_LIBRARY);
  const targetItems = shuffledItems.slice(0, lociCount);
  const distractorItems = shuffledItems.slice(lociCount, lociCount + distractorCount);
  const recallCandidates = shuffle(rng, [...targetItems, ...distractorItems]);
  const round: MemoryPalaceRound = {
    id: 'memory-palace:' + normalizedSeed + ':' + level,
    seed: normalizedSeed,
    level,
    difficulty: clamp(Math.round(18 + (lociCount - 5) * 8 + distractorCount * 4), 1, 100),
    generatorVersion: MEMORY_PALACE_GENERATOR_VERSION,
    lociCount,
    loci: routeForLevel.map((locus, index) => ({
      ...locus,
      // Порядок всегда 1..N подряд: перемешивание меняет, КАКОЕ место стоит
      // вторым, а не нумерацию — её же валидатор и проверяет.
      order: index + 1,
      label: { ...locus.label },
    })),
    targetItems: targetItems.map((item) => ({ ...item, label: { ...item.label } })),
    distractorItems: distractorItems.map((item) => ({ ...item, label: { ...item.label } })),
    recallCandidates: recallCandidates.map((item) => ({ ...item, label: { ...item.label } })),
    directions: ['forward', 'reverse'],
  };
  const issues = validateMemoryPalaceRound(round);
  if (issues.length > 0) throw new Error('Generated invalid Memory Palace round: ' + issues.join(', '));
  return round;
}
