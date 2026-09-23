/// ПОВЕРХНОСТЬ ФИГУРЫ — перенос `core/surface.ts`.
///
/// Тот же правый поворот, что в геометрии, только непрерывный: дробные углы нужны рисунку, а
/// состояние задания остаётся целочисленным. Отсюда же берётся отпечаток ракурса («Точка зрения»):
/// две картинки считаются одинаковыми, если совпали их грани на экране.
///
/// ⚠️ Масштаб по описанной сфере (когда `unit` не задан) — чтобы фигура не «дышала» при вращении;
/// у неподвижных вариантов ответа масштаб общий на набор (см. [stillUnit]), иначе пара
/// «фигура + её зеркало» выдавала бы себя одинаковым габаритом.
library;

import 'dart:math';

import 'geometry.dart';

/// Непрерывный поворот точки вокруг оси — тот же знак, что у четвертей в geometry.
List<double> turnPoint(List<double> p, Axis axis, double radians) {
  final c = cos(radians), s = sin(radians);
  final x = p[0], y = p[1], z = p[2];
  return switch (axis) {
    Axis.x => [x, y * c - z * s, y * s + z * c],
    Axis.y => [x * c + z * s, y, -x * s + z * c],
    Axis.z => [x * c - y * s, x * s + y * c, z],
  };
}

class _Face {
  const _Face(this.normal, this.corners);
  final List<double> normal;
  final List<List<double>> corners;
}

const List<_Face> _faces = [
  _Face(
    [1, 0, 0],
    [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  ),
  _Face(
    [-1, 0, 0],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  ),
  _Face(
    [0, 1, 0],
    [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  ),
  _Face(
    [0, -1, 0],
    [
      [0, 0, 1],
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
    ],
  ),
  _Face(
    [0, 0, 1],
    [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  ),
  _Face(
    [0, 0, -1],
    [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  ),
];

/// Грань фигуры на экране: точки в плоскости, глубина для порядка рисования и цвет.
class SurfaceFace {
  const SurfaceFace({
    required this.id,
    required this.depth,
    required this.ghost,
    required this.rgb,
    required this.points,
  });

  final String id;
  final double depth;

  /// Пустой кубик («Недостающая часть») — контур без заливки.
  final bool ghost;
  final List<int> rgb;
  final List<List<double>> points;
}

/// Грани фигуры в экранных координатах квадрата `size`.
List<SurfaceFace> shapeSurface(
  Shape shape,
  double size, {
  Axis axis = Axis.x,
  double degrees = 0,
  Shape ghost = const [],
  double? unit,
}) {
  if (shape.isEmpty) return [];
  final center = [
    for (var i = 0; i < 3; i++)
      (shape.map((c) => c[i]).reduce(min) + shape.map((c) => c[i]).reduce(max) + 1) / 2,
  ];
  String key(List<num> c) => '${c[0]},${c[1]},${c[2]}';
  final occupied = {for (final c in shape) key(c)};
  final empty = {for (final c in ghost) key(c)};
  final solid = occupied.where((k) => !empty.contains(k)).toSet();

  var radius = 0.0;
  for (final c in shape) {
    for (var dx = 0; dx < 2; dx++) {
      for (var dy = 0; dy < 2; dy++) {
        for (var dz = 0; dz < 2; dz++) {
          final v = [c[0] + dx - center[0], c[1] + dy - center[1], c[2] + dz - center[2]];
          final r = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
          if (r > radius) radius = r;
        }
      }
    }
  }
  final scale = (size - 12) / (2 * radius * sqrt(1.5));
  final radians = degrees * pi / 180;

  final out = <SurfaceFace>[];
  for (final cube in shape) {
    final isGhost = empty.contains(key(cube));
    for (var f = 0; f < _faces.length; f++) {
      final face = _faces[f];
      final neighbour = key([for (var i = 0; i < 3; i++) cube[i] + face.normal[i].toInt()]);
      if ((isGhost ? occupied : solid).contains(neighbour)) continue;
      final normal = turnPoint(face.normal, axis, radians);
      if (normal[0] + normal[1] + normal[2] <= 1e-7) continue;
      final points3 = [
        for (final p in face.corners)
          turnPoint([for (var i = 0; i < 3; i++) p[i] + cube[i] - center[i]], axis, radians),
      ];
      var depth = 0.0;
      for (final p in points3) {
        depth += p[0] + p[1] + p[2];
      }
      depth /= 4;
      final light = max(0.0, normal[0] * .3 + normal[1] * .8 + normal[2] * .5);
      final rgb = [
        for (final v in [106, 79, 153]) (v + (240 - v) * (.12 + .55 * light)).round(),
      ];
      out.add(
        SurfaceFace(
          id: '${key(cube)}:$f',
          depth: depth,
          ghost: isGhost,
          rgb: rgb,
          points: [
            for (final p in points3) [(p[0] - p[2]) * sqrt(3) / 2, -p[1] + (p[0] + p[2]) / 2],
          ],
        ),
      );
    }
  }

  if (unit == null) {
    for (final face in out) {
      for (final p in face.points) {
        p[0] = p[0] * scale + size / 2;
        p[1] = p[1] * scale + size / 2;
      }
    }
  } else {
    final xs = [
      for (final f in out)
        for (final p in f.points) p[0],
    ];
    final ys = [
      for (final f in out)
        for (final p in f.points) p[1],
    ];
    final cx = (xs.reduce(min) + xs.reduce(max)) / 2;
    final cy = (ys.reduce(min) + ys.reduce(max)) / 2;
    for (final face in out) {
      for (final p in face.points) {
        p[0] = (p[0] - cx) * unit + size / 2;
        p[1] = (p[1] - cy) * unit + size / 2;
      }
    }
  }
  out.sort((a, b) => a.depth.compareTo(b.depth));
  return out;
}

/// Общий масштаб для НАБОРА неподвижных фигур: крупнейший, при котором каждая влезает целиком.
double stillUnit(List<Shape> shapes, double size, {double margin = 6}) {
  var best = double.infinity;
  for (final shape in shapes) {
    final faces = shapeSurface(shape, size, axis: Axis.x, unit: 1);
    final xs = [
      for (final f in faces)
        for (final p in f.points) p[0],
    ];
    final ys = [
      for (final f in faces)
        for (final p in f.points) p[1],
    ];
    if (xs.isEmpty) continue;
    final w = xs.reduce(max) - xs.reduce(min);
    final h = ys.reduce(max) - ys.reduce(min);
    if (w > 0 && h > 0) {
      best = min(best, min((size - 2 * margin) / w, (size - 2 * margin) / h));
    }
  }
  return best.isFinite ? best : 1;
}
