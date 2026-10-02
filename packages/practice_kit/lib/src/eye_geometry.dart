import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Same normalized path for the guide and the moving target.
Offset eyeGeometryPosition(String shape, double progress) {
  final t = (progress % 1) * 2 * math.pi;
  if (shape == 'heart') {
    return Offset(
      .5 + .34 * math.pow(math.sin(t), 3),
      .46 -
          .022 *
              (13 * math.cos(t) -
                  5 * math.cos(2 * t) -
                  2 * math.cos(3 * t) -
                  math.cos(4 * t)),
    );
  }
  if (shape == 'circle') {
    return Offset(.5 + .34 * math.cos(t), .46 + .32 * math.sin(t));
  }
  if (shape == 'figure-eight') {
    return Offset(.5 + .34 * math.sin(t), .46 + .32 * math.sin(2 * t));
  }
  final vertices = switch (shape) {
    'diamond' => const [
      Offset(.5, .1),
      Offset(.84, .46),
      Offset(.5, .82),
      Offset(.16, .46),
      Offset(.5, .1),
    ],
    'cross' => const [
      Offset(.5, .46),
      Offset(.5, .1),
      Offset(.5, .46),
      Offset(.84, .46),
      Offset(.5, .46),
      Offset(.5, .82),
      Offset(.5, .46),
      Offset(.16, .46),
      Offset(.5, .46),
    ],
    'triangle' => const [
      Offset(.5, .1),
      Offset(.84, .82),
      Offset(.16, .82),
      Offset(.5, .1),
    ],
    _ => const [
      Offset(.16, .14),
      Offset(.84, .14),
      Offset(.84, .78),
      Offset(.16, .78),
      Offset(.16, .14),
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
  const EyeGeometryGuide(this.shape, this.color);
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path();
    for (var i = 0; i <= 360; i++) {
      final p = eyeGeometryPosition(shape, i / 360);
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
      shape != oldDelegate.shape || color != oldDelegate.color;
}
