/// ГЕНЕРАТОР РАУНДА «НАВИГАТОРА» — ПЕРЕНОС `core/generator.ts` ОДИН В ОДИН.
///
/// 🔴 ПАРТИЯ РАЗДАЁТСЯ ПО ЗЕРНУ, И ПОРЯДОК БРОСКОВ ОБЯЗАН СОВПАСТЬ С ВЕБОМ ДО ЕДИНОГО. Одно
/// зерно даёт одну и ту же партию в вебе и в приложении; разойдись хоть один бросок — и вся
/// раздача дальше другая, а человек получит «ту же» ступень другой. Поэтому:
/// · генератор случайных чисел, перемешивание и причёсывание зерна — из общего
///   `shell/js_compat.dart`, а не свои (у трёх игр уже лежат копии — четвёртой не будет);
/// · ⚠️ ориентиры раздаются РАНЬШЕ ложных ветвей. В TS это держится только порядком полей в
///   литерале объекта (`landmarks: …` стоит перед `falseBranches: …`), здесь — явным порядком
///   вызовов. Переставь строки — и ни одна проба правил не заметит, а эталон разойдётся.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart';
import 'geometry.dart';
import 'types.dart';
import 'validator.dart';

const _rotations = [0, 90, 180, 270];
const _landmarkSymbols = ['diamond', 'circle', 'triangle', 'star', 'square'];

int _clampLevel(num requested) => math.min(navigatorLevels, math.max(1, requested.floor()));

NavigatorMode navigatorModeForLevel(num requestedLevel) {
  final level = _clampLevel(requestedLevel);
  return NavigatorMode.values[(level - 1) % NavigatorMode.values.length];
}

List<GridCell> _makeRoute(Rng rng, int gridSize, int routeSteps) {
  final start = GridCell(randomInt(rng, 0, gridSize - 1), randomInt(rng, 0, gridSize - 1));
  final route = <GridCell>[start];
  final used = <String>{cellKey(start)};

  bool search() {
    if (route.length == routeSteps + 1) return true;
    final current = route.last;
    final candidates = shuffle(rng, cardinalNeighbors(current, gridSize))
        .where((cell) => !used.contains(cellKey(cell)))
        .toList();
    for (final candidate in candidates) {
      route.add(candidate);
      used.add(cellKey(candidate));
      if (search()) return true;
      used.remove(cellKey(candidate));
      route.removeLast();
    }
    return false;
  }

  if (!search()) throw StateError('Unable to generate $routeSteps-step route on ${gridSize}x$gridSize');
  return route;
}

List<Cardinal> _routeDirections(List<GridCell> route) => [
  for (var i = 1; i < route.length; i++)
    directionBetween(route[i - 1], route[i]) ??
        (throw StateError('Non-cardinal generated route step ${i - 1}')),
];

List<Turn> _routeTurns(List<Cardinal> directions, Cardinal startingFacing) {
  var facing = startingFacing;
  final turns = <Turn>[];
  for (var i = 0; i < directions.length; i++) {
    final turn = turnBetween(facing, directions[i]);
    if (turn == null) throw StateError('Generated U-turn at step $i');
    facing = directions[i];
    turns.add(turn);
  }
  return turns;
}

List<NavigatorFalseBranch> _makeFalseBranches(Rng rng, List<GridCell> route, int gridSize, int targetCount) {
  if (targetCount <= 0) return const [];
  final routeCells = route.map(cellKey).toSet();
  final usedTargets = <String>{};
  final candidates = shuffle(rng, [
    for (final from in route)
      for (final to in cardinalNeighbors(from, gridSize)) NavigatorFalseBranch(from, to),
  ]);
  final branches = <NavigatorFalseBranch>[];
  for (final candidate in candidates) {
    final targetKey = cellKey(candidate.to);
    if (routeCells.contains(targetKey) || usedTargets.contains(targetKey)) continue;
    branches.add(candidate);
    usedTargets.add(targetKey);
    if (branches.length == targetCount) break;
  }
  return branches;
}

List<NavigatorLandmark> _makeLandmarks(Rng rng, int gridSize, int count) {
  final cells = shuffle(rng, [
    for (var index = 0; index < gridSize * gridSize; index++) GridCell(index % gridSize, index ~/ gridSize),
  ]);
  return [
    for (var index = 0; index < math.min(count, cells.length); index++)
      NavigatorLandmark('landmark-${index + 1}', cells[index], _landmarkSymbols[index % _landmarkSymbols.length]),
  ];
}

NavigatorRound generateNavigatorRound(String seed, num requestedLevel, [NavigatorMode? requestedMode]) {
  final normalizedSeed = normalizeSeed(seed, 'navigator');
  final level = _clampLevel(requestedLevel);
  final mode = requestedMode ?? navigatorModeForLevel(level);
  final rng = createRng('$normalizedSeed:$level:${mode.wire}:$navigatorGeneratorVersion');
  final gridSize = math.min(8, 3 + (level - 1) ~/ 5);
  final routeSteps = [15, gridSize * gridSize - 1, 3 + (level - 1) ~/ 2].reduce(math.min);
  final route = _makeRoute(rng, gridSize, routeSteps);
  final directions = _routeDirections(route);
  final first = directions.first;
  final startingFacing = shuffle(rng, [first, rotateCardinal(first, 90), rotateCardinal(first, 270)]).first;
  final turns = _routeTurns(directions, startingFacing);
  final landmarkTarget = level < 4 ? 0 : math.min(5, 1 + (level - 4) ~/ 6);
  final falseBranchTarget = level < 7 ? 0 : math.min(6, 1 + (level - 7) ~/ 5);
  final rotationTier = level < 8 ? 0 : math.min(3, 1 + (level - 8) ~/ 7);
  final allowedRotations = _rotations.sublist(0, rotationTier + 1);
  final mapRotation = allowedRotations[randomInt(rng, 0, allowedRotations.length - 1)];
  final hideMapDuringRecall = level >= 6;
  final delaySteps = level < 6 ? 0 : math.min(3, 1 + (level - 6) ~/ 8);
  final homeBearingDeg = bearingDegrees(route.last, route.first);
  final raw = 4 +
      gridSize * 4 +
      routeSteps * 3.2 +
      landmarkTarget * 2 +
      falseBranchTarget * 3 +
      rotationTier * 4 +
      (hideMapDuringRecall ? 7 : 0) +
      delaySteps * 3;
  final difficulty = math.min(100, math.max(1, jsRound(raw.toDouble()).toInt()));
  // ⚠️ Порядок бросков: ориентиры, ПОТОМ ложные ветви — как поля в литерале TS.
  final landmarks = _makeLandmarks(rng, gridSize, landmarkTarget);
  final falseBranches = _makeFalseBranches(rng, route, gridSize, falseBranchTarget);
  final round = NavigatorRound(
    id: 'navigator:$normalizedSeed:$level:${mode.wire}',
    seed: normalizedSeed,
    level: level,
    mode: mode,
    difficulty: difficulty,
    gridSize: gridSize,
    routeSteps: routeSteps,
    route: route,
    routeDirections: directions,
    startingFacing: startingFacing,
    turns: turns,
    landmarks: landmarks,
    falseBranches: falseBranches,
    mapRotation: mapRotation,
    hideMapDuringRecall: hideMapDuringRecall,
    delaySteps: delaySteps,
    homeBearingDeg: homeBearingDeg,
    correctHomeSector: homeSectorForBearing(homeBearingDeg),
  );
  final issues = validateNavigatorRound(round);
  if (issues.isNotEmpty) throw StateError('Generated invalid Navigator round: ${issues.join(', ')}');
  return round;
}
