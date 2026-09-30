/// СЧЁТ «НАВИГАТОРА» — ПЕРЕНОС `core/scoring.ts` ОДИН В ОДИН.
///
/// ⚠️ `Math.round` → `jsRound`. Доля в счёте даёт ровные половины (15 из 16 → 937,5); пока
/// значение неотрицательное, JS и Dart округляют одинаково, но держать это рассуждение в голове
/// дороже, чем взять функцию, которая совпадает всегда.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart';
import 'geometry.dart';
import 'types.dart';

class NavigatorMetrics {
  const NavigatorMetrics({
    required this.accuracy,
    required this.durationMs,
    required this.difficulty,
    required this.errors,
    required this.score,
    required this.seed,
    required this.level,
    required this.mode,
    required this.gridSize,
    required this.routeSteps,
    required this.routeAccuracy,
    required this.extraSteps,
    required this.angularErrorDeg,
    required this.routeHits,
    required this.turnHits,
    required this.turnTotal,
    required this.selectedHomeSector,
    required this.correctHomeSector,
    required this.mapRotation,
    required this.landmarkCount,
    required this.falseBranchCount,
    required this.hideMapDuringRecall,
    required this.delaySteps,
  });

  final double accuracy;
  final int durationMs;
  final int difficulty;
  final int errors;
  final int score;
  final String seed;
  final int level;
  final NavigatorMode mode;
  final int gridSize;
  final int routeSteps;
  final double? routeAccuracy;
  final int extraSteps;
  final double? angularErrorDeg;
  final int routeHits;
  final int turnHits;
  final int turnTotal;
  final HomeSector? selectedHomeSector;
  final HomeSector correctHomeSector;
  final int mapRotation;
  final int landmarkCount;
  final int falseBranchCount;
  final bool hideMapDuringRecall;
  final int delaySteps;
  String get generatorVersion => navigatorGeneratorVersion;
}

/// Партия пройдена: у «домой» — промах не больше полусектора, у остальных — точность ≥ 0,8.
bool isPassed(NavigatorMetrics m) {
  if (m.mode == NavigatorMode.homeDirection) {
    return m.angularErrorDeg != null && m.angularErrorDeg! <= 22.5;
  }
  return m.accuracy >= 0.8;
}

double _clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));

NavigatorMetrics scoreNavigatorCompletion(
  NavigatorRound round, {
  required double durationMs,
  required int routeHits,
  required int extraSteps,
  required int turnHits,
  required HomeSector? selectedHomeSector,
}) {
  final angularErrorDeg = round.mode == NavigatorMode.homeDirection && selectedHomeSector != null
      ? angularDifference(homeSectorAngle(selectedHomeSector), round.homeBearingDeg)
      : null;
  final double? routeAccuracy = switch (round.mode) {
    NavigatorMode.routeRecall => round.routeSteps / math.max(1, round.routeSteps + extraSteps),
    NavigatorMode.turnSequence => turnHits / round.routeSteps,
    NavigatorMode.homeDirection => null,
  };
  final accuracy = routeAccuracy ?? _clamp(1 - (angularErrorDeg ?? 180) / 180, 0, 1);
  final errors = switch (round.mode) {
    NavigatorMode.routeRecall => extraSteps,
    NavigatorMode.turnSequence => round.routeSteps - turnHits,
    NavigatorMode.homeDirection => selectedHomeSector == round.correctHomeSector ? 0 : 1,
  };
  final score = jsRound(_clamp(accuracy * 1000 + round.difficulty * 5 - errors * 35, 0, 1500)).toInt();
  return NavigatorMetrics(
    accuracy: accuracy,
    durationMs: math.max(0, jsRound(durationMs).toInt()),
    difficulty: round.difficulty,
    errors: errors,
    score: score,
    seed: round.seed,
    level: round.level,
    mode: round.mode,
    gridSize: round.gridSize,
    routeSteps: round.routeSteps,
    routeAccuracy: routeAccuracy,
    extraSteps: round.mode == NavigatorMode.routeRecall ? extraSteps : 0,
    angularErrorDeg: angularErrorDeg,
    routeHits: round.mode == NavigatorMode.routeRecall ? routeHits : 0,
    turnHits: round.mode == NavigatorMode.turnSequence ? turnHits : 0,
    turnTotal: round.mode == NavigatorMode.turnSequence ? round.routeSteps : 0,
    selectedHomeSector: selectedHomeSector,
    correctHomeSector: round.correctHomeSector,
    mapRotation: round.mapRotation,
    landmarkCount: round.landmarks.length,
    falseBranchCount: round.falseBranches.length,
    hideMapDuringRecall: round.hideMapDuringRecall,
    delaySteps: round.delaySteps,
  );
}
