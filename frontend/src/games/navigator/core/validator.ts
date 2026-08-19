import {
  bearingDegrees,
  cellKey,
  directionBetween,
  homeSectorForBearing,
  isCellInside,
  rotateCardinal,
  rotateCell,
  sameCell,
  turnBetween,
} from './geometry';
import {
  CARDINAL_DIRECTIONS,
  HOME_SECTORS,
  NAVIGATOR_MODES,
  type CardinalDirection,
  type NavigatorRound,
} from './types';

export function validateNavigatorRound(round: NavigatorRound): string[] {
  const issues: string[] = [];
  if (!NAVIGATOR_MODES.includes(round.mode)) issues.push(`invalid mode ${round.mode}`);
  if (round.gridSize < 3 || round.gridSize > 8) issues.push(`grid size ${round.gridSize}`);
  if (round.routeSteps < 3 || round.routeSteps > 15) issues.push(`route steps ${round.routeSteps}`);
  if (round.route.length !== round.routeSteps + 1) issues.push('route length mismatch');
  if (round.routeDirections.length !== round.routeSteps) issues.push('direction length mismatch');
  if (round.turns.length !== round.routeSteps) issues.push('turn length mismatch');
  if (!CARDINAL_DIRECTIONS.includes(round.startingFacing)) issues.push('invalid starting facing');
  const routeKeys = new Set<string>();
  for (const [index, cell] of round.route.entries()) {
    if (!isCellInside(cell, round.gridSize)) issues.push(`route cell ${index} outside grid`);
    const key = cellKey(cell);
    if (routeKeys.has(key)) issues.push(`route revisits ${key}`);
    routeKeys.add(key);
    if (index > 0) {
      const prior = round.route[index - 1];
      const direction = prior ? directionBetween(prior, cell) : null;
      if (!direction) issues.push(`ambiguous or unreachable route step ${index}`);
      else if (round.routeDirections[index - 1] !== direction) issues.push(`direction mismatch ${index - 1}`);
    }
  }
  let facing = round.startingFacing;
  for (let index = 0; index < round.routeDirections.length; index += 1) {
    const direction = round.routeDirections[index] as CardinalDirection;
    const expectedTurn = turnBetween(facing, direction);
    if (!expectedTurn) issues.push(`U-turn at ${index}`);
    else if (round.turns[index] !== expectedTurn) issues.push(`turn mismatch ${index}`);
    facing = direction;
  }
  const branchTargets = new Set<string>();
  for (const [index, branch] of round.falseBranches.entries()) {
    if (!isCellInside(branch.from, round.gridSize) || !isCellInside(branch.to, round.gridSize)) {
      issues.push(`branch ${index} outside grid`);
    }
    if (!routeKeys.has(cellKey(branch.from))) issues.push(`branch ${index} does not start on route`);
    if (routeKeys.has(cellKey(branch.to))) issues.push(`branch ${index} replaces route cell`);
    if (!directionBetween(branch.from, branch.to)) issues.push(`branch ${index} is unreachable`);
    const targetKey = cellKey(branch.to);
    if (branchTargets.has(targetKey)) issues.push(`duplicate branch target ${targetKey}`);
    branchTargets.add(targetKey);
  }
  const landmarkIds = new Set<string>();
  const landmarkCells = new Set<string>();
  for (const landmark of round.landmarks) {
    if (!isCellInside(landmark.cell, round.gridSize)) issues.push(`landmark ${landmark.id} outside grid`);
    if (landmarkIds.has(landmark.id)) issues.push(`duplicate landmark ID ${landmark.id}`);
    if (landmarkCells.has(cellKey(landmark.cell))) issues.push(`duplicate landmark cell ${cellKey(landmark.cell)}`);
    landmarkIds.add(landmark.id);
    landmarkCells.add(cellKey(landmark.cell));
  }
  if (![0, 90, 180, 270].includes(round.mapRotation)) issues.push(`rotation ${round.mapRotation}`);
  for (let index = 1; index < round.route.length; index += 1) {
    const prior = rotateCell(round.route[index - 1]!, round.gridSize, round.mapRotation);
    const current = rotateCell(round.route[index]!, round.gridSize, round.mapRotation);
    if (!isCellInside(prior, round.gridSize) || !isCellInside(current, round.gridSize)) {
      issues.push(`rotation moves route outside at ${index}`);
    }
    const rotatedDirection = directionBetween(prior, current);
    const expected = rotateCardinal(round.routeDirections[index - 1]!, round.mapRotation);
    if (rotatedDirection !== expected) issues.push(`rotation changes logical step ${index - 1}`);
  }
  const expectedBearing = bearingDegrees(round.route.at(-1)!, round.route[0]!);
  if (Math.abs(expectedBearing - round.homeBearingDeg) > 1e-9) issues.push('home bearing mismatch');
  if (round.correctHomeSector !== homeSectorForBearing(round.homeBearingDeg)) issues.push('home sector mismatch');
  if (!HOME_SECTORS.includes(round.correctHomeSector)) issues.push('invalid home sector');
  if (sameCell(round.route[0]!, round.route.at(-1)!)) issues.push('home start equals endpoint');
  if (round.delaySteps < 0 || round.delaySteps > 3) issues.push(`delay steps ${round.delaySteps}`);
  if (round.level < 6 && (round.hideMapDuringRecall || round.delaySteps > 0)) {
    issues.push('advanced hiding or delay in tutorial levels');
  }
  if (round.difficulty < 1 || round.difficulty > 100) issues.push(`difficulty ${round.difficulty}`);
  return issues;
}
