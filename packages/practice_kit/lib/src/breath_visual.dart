import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'practices.dart';

/// Derived only from the session cue: no second timer or autonomous animation.
double breathExpansion(String step, double progress) {
  final p = progress.clamp(0.0, 1.0);
  if (step == 'hold-in' || step == 'hold') return 1;
  if (step == 'hold-out') return 0;
  if (step == 'inhale-one') return p * 2 / 3;
  if (step == 'inhale-two') return 2 / 3 + p / 3;
  if (step.contains('inhale') || step.endsWith('-in')) return p;
  if (step.contains('exhale') || step.endsWith('-out')) return 1 - p;
  return .5;
}

/// A breathing orb and an independent muscle-state ring inside a fixed box.
/// Ring state describes the scheduled cue, not a sensor-confirmed contraction.
class BreathVisual extends StatelessWidget {
  const BreathVisual({super.key, required this.breath, this.muscle});
  final Json breath;
  final Json? muscle;

  @override
  Widget build(BuildContext context) {
    final expansion = breathExpansion(
      '${breath['stepId']}',
      (breath['progress'] as num).toDouble(),
    );
    final squeezing = muscle?['stepId'].toString().endsWith('squeeze') ?? false;
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: [
        breath['title'],
        if (muscle != null) muscle!['title'],
      ].join(' · '),
      child: CustomPaint(
        key: const Key('practice-breath-visual'),
        painter: BreathVisualPainter(
          expansion: expansion,
          muscleActive: muscle != null,
          squeezing: squeezing,
          color: scheme.primary,
          muscleColor: scheme.tertiary,
        ),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class BreathVisualPainter extends CustomPainter {
  const BreathVisualPainter({
    required this.expansion,
    required this.muscleActive,
    required this.squeezing,
    required this.color,
    required this.muscleColor,
  });
  final double expansion;
  final bool muscleActive, squeezing;
  final Color color, muscleColor;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = math.min(size.width, size.height) * .37;
    final orb = radius * (.34 + .66 * expansion);
    canvas.drawCircle(
      center,
      radius,
      Paint()..color = color.withValues(alpha: .08),
    );
    canvas.drawCircle(
      center,
      orb,
      Paint()
        ..shader = RadialGradient(
          colors: [color.withValues(alpha: .85), color.withValues(alpha: .22)],
        ).createShader(Rect.fromCircle(center: center, radius: orb)),
    );
    canvas.drawCircle(
      center,
      orb,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    if (muscleActive) {
      final ring = radius * 1.2;
      final paint = Paint()
        ..color = muscleColor.withValues(alpha: squeezing ? 1 : .45)
        ..style = PaintingStyle.stroke
        ..strokeWidth = squeezing ? 7 : 3
        ..strokeCap = StrokeCap.round;
      if (squeezing) {
        canvas.drawCircle(center, ring, paint);
      } else {
        for (var i = 0; i < 12; i++) {
          canvas.drawArc(
            Rect.fromCircle(center: center, radius: ring),
            i * math.pi / 6,
            math.pi / 9,
            false,
            paint,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(BreathVisualPainter old) =>
      expansion != old.expansion ||
      muscleActive != old.muscleActive ||
      squeezing != old.squeezing ||
      color != old.color ||
      muscleColor != old.muscleColor;
}
