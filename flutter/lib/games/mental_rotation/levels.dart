/// ЛЕСТНИЦА «ПОВОРОТА» — перенос `core/levels.ts` и `levelParams` из `core/rotation.ts`.
///
/// Пятьдесят ступеней: каждая пятёрка меняет путь поворота и подделки, каждая пятёрка выше —
/// добавляет кубик. Единственный источник и для экрана, и для генератора: подпись «4 кубика,
/// ось Z» на настройке обязана совпасть с тем, что выпало в партии.
library;

import 'geometry.dart';

class RotationLevelSpec {
  const RotationLevelSpec({
    required this.level,
    required this.cubes,
    required this.path,
    required this.optionCount,
    required this.foil,
  });

  final int level;
  final int cubes;
  final List<Axis> path;
  final int optionCount;

  /// `mixed` — зеркало и другая фигура; `one-cube` — подделки с переставленным кубиком.
  final String foil;
}

class _Pattern {
  const _Pattern(this.path, this.optionCount, this.foil);
  final List<Axis> path;
  final int optionCount;
  final String foil;
}

const List<_Pattern> _patterns = [
  _Pattern([Axis.z], 3, 'mixed'),
  _Pattern([Axis.z, Axis.z], 3, 'mixed'),
  _Pattern([Axis.x, Axis.y], 3, 'mixed'),
  _Pattern([Axis.x, Axis.y, Axis.y], 4, 'mixed'),
  _Pattern([Axis.x, Axis.y, Axis.y], 4, 'one-cube'),
];

final List<RotationLevelSpec> rotationLevels = List.generate(50, (i) {
  final p = _patterns[i % 5];
  return RotationLevelSpec(
    level: i + 1,
    cubes: 4 + (i ~/ 5),
    path: [...p.path],
    optionCount: p.optionCount,
    foil: p.foil,
  );
});

RotationLevelSpec rotationLevelSpec(int level) => rotationLevels[(level - 1).clamp(0, 49)];

/// Параметры пробы уровня: размер фигуры, оси подделок, число вариантов.
class LevelParams {
  const LevelParams({
    required this.minC,
    required this.maxC,
    required this.axes,
    required this.optionCount,
    required this.compound,
  });

  final int minC;
  final int maxC;

  /// Оси пути БЕЗ повторов — ими крутят подделки.
  final List<Axis> axes;
  final int optionCount;

  /// Составной поворот (косой ракурс) — с четвёртой ступени каждой пятёрки.
  final bool compound;
}

LevelParams levelParams(int level) {
  final s = rotationLevelSpec(level);
  final axes = <Axis>[];
  for (final a in s.path) {
    if (!axes.contains(a)) axes.add(a);
  }
  return LevelParams(
    minC: s.cubes,
    maxC: s.cubes,
    axes: axes,
    optionCount: s.optionCount,
    compound: axes.length > 1,
  );
}
