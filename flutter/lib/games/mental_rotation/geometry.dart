/// ГЕОМЕТРИЯ ФИГУР ИЗ КУБИКОВ — перенос `core/geometry.ts`.
///
/// Один движок поворота на фигуры и на грани куба: три функции по 90° вокруг осей, 24 ориентации
/// перебором (а не выписанным списком матриц), зеркало отдельной операцией.
///
/// ⚠️ ЗЕРКАЛО ≠ ПОВОРОТ, но у симметричной фигуры зеркальная копия может совпасть с самой фигурой.
/// Поэтому «это зеркало» нигде не берётся по построению — спрашивается [isValidRotation] перебором.
library;

/// Кубик — три целых координаты.
typedef Cube = List<int>;

/// Фигура — набор кубиков.
typedef Shape = List<Cube>;

enum Axis { x, y, z }

Axis axisOf(String name) => switch (name) {
  'x' => Axis.x,
  'y' => Axis.y,
  'z' => Axis.z,
  _ => throw ArgumentError('не ось: $name'),
};

String axisName(Axis axis) => axis.name;

Cube rotateX(Cube c) => [c[0], -c[2], c[1]];
Cube rotateY(Cube c) => [c[2], c[1], -c[0]];
Cube rotateZ(Cube c) => [-c[1], c[0], c[2]];

Cube Function(Cube) rotator(Axis axis) => switch (axis) {
  Axis.x => rotateX,
  Axis.y => rotateY,
  Axis.z => rotateZ,
};

/// Поворот фигуры на `times` четвертей вокруг оси.
Shape rotateShape(Shape shape, Axis axis, [int times = 1]) {
  final fn = rotator(axis);
  final n = ((times % 4) + 4) % 4;
  var out = shape;
  for (var i = 0; i < n; i++) {
    out = out.map(fn).toList();
  }
  return out;
}

/// Сдвиг в неотрицательный угол: сравнивать можно только нормализованные фигуры.
Shape normalizeShape(Shape shape) {
  if (shape.isEmpty) return shape;
  var minX = shape.first[0], minY = shape.first[1], minZ = shape.first[2];
  for (final c in shape) {
    if (c[0] < minX) minX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[2] < minZ) minZ = c[2];
  }
  return [
    for (final c in shape) [c[0] - minX, c[1] - minY, c[2] - minZ],
  ];
}

/// Отпечаток: порядок кубиков ничего не значит, поэтому сортируем — как `join`+`sort` в TS.
String shapeKey(Shape shape) {
  final parts = [for (final c in shape) '${c[0]},${c[1]},${c[2]}']..sort();
  return parts.join('|');
}

bool sameShape(Shape a, Shape b) => shapeKey(normalizeShape(a)) == shapeKey(normalizeShape(b));

/// Все РАЗЛИЧНЫЕ ориентации фигуры. У несимметричной их 24.
List<Shape> allOrientations(Shape shape) {
  final seen = <String, Shape>{};
  for (var rx = 0; rx < 4; rx++) {
    for (var ry = 0; ry < 4; ry++) {
      for (var rz = 0; rz < 4; rz++) {
        final cand = normalizeShape(
          rotateShape(rotateShape(rotateShape(shape, Axis.x, rx), Axis.y, ry), Axis.z, rz),
        );
        seen.putIfAbsent(shapeKey(cand), () => cand);
      }
    }
  }
  return seen.values.toList();
}

/// `b` — законный поворот `a` (а не зеркало и не другая фигура).
bool isValidRotation(Shape a, Shape b) {
  final target = shapeKey(normalizeShape(a));
  return allOrientations(b).any((o) => shapeKey(o) == target);
}

/// Отражение по оси X. Поворотом не компенсируется — кроме симметричных фигур.
Shape mirrorShape(Shape shape) => [
  for (final c in shape) [-c[0], c[1], c[2]],
];

/// Габарит по осям: по нему видно, плоская фигура или объёмная.
List<int> boundingBox(Shape shape) {
  int span(int i) {
    var lo = shape.first[i], hi = shape.first[i];
    for (final c in shape) {
      if (c[i] < lo) lo = c[i];
      if (c[i] > hi) hi = c[i];
    }
    return hi - lo + 1;
  }

  return [span(0), span(1), span(2)];
}

/// Объёмная: не меньше двух клеток по КАЖДОЙ оси. У плоской вид сверху вырождается в полоску.
bool isVolumetric(Shape shape) => boundingBox(shape).every((s) => s >= 2);
