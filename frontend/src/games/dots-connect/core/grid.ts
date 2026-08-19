import type { Cell, DotsPaths } from './types';

export function cellKey(cell: Cell): string {
  return `${cell.row},${cell.col}`;
}

export function sameCell(left: Cell, right: Cell): boolean {
  return left.row === right.row && left.col === right.col;
}

export function isAdjacent(left: Cell, right: Cell): boolean {
  return Math.abs(left.row - right.row) + Math.abs(left.col - right.col) === 1;
}

export function isInBounds(cell: Cell, size: number): boolean {
  return Number.isInteger(cell.row)
    && Number.isInteger(cell.col)
    && cell.row >= 0
    && cell.col >= 0
    && cell.row < size
    && cell.col < size;
}

export function clonePaths(paths: DotsPaths): DotsPaths {
  return Object.fromEntries(
    Object.entries(paths).map(([pairId, path]) => [
      pairId,
      path.map((cell) => ({ ...cell })),
    ]),
  );
}

export function pathOwnerAt(paths: DotsPaths, cell: Cell): string | null {
  for (const [pairId, path] of Object.entries(paths)) {
    if (path.some((candidate) => sameCell(candidate, cell))) return pairId;
  }
  return null;
}
