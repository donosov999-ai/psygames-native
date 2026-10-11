import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Same normalized path for the guide and the moving target.
Offset eyeGeometryPosition(
  String shape,
  double progress, {
  Size? size,
  double targetRadius = 22,
}) {
  final p = _shapePosition(shape, progress);
  // Legacy normalized callers retain a safe margin. Size-aware fullscreen
  // callers can use all space except the real target radius + antialiasing.
  final insetX = size == null
      ? .1
      : size.width <= 0
      ? .5
      : ((targetRadius + 1) / size.width).clamp(0.0, .5);
  final insetY = size == null
      ? .1
      : size.height <= 0
      ? .5
      : ((targetRadius + 1) / size.height).clamp(0.0, .5);
  return Offset(
    insetX + p.dx * (1 - 2 * insetX),
    insetY + p.dy * (1 - 2 * insetY),
  );
}

Offset _shapePosition(String shape, double progress) {
  final t = (progress % 1) * 2 * math.pi;
  if (shape == 'heart') {
    // The original heart's y polynomial spans -17..11.923253, not a
    // symmetric range. Normalize those extrema so its tip/lobes fit the field.
    return Offset(
      .5 + .5 * math.pow(math.sin(t), 3),
      ((11.923253 -
                  (13 * math.cos(t) -
                      5 * math.cos(2 * t) -
                      2 * math.cos(3 * t) -
                      math.cos(4 * t))) /
              (11.923253 + 17))
          .clamp(0.0, 1.0),
    );
  }
  if (shape == 'circle') {
    return Offset(.5 + .5 * math.cos(t), .5 + .5 * math.sin(t));
  }
  if (shape == 'figure-eight') {
    return Offset(.5 + .5 * math.sin(t), .5 + .5 * math.sin(2 * t));
  }
  final vertices = switch (shape) {
    'diamond' => const [
      Offset(.5, 0),
      Offset(1, .5),
      Offset(.5, 1),
      Offset(0, .5),
      Offset(.5, 0),
    ],
    'cross' => const [
      Offset(.5, .5),
      Offset(.5, 0),
      Offset(.5, .5),
      Offset(1, .5),
      Offset(.5, .5),
      Offset(.5, 1),
      Offset(.5, .5),
      Offset(0, .5),
      Offset(.5, .5),
    ],
    'triangle' => const [
      Offset(.5, 0),
      Offset(1, 1),
      Offset(0, 1),
      Offset(.5, 0),
    ],
    _ => const [
      Offset(0, 0),
      Offset(1, 0),
      Offset(1, 1),
      Offset(0, 1),
      Offset(0, 0),
    ],
  };
  final phase = (progress % 1) * (vertices.length - 1);
  final index = phase.floor();
  final fraction = phase - index;
  // Smooth acceleration at corners instead of sharp velocity changes.
  return Offset.lerp(
    vertices[index],
    vertices[index + 1],
    fraction * fraction * (3 - 2 * fraction),
  )!;
}

class EyeGeometryGuide extends CustomPainter {
  final String shape;
  final Color color;

  /// Set together with eyeGeometryPosition(size: ...) in a size-aware stage.
  final double? targetRadius;
  const EyeGeometryGuide(this.shape, this.color, {this.targetRadius});
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path();
    for (var i = 0; i <= 360; i++) {
      final p = eyeGeometryPosition(
        shape,
        i / 360,
        size: targetRadius == null ? null : size,
        targetRadius: targetRadius ?? 22,
      );
      if (i == 0) {
        path.moveTo(p.dx * size.width, p.dy * size.height);
      } else {
        path.lineTo(p.dx * size.width, p.dy * size.height);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color.withValues(alpha: .35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant EyeGeometryGuide oldDelegate) =>
      shape != oldDelegate.shape ||
      color != oldDelegate.color ||
      targetRadius != oldDelegate.targetRadius;
}
