/// БИБЛИОТЕКА ФИГУР — перенос `core/shapes.ts`.
///
/// Список ОДИН на все виды заданий: поворот берёт из него киральные фигуры, проекция — объёмные.
/// Две копии координат рано или поздно разъезжаются, и «правильная» проекция перестаёт быть
/// проекцией показанной фигуры.
///
/// Фигуры на 9–13 кубиков не выписаны руками, а достраиваются ростом по граням от одной заводской
/// (тот же генератор и то же семя, что в TS, — иначе полосы размеров разойдутся).
library;

import 'geometry.dart';
import 'rng.dart';

const List<List<List<int>>> shapeLibrary = [
  // L (4)
  [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [2, 1, 0],
  ],
  // Z (4)
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [2, 1, 0],
  ],
  // T со ступенькой в глубину (4)
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ],
  // лесенка (5)
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [2, 1, 0],
    [2, 2, 0],
  ],
  // ступенька в глубину (5)
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [1, 1, 1],
    [2, 1, 1],
  ],
  // длинная L (5)
  [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [3, 0, 0],
    [3, 1, 0],
  ],
  // угол с отростком вверх (5)
  [
    [0, 0, 0],
    [0, 1, 0],
    [0, 2, 0],
    [1, 2, 0],
    [1, 2, 1],
  ],
  // змейка через три плоскости (6)
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
    [2, 1, 1],
    [2, 2, 1],
  ],
  // ветка (6)
  [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [2, 1, 0],
    [2, 1, 1],
    [2, 2, 1],
  ],
  // тройник с отростком в глубину (6) — единственная с развилкой
  [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
    [1, 2, 1],
  ],
  // лестница 3D (7)
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [2, 1, 0],
    [2, 1, 1],
    [3, 1, 1],
    [3, 2, 1],
  ],
  // спираль (7)
  [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [2, 0, 1],
    [2, 1, 1],
    [2, 2, 1],
    [1, 2, 1],
  ],
  // коромысло (8)
  [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [2, 1, 0],
    [2, 2, 0],
    [2, 2, 1],
    [3, 2, 1],
    [3, 2, 2],
  ],
];

const List<List<int>> _adjacent = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

final Map<int, List<Shape>> _extendedCache = {};

/// Фигуры нужного размера. Пустым набор не бывает — это стережёт проба.
List<Shape> shapesOfSize(int minCubes, int maxCubes) {
  final extra = <Shape>[];
  for (var n = minCubes > 9 ? minCubes : 9; n <= (maxCubes < 13 ? maxCubes : 13); n++) {
    extra.addAll(extendedShapes(n));
  }
  final all = <Shape>[
    for (final s in shapeLibrary)
      [
        for (final c in s) [...c],
      ],
    ...extra,
  ];
  return [
    for (final s in all)
      if (s.length >= minCubes && s.length <= maxCubes)
        [
          for (final c in s) [...c],
        ],
  ];
}

/// Рост по граням: компактный габарит (не шире 4) и без повторов с точностью до поворота.
List<Shape> extendedShapes(int count) {
  final cached = _extendedCache[count];
  if (cached != null) return cached;
  final random = createRng('rotation-shapes-$count');
  final out = <Shape>[];
  final seen = <String>{};
  for (var attempt = 0; attempt < 300 && out.length < 12; attempt++) {
    var shape = <Cube>[
      for (final c in shapeLibrary[2]) [...c],
    ];
    while (shape.length < count) {
      final occupied = {for (final c in shape) '${c[0]},${c[1]},${c[2]}'};
      final frontier = <String, Cube>{};
      for (final c in shape) {
        for (final d in _adjacent) {
          final candidate = <int>[c[0] + d[0], c[1] + d[1], c[2] + d[2]];
          final key = '${candidate[0]},${candidate[1]},${candidate[2]}';
          if (occupied.contains(key)) continue;
          if (boundingBox([...shape, candidate]).any((span) => span > 4)) continue;
          frontier[key] = candidate;
        }
      }
      shape.add(pick(random, frontier.values.toList()));
    }
    shape = normalizeShape(shape);
    final canonical = (allOrientations(shape).map(shapeKey).toList()..sort()).first;
    if (!seen.contains(canonical)) {
      seen.add(canonical);
      out.add(shape);
    }
  }
  if (out.length < 3) throw StateError('insufficient distinct $count-cube shapes');
  _extendedCache[count] = out;
  return out;
}
