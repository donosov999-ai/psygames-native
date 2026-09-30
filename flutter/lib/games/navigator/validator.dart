/// ПРОВЕРКА РАУНДА «НАВИГАТОРА» — ПЕРЕНОС `core/validator.ts`.
///
/// ⚠️ Проверки «недопустимый режим / направление / сектор» из TS здесь не повторены: в Dart
/// эти значения — перечисления, и недопустимое значение просто нельзя собрать. Всё остальное
/// — один в один, тексты замечаний те же (по ним генератор бросает ту же ошибку).
library;

import 'geometry.dart';
import 'types.dart';

List<String> validateNavigatorRound(NavigatorRound round) {
  final issues = <String>[];
  if (round.gridSize < 3 || round.gridSize > 8) issues.add('grid size ${round.gridSize}');
  if (round.routeSteps < 3 || round.routeSteps > 15) issues.add('route steps ${round.routeSteps}');
  if (round.route.length != round.routeSteps + 1) issues.add('route length mismatch');
  if (round.routeDirections.length != round.routeSteps) issues.add('direction length mismatch');
  if (round.turns.length != round.routeSteps) issues.add('turn length mismatch');

  final routeKeys = <String>{};
  for (var index = 0; index < round.route.length; index++) {
    final cell = round.route[index];
    if (!isCellInside(cell, round.gridSize)) issues.add('route cell $index outside grid');
    final key = cellKey(cell);
    if (routeKeys.contains(key)) issues.add('route revisits $key');
    routeKeys.add(key);
    if (index > 0) {
      final direction = directionBetween(round.route[index - 1], cell);
      if (direction == null) {
        issues.add('ambiguous or unreachable route step $index');
      } else if (round.routeDirections[index - 1] != direction) {
        issues.add('direction mismatch ${index - 1}');
      }
    }
  }

  var facing = round.startingFacing;
  for (var index = 0; index < round.routeDirections.length; index++) {
    final direction = round.routeDirections[index];
    final expectedTurn = turnBetween(facing, direction);
    if (expectedTurn == null) {
      issues.add('U-turn at $index');
    } else if (round.turns[index] != expectedTurn) {
      issues.add('turn mismatch $index');
    }
    facing = direction;
  }

  final branchTargets = <String>{};
  for (var index = 0; index < round.falseBranches.length; index++) {
    final branch = round.falseBranches[index];
    if (!isCellInside(branch.from, round.gridSize) || !isCellInside(branch.to, round.gridSize)) {
      issues.add('branch $index outside grid');
    }
    if (!routeKeys.contains(cellKey(branch.from))) issues.add('branch $index does not start on route');
    if (routeKeys.contains(cellKey(branch.to))) issues.add('branch $index replaces route cell');
    if (directionBetween(branch.from, branch.to) == null) issues.add('branch $index is unreachable');
    final targetKey = cellKey(branch.to);
    if (branchTargets.contains(targetKey)) issues.add('duplicate branch target $targetKey');
    branchTargets.add(targetKey);
  }

  final landmarkIds = <String>{};
  final landmarkCells = <String>{};
  for (final landmark in round.landmarks) {
    if (!isCellInside(landmark.cell, round.gridSize)) issues.add('landmark ${landmark.id} outside grid');
    if (landmarkIds.contains(landmark.id)) issues.add('duplicate landmark ID ${landmark.id}');
    if (landmarkCells.contains(cellKey(landmark.cell))) {
      issues.add('duplicate landmark cell ${cellKey(landmark.cell)}');
    }
    landmarkIds.add(landmark.id);
    landmarkCells.add(cellKey(landmark.cell));
  }

  if (![0, 90, 180, 270].contains(round.mapRotation)) issues.add('rotation ${round.mapRotation}');
  for (var index = 1; index < round.route.length; index++) {
    final prior = rotateCell(round.route[index - 1], round.gridSize, round.mapRotation);
    final current = rotateCell(round.route[index], round.gridSize, round.mapRotation);
    if (!isCellInside(prior, round.gridSize) || !isCellInside(current, round.gridSize)) {
      issues.add('rotation moves route outside at $index');
    }
    final rotated = directionBetween(prior, current);
    final expected = rotateCardinal(round.routeDirections[index - 1], round.mapRotation);
    if (rotated != expected) issues.add('rotation changes logical step ${index - 1}');
  }

  final expectedBearing = bearingDegrees(round.route.last, round.route.first);
  if ((expectedBearing - round.homeBearingDeg).abs() > 1e-9) issues.add('home bearing mismatch');
  if (round.correctHomeSector != homeSectorForBearing(round.homeBearingDeg)) {
    issues.add('home sector mismatch');
  }
  if (round.route.first == round.route.last) issues.add('home start equals endpoint');
  if (round.delaySteps < 0 || round.delaySteps > 3) issues.add('delay steps ${round.delaySteps}');
  if (round.level < 6 && (round.hideMapDuringRecall || round.delaySteps > 0)) {
    issues.add('advanced hiding or delay in tutorial levels');
  }
  if (round.difficulty < 1 || round.difficulty > 100) issues.add('difficulty ${round.difficulty}');
  return issues;
}
