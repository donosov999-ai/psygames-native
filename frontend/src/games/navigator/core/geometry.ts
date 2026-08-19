import {
  CARDINAL_DIRECTIONS,
  HOME_SECTORS,
  type CardinalDirection,
  type GridCell,
  type HomeSector,
  type MapRotation,
  type TurnInstruction,
} from './types';

const DELTAS: Record<CardinalDirection, GridCell> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`;
}

export function sameCell(left: GridCell, right: GridCell): boolean {
  return left.x === right.x && left.y === right.y;
}

export function isCellInside(cell: GridCell, gridSize: number): boolean {
  return Number.isInteger(cell.x)
    && Number.isInteger(cell.y)
    && cell.x >= 0
    && cell.y >= 0
    && cell.x < gridSize
    && cell.y < gridSize;
}

export function moveCell(cell: GridCell, direction: CardinalDirection): GridCell {
  const delta = DELTAS[direction];
  return { x: cell.x + delta.x, y: cell.y + delta.y };
}

export function cardinalNeighbors(cell: GridCell, gridSize: number): GridCell[] {
  return CARDINAL_DIRECTIONS
    .map((direction) => moveCell(cell, direction))
    .filter((candidate) => isCellInside(candidate, gridSize));
}

export function directionBetween(from: GridCell, to: GridCell): CardinalDirection | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return 'north';
  if (dx === 1 && dy === 0) return 'east';
  if (dx === 0 && dy === 1) return 'south';
  if (dx === -1 && dy === 0) return 'west';
  return null;
}

export function rotateCardinal(
  direction: CardinalDirection,
  rotation: MapRotation,
): CardinalDirection {
  const index = CARDINAL_DIRECTIONS.indexOf(direction);
  return CARDINAL_DIRECTIONS[(index + rotation / 90) % 4] as CardinalDirection;
}

export function unrotateCardinal(
  direction: CardinalDirection,
  rotation: MapRotation,
): CardinalDirection {
  return rotateCardinal(direction, normalizeDegrees(360 - rotation) as MapRotation);
}

export function rotateCell(cell: GridCell, gridSize: number, rotation: MapRotation): GridCell {
  if (rotation === 90) return { x: gridSize - 1 - cell.y, y: cell.x };
  if (rotation === 180) return { x: gridSize - 1 - cell.x, y: gridSize - 1 - cell.y };
  if (rotation === 270) return { x: cell.y, y: gridSize - 1 - cell.x };
  return { ...cell };
}

export function turnBetween(
  facing: CardinalDirection,
  next: CardinalDirection,
): TurnInstruction | null {
  const fromIndex = CARDINAL_DIRECTIONS.indexOf(facing);
  const toIndex = CARDINAL_DIRECTIONS.indexOf(next);
  const delta = (toIndex - fromIndex + 4) % 4;
  if (delta === 0) return 'straight';
  if (delta === 1) return 'right';
  if (delta === 3) return 'left';
  return null;
}

export function turnDirection(
  facing: CardinalDirection,
  turn: TurnInstruction,
): CardinalDirection {
  const delta = turn === 'left' ? 3 : turn === 'right' ? 1 : 0;
  const index = CARDINAL_DIRECTIONS.indexOf(facing);
  return CARDINAL_DIRECTIONS[(index + delta) % 4] as CardinalDirection;
}

export function bearingDegrees(from: GridCell, to: GridCell): number {
  return normalizeDegrees(Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI);
}

export function angularDifference(left: number, right: number): number {
  const delta = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(delta, 360 - delta);
}

export function homeSectorAngle(sector: HomeSector): number {
  return HOME_SECTORS.indexOf(sector) * 45;
}

export function homeSectorForBearing(bearing: number): HomeSector {
  const index = Math.round(normalizeDegrees(bearing) / 45) % HOME_SECTORS.length;
  return HOME_SECTORS[index] as HomeSector;
}

export function rotateHomeSector(sector: HomeSector, rotation: MapRotation): HomeSector {
  return homeSectorForBearing(homeSectorAngle(sector) + rotation);
}

export function unrotateHomeSector(sector: HomeSector, rotation: MapRotation): HomeSector {
  return homeSectorForBearing(homeSectorAngle(sector) - rotation);
}
