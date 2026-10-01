/// ЗАБЕГ «СВОБОДНО» «Числового забега» — перенос `runner-campaign.mjs` (VER 4).
///
/// Двенадцать этапов по 14 рядов (7 построений + 7 препятствий), черта без порога, финал —
/// лестница из десяти стен, верхняя — число эталонного пути решателя. Состав этапов от зерна
/// НЕ зависит: зерно двигает только геометрию.
library;

import 'dart:collection';
import 'dart:math' as math;

import '../../shell/js_compat.dart' show jsRound;
import '../runner/road.dart';
import '../runner/shapes.dart';
import '../runner/solver.dart';

const String campaignVersion = 'number-run-campaign/4';
const int campaignStageCount = 12;
const int ladderWalls = 10;

/// Семь рядов чисел на этап. Состав от зерна не зависит: это лестница забега, а не жребий.
const List<List<String>> campaignPlan = [
  ['line', 'line', 'snake', 'line', 'grid', 'columns', 'line'],
  ['snake', 'walls', 'grid', 'columns', 'ramp', 'line', 'snake'],
  ['grid', 'columns', 'ramp', 'snake', 'line', 'grid', 'walls'],
  ['columns', 'snake', 'walls', 'ramp', 'grid', 'line', 'double'],
  ['snake', 'ramp', 'columns', 'line', 'grid', 'snake', 'walls'],
  ['grid', 'line', 'snake', 'columns', 'ramp', 'grid', 'walls'],
  ['columns', 'grid', 'ramp', 'snake', 'walls', 'columns', 'line'],
  ['snake', 'columns', 'line', 'grid', 'ramp', 'snake', 'double'],
  ['ramp', 'grid', 'columns', 'walls', 'snake', 'columns', 'grid'],
  ['line', 'snake', 'grid', 'ramp', 'columns', 'walls', 'snake'],
  ['columns', 'ramp', 'snake', 'grid', 'line', 'columns', 'walls'],
  ['snake', 'walls', 'columns', 'ramp', 'grid', 'columns', 'double'],
];

/// Прибавка и потеря строя по месту ряда в этапе, в долях k.
const List<List<double>> _lineGains = [
  [4, 2],
  [4, 3],
  [6, 4],
  [5, 3],
  [2, 4],
  [5, 2],
  [3, 2],
];

final LinkedHashMap<int, RoadCourse> _cache = LinkedHashMap();

/// Построение ряда по имени — общее для забега и уровней.
void buildShape(RoadTrack track, String shape, int stage, double k) {
  switch (shape) {
    case 'grid':
      track.grid(stage, k);
    case 'columns':
      track.columns(stage, k);
    case 'ramp':
      track.ramp(stage, k);
    case 'walls':
      track.walls(stage, k);
    default:
      throw ArgumentError('Unknown shape $shape');
  }
}

RoadCourse makeCampaign([int seed = 20260912]) {
  if (seed < 0 || seed > 0xffffffff) throw ArgumentError('Invalid campaign seed');
  final cached = _cache[seed];
  if (cached != null) return cached;
  final track = RoadTrack(runnerRandom(seed));
  final stages = <RoadStage>[];
  for (var stage = 1; stage <= campaignStageCount; stage++) {
    final k = stage + 1.0, startRow = track.rows.length, startValue = track.intended, plan = campaignPlan[stage - 1];
    var slot = 0;
    void next() {
      final shape = plan[slot++];
      if (shape == 'line') {
        final g = _lineGains[slot - 1];
        track.line(stage, k, g[0] * k, g[1] * k);
      } else if (shape == 'double') {
        track.doubling(stage, k, stage == 8 ? 1.15 : .85);
      } else if (shape == 'snake') {
        track.snake(stage, k, stage == 1 ? 0 : stage < 6 ? 1 : 2);
      } else {
        buildShape(track, shape, stage, k);
      }
    }

    // Первые двадцать секунд уже содержат синие и красные числа, настоящий мост, прыжок и урон.
    next();
    track.bridge(stage, stage == 1 ? -1 : track.lane().toDouble());
    next();
    track.jump(stage, stage == 1 ? 0 : track.lane().toDouble());
    next();
    track.block(stage, k);
    next();
    track.gap(stage);
    next();
    track.jump(stage, track.lane().toDouble());
    next();
    track.bridge(stage, track.lane().toDouble());
    next();
    track.stageLine(stage);
    stages.add(RoadStage(
      id: stage,
      startRow: startRow,
      endRow: track.rows.length - 1,
      startZ: startRow * 24.0,
      endZ: track.rows.last.z,
      startValue: startValue,
      target: track.intended,
    ));
  }
  final course = RoadCourse(
    version: campaignVersion,
    mode: 'journey',
    levelId: 0,
    seed: seed,
    start: 1,
    speed: 8,
    lateralSpeed: 4,
    rows: List.unmodifiable(track.rows),
    gates: campaignStageCount,
    stages: stages,
  );
  final path = solveCourse(course);
  if (path == null) throw StateError('No reachable journey: $seed');
  if ([-1.0, 0.0, 1.0].any((lane) => stationaryWins(course, lane))) throw StateError('Stationary journey winner: $seed');
  final done = course.withFinale(finaleLadder(path.last.sum));
  _cache[seed] = done;
  if (_cache.length > 3) _cache.remove(_cache.keys.first);
  return done;
}

/// Ряд круглых ступеней: при шаге «1/2/5» эталон 9 844 давал стены до 5 000 — половина пути
/// ломала всё.
const List<double> niceSteps = [8, 7.5, 6, 5, 4, 3, 2.5, 2, 1.5, 1.2, 1];

/// `10 ** Math.floor(Math.log10(raw))` без логарифма: у `math.log(1000) / math.ln10` хвост
/// 2,9999999999999996, и степень вышла бы в десять раз меньше.
double _power10Floor(double raw) {
  var p = 1.0;
  while (p * 10 <= raw) {
    p *= 10;
  }
  while (p > raw) {
    p /= 10;
  }
  return p;
}

/// Финал после черты: десять стен, верхняя — число эталонного пути решателя. Ступень — круглое
/// число не больше десятой доли, поэтому верхнюю стену эталонный путь пробивает всегда.
RoadFinale finaleLadder(double reference) {
  final raw = math.max(1.0, reference / ladderWalls);
  final power = _power10Floor(raw);
  final step = niceSteps.map((m) => m * power).firstWhere((v) => v <= raw + 1e-9);
  return RoadFinale.ladder(
    reference: reference,
    walls: [for (var i = 0; i < ladderWalls; i++) jsRound(step * (i + 1))],
  );
}

int wallsBroken(RoadFinale finale, double value) => finale.walls!.where((v) => value >= v).length;
