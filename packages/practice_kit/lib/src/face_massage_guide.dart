import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Original schematic, not copied reference artwork. A mirrored frontal face;
/// explicit gaps keep the guide away from eyes and anterior/lateral neck.
class FaceMassageGuide extends StatelessWidget {
  final String step, program;
  final double progress;
  const FaceMassageGuide({
    super.key,
    required this.step,
    required this.program,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Face massage: $step',
    child: CustomPaint(
      key: const ValueKey('face-massage-guide'),
      painter: FaceMassagePainter(
        step,
        program.startsWith('gua-sha'),
        progress,
        Theme.of(context).colorScheme.onSurface,
        Theme.of(context).colorScheme.primary,
      ),
      size: Size.infinite,
    ),
  );
}

class FaceMassagePainter extends CustomPainter {
  final String step;
  final bool tool;
  final double progress;
  final Color ink, accent;
  const FaceMassagePainter(
    this.step,
    this.tool,
    this.progress,
    this.ink,
    this.accent,
  );

  /// User's left is screen left (mirror), not the model's anatomical left.
  static (Offset, Offset)? stroke(String step) {
    final sign = step.endsWith('-left') ? -1.0 : 1.0;
    if (step.startsWith('jaw-')) {
      return (Offset(.5 + sign * .035, .76), Offset(.5 + sign * .24, .61));
    }
    if (step.startsWith('cheeks-')) {
      return (Offset(.5 + sign * .07, .55), Offset(.5 + sign * .26, .52));
    }
    if (step.startsWith('forehead-')) {
      return (Offset(.5 + sign * .025, .29), Offset(.5 + sign * .23, .29));
    }
    return null;
  }

  @override
  void paint(Canvas canvas, Size size) {
    // Uniform scaling keeps the face and tool recognizable on narrow screens.
    final scale = math.min(size.width, size.height);
    canvas.save();
    canvas.translate((size.width - scale) / 2, (size.height - scale) / 2);
    canvas.scale(scale);
    final outline = Paint()
      ..color = ink.withValues(alpha: .7)
      ..style = PaintingStyle.stroke
      ..strokeWidth = .012
      ..strokeCap = StrokeCap.round;
    final face = Path()
      ..moveTo(.5, .12)
      ..cubicTo(.13, .10, .14, .64, .36, .78)
      ..quadraticBezierTo(.5, .91, .64, .78)
      ..cubicTo(.86, .64, .87, .10, .5, .12);
    canvas.drawPath(face, outline);
    for (final x in [.37, .63]) {
      canvas.drawArc(
        Rect.fromCenter(center: Offset(x, .43), width: .12, height: .05),
        0,
        math.pi,
        false,
        outline,
      );
    }
    canvas.drawPath(
      Path()
        ..moveTo(.5, .46)
        ..lineTo(.47, .58)
        ..lineTo(.53, .58),
      outline,
    );
    canvas.drawArc(
      const Rect.fromLTWH(.42, .65, .16, .055),
      0,
      math.pi,
      false,
      outline,
    );
    final segment = stroke(step);
    if (segment != null) {
      final (start, end) = segment;
      final arrow = Paint()
        ..color = accent
        ..strokeWidth = .018
        ..strokeCap = StrokeCap.round;
      canvas.drawLine(start, end, arrow);
      final angle = (end - start).direction;
      for (final a in [angle + 2.6, angle - 2.6]) {
        canvas.drawLine(
          end,
          end + Offset(math.cos(a), math.sin(a)) * .055,
          arrow,
        );
      }
      // Return is lifted: disappear briefly before the next outward stroke.
      final phase = (progress.clamp(0, 1) * 2) % 1;
      if (phase < .85) {
        final p = Offset.lerp(start, end, phase / .85)!;
        final fill = Paint()..color = accent;
        if (tool) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(center: p, width: .075, height: .125),
              const Radius.circular(.025),
            ),
            fill,
          );
          canvas.drawLine(
            p + const Offset(-.02, -.035),
            p + const Offset(-.02, .035),
            Paint()
              ..color = ink
              ..strokeWidth = .008,
          );
        } else {
          for (final dy in [-.025, .025]) {
            canvas.drawCircle(p + Offset(0, dy), .022, fill);
          }
        }
      }
    } else if (step == 'prepare') {
      canvas.drawCircle(const Offset(.85, .78), .055, Paint()..color = accent);
      canvas.drawLine(const Offset(.85, .755), const Offset(.85, .79), outline);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant FaceMassagePainter oldDelegate) =>
      oldDelegate.step != step ||
      oldDelegate.tool != tool ||
      oldDelegate.progress != progress ||
      oldDelegate.ink != ink ||
      oldDelegate.accent != accent;
}
