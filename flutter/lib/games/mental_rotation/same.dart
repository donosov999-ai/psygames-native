/// «ОДИНАКОВЫ?» — перенос `core/same.ts`.
///
/// Две фигуры рядом: ответ «да» или «нет». Пара собирается честной проверкой, а не по замыслу:
/// одинаковая картинка — не задание (её отвечают без поворота), поворот обязан остаться поворотом,
/// подделка обязана НЕ быть поворотом. Всё три ловушки проверяются перебором 24 ориентаций.
library;

import 'geometry.dart';
import 'levels.dart';
import 'projection.dart';
import 'rng.dart';
import 'rotation.dart';
import 'task.dart';

const List<Axis> _axes = [Axis.x, Axis.y, Axis.z];

/// Случайная ориентация: по случайному числу четвертей вокруг каждой оси.
Shape tumble(Shape shape, Rng rng) {
  var out = shape;
  for (final axis in _axes) {
    out = rotateShape(out, axis, randomInt(rng, 0, 3));
  }
  return normalizeShape(out);
}

enum SameFlaw { none, mirror, oneCube }

String sameFlawName(SameFlaw f) => switch (f) {
  SameFlaw.none => 'none',
  SameFlaw.mirror => 'mirror',
  SameFlaw.oneCube => 'one-cube',
};

class SameOption {
  const SameOption({required this.answer, required this.isMatch});
  final bool answer;
  final bool isMatch;
}

class SameTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.same;

  const SameTask({
    required this.left,
    required this.right,
    required this.isSame,
    required this.flaw,
    required this.options,
    required this.correctIdx,
  });

  final Shape left;
  final Shape right;
  final bool isSame;
  final SameFlaw flaw;
  final List<SameOption> options;
  @override
  final int correctIdx;
}

SameTask _pair(Shape left, Shape right, bool isSame, SameFlaw flaw) => SameTask(
  left: left,
  right: right,
  isSame: isSame,
  flaw: flaw,
  options: [
    SameOption(answer: true, isMatch: isSame),
    SameOption(answer: false, isMatch: !isSame),
  ],
  correctIdx: isSame ? 0 : 1,
);

SameTask buildSameTask(int level, Rng rng) {
  final p = levelParams(level);
  final spec = rotationLevelSpec(level);
  final candidates = rotationCandidates(p);
  if (candidates.isEmpty) throw StateError('нет фигур размера ${p.minC}–${p.maxC}');

  final wantSame = rng() < 0.5;

  for (var attempt = 0; attempt < 200; attempt++) {
    final left = normalizeShape(pick(rng, candidates));

    if (wantSame) {
      final right = tumble(left, rng);
      if (shapeKey(right) == shapeKey(left)) continue; // одинаковая картинка — не задание
      if (!isValidRotation(left, right)) continue; // поворот обязан остаться поворотом
      return _pair(left, right, true, SameFlaw.none);
    }

    final useMirror = spec.foil != 'one-cube';
    final source = useMirror ? mirrorShape(left) : moveOneCube(left, rng);
    if (source == null) continue;
    final right = tumble(source, rng);
    if (isValidRotation(left, right)) continue; // подделка обязана НЕ быть поворотом
    return _pair(left, right, false, useMirror ? SameFlaw.mirror : SameFlaw.oneCube);
  }

  throw StateError('same $level: не собралась честная пара за 200 попыток');
}
