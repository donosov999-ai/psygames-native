/// РИСОВАТЕЛИ ЗАДАНИЙ — перенос картинок экрана `app/games/mental-rotation.tsx` на Canvas.
///
/// Фигуры рисует ЯДРО: [shapeSurface] отдаёт видимые грани, их глубину и цвет. Рисователь только
/// кладёт многоугольники на холст — иначе на экране появилась бы вторая геометрия, и картинка
/// разошлась бы с правилами (отпечаток ракурса в «Точке зрения» считается тем же рисователем).
///
/// 🔴 ЗНАЧКИ НА ГРАНЯХ — ОЧЕРТАНИЕМ, А НЕ ЦВЕТОМ: дальтонизм плюс разная заливка граней. Цвет
/// вторичен, форма различает и без него.
library;

import 'dart:math';

import 'package:flutter/material.dart' hide Axis;

import 'cube_faces.dart';
import 'geometry.dart';
import 'net.dart';
import 'oblique.dart';
import 'projection.dart';
import 'surface.dart';

// ─── значки на гранях ─────────────────────────────────────────────────────

List<List<double>> _ring(double r) => [
  for (var i = 0; i < 14; i++) [0.5 + r * cos(i / 14 * pi * 2), 0.5 + r * sin(i / 14 * pi * 2)],
];

/// Очертания значков в долях грани: (0,0) — левый верх, (1,1) — правый низ.
final Map<FaceMark, ({List<List<double>> points, bool hollow})> markShapes = {
  FaceMark.dot: (points: _ring(0.3), hollow: false),
  FaceMark.ring: (points: _ring(0.32), hollow: true),
  FaceMark.square: (
    points: const [
      [0.26, 0.26],
      [0.74, 0.26],
      [0.74, 0.74],
      [0.26, 0.74],
    ],
    hollow: false,
  ),
  FaceMark.triangle: (
    points: const [
      [0.5, 0.2],
      [0.8, 0.76],
      [0.2, 0.76],
    ],
    hollow: false,
  ),
  FaceMark.plus: (
    points: const [
      [0.42, 0.2],
      [0.58, 0.2],
      [0.58, 0.42],
      [0.8, 0.42],
      [0.8, 0.58],
      [0.58, 0.58],
      [0.58, 0.8],
      [0.42, 0.8],
      [0.42, 0.58],
      [0.2, 0.58],
      [0.2, 0.42],
      [0.42, 0.42],
    ],
    hollow: false,
  ),
  FaceMark.bar: (
    points: const [
      [0.16, 0.43],
      [0.84, 0.43],
      [0.84, 0.57],
      [0.16, 0.57],
    ],
    hollow: false,
  ),
};

/// Цвет значка. Вторичный признак: форма различает и без него.
const Map<FaceMark, Color> markColors = {
  FaceMark.dot: Color(0xFF1F2937),
  FaceMark.ring: Color(0xFFB91C1C),
  FaceMark.square: Color(0xFF1D4ED8),
  FaceMark.triangle: Color(0xFF15803D),
  FaceMark.plus: Color(0xFF7C2D12),
  FaceMark.bar: Color(0xFF6B21A8),
};

void _drawMark(Canvas canvas, FaceMark mark, Offset a, Offset b, Offset d) {
  final art = markShapes[mark]!;
  final path = Path();
  for (var i = 0; i < art.points.length; i++) {
    final u = art.points[i][0], v = art.points[i][1];
    final p = Offset(
      a.dx + u * (b.dx - a.dx) + v * (d.dx - a.dx),
      a.dy + u * (b.dy - a.dy) + v * (d.dy - a.dy),
    );
    i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
  }
  path.close();
  final color = markColors[mark]!;
  if (!art.hollow) canvas.drawPath(path, Paint()..color = color);
  canvas.drawPath(
    path,
    Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = art.hollow ? 2.4 : 0.8,
  );
}

// ─── фигура из кубиков ────────────────────────────────────────────────────

/// Фигура в изометрии. `ghost` — кубики, нарисованные пустыми («Недостающая часть»);
/// `unit` — общий масштаб на набор неподвижных фигур (см. [stillUnit]).
class ShapePainter extends CustomPainter {
  const ShapePainter(
    this.shape, {
    this.axis = Axis.x,
    this.degrees = 0,
    this.ghost = const [],
    this.unit,
  });

  final Shape shape;
  final Axis axis;
  final double degrees;
  final Shape ghost;
  final double? unit;

  @override
  void paint(Canvas canvas, Size size) {
    final side = min(size.width, size.height);
    final dx = (size.width - side) / 2, dy = (size.height - side) / 2;
    final faces = shapeSurface(shape, side, axis: axis, degrees: degrees, ghost: ghost, unit: unit);
    for (final f in faces) {
      final path = Path();
      for (var i = 0; i < f.points.length; i++) {
        final p = Offset(f.points[i][0] + dx, f.points[i][1] + dy);
        i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
      }
      path.close();
      if (!f.ghost) {
        canvas.drawPath(path, Paint()..color = Color.fromARGB(255, f.rgb[0], f.rgb[1], f.rgb[2]));
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = f.ghost ? const Color(0xFF9A7FB8) : const Color(0xFF6D5587)
          ..style = PaintingStyle.stroke
          ..strokeJoin = StrokeJoin.round
          ..strokeWidth = f.ghost ? 1.6 : 1.1,
      );
    }
  }

  @override
  bool shouldRepaint(ShapePainter old) =>
      old.shape != shape || old.degrees != degrees || old.axis != axis || old.unit != unit;
}

// ─── плоская сетка ────────────────────────────────────────────────────────

/// Вариант ответа «Проекции» и «Среза». Рисуется ВЕСЬ габарит: пустая клетка показана рамкой,
/// иначе дырка внутри фигуры была бы неотличима от края, и два разных ответа выглядели бы одним.
class GridPainter extends CustomPainter {
  const GridPainter(this.cells, {required this.fill, required this.edge});

  final List<Cell2D> cells;
  final Color fill;
  final Color edge;

  @override
  void paint(Canvas canvas, Size size) {
    final side = min(size.width, size.height);
    final g = gridSize(cells);
    final step = side * 0.86 / max(max(g.cols, g.rows), 2);
    final ox = (size.width - g.cols * step) / 2;
    final oy = (size.height - g.rows * step) / 2;
    final filled = {for (final c in cells) '${c.col},${c.row}'};
    final edgePaint = Paint()
      ..color = edge
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    for (var row = 0; row < g.rows; row++) {
      for (var col = 0; col < g.cols; col++) {
        final r = Rect.fromLTWH(ox + col * step, oy + row * step, step, step);
        if (filled.contains('$col,$row')) canvas.drawRect(r, Paint()..color = fill);
        canvas.drawRect(r, edgePaint);
      }
    }
  }

  @override
  bool shouldRepaint(GridPainter old) => old.cells != cells;
}

// ─── выкройка и кубик со значками ─────────────────────────────────────────

/// Выкройка: шесть помеченных квадратов на листе, общие рёбра — пунктиром (по ним и складывают).
class NetPainter extends CustomPainter {
  const NetPainter(this.net, this.markOfCell, {required this.paper, required this.edge});

  final CubeNet net;
  final Map<String, FaceMark> markOfCell;
  final Color paper;
  final Color edge;

  @override
  void paint(Canvas canvas, Size size) {
    final side = min(size.width, size.height);
    final g = netSize(net);
    final cell = side * 0.9 / max(g.cols, g.rows);
    final ox = (size.width - g.cols * cell) / 2;
    final oy = (size.height - g.rows * cell) / 2;
    final occupied = {for (final c in net.cells) netCellKey(c)};

    for (final c in net.cells) {
      final x = ox + c.col * cell, y = oy + c.row * cell;
      final r = Rect.fromLTWH(x, y, cell, cell);
      canvas.drawRect(r.translate(0, 1.5), Paint()..color = const Color(0x24665077));
      canvas.drawRect(r, Paint()..color = paper);
      canvas.drawRect(
        r,
        Paint()
          ..color = edge
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
      _drawMark(
        canvas,
        markOfCell[netCellKey(c)]!,
        Offset(x, y),
        Offset(x + cell, y),
        Offset(x, y + cell),
      );
    }

    // Общее ребро двух клеток — пунктир: это линия сгиба, а не край листа.
    final fold = Paint()
      ..color = const Color(0xFF795B96)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    for (final c in net.cells) {
      final x = ox + c.col * cell, y = oy + c.row * cell;
      if (occupied.contains('${c.col + 1},${c.row}')) {
        _dashed(canvas, Offset(x + cell, y), Offset(x + cell, y + cell), fold);
      }
      if (occupied.contains('${c.col},${c.row + 1}')) {
        _dashed(canvas, Offset(x, y + cell), Offset(x + cell, y + cell), fold);
      }
    }
  }

  static void _dashed(Canvas canvas, Offset a, Offset b, Paint paint) {
    const dash = 3.0;
    final total = (b - a).distance;
    final dir = (b - a) / (total == 0 ? 1 : total);
    for (var t = 0.0; t < total; t += dash * 2) {
      canvas.drawLine(a + dir * t, a + dir * min(t + dash, total), paint);
    }
  }

  @override
  bool shouldRepaint(NetPainter old) => old.net != net || old.markOfCell != markOfCell;
}

/// Восемь углов кубика. Порядок важен: по нему собраны грани.
List<Cube> _cubeCorners() => const [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

/// Видимые грани кубика и рамка для значка на каждой: `a` — левый верх, `b` — вправо вдоль
/// грани, `d` — вниз по экрану. Без рамки значок поехал бы мимо скошенной грани.
const Map<CubeFace, ({List<int> fill, int a, int b, int d})> faceFrame = {
  CubeFace.up: (fill: [3, 2, 6, 7], a: 7, b: 3, d: 6),
  CubeFace.front: (fill: [4, 5, 6, 7], a: 7, b: 6, d: 4),
  CubeFace.right: (fill: [1, 5, 6, 2], a: 6, b: 2, d: 5),
};

const Map<CubeFace, Color> _faceFill = {
  CubeFace.up: Color(0xFFE5DAF5),
  CubeFace.front: Color(0xFFD2BFE9),
  CubeFace.right: Color(0xFFBCA2D8),
};

/// Один кубик со значками на трёх видимых гранях — вариант ответа «Развёртки».
class MarkedCubePainter extends CustomPainter {
  const MarkedCubePainter(this.faces);

  final FaceMap faces;

  @override
  void paint(Canvas canvas, Size size) {
    final side = min(size.width, size.height);
    final scale = side / 2.5;
    final ox = size.width / 2, oy = size.height / 2;
    // Та же изометрия, что у фигур: видны грани +x, +y, +z, начало в середине карточки.
    final p = [
      for (final c in _cubeCorners())
        Offset(ox + (c[0] - c[2]) * sqrt(3) / 2 * scale, oy + (-c[1] + (c[0] + c[2]) / 2) * scale),
    ];

    for (final entry in faceFrame.entries) {
      final frame = entry.value;
      final path = Path();
      for (var i = 0; i < frame.fill.length; i++) {
        final q = p[frame.fill[i]];
        i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
      }
      path.close();
      canvas.drawPath(path, Paint()..color = _faceFill[entry.key]!);
      canvas.drawPath(
        path,
        Paint()
          ..color = const Color(0xFF6D5587)
          ..style = PaintingStyle.stroke
          ..strokeJoin = StrokeJoin.round
          ..strokeWidth = 1.2,
      );
      _drawMark(canvas, faces[entry.key]!, p[frame.a], p[frame.b], p[frame.d]);
    }
  }

  @override
  bool shouldRepaint(MarkedCubePainter old) => old.faces != faces;
}

// ─── косое сечение ────────────────────────────────────────────────────────

/// Вариант ответа «Сечения» — многоугольник, вписанный в карточку одним размером: человеку виден
/// ВИД многоугольника, а не его длина (ответ и сравнивается с точностью до подобия).
class PolygonPainter extends CustomPainter {
  const PolygonPainter(this.points, {required this.fill, required this.edge});

  final List<Vec2> points;
  final Color fill;
  final Color edge;

  @override
  void paint(Canvas canvas, Size size) {
    final side = min(size.width, size.height);
    final fitted = fitPolygon(points, side);
    final dx = (size.width - side) / 2, dy = (size.height - side) / 2;
    final path = Path();
    for (var i = 0; i < fitted.length; i++) {
      final p = Offset(fitted[i][0] + dx, fitted[i][1] + dy);
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    path.close();
    canvas.drawPath(path, Paint()..color = fill);
    canvas.drawPath(
      path,
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke
        ..strokeJoin = StrokeJoin.round
        ..strokeWidth = 1.6,
    );
  }

  @override
  bool shouldRepaint(PolygonPainter old) => old.points != points;
}

/// Тело с косой плоскостью: рёбра параллелепипеда и сам разрез поверх них.
class ObliqueBodyPainter extends CustomPainter {
  const ObliqueBodyPainter(this.dims, this.section);

  final Vec3 dims;
  final List<Vec3> section;

  @override
  void paint(Canvas canvas, Size size) {
    final side = min(size.width, size.height);
    final centre = [dims[0] / 2, dims[1] / 2, dims[2] / 2];
    final all = [...boxVertices(dims), ...section];
    var radius = 0.0;
    for (final v in all) {
      final p = isoProject([v[0] - centre[0], v[1] - centre[1], v[2] - centre[2]]);
      radius = max(radius, max(p[0].abs(), p[1].abs()));
    }
    final scale = (side / 2 - 10) / (radius == 0 ? 1 : radius);
    Offset at(Vec3 v) {
      final p = isoProject([v[0] - centre[0], v[1] - centre[1], v[2] - centre[2]]);
      return Offset(size.width / 2 + p[0] * scale, size.height / 2 + p[1] * scale);
    }

    final edge = Paint()
      ..color = const Color(0xFF8B79A8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    for (final e in boxEdges(dims)) {
      canvas.drawLine(at(e[0]), at(e[1]), edge);
    }

    final path = Path();
    for (var i = 0; i < section.length; i++) {
      final p = at(section[i]);
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    path.close();
    canvas.drawPath(path, Paint()..color = const Color(0x8C7C4DBB));
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xFF4C1D95)
        ..style = PaintingStyle.stroke
        ..strokeJoin = StrokeJoin.round
        ..strokeWidth = 1.8,
    );
  }

  @override
  bool shouldRepaint(ObliqueBodyPainter old) => old.dims != dims || old.section != section;
}
