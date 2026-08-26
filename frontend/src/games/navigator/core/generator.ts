/* psygames-navigator-generator · VER 1 · 19.08.2026 */
import {
  bearingDegrees,
  cardinalNeighbors,
  cellKey,
  directionBetween,
  homeSectorForBearing,
  rotateCardinal,
  turnBetween,
} from './geometry';
import { createRng, normalizeSeed, randomInt, shuffle, type Rng } from './rng';
import {
  NAVIGATOR_GENERATOR_VERSION,
  NAVIGATOR_MODES,
  LEVELS,
  type CardinalDirection,
  type GridCell,
  type MapRotation,
  type NavigatorFalseBranch,
  type NavigatorLandmark,
  type NavigatorMode,
  type NavigatorRound,
  type TurnInstruction,
} from './types';
import { validateNavigatorRound } from './validator';

const ROTATIONS: MapRotation[] = [0, 90, 180, 270];
const LANDMARK_SYMBOLS: NavigatorLandmark['symbol'][] = [
  'diamond',
  'circle',
  'triangle',
  'star',
  'square',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function navigatorModeForLevel(requestedLevel: number): NavigatorMode {
  const level = Math.min(LEVELS, Math.max(1, Math.floor(requestedLevel)));
  return NAVIGATOR_MODES[(level - 1) % NAVIGATOR_MODES.length] as NavigatorMode;
}

function makeRoute(rng: Rng, gridSize: number, routeSteps: number): GridCell[] {
  const start = {
    x: randomInt(rng, 0, gridSize - 1),
    y: randomInt(rng, 0, gridSize - 1),
  };
  const route = [start];
  const used = new Set([cellKey(start)]);

  function search(): boolean {
    if (route.length === routeSteps + 1) return true;
    const current = route[route.length - 1] as GridCell;
    const candidates = shuffle(rng, cardinalNeighbors(current, gridSize))
      .filter((cell) => !used.has(cellKey(cell)));
    for (const candidate of candidates) {
      route.push(candidate);
      used.add(cellKey(candidate));
      if (search()) return true;
      used.delete(cellKey(candidate));
      route.pop();
    }
    return false;
  }

  if (!search()) throw new Error(`Unable to generate ${routeSteps}-step route on ${gridSize}x${gridSize}`);
  return route;
}

function routeDirections(route: readonly GridCell[]): CardinalDirection[] {
  return route.slice(1).map((cell, index) => {
    const direction = directionBetween(route[index] as GridCell, cell);
    if (!direction) throw new Error(`Non-cardinal generated route step ${index}`);
    return direction;
  });
}

function routeTurns(
  directions: readonly CardinalDirection[],
  startingFacing: CardinalDirection,
): TurnInstruction[] {
  let facing = startingFacing;
  return directions.map((direction, index) => {
    const turn = turnBetween(facing, direction);
    if (!turn) throw new Error(`Generated U-turn at step ${index}`);
    facing = direction;
    return turn;
  });
}

function makeFalseBranches(
  rng: Rng,
  route: readonly GridCell[],
  gridSize: number,
  targetCount: number,
): NavigatorFalseBranch[] {
  if (targetCount <= 0) return [];
  const routeCells = new Set(route.map(cellKey));
  const usedTargets = new Set<string>();
  const candidates = shuffle(rng, route.flatMap((from) => (
    cardinalNeighbors(from, gridSize).map((to) => ({ from, to }))
  )));
  const branches: NavigatorFalseBranch[] = [];
  for (const candidate of candidates) {
    const targetKey = cellKey(candidate.to);
    if (routeCells.has(targetKey) || usedTargets.has(targetKey)) continue;
    branches.push({ from: { ...candidate.from }, to: { ...candidate.to } });
    usedTargets.add(targetKey);
    if (branches.length === targetCount) break;
  }
  return branches;
}

function makeLandmarks(
  rng: Rng,
  gridSize: number,
  count: number,
): NavigatorLandmark[] {
  const cells = shuffle(rng, Array.from({ length: gridSize * gridSize }, (_, index) => ({
    x: index % gridSize,
    y: Math.floor(index / gridSize),
  })));
  return cells.slice(0, count).map((cell, index) => ({
    id: `landmark-${index + 1}`,
    cell,
    symbol: LANDMARK_SYMBOLS[index % LANDMARK_SYMBOLS.length] as NavigatorLandmark['symbol'],
  }));
}

export function generateNavigatorRound(
  seed: string,
  requestedLevel: number,
  requestedMode?: NavigatorMode,
): NavigatorRound {
  const normalizedSeed = normalizeSeed(seed);
  const level = Math.min(LEVELS, Math.max(1, Math.floor(requestedLevel)));
  const mode = requestedMode ?? navigatorModeForLevel(level);
  const rng = createRng(`${normalizedSeed}:${level}:${mode}:${NAVIGATOR_GENERATOR_VERSION}`);
  const gridSize = Math.min(8, 3 + Math.floor((level - 1) / 5));
  const routeSteps = Math.min(15, gridSize * gridSize - 1, 3 + Math.floor((level - 1) / 2));
  const route = makeRoute(rng, gridSize, routeSteps);
  const directions = routeDirections(route);
  const firstDirection = directions[0] as CardinalDirection;
  const startingCandidates = [
    firstDirection,
    rotateCardinal(firstDirection, 90),
    rotateCardinal(firstDirection, 270),
  ];
  const startingFacing = shuffle(rng, startingCandidates)[0] as CardinalDirection;
  const turns = routeTurns(directions, startingFacing);
  const landmarkTarget = level < 4 ? 0 : Math.min(5, 1 + Math.floor((level - 4) / 6));
  const falseBranchTarget = level < 7 ? 0 : Math.min(6, 1 + Math.floor((level - 7) / 5));
  const rotationTier = level < 8 ? 0 : Math.min(3, 1 + Math.floor((level - 8) / 7));
  const allowedRotations = ROTATIONS.slice(0, rotationTier + 1);
  const mapRotation = allowedRotations[randomInt(rng, 0, allowedRotations.length - 1)] as MapRotation;
  const hideMapDuringRecall = level >= 6;
  const delaySteps = level < 6 ? 0 : Math.min(3, 1 + Math.floor((level - 6) / 8));
  const homeBearingDeg = bearingDegrees(route[route.length - 1] as GridCell, route[0] as GridCell);
  const difficulty = clamp(Math.round(
    4
    + gridSize * 4
    + routeSteps * 3.2
    + landmarkTarget * 2
    + falseBranchTarget * 3
    + rotationTier * 4
    + (hideMapDuringRecall ? 7 : 0)
    + delaySteps * 3,
  ), 1, 100);
  const round: NavigatorRound = {
    id: `navigator:${normalizedSeed}:${level}:${mode}`,
    seed: normalizedSeed,
    level,
    mode,
    difficulty,
    gridSize,
    routeSteps,
    route,
    routeDirections: directions,
    startingFacing,
    turns,
    landmarks: makeLandmarks(rng, gridSize, landmarkTarget),
    falseBranches: makeFalseBranches(rng, route, gridSize, falseBranchTarget),
    mapRotation,
    hideMapDuringRecall,
    delaySteps,
    homeBearingDeg,
    correctHomeSector: homeSectorForBearing(homeBearingDeg),
    generatorVersion: NAVIGATOR_GENERATOR_VERSION,
  };
  const issues = validateNavigatorRound(round);
  if (issues.length > 0) throw new Error(`Generated invalid Navigator round: ${issues.join(', ')}`);
  return round;
}
