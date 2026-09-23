/// «СЕЧЕНИЕ»: КОСАЯ ПЛОСКОСТЬ РЕЖЕТ ПАРАЛЛЕЛЕПИПЕД — перенос `core/oblique.ts`.
///
/// Решение Дениса 17.09.2026: «косой срез делай». Ортогональный «Срез» остаётся младшими
/// ступенями; здесь плоскость под углом, и разрез — многоугольник. Это вторая геометрия рядом
/// с кубиками, и она отдельная:
///   · тело — выпуклый параллелепипед: сечение всегда ОДИН выпуклый многоугольник;
///   · сечение считается по двенадцати рёбрам: где ребро пересекает плоскость, там вершина;
///   · ответ сравнивается С ТОЧНОСТЬЮ ДО ПОДОБИЯ, поворота и отражения — карточки одного размера.
///
/// 🔴 ВЫРОЖДЕННОЕ — НЕ ЗАДАНИЕ: плоскость по грани даёт грань, через вершину — точку. Такие
/// [slicePolygon] возвращает `null`, и генератор их не берёт.
library;

import 'dart:math';

import 'levels.dart';
import 'rng.dart';
import 'task.dart';

typedef Vec2 = List<double>;
typedef Vec3 = List<double>;

const double _eps = 1e-9;

Vec3 _sub(Vec3 a, Vec3 b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
double _dot(Vec3 a, Vec3 b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
Vec3 _cross(Vec3 a, Vec3 b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
double _norm(Vec3 a) => sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
Vec3 _scale(Vec3 a, double k) => [a[0] * k, a[1] * k, a[2] * k];
double _hypot2(double x, double y) => sqrt(x * x + y * y);

/// Плоскость `normal · p = offset`, нормаль единичной длины.
class SlicePlane {
  const SlicePlane(this.normal, this.offset);
  final Vec3 normal;
  final double offset;
}

List<Vec3> boxVertices(Vec3 dims) {
  final out = <Vec3>[];
  for (final x in [0.0, dims[0]]) {
    for (final y in [0.0, dims[1]]) {
      for (final z in [0.0, dims[2]]) {
        out.add([x, y, z]);
      }
    }
  }
  return out;
}

/// Двенадцать рёбер параллелепипеда: пары вершин, отличающиеся одной координатой.
List<List<Vec3>> boxEdges(Vec3 dims) {
  final v = boxVertices(dims);
  final edges = <List<Vec3>>[];
  for (var i = 0; i < v.length; i++) {
    for (var j = i + 1; j < v.length; j++) {
      var differ = 0;
      for (var k = 0; k < 3; k++) {
        if (v[i][k] != v[j][k]) differ++;
      }
      if (differ == 1) edges.add([v[i], v[j]]);
    }
  }
  return edges;
}

/// Плоскость через три точки; `null`, если точки на одной прямой.
SlicePlane? planeThrough(Vec3 p1, Vec3 p2, Vec3 p3) {
  final n = _cross(_sub(p2, p1), _sub(p3, p1));
  final len = _norm(n);
  if (len < 1e-9) return null;
  final normal = _scale(n, 1 / len);
  return SlicePlane(normal, _dot(normal, p1));
}

/// Сечение параллелепипеда плоскостью: вершины по обходу, или `null`, если многоугольника нет.
List<Vec3>? slicePolygon(Vec3 dims, SlicePlane plane) {
  double side(Vec3 p) => _dot(plane.normal, p) - plane.offset;
  final verts = boxVertices(dims);
  // По грани: четыре вершины в плоскости, а все остальные по одну её сторону. Диагональная
  // плоскость тоже держит четыре вершины, но остальные у неё по обе стороны — это сечение.
  final onPlane = verts.where((p) => side(p).abs() < 1e-7).length;
  final oneSide = verts.every((p) => side(p) > -1e-7) || verts.every((p) => side(p) < 1e-7);
  if (onPlane >= 4 && oneSide) return null;

  final points = <Vec3>[];
  void add(Vec3 p) {
    if (!points.any((q) => _norm(_sub(p, q)) < 1e-7)) points.add(p);
  }

  for (final e in boxEdges(dims)) {
    final a = e[0], b = e[1];
    final sa = side(a), sb = side(b);
    if (sa.abs() < 1e-7) add(a);
    if (sb.abs() < 1e-7) add(b);
    if ((sa < -1e-7 && sb > 1e-7) || (sa > 1e-7 && sb < -1e-7)) {
      add(_sub(a, _scale(_sub(a, b), sa / (sa - sb))));
    }
  }
  if (points.length < 3) return null;
  final ordered = _orderAround(points, plane.normal);
  if (_polygonArea2(to2D(ordered, plane.normal)) < 0.05) return null;
  return ordered;
}

/// Упорядочить точки выпуклого многоугольника по обходу вокруг центра в плоскости с нормалью.
List<Vec3> _orderAround(List<Vec3> points, Vec3 normal) {
  var sx = 0.0, sy = 0.0, sz = 0.0;
  for (final p in points) {
    sx += p[0];
    sy += p[1];
    sz += p[2];
  }
  final c = _scale([sx, sy, sz], 1 / points.length);
  final basis = planeBasis(normal);
  final u = basis[0], v = basis[1];
  double angle(Vec3 p) {
    final d = _sub(p, c);
    return atan2(_dot(d, v), _dot(d, u));
  }

  return [...points]..sort((p, q) => angle(p).compareTo(angle(q)));
}

/// Ортонормированный базис плоскости.
List<Vec3> planeBasis(Vec3 normal) {
  final helper = normal[0].abs() < 0.9 ? <double>[1, 0, 0] : <double>[0, 1, 0];
  final u0 = _cross(normal, helper);
  final u = _scale(u0, 1 / _norm(u0));
  return [u, _cross(normal, u)];
}

/// Многоугольник в координатах своей плоскости — настоящая форма сечения.
List<Vec2> to2D(List<Vec3> points, Vec3 normal) {
  final basis = planeBasis(normal);
  final u = basis[0], v = basis[1];
  return [
    for (final p in points) [_dot(p, u), _dot(p, v)],
  ];
}

/// Изометрия рисователя кубиков: видны грани +x, +y, +z.
Vec2 isoProject(Vec3 p) => [(p[0] - p[2]) * sqrt(3) / 2, -p[1] + (p[0] + p[2]) / 2];

double _polygonArea2(List<Vec2> points) {
  var s = 0.0;
  for (var i = 0; i < points.length; i++) {
    final a = points[i], b = points[(i + 1) % points.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s.abs() / 2;
}

/// Выпуклая оболочка (Эндрю) — для тени и вида под углом.
List<Vec2> convexHull(List<Vec2> points) {
  final pts = [...points]
    ..sort((a, b) {
      final c = a[0].compareTo(b[0]);
      return c != 0 ? c : a[1].compareTo(b[1]);
    });
  double crossZ(Vec2 o, Vec2 a, Vec2 b) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  final lower = <Vec2>[];
  for (final p in pts) {
    while (lower.length >= 2 &&
        crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) {
      lower.removeLast();
    }
    lower.add(p);
  }
  final upper = <Vec2>[];
  for (final p in pts.reversed) {
    while (upper.length >= 2 &&
        crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) {
      upper.removeLast();
    }
    upper.add(p);
  }
  return [...lower.sublist(0, lower.length - 1), ...upper.sublist(0, upper.length - 1)];
}

/// Стороны (доли периметра) и внутренние углы (градусы) по обходу.
({List<double> sides, List<double> angles}) polygonSignature(List<Vec2> points) {
  final n = points.length;
  final lens = [
    for (var i = 0; i < n; i++)
      _hypot2(points[(i + 1) % n][0] - points[i][0], points[(i + 1) % n][1] - points[i][1]),
  ];
  var per = 0.0;
  for (final l in lens) {
    per += l;
  }
  if (per == 0) per = 1;
  final angles = [
    for (var i = 0; i < n; i++)
      () {
        final p = points[i], prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
        final a = [prev[0] - p[0], prev[1] - p[1]];
        final b = [next[0] - p[0], next[1] - p[1]];
        final den = _hypot2(a[0], a[1]) * _hypot2(b[0], b[1]);
        final cosv = (a[0] * b[0] + a[1] * b[1]) / (den == 0 ? 1 : den);
        return acos(cosv.clamp(-1.0, 1.0)) * 180 / pi;
      }(),
  ];
  return (sides: [for (final l in lens) l / per], angles: angles);
}

/// Насколько два многоугольника различимы глазом с точностью до подобия, поворота и отражения.
/// 0 — один вид; бесконечность — разное число сторон.
double polygonDistance(List<Vec2> a, List<Vec2> b) {
  if (a.length != b.length) return double.infinity;
  final n = a.length;
  final sa = polygonSignature(a), sb = polygonSignature(b);
  var best = double.infinity;
  for (final dir in [1, -1]) {
    for (var k = 0; k < n; k++) {
      var worst = 0.0;
      for (var i = 0; i < n; i++) {
        final j = (((dir == 1 ? i + k : k - i) % n) + n) % n;
        // При обходе в обратную сторону сторона i лежит между вершинами j и j−1.
        final sideB = dir == 1 ? sb.sides[j] : sb.sides[(j - 1 + n) % n];
        final d1 = (sa.sides[i] - sideB).abs() * n;
        final d2 = (sa.angles[i] - sb.angles[j]).abs() / 90;
        worst = max(worst, max(d1, d2));
      }
      best = min(best, worst);
    }
  }
  return best;
}

/// Порог различимости двух вариантов. Ниже — два варианта одного вида на экране, то есть второй
/// верный ответ. Подобран замером: квадрат против прямоугольника 1:√2 даёт 0,17 — различимы.
const double obliqueMinDistance = 0.12;

/// Ступени. Три оси трудности сразу: тело (куб → брусья), число сторон сечения и БЛИЗОСТЬ
/// подделок. Замер 17.09.2026: без порога по ступеням самое тонкое различие выдавалось с
/// первого же задания.
({List<Vec3> dims, List<int> sides, double minDistance}) obliqueLevelSpec(int level) {
  if (level < 30) {
    return (
      dims: [
        [1, 1, 1],
      ],
      sides: [3, 4],
      minDistance: 0.3,
    );
  }
  if (level < 36) {
    return (
      dims: [
        [1, 1, 1],
      ],
      sides: [4, 5],
      minDistance: 0.22,
    );
  }
  if (level < 42) {
    return (
      dims: [
        [1, 1, 1],
        [2, 1, 1],
      ],
      sides: [5, 6],
      minDistance: 0.16,
    );
  }
  return (
    dims: [
      [2, 1, 1],
      [2, 2, 1],
      [1, 1, 1],
    ],
    sides: [4, 5, 6],
    minDistance: obliqueMinDistance,
  );
}

/// Углы, которые глаз читает как углы: не острее 12° и не ближе 8° к развёрнутому.
const double obliqueAngleMin = 12;
const double obliqueAngleMax = 172;

bool readableAngles(List<Vec2> points) =>
    polygonSignature(points).angles.every((a) => a >= obliqueAngleMin && a <= obliqueAngleMax);

/// Сечение, годное в задание: многоугольник нужной сторонности, каждый угол которого виден как
/// угол. Замер 17.09.2026 (1080 заданий): без проверки углов верные ответы были пятиугольниками
/// с углом 176° — на рисунке четырёхугольник, а спрашивают про пятиугольник.
({List<Vec3> section, List<Vec2> truth})? sectionForTask(
  Vec3 dims,
  SlicePlane plane,
  List<int> sides,
) {
  final section = slicePolygon(dims, plane);
  if (section == null || !sides.contains(section.length)) return null;
  final truth = to2D(section, plane.normal);
  if (!readableAngles(truth)) return null;
  return (section: section, truth: truth);
}

const List<double> _params = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1];

/// Случайная плоскость через три точки на трёх разных рёбрах тела.
SlicePlane? _randomPlane(Vec3 dims, Rng rng) {
  final edges = shuffle(rng, boxEdges(dims)).sublist(0, 3);
  final pts = [
    for (final e in edges)
      () {
        final a = e[0], b = e[1];
        final t = pick(rng, _params);
        return <double>[
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ];
      }(),
  ];
  return planeThrough(pts[0], pts[1], pts[2]);
}

List<Vec2> _shadowOf(List<Vec3> points, Vec3 normal) {
  // Тень на ту грань, к которой плоскость ближе всего: отбрасываем ось с наибольшей долей нормали.
  var axis = 0;
  for (var k = 0; k < 3; k++) {
    if (normal[k].abs() > normal[axis].abs()) axis = k;
  }
  final keep = [
    for (var k = 0; k < 3; k++)
      if (k != axis) k,
  ];
  return convexHull([
    for (final p in points) [p[keep[0]], p[keep[1]]],
  ]);
}

enum ObliqueFlaw { none, seen, shadow, other }

class ObliqueOption {
  const ObliqueOption({required this.points, required this.isMatch, required this.flaw});
  final List<Vec2> points;
  final bool isMatch;
  final ObliqueFlaw flaw;
}

class ObliqueTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.oblique;

  const ObliqueTask({
    required this.dims,
    required this.plane,
    required this.section,
    required this.options,
    required this.correctIdx,
    required this.sides,
  });

  /// Размеры параллелепипеда по x, y, z.
  final Vec3 dims;
  final SlicePlane plane;

  /// Вершины сечения в пространстве, по обходу — ими рисуется плоскость на теле.
  final List<Vec3> section;
  final List<ObliqueOption> options;
  @override
  final int correctIdx;

  /// Сколько сторон у верного ответа — ось лестницы.
  final int sides;
}

ObliqueTask buildObliqueTask(int level, Rng rng) {
  final spec = obliqueLevelSpec(level);
  final optionCount = levelParams(level).optionCount;

  for (var attempt = 0; attempt < 400; attempt++) {
    final dims = pick(rng, spec.dims);
    final plane = _randomPlane(dims, rng);
    if (plane == null) continue;
    final fit = sectionForTask(dims, plane, spec.sides);
    if (fit == null) continue;
    final section = fit.section, truth = fit.truth;

    final options = <ObliqueOption>[
      ObliqueOption(points: truth, isMatch: true, flaw: ObliqueFlaw.none),
    ];
    // От верного ответа — не ближе порога ступени; друг от друга — не ближе порога различимости.
    bool differs(List<Vec2> p) =>
        polygonDistance(truth, p) >= spec.minDistance &&
        options.every((o) => polygonDistance(o.points, p) >= obliqueMinDistance);

    void push(List<Vec2>? p, ObliqueFlaw flaw) {
      if (p == null || p.length < 3 || options.length >= optionCount) return;
      // Нечитаемый угол у подделки — подсказка или обман. Замер 17.09.2026 (1080 заданий): без
      // этой проверки 132 подделки были иглами с углами вроде 3°/11°/166°.
      if (!readableAngles(p)) return;
      if (_polygonArea2(p) < 1e-3 || !differs(p)) return;
      options.add(ObliqueOption(points: p, isMatch: false, flaw: flaw));
    }

    push(convexHull([for (final p in section) isoProject(p)]), ObliqueFlaw.seen);
    push(_shadowOf(section, plane.normal), ObliqueFlaw.shadow);
    for (var k = 0; k < 60 && options.length < optionCount; k++) {
      final otherDims = rng() < 0.7 ? dims : pick(rng, spec.dims);
      final other = _randomPlane(otherDims, rng);
      if (other == null) continue;
      final s = slicePolygon(otherDims, other);
      if (s == null) continue;
      // Та же сторонность — сильнее всего путают; иначе ±1 сторона.
      if (k < 30 && s.length != section.length) continue;
      push(to2D(s, other.normal), ObliqueFlaw.other);
    }
    if (options.length < optionCount) continue;

    final mixed = shuffle(rng, options);
    return ObliqueTask(
      dims: dims,
      plane: plane,
      section: section,
      options: mixed,
      correctIdx: mixed.indexWhere((o) => o.isMatch),
      sides: section.length,
    );
  }
  throw StateError('oblique $level: не собралось задание за 400 попыток');
}

/// Для рисунка варианта: повернуть многоугольник длинной стороной вниз и вписать в квадрат.
List<Vec2> fitPolygon(List<Vec2> points, double size, [double margin = 8]) {
  final n = points.length;
  var longest = 0.0, idx = 0;
  for (var i = 0; i < n; i++) {
    final a = points[i], b = points[(i + 1) % n];
    final l = _hypot2(b[0] - a[0], b[1] - a[1]);
    if (l > longest) {
      longest = l;
      idx = i;
    }
  }
  final a = points[idx], b = points[(idx + 1) % n];
  final ang = -atan2(b[1] - a[1], b[0] - a[0]);
  final c = cos(ang), s = sin(ang);
  var rotated = [
    for (final p in points) <double>[p[0] * c - p[1] * s, p[0] * s + p[1] * c],
  ];
  // Длинная сторона — внизу: если остальная фигура ниже неё, отражаем по вертикали.
  final baseY = rotated[idx][1];
  var meanY = 0.0;
  for (final p in rotated) {
    meanY += p[1];
  }
  meanY /= n;
  if (meanY > baseY) {
    rotated = [
      for (final p in rotated) <double>[p[0], -p[1]],
    ];
  }
  final xs = [for (final p in rotated) p[0]], ys = [for (final p in rotated) p[1]];
  final minX = xs.reduce(min), minY = ys.reduce(min);
  final w = xs.reduce(max) - minX, h = ys.reduce(max) - minY;
  final k = (size - 2 * margin) / max(max(w, h), _eps);
  final ox = (size - w * k) / 2 - minX * k, oy = (size - h * k) / 2 - minY * k;
  return [
    for (final p in rotated) <double>[p[0] * k + ox, p[1] * k + oy],
  ];
}
