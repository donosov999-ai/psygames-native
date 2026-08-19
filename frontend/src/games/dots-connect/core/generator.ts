import { isAdjacent } from './grid';
import {
  hamiltonianCycleOrder,
  rotateOrder,
  serpentineOrder,
  transformOrder,
} from './orders';
import { createRng, normalizeSeed, randomInt, shuffle, type Rng } from './rng';
import {
  DOTS_CONNECT_GENERATOR_VERSION,
  type Cell,
  type DotsPair,
  type GeneratedDotsPuzzle,
} from './types';

const PAIR_STYLES = [
  { color: '#be123c', symbol: '●' },
  { color: '#1d4ed8', symbol: '■' },
  { color: '#047857', symbol: '▲' },
  { color: '#7e22ce', symbol: '◆' },
  { color: '#b45309', symbol: '★' },
  { color: '#0f766e', symbol: '✚' },
  { color: '#9d174d', symbol: '✖' },
  { color: '#334155', symbol: '⬢' },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function progression(level: number): { size: number; pairCount: number; difficulty: number } {
  const size = clamp(4 + Math.floor((level - 1) / 6), 4, 8);
  const pairCount = clamp(
    3 + Math.floor((level - 1) / 5),
    3,
    Math.min(8, Math.floor((size * size) / 2)),
  );
  const sizeDifficulty = (size - 4) / 4;
  const pairDifficulty = (pairCount - 3) / 5;
  const levelDifficulty = clamp((level - 1) / 39, 0, 1);
  return {
    size,
    pairCount,
    difficulty: round(sizeDifficulty * 0.5 + pairDifficulty * 0.3 + levelDifficulty * 0.2),
  };
}

function segmentLengths(totalCells: number, pairCount: number, rng: Rng): number[] {
  if (totalCells < pairCount * 2) {
    throw new RangeError('Every endpoint pair needs at least two cells');
  }
  const lengths = Array.from({ length: pairCount }, () => 2);
  let remaining = totalCells - pairCount * 2;
  while (remaining > 0) {
    const index = randomInt(rng, 0, pairCount - 1);
    lengths[index] = (lengths[index] as number) + 1;
    remaining -= 1;
  }
  return shuffle(rng, lengths);
}

function constructionOrder(size: number, rng: Rng): {
  order: Cell[];
  construction: GeneratedDotsPuzzle['construction'];
} {
  const transform = randomInt(rng, 0, 7);
  if (size % 2 === 0) {
    const cycle = transformOrder(hamiltonianCycleOrder(size), size, transform);
    const rotated = rotateOrder(cycle, randomInt(rng, 0, cycle.length - 1));
    return {
      order: rng() < 0.5 ? rotated : [...rotated].reverse(),
      construction: 'hamiltonian-cycle',
    };
  }
  const snake = transformOrder(serpentineOrder(size), size, transform);
  return {
    order: rng() < 0.5 ? snake : [...snake].reverse(),
    construction: 'serpentine-path',
  };
}

function assertTraversal(order: readonly Cell[], size: number): void {
  if (order.length !== size * size) throw new Error('Traversal does not cover the grid');
  for (let index = 1; index < order.length; index += 1) {
    if (!isAdjacent(order[index - 1] as Cell, order[index] as Cell)) {
      throw new Error(`Traversal jumps at index ${index}`);
    }
  }
}

export function generateDotsPuzzle(seed: string, level: number): GeneratedDotsPuzzle {
  const normalizedSeed = normalizeSeed(seed);
  const safeLevel = Math.max(1, Math.floor(level));
  const { size, pairCount, difficulty } = progression(safeLevel);
  const rng = createRng(`${normalizedSeed}|${safeLevel}|${DOTS_CONNECT_GENERATOR_VERSION}`);
  const { order, construction } = constructionOrder(size, rng);
  assertTraversal(order, size);
  const lengths = segmentLengths(order.length, pairCount, rng);
  const styles = shuffle(rng, PAIR_STYLES).slice(0, pairCount);
  const pairs: DotsPair[] = [];
  const solution: GeneratedDotsPuzzle['solution'] = {};
  let cursor = 0;

  for (let index = 0; index < pairCount; index += 1) {
    const length = lengths[index] as number;
    const path = order.slice(cursor, cursor + length).map((cell) => ({ ...cell }));
    const first = path[0] as Cell;
    const last = path[path.length - 1] as Cell;
    const style = styles[index] as (typeof PAIR_STYLES)[number];
    const pairId = `pair-${index + 1}`;
    pairs.push({
      id: pairId,
      color: style.color,
      symbol: style.symbol,
      endpoints: [{ ...first }, { ...last }],
    });
    solution[pairId] = path;
    cursor += length;
  }

  return {
    id: `${normalizedSeed}:${safeLevel}`,
    seed: normalizedSeed,
    level: safeLevel,
    size,
    pairCount,
    difficulty,
    construction,
    generatorVersion: DOTS_CONNECT_GENERATOR_VERSION,
    pairs: shuffle(rng, pairs),
    solution,
  };
}

export function toPublicPuzzle(puzzle: GeneratedDotsPuzzle): Omit<GeneratedDotsPuzzle, 'solution'> {
  const { solution: _solution, ...publicPuzzle } = puzzle;
  return publicPuzzle;
}
