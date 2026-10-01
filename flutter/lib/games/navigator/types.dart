/// ТИПЫ «НАВИГАТОРА» — ПЕРЕНОС `frontend/src/games/navigator/core/types.ts` ОДИН В ОДИН.
///
/// Строковые объединения TS стали перечислениями Dart. У каждого значения есть [wire] — ровно
/// та строка, что в TS: по ней сверяется эталон, снятый прогоном живого ядра, и по ней же
/// значения уходят в сохранение партии. Имена значений латиницей: Dart не принимает дефис в
/// идентификаторе, поэтому `north-east` стал `northEast`, а строка осталась прежней.
library;

const navigatorGeneratorVersion = 'navigator-generator-v1';

/// Ступеней лестницы — как `LEVELS` в TS.
const navigatorLevels = 33;

enum NavigatorMode {
  routeRecall('route-recall'),
  turnSequence('turn-sequence'),
  homeDirection('home-direction');

  const NavigatorMode(this.wire);
  final String wire;

  static NavigatorMode fromWire(String s) => values.firstWhere((m) => m.wire == s);
}

enum Cardinal {
  north('north'),
  east('east'),
  south('south'),
  west('west');

  const Cardinal(this.wire);
  final String wire;

  static Cardinal fromWire(String s) => values.firstWhere((c) => c.wire == s);
}

enum Turn {
  left('left'),
  straight('straight'),
  right('right');

  const Turn(this.wire);
  final String wire;

  static Turn fromWire(String s) => values.firstWhere((t) => t.wire == s);
}

enum HomeSector {
  north('north'),
  northEast('north-east'),
  east('east'),
  southEast('south-east'),
  south('south'),
  southWest('south-west'),
  west('west'),
  northWest('north-west');

  const HomeSector(this.wire);
  final String wire;

  static HomeSector fromWire(String s) => values.firstWhere((h) => h.wire == s);
}

/// Клетка сетки.
class GridCell {
  const GridCell(this.x, this.y);
  final int x;
  final int y;

  @override
  bool operator ==(Object other) => other is GridCell && other.x == x && other.y == y;

  @override
  int get hashCode => Object.hash(x, y);

  @override
  String toString() => '$x,$y';
}

class NavigatorLandmark {
  const NavigatorLandmark(this.id, this.cell, this.symbol);
  final String id;
  final GridCell cell;

  /// 'diamond' | 'circle' | 'triangle' | 'star' | 'square' — строкой, как в TS.
  final String symbol;
}

class NavigatorFalseBranch {
  const NavigatorFalseBranch(this.from, this.to);
  final GridCell from;
  final GridCell to;
}

class NavigatorRound {
  const NavigatorRound({
    required this.id,
    required this.seed,
    required this.level,
    required this.mode,
    required this.difficulty,
    required this.gridSize,
    required this.routeSteps,
    required this.route,
    required this.routeDirections,
    required this.startingFacing,
    required this.turns,
    required this.landmarks,
    required this.falseBranches,
    required this.mapRotation,
    required this.hideMapDuringRecall,
    required this.delaySteps,
    required this.homeBearingDeg,
    required this.correctHomeSector,
  });

  final String id;
  final String seed;
  final int level;
  final NavigatorMode mode;
  final int difficulty;
  final int gridSize;
  final int routeSteps;
  final List<GridCell> route;
  final List<Cardinal> routeDirections;
  final Cardinal startingFacing;
  final List<Turn> turns;
  final List<NavigatorLandmark> landmarks;
  final List<NavigatorFalseBranch> falseBranches;

  /// 0 | 90 | 180 | 270.
  final int mapRotation;
  final bool hideMapDuringRecall;
  final int delaySteps;
  final double homeBearingDeg;
  final HomeSector correctHomeSector;
  String get generatorVersion => navigatorGeneratorVersion;
}
