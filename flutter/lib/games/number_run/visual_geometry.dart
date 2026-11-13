/// Projection checks for the numeral only; these never alter RoadState or hits.
library;

import 'dart:math' as math;
import 'dart:ui';

double runnerFov(Size viewport) {
  final aspect = viewport.width / viewport.height;
  final fit = 2 * math.atan(4.8 / (12.9 * aspect));
  return math.min(
    80 * math.pi / 180,
    math.max((aspect < .62 ? 65 : 55) * math.pi / 180, fit),
  );
}

/// Same camera as Road3d: eye(0,8.2,11), target(0,0,-10).
Offset runnerProject(Size viewport, double x, double y, double z) {
  final length = math.sqrt(8.2 * 8.2 + 21 * 21);
  final sin = 8.2 / length, cos = 21 / length;
  final depth = -(y - 8.2) * sin - (z - 11) * cos;
  final vertical = (y - 8.2) * cos - (z - 11) * sin;
  final unit = math.tan(runnerFov(viewport) / 2);
  return Offset(
    viewport.width / 2 + x * viewport.height / (2 * depth * unit),
    viewport.height / 2 - vertical * viewport.height / (2 * depth * unit),
  );
}

Rect runnerNumeralBounds(
  Size viewport, {
  required double width,
  required double scale,
  required double laneX,
  required double jump,
}) {
  final points = <Offset>[
    for (final x in [-width / 2, width / 2])
      for (final y in [-.033, .988])
        for (final z in [-.135, .135])
          runnerProject(
            viewport,
            laneX + x * scale,
            jump + .08 + y * scale,
            z * math.min(scale, .6),
          ),
  ];
  return Rect.fromLTRB(
    points.map((p) => p.dx).reduce(math.min),
    points.map((p) => p.dy).reduce(math.min),
    points.map((p) => p.dx).reduce(math.max),
    points.map((p) => p.dy).reduce(math.max),
  );
}

double fitRunnerNumeral(
  Size viewport, {
  required double width,
  required double requested,
  required double laneX,
  required double jump,
}) {
  bool fits(double scale) {
    final r = runnerNumeralBounds(
      viewport,
      width: width,
      scale: scale,
      laneX: laneX,
      jump: jump,
    );
    return r.width <= viewport.width * .34 &&
        r.height <= viewport.height * .16 &&
        r.left >= 6 &&
        r.right <= viewport.width - 6 &&
        r.top >= 6 &&
        r.bottom <= viewport.height - 6;
  }

  if (fits(requested)) return requested;
  var lo = 0.0, hi = requested;
  for (var i = 0; i < 28; i++) {
    final mid = (lo + hi) / 2;
    if (fits(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}
