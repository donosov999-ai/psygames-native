import { cellKey } from './grid';
import { enumerateConstructionOrders } from './orders';
import { validateDotsSolution } from './validator';
import type { Cell, DotsPuzzle, DotsSolution } from './types';

interface Interval {
  pairId: string;
  start: number;
  end: number;
}

function recoverFromOrder(puzzle: DotsPuzzle, order: readonly Cell[]): DotsSolution | null {
  const positions = new Map(order.map((cell, index) => [cellKey(cell), index]));
  const intervals: Interval[] = [];
  for (const pair of puzzle.pairs) {
    const left = positions.get(cellKey(pair.endpoints[0]));
    const right = positions.get(cellKey(pair.endpoints[1]));
    if (left === undefined || right === undefined || left === right) return null;
    intervals.push({
      pairId: pair.id,
      start: Math.min(left, right),
      end: Math.max(left, right),
    });
  }
  intervals.sort((left, right) => left.start - right.start);
  if (intervals[0]?.start !== 0) return null;
  for (let index = 1; index < intervals.length; index += 1) {
    if ((intervals[index - 1] as Interval).end + 1 !== (intervals[index] as Interval).start) {
      return null;
    }
  }
  if (intervals[intervals.length - 1]?.end !== order.length - 1) return null;

  const solution: DotsSolution = {};
  for (const interval of intervals) {
    solution[interval.pairId] = order
      .slice(interval.start, interval.end + 1)
      .map((cell) => ({ ...cell }));
  }
  return validateDotsSolution(puzzle, solution).complete ? solution : null;
}

/**
 * Exact solver for the published generator family. It receives endpoints only:
 * no seed, generator solution, or hidden path is consulted.
 */
export function solveDotsPuzzle(puzzle: DotsPuzzle): DotsSolution | null {
  for (const order of enumerateConstructionOrders(puzzle.size)) {
    const solution = recoverFromOrder(puzzle, order);
    if (solution) return solution;
  }
  return null;
}
