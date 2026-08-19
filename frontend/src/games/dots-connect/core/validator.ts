import { cellKey, isAdjacent, isInBounds, sameCell } from './grid';
import type {
  Cell,
  DotsPaths,
  DotsPuzzle,
  SolutionValidation,
} from './types';

function endpointsMatch(path: readonly Cell[], endpoints: readonly [Cell, Cell]): boolean {
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || !last) return false;
  return (sameCell(first, endpoints[0]) && sameCell(last, endpoints[1]))
    || (sameCell(first, endpoints[1]) && sameCell(last, endpoints[0]));
}

export function validateDotsSolution(
  puzzle: DotsPuzzle,
  paths: DotsPaths,
): SolutionValidation {
  const issues: string[] = [];
  const occupied = new Map<string, string>();
  const validPairIds = new Set(puzzle.pairs.map((pair) => pair.id));
  const endpointOwners = new Map<string, string>();
  for (const pair of puzzle.pairs) {
    for (const endpoint of pair.endpoints) endpointOwners.set(cellKey(endpoint), pair.id);
  }

  for (const pairId of Object.keys(paths)) {
    if (!validPairIds.has(pairId)) issues.push(`unknown pair ${pairId}`);
  }

  for (const pair of puzzle.pairs) {
    const path = paths[pair.id];
    if (!path || path.length < 2) {
      issues.push(`pair ${pair.id} is not connected`);
      continue;
    }
    if (!endpointsMatch(path, pair.endpoints)) {
      issues.push(`pair ${pair.id} has wrong endpoints`);
    }
    for (let index = 0; index < path.length; index += 1) {
      const cell = path[index] as Cell;
      const key = cellKey(cell);
      if (!isInBounds(cell, puzzle.size)) issues.push(`pair ${pair.id} leaves the board at ${key}`);
      if (index > 0 && !isAdjacent(path[index - 1] as Cell, cell)) {
        issues.push(`pair ${pair.id} jumps before ${key}`);
      }
      const endpointOwner = endpointOwners.get(key);
      if (endpointOwner && endpointOwner !== pair.id) {
        issues.push(`pair ${pair.id} enters endpoint of ${endpointOwner}`);
      }
      const priorOwner = occupied.get(key);
      if (priorOwner) issues.push(`cell ${key} is shared by ${priorOwner} and ${pair.id}`);
      else occupied.set(key, pair.id);
    }
  }

  const totalCells = puzzle.size * puzzle.size;
  if (occupied.size !== totalCells) {
    issues.push(`coverage ${occupied.size}/${totalCells}`);
  }
  return {
    valid: issues.length === 0,
    complete: issues.length === 0 && occupied.size === totalCells,
    coveredCells: occupied.size,
    totalCells,
    issues,
  };
}
