/// ЗАДАНИЕ «ПОВОРОТ» (Шепард — Метцлер) — перенос `core/rotation.ts`.
///
/// Среди вариантов один — законный поворот эталона, остальные зеркала, другие фигуры или фигуры с
/// переставленным кубиком. Путь поворота записывается пошагово (`steps`, по 90°): из готовой
/// повёрнутой фигуры путь обратно не восстановить, а разбор ошибки показывает именно тот поворот,
/// который применён. `angleSum` = 90° × число шагов — это ось биомаркера, а не украшение.
///
/// ⚠️ Всякая подделка проверяется [isValidRotation] перебором 24 ориентаций, а не «наверное,
/// зеркало»: у плоской фигуры зеркальная копия — законный поворот, и она стала бы вторым верным
/// ответом на экране.
library;

import 'geometry.dart';
import 'levels.dart';
import 'rng.dart';
import 'shapes.dart';
import 'task.dart';

/// Шаг поворота: четверть вокруг оси.
class RotationStep {
  const RotationStep(this.axis);
  final Axis axis;
}

/// Чем плох вариант: none — верный, mirror — зеркало, other — другая фигура.
enum Flaw { none, mirror, other }

class RotationOption {
  const RotationOption({required this.shape, required this.isMatch, required this.flaw});
  final Shape shape;
  final bool isMatch;
  final Flaw flaw;
}

class RotationTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.rotation;

  const RotationTask({
    required this.base,
    required this.options,
    required this.correctIdx,
    required this.steps,
    required this.angleSum,
  });

  final Shape base;
  final List<RotationOption> options;
  @override
  final int correctIdx;
  final List<RotationStep> steps;
  final int angleSum;
}

/// Киральная фигура: зеркальная копия НЕ является её поворотом.
bool isChiral(Shape shape) => !isValidRotation(shape, mirrorShape(shape));

/// Фигуры для поворотной пробы. Киральные — первым выбором; если их меньше двух, берём полосу.
List<Shape> rotationCandidates(LevelParams p) {
  final band = shapesOfSize(p.minC, p.maxC);
  final chiral = band.where(isChiral).toList();
  return chiral.length >= 2 ? chiral : band;
}

Shape _applySteps(Shape shape, List<RotationStep> steps) {
  var out = shape;
  for (final step in steps) {
    out = rotateShape(out, step.axis, 1);
  }
  return normalizeShape(out);
}

RotationTask buildRotationTask(int level, Rng rng) {
  final p = levelParams(level);
  final spec = rotationLevelSpec(level);
  final candidates = rotationCandidates(p);
  if (candidates.isEmpty) throw StateError('нет фигур размера ${p.minC}–${p.maxC}');
  var base = pick(rng, candidates);

  // Поворот обязан что-то изменить: вариант, совпавший с эталоном, отвечается без ротации в голове.
  final steps = [for (final axis in spec.path) RotationStep(axis)];
  if (rng() < .5) steps.add(RotationStep(spec.path.last));
  var correctShape = _applySteps(base, steps);
  for (
    var guard = 0;
    guard < 12 && shapeKey(correctShape) == shapeKey(normalizeShape(base));
    guard++
  ) {
    base = pick(rng, candidates);
    correctShape = _applySteps(base, steps);
  }

  final options = <RotationOption>[
    RotationOption(shape: correctShape, isMatch: true, flaw: Flaw.none),
  ];
  final taken = <String>{shapeKey(correctShape)};
  final others = candidates.where((s) => shapeKey(s) != shapeKey(base)).toList();

  RotationOption? spoil() {
    if (spec.foil == 'one-cube') {
      final changed = relocateCube(base, rng);
      if (changed == null) return null;
      final cand = _applySteps(changed, steps);
      if (isValidRotation(base, cand) || taken.contains(shapeKey(cand))) return null;
      return RotationOption(shape: cand, isMatch: false, flaw: Flaw.other);
    }
    final wantMirror = rng() < 0.55;
    final source = wantMirror
        ? mirrorShape(base)
        : (others.isNotEmpty ? pick(rng, others) : mirrorShape(base));
    final flaw = wantMirror || others.isEmpty ? Flaw.mirror : Flaw.other;
    var cand = source;
    for (final axis in p.axes) {
      cand = rotateShape(cand, axis, randomInt(rng, 1, 3));
    }
    cand = normalizeShape(cand);
    if (isValidRotation(base, cand)) return null;
    if (taken.contains(shapeKey(cand))) return null;
    return RotationOption(shape: cand, isMatch: false, flaw: flaw);
  }

  for (var attempt = 0; options.length < p.optionCount && attempt < 200; attempt++) {
    final spoiled = spoil();
    if (spoiled == null) continue;
    taken.add(shapeKey(spoiled.shape));
    options.add(spoiled);
  }
  if (options.length != p.optionCount) {
    throw StateError('rotation $level: insufficient distinct options');
  }

  final mixed = shuffle(rng, options);
  return RotationTask(
    base: normalizeShape(base),
    options: mixed,
    correctIdx: mixed.indexWhere((o) => o.isMatch),
    steps: steps,
    angleSum: steps.length * 90,
  );
}

/// Переставить ровно один кубик, сохранив связность по граням и их число.
Shape? relocateCube(Shape base, Rng rng) {
  final removed = randomInt(rng, 0, base.length - 1);
  final rest = [
    for (var i = 0; i < base.length; i++)
      if (i != removed) base[i],
  ];
  String key(Cube c) => '${c[0]},${c[1]},${c[2]}';
  final occupied = {for (final c in rest) key(c)};
  final seen = <String>{key(rest.first)};
  final queue = <Cube>[rest.first];
  for (var i = 0; i < queue.length; i++) {
    for (final d in _neighbors) {
      final c = <int>[queue[i][0] + d[0], queue[i][1] + d[1], queue[i][2] + d[2]];
      final k = key(c);
      if (occupied.contains(k) && !seen.contains(k)) {
        seen.add(k);
        queue.add(c);
      }
    }
  }
  if (seen.length != rest.length) return null;
  final frontier = <String, Cube>{};
  for (final c in rest) {
    for (final d in _neighbors) {
      final next = <int>[c[0] + d[0], c[1] + d[1], c[2] + d[2]];
      final k = key(next);
      if (!occupied.contains(k) && k != key(base[removed])) frontier[k] = next;
    }
  }
  if (frontier.isEmpty) return null;
  return [...rest, pick(rng, frontier.values.toList())];
}

const List<List<int>> _neighbors = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
