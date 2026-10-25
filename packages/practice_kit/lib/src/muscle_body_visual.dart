import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'practices.dart';
import 'practice_haptics.dart';

/// Cue-only guidance, not a sensor or an assertion of completed contraction.
class MuscleBodyVisual extends StatelessWidget {
  const MuscleBodyVisual({
    super.key,
    this.abdomen,
    this.pelvic,
    this.eyeOverlay = false,
    this.locale = 'ru',
  });
  final Json? abdomen, pelvic;
  final bool eyeOverlay;
  final String locale;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: LayoutBuilder(
      builder: (context, b) {
        final height = math.min(b.maxHeight * .9, b.maxWidth / .94);
        final width = height * .94;
        final scheme = Theme.of(context).colorScheme;
        return Center(
          child: SizedBox(
            width: width,
            height: height,
            child: Stack(
              children: [
                Positioned.fill(
                  child: Opacity(
                    opacity: eyeOverlay ? .24 : .8,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(28),
                      child: Stack(
                        children: [
                          Positioned(
                            left: width / 2 - (width / .38) / 2,
                            top: -(width / .38 * 1.5) * .31,
                            width: width / .38,
                            height: width / .38 * 1.5,
                            child: Image.asset(
                              'packages/practice_kit/assets/cosmic-body/body-master-v1.webp',
                              fit: BoxFit.fill,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                if (abdomen != null)
                  _zone(
                    context,
                    abdomen!,
                    'abdomen',
                    .37,
                    width,
                    height,
                    const Color(0xfff5ac55),
                    scheme,
                  ),
                if (pelvic != null)
                  _zone(
                    context,
                    pelvic!,
                    'kegel',
                    .76,
                    width,
                    height,
                    const Color(0xff4ad7c2),
                    scheme,
                  ),
              ],
            ),
          ),
        );
      },
    ),
  );

  Widget _zone(
    BuildContext context,
    Json cue,
    String kind,
    double y,
    double w,
    double h,
    Color color,
    ColorScheme scheme,
  ) {
    final tension = PracticeHaptics.isTension(kind, '${cue['stepId']}');
    final progress = ((cue['progress'] as num?) ?? 0).toDouble().clamp(
      0.0,
      1.0,
    );
    final ru = locale == 'ru';
    final name = kind == 'abdomen'
        ? (ru ? 'Живот' : 'Abdomen')
        : (ru ? 'Тазовое дно' : 'Pelvic floor');
    final phase = tension
        ? kind == 'abdomen'
              ? '${cue['title']}'
              : (ru ? 'Сократить и приподнять' : 'Squeeze and lift')
        : (ru ? 'Полностью расслабить' : 'Fully relax');
    return Positioned(
      left: 0,
      right: 0,
      top: h * y - 52,
      child: Semantics(
        label: '$name: $phase. ${cue['cue'] ?? ''}',
        child: Column(
          children: [
            SizedBox(
              height: 64,
              width: w * .55,
              child: CustomPaint(
                key: Key('muscle-zone-$kind'),
                painter: MuscleZonePainter(
                  tension: tension,
                  progress: progress,
                  color: color,
                  lift: kind == 'kegel',
                ),
              ),
            ),
            Container(
              constraints: BoxConstraints(maxWidth: w),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: scheme.surface.withValues(alpha: .92),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$name · $phase',
                key: Key('muscle-phase-$kind'),
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: scheme.onSurface),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class MuscleZonePainter extends CustomPainter {
  const MuscleZonePainter({
    required this.tension,
    required this.progress,
    required this.color,
    required this.lift,
  });
  final bool tension, lift;
  final double progress;
  final Color color;
  @override
  void paint(Canvas c, Size s) {
    final contraction = tension
        ? math.min(1.0, progress * 3)
        : 1 - math.min(1.0, progress * 3);
    final center = Offset(
      s.width / 2,
      s.height / 2 - (lift ? contraction * 7 : 0),
    );
    final r = Rect.fromCenter(
      center: center,
      width: s.width * (.9 - contraction * .3),
      height: 44 - contraction * 10,
    );
    c.drawOval(
      r.inflate(4),
      Paint()
        ..color = Colors.black.withValues(alpha: .65)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6,
    );
    c.drawOval(r, Paint()..color = color.withValues(alpha: .12));
    c.drawOval(
      r,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = tension ? 4 : 2,
    );
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    if (tension && lift) {
      c.drawPath(
        Path()
          ..moveTo(center.dx - 7, center.dy + 3)
          ..lineTo(center.dx, center.dy - 5)
          ..lineTo(center.dx + 7, center.dy + 3),
        p,
      );
    } else if (tension) {
      c.drawPath(
        Path()
          ..moveTo(r.left + 10, center.dy - 5)
          ..lineTo(r.left + 16, center.dy)
          ..lineTo(r.left + 10, center.dy + 5),
        p,
      );
      c.drawPath(
        Path()
          ..moveTo(r.right - 10, center.dy - 5)
          ..lineTo(r.right - 16, center.dy)
          ..lineTo(r.right - 10, center.dy + 5),
        p,
      );
    }
  }

  @override
  bool shouldRepaint(MuscleZonePainter old) =>
      old.tension != tension ||
      old.progress != progress ||
      old.color != color ||
      old.lift != lift;
}
