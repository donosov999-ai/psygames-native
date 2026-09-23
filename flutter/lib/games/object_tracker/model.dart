/// ПРАВИЛА «ТРЕКЕРА ОБЪЕКТОВ» — перенос ядра frontend/src/games/object-tracker/core.
///
/// Игра про удержание нескольких целей взглядом: показали, какие шарики целевые,
/// шарики перемешались движением, назови их снова. 41 уровень: растут число
/// шариков (4→12), число целей (1→5), скорость, длительность и «стягивание к
/// центру» — чем выше уровень, тем чаще цели проходят вплотную друг к другу.
///
/// ЧТО СВЕРЕНО ТОЧНО, А ЧТО С ДОПУСКОМ (честно, потому что это разные вещи):
/// · раздача круга (сколько шариков, какие цели, где стоят, скорости, трудность),
///   подсчёт очков и проверки круга — ТОЧНО, до последнего знака;
/// · траектория движения — с померенным допуском. Причина не в переносе: `Math.hypot`,
///   `sin`, `cos`, `atan2` у JS и у Dart совпадают не до последнего бита, а шаг
///   физики повторяется сотни раз за круг, и разница последнего знака расползается.
///   Насколько именно — померено пробой `object_tracker_test.dart` и записано там же.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' hide normalizeSeed;
import '../../shell/js_compat.dart' as jsc;
export '../../shell/js_compat.dart' show Rng, createRng, hashSeed, jsRound, randomInt, shuffle;

const String trackerGeneratorVersion = 'object-tracker-generator-v1';
const double trackerObjectRadius = 0.068;
const int trackerLevels = 41;

String normalizeSeed(String seed) => jsc.normalizeSeed(seed, 'object-tracker');

double _clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));

/// `Math.hypot` из JS: со шкалированием и компенсацией Кэхана, а не «корень из
/// суммы квадратов». Записано так же, как в V8, — иначе расхождение начинается
/// не в последнем знаке, а раньше.
double jsHypot(double x, double y) {
  final ax = x.abs();
  final ay = y.abs();
  final maxAbs = math.max(ax, ay);
  if (maxAbs == 0) return 0;
  var sum = 0.0;
  var compensation = 0.0;
  for (final v in [ax, ay]) {
    final n = v / maxAbs;
    final summand = n * n - compensation;
    final preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return maxAbs * math.sqrt(sum);
}

// ──────────────────────────────── Состояние мира ─────────────────────────────

class TrackerObjectState {
  TrackerObjectState({required this.id, required this.x, required this.y, required this.vx, required this.vy});
  final String id;
  double x, y, vx, vy;

  TrackerObjectState copy() => TrackerObjectState(id: id, x: x, y: y, vx: vx, vy: vy);

  Map<String, dynamic> toJson() => {'id': id, 'x': x, 'y': y, 'vx': vx, 'vy': vy};
}

class TrackerWorld {
  TrackerWorld({required this.timeMs, required this.objects, this.closeApproaches = 0, List<String>? closePairs})
      : closePairs = closePairs ?? <String>[];
  double timeMs;
  List<TrackerObjectState> objects;
  int closeApproaches;
  List<String> closePairs;

  TrackerWorld copy() => TrackerWorld(
        timeMs: timeMs,
        objects: objects.map((o) => o.copy()).toList(),
        closeApproaches: closeApproaches,
        closePairs: List<String>.of(closePairs),
      );
}

class ObjectTrackerRound {
  const ObjectTrackerRound({
    required this.id,
    required this.seed,
    required this.level,
    required this.difficulty,
    required this.objectCount,
    required this.targetCount,
    required this.targetIds,
    required this.initialWorld,
    required this.speed,
    required this.speedTier,
    required this.durationMs,
    required this.durationTier,
    required this.closeApproachStrength,
    required this.closeApproachTier,
  });

  final String id, seed;
  final int level, difficulty, objectCount, targetCount;
  final List<String> targetIds;
  final TrackerWorld initialWorld;
  final double speed;
  final int speedTier, durationMs, durationTier;
  final double closeApproachStrength;
  final int closeApproachTier;

  double get objectRadius => trackerObjectRadius;
}

// ──────────────────────────────── Раздача круга ──────────────────────────────

int objectCountForLevel(int level) => math.min(12, 4 + ((level - 1) / 3).floor());

int targetCountForLevel(int level, int objectCount) =>
    math.min(5, math.min(objectCount - 1, 1 + ((level - 1) / 8).floor()));

List<List<double>> gridPositions(int count) {
  final columns = math.min(4, count);
  final rows = (count / columns).ceil();
  return List<List<double>>.generate(count, (index) => [
        (index % columns + 0.5) / columns,
        ((index / columns).floor() + 0.5) / rows,
      ]);
}

ObjectTrackerRound generateObjectTrackerRound(String seed, int requestedLevel) {
  final normalizedSeed = normalizeSeed(seed);
  final level = math.min(trackerLevels, math.max(1, requestedLevel.floor()));
  final rng = createRng('$normalizedSeed:$level:$trackerGeneratorVersion');
  final objectCount = objectCountForLevel(level);
  final targetCount = targetCountForLevel(level, objectCount);
  final speedTier = math.min(10, ((level - 1) / 3).floor());
  final durationTier = math.min(10, ((level - 1) / 4).floor());
  final closeApproachTier = math.min(8, ((level - 1) / 5).floor());
  final speed = 0.085 + speedTier * 0.012;
  final durationMs = 2800 + durationTier * 450;
  final closeApproachStrength = closeApproachTier / 8;
  final positions = shuffle(rng, gridPositions(objectCount));

  final objects = <TrackerObjectState>[];
  for (var index = 0; index < positions.length; index += 1) {
    final px = positions[index][0];
    final py = positions[index][1];
    final randomAngle = rng() * math.pi * 2;
    final centerAngle = math.atan2(0.5 - py, 0.5 - px);
    final blend = closeApproachStrength * 0.35;
    final vx = math.cos(randomAngle) * (1 - blend) + math.cos(centerAngle) * blend;
    final vy = math.sin(randomAngle) * (1 - blend) + math.sin(centerAngle) * blend;
    final magnitude = jsHypot(vx, vy) == 0 ? 1.0 : jsHypot(vx, vy);
    objects.add(TrackerObjectState(
      id: 'object-${index + 1}',
      x: px,
      y: py,
      vx: vx / magnitude * speed,
      vy: vy / magnitude * speed,
    ));
  }

  final targetIds = shuffle(rng, objects.map((o) => o.id).toList()).take(targetCount).toList()..sort();
  final difficulty = _clamp(
    jsRound(4 +
        objectCount * 3.5 +
        targetCount * 6 +
        speedTier * 2 +
        durationTier * 1.5 +
        closeApproachTier * 2.5),
    1,
    100,
  ).toInt();

  final round = ObjectTrackerRound(
    id: 'object-tracker:$normalizedSeed:$level',
    seed: normalizedSeed,
    level: level,
    difficulty: difficulty,
    objectCount: objectCount,
    targetCount: targetCount,
    targetIds: targetIds,
    initialWorld: TrackerWorld(timeMs: 0, objects: objects),
    speed: speed,
    speedTier: speedTier,
    durationMs: durationMs,
    durationTier: durationTier,
    closeApproachStrength: closeApproachStrength,
    closeApproachTier: closeApproachTier,
  );
  final issues = validateObjectTrackerRound(round);
  if (issues.isNotEmpty) {
    throw StateError('Раздача круга не прошла проверку: ${issues.join(', ')}');
  }
  return round;
}

// ─────────────────────────────────── Физика ──────────────────────────────────
//
// Шаг ФИКСИРОВАННЫЙ — 8 мс, и это не деталь, а условие повторяемости: мир
// двигают не часы, а накопленные дельты кадров. Переменный шаг давал бы разную
// партию на разных устройствах при одном зерне.

const double _substepMs = 8;
const double _epsilon = 1e-9;

String _pairKey(String left, String right) =>
    left.compareTo(right) < 0 ? '$left|$right' : '$right|$left';

void _keepInside(TrackerObjectState o, double radius) {
  if (o.x < radius) {
    o.x = radius;
    o.vx = o.vx.abs();
  } else if (o.x > 1 - radius) {
    o.x = 1 - radius;
    o.vx = -o.vx.abs();
  }
  if (o.y < radius) {
    o.y = radius;
    o.vy = o.vy.abs();
  } else if (o.y > 1 - radius) {
    o.y = 1 - radius;
    o.vy = -o.vy.abs();
  }
}

void _applyConvergence(TrackerObjectState o, double strength, double dtSeconds, double nominalSpeed) {
  if (strength <= 0) return;
  final dx = 0.5 - o.x;
  final dy = 0.5 - o.y;
  final h = jsHypot(dx, dy);
  final distance = h == 0 ? 1.0 : h;
  final acceleration = strength * 0.055;
  o.vx += dx / distance * acceleration * dtSeconds;
  o.vy += dy / distance * acceleration * dtSeconds;
  final speed = jsHypot(o.vx, o.vy);
  final cap = nominalSpeed * 1.3;
  if (speed > cap) {
    o.vx = o.vx / speed * cap;
    o.vy = o.vy / speed * cap;
  }
}

void _resolvePair(TrackerObjectState left, TrackerObjectState right, double radius, int leftIndex, int rightIndex) {
  var dx = right.x - left.x;
  var dy = right.y - left.y;
  var distance = jsHypot(dx, dy);
  if (distance < _epsilon) {
    final angle = ((leftIndex + 1) * 17 + (rightIndex + 1) * 29) * 0.61803398875;
    dx = math.cos(angle);
    dy = math.sin(angle);
    distance = 1;
  }
  final minimumDistance = radius * 2;
  if (distance >= minimumDistance) return;
  final nx = dx / distance;
  final ny = dy / distance;
  final overlap = minimumDistance - distance + 1e-7;
  left.x -= nx * overlap / 2;
  left.y -= ny * overlap / 2;
  right.x += nx * overlap / 2;
  right.y += ny * overlap / 2;

  final leftNormal = left.vx * nx + left.vy * ny;
  final rightNormal = right.vx * nx + right.vy * ny;
  if (leftNormal > rightNormal) {
    final delta = rightNormal - leftNormal;
    left.vx += delta * nx;
    left.vy += delta * ny;
    right.vx -= delta * nx;
    right.vy -= delta * ny;
  }
}

Set<String> _closePairs(List<TrackerObjectState> objects, double threshold) {
  final pairs = <String>{};
  for (var l = 0; l < objects.length; l += 1) {
    for (var r = l + 1; r < objects.length; r += 1) {
      final a = objects[l];
      final b = objects[r];
      if (jsHypot(a.x - b.x, a.y - b.y) <= threshold) pairs.add(_pairKey(a.id, b.id));
    }
  }
  return pairs;
}

void _singleStep(ObjectTrackerRound round, List<TrackerObjectState> objects, double dtMs) {
  final dtSeconds = dtMs / 1000;
  for (final o in objects) {
    _applyConvergence(o, round.closeApproachStrength, dtSeconds, round.speed);
    o.x += o.vx * dtSeconds;
    o.y += o.vy * dtSeconds;
    _keepInside(o, round.objectRadius);
  }
  for (var iteration = 0; iteration < 8; iteration += 1) {
    for (var l = 0; l < objects.length; l += 1) {
      for (var r = l + 1; r < objects.length; r += 1) {
        _resolvePair(objects[l], objects[r], round.objectRadius, l, r);
      }
    }
    for (final o in objects) {
      _keepInside(o, round.objectRadius);
    }
  }
}

TrackerWorld advanceTrackerWorld(ObjectTrackerRound round, TrackerWorld world, double requestedDeltaMs) {
  final remaining = math.max(0.0, round.durationMs - world.timeMs);
  final deltaMs = _clamp(requestedDeltaMs.isFinite ? requestedDeltaMs : 0, 0, remaining);
  if (deltaMs <= 0) return world.copy();
  final next = world.copy();
  var priorClose = world.closePairs.toSet();
  var elapsed = 0.0;
  while (elapsed < deltaMs - _epsilon) {
    final step = math.min(_substepMs, deltaMs - elapsed);
    _singleStep(round, next.objects, step);
    elapsed += step;
    final currentClose = _closePairs(next.objects, round.objectRadius * 2 + 0.055);
    for (final key in currentClose) {
      if (!priorClose.contains(key)) next.closeApproaches += 1;
    }
    priorClose = currentClose;
  }
  next.timeMs = math.min(round.durationMs.toDouble(), world.timeMs + deltaMs);
  next.closePairs = priorClose.toList()..sort();
  return next;
}

List<TrackerWorld> simulateTrackerRound(ObjectTrackerRound round, [double sampleMs = 50]) {
  final frames = [round.initialWorld.copy()];
  var world = frames.first;
  while (world.timeMs < round.durationMs) {
    world = advanceTrackerWorld(round, world, sampleMs);
    frames.add(world);
  }
  return frames;
}

// ──────────────────────────────── Проверки круга ─────────────────────────────

class TrackerWorldValidation {
  const TrackerWorldValidation({
    required this.valid,
    required this.insideField,
    required this.nonOverlapping,
    required this.finite,
    required this.minimumGap,
    required this.maximumDisplacement,
    required this.issues,
  });
  final bool valid, insideField, nonOverlapping, finite;
  final double minimumGap, maximumDisplacement;
  final List<String> issues;
}

TrackerWorldValidation validateTrackerWorld(
  ObjectTrackerRound round,
  TrackerWorld world, {
  TrackerWorld? previous,
  double deltaMs = 0,
}) {
  final issues = <String>[];
  final ids = <String>{};
  var insideField = true;
  var finite = true;
  var minimumGap = double.infinity;
  var maximumDisplacement = 0.0;
  final previousById = {for (final o in previous?.objects ?? const <TrackerObjectState>[]) o.id: o};

  for (final o in world.objects) {
    if (ids.contains(o.id)) issues.add('дубль шарика ${o.id}');
    ids.add(o.id);
    if (![o.x, o.y, o.vx, o.vy].every((v) => v.isFinite)) finite = false;
    if (o.x < round.objectRadius - 1e-7 ||
        o.x > 1 - round.objectRadius + 1e-7 ||
        o.y < round.objectRadius - 1e-7 ||
        o.y > 1 - round.objectRadius + 1e-7) {
      insideField = false;
    }
    final prior = previousById[o.id];
    if (prior != null) {
      maximumDisplacement = math.max(maximumDisplacement, jsHypot(o.x - prior.x, o.y - prior.y));
    }
  }
  if (!finite) issues.add('нечисловое состояние шарика');
  if (!insideField) issues.add('шарик вышел за поле');
  if (world.objects.length != round.objectCount) issues.add('число шариков не то');
  for (var l = 0; l < world.objects.length; l += 1) {
    for (var r = l + 1; r < world.objects.length; r += 1) {
      final a = world.objects[l];
      final b = world.objects[r];
      minimumGap = math.min(minimumGap, jsHypot(a.x - b.x, a.y - b.y) - round.objectRadius * 2);
    }
  }
  final nonOverlapping = minimumGap >= -2e-6;
  if (!nonOverlapping) issues.add('шарики налезли друг на друга на ${-minimumGap}');
  if (previous != null && deltaMs > 0) {
    final generousMaximum = round.speed * 1.4 * deltaMs / 1000 + 0.003;
    if (maximumDisplacement > generousMaximum) issues.add('прыжок на $maximumDisplacement');
  }
  return TrackerWorldValidation(
    valid: issues.isEmpty,
    insideField: insideField,
    nonOverlapping: nonOverlapping,
    finite: finite,
    minimumGap: minimumGap.isFinite ? minimumGap : 1,
    maximumDisplacement: maximumDisplacement,
    issues: issues,
  );
}

List<String> validateObjectTrackerRound(ObjectTrackerRound round) {
  final issues = <String>[];
  if (round.objectCount < 4 || round.objectCount > 12) issues.add('шариков ${round.objectCount}');
  if (round.targetCount < 1 || round.targetCount > 5 || round.targetCount >= round.objectCount) {
    issues.add('целей ${round.targetCount}');
  }
  if (round.targetIds.length != round.targetCount ||
      round.targetIds.toSet().length != round.targetCount) {
    issues.add('список целей испорчен');
  }
  final objectIds = round.initialWorld.objects.map((o) => o.id).toSet();
  if (round.targetIds.any((id) => !objectIds.contains(id))) issues.add('цели нет среди шариков');
  if (round.initialWorld.timeMs != 0) issues.add('время старта не ноль');
  if (round.durationMs < 2000 || round.durationMs > 10000) issues.add('длительность вне договора');
  if (round.speed <= 0 || round.speed > 0.3) issues.add('скорость вне договора');
  if (round.closeApproachStrength < 0 || round.closeApproachStrength > 1) {
    issues.add('стягивание вне 0..1');
  }
  issues.addAll(validateTrackerWorld(round, round.initialWorld).issues);
  return issues;
}

// ──────────────────────────────── Подсчёт очков ──────────────────────────────

class ObjectTrackerMetrics {
  const ObjectTrackerMetrics({
    required this.accuracy,
    required this.durationMs,
    required this.difficulty,
    required this.errors,
    required this.score,
    required this.hits,
    required this.misses,
    required this.falseSelections,
    required this.selectedCount,
    required this.closeApproaches,
  });
  final double accuracy;
  final int durationMs, difficulty, errors, score;
  final int hits, misses, falseSelections, selectedCount, closeApproaches;
}

/// Уровень взят: точность не ниже 0,6 И не больше одного лишнего шарика.
bool isPassed(ObjectTrackerMetrics m) => m.accuracy >= 0.6 && m.falseSelections <= 1;

ObjectTrackerMetrics scoreObjectTrackerCompletion(
  ObjectTrackerRound round,
  List<String> selectedIds, {
  required int durationMs,
  required int closeApproaches,
}) {
  final targetIds = round.targetIds.toSet();
  final objectIds = round.initialWorld.objects.map((o) => o.id).toSet();
  final unique = <String>[];
  for (final id in selectedIds) {
    if (!unique.contains(id) && objectIds.contains(id)) unique.add(id);
  }
  final hits = unique.where(targetIds.contains).length;
  final misses = round.targetCount - hits;
  final falseSelections = unique.where((id) => !targetIds.contains(id)).length;
  final errors = misses + falseSelections;
  final denominator = hits + errors;
  final accuracy = denominator == 0 ? 0.0 : hits / denominator;
  final score = jsRound(_clamp(
    accuracy * 1000 + round.difficulty * 4 + math.min(50, closeApproaches) * 2 - errors * 40,
    0,
    2000,
  )).toInt();

  return ObjectTrackerMetrics(
    accuracy: accuracy,
    durationMs: math.max(0, durationMs),
    difficulty: round.difficulty,
    errors: errors,
    score: score,
    hits: hits,
    misses: misses,
    falseSelections: falseSelections,
    selectedCount: unique.length,
    closeApproaches: math.max(0, closeApproaches),
  );
}
