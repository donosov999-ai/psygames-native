/// «ТОЧКА ЗРЕНИЯ»: С КАКОГО УГЛА СМОТРИМ — перенос `core/viewpoint.ts`.
///
/// Фигура одна и та же, варианты — её ракурсы. Различие ракурсов решается не на глаз, а
/// отпечатком: две картинки считаются одинаковыми, если совпали грани на экране. Поэтому
/// сильно симметричная фигура просто не берётся — у неё различимых ракурсов меньше, чем вариантов.
///
/// 🔴 НОЛЬ ВЫБРАСЫВАЕТСЯ ВМЕСТЕ С ЛЮБЫМ УГЛОМ ТОГО ЖЕ ОТПЕЧАТКА: эталон показан под 0°, и такой
/// вариант отвечался бы без единого поворота в голове.
library;

import 'geometry.dart';
import 'levels.dart';
import 'rng.dart';
import 'shapes.dart';
import 'surface.dart';
import 'task.dart';

/// Размер, при котором снимается отпечаток ракурса. Только для сравнения.
const double fingerprintSize = 240;
const int _fingerprintPrecision = 1;

/// Ось, вокруг которой ходит зритель.
const Axis viewpointAxis = Axis.y;

String viewFingerprint(
  Shape shape,
  double degrees,
) => shapeSurface(shape, fingerprintSize, axis: viewpointAxis, degrees: degrees)
    .map(
      (f) => f.points
          .map(
            (p) =>
                '${p[0].toStringAsFixed(_fingerprintPrecision)},${p[1].toStringAsFixed(_fingerprintPrecision)}',
          )
          .join(' '),
    )
    .join('|');

/// Углы ступени: 90° на простых, 45° там, где поворот составной.
List<double> viewpointAngles(int level) {
  final step = levelParams(level).compound ? 45 : 90;
  final out = <double>[];
  for (var a = 0; a < 360; a += step) {
    out.add(a.toDouble());
  }
  return out;
}

/// Фигуры, у которых есть протяжённость и по X, и по Z — иначе ракурсы неразличимы.
List<Shape> viewpointCandidates(int minCubes, int maxCubes) {
  final band = shapesOfSize(minCubes, maxCubes);
  final solid = band
      .where((s) => s.map((c) => c[0]).toSet().length > 1 && s.map((c) => c[2]).toSet().length > 1)
      .toList();
  return solid.isNotEmpty ? solid : band;
}

class ViewpointOption {
  const ViewpointOption({required this.degrees, required this.isMatch});
  final double degrees;
  final bool isMatch;
}

class ViewpointTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.viewpoint;

  const ViewpointTask({
    required this.shape,
    required this.axis,
    required this.degrees,
    required this.options,
    required this.correctIdx,
  });

  final Shape shape;
  final Axis axis;
  final double degrees;
  final List<ViewpointOption> options;
  @override
  final int correctIdx;
}

ViewpointTask buildViewpointTask(int level, Rng rng) {
  final p = levelParams(level);
  final angles = viewpointAngles(level);
  final candidates = viewpointCandidates(p.minC, p.maxC);
  if (candidates.isEmpty) throw StateError('нет фигур размера ${p.minC}–${p.maxC}');

  for (final shape in shuffle(rng, candidates)) {
    final distinct = <String, double>{};
    for (final a in angles) {
      distinct.putIfAbsent(viewFingerprint(shape, a), () => a);
    }
    final offered = distinct.values.where((a) => a != 0).toList();
    if (offered.length < p.optionCount) continue;

    final usable = shuffle(rng, offered);
    final degrees = usable.first;
    final options = <ViewpointOption>[ViewpointOption(degrees: degrees, isMatch: true)];
    for (final a in usable.sublist(1, p.optionCount)) {
      options.add(ViewpointOption(degrees: a, isMatch: false));
    }
    final mixed = shuffle(rng, options);
    return ViewpointTask(
      shape: shape,
      axis: viewpointAxis,
      degrees: degrees,
      options: mixed,
      correctIdx: mixed.indexWhere((o) => o.isMatch),
    );
  }

  throw StateError('viewpoint $level: нет фигуры с ${p.optionCount} различимыми ракурсами');
}
