import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Geometry and scoring share the same logical clock and coordinate space.
/// No independent timer: the practice clock freezes on pause/background.
class EyeTargets {
  final Offset disc, ring;
  final double discRadius, ringRadius;
  final int window;
  const EyeTargets(
    this.disc,
    this.ring,
    this.discRadius,
    this.ringRadius,
    this.window,
  );

  bool get matches => (disc - ring).distance + discRadius <= ringRadius;

  static EyeTargets at(int elapsedMs, Size size) {
    final seconds = elapsedMs / 1000;
    final radius = math.min(size.width, size.height) * .105;
    final centre = Offset(
      size.width * (.5 + .17 * math.sin(seconds * .73)),
      size.height * (.5 + .18 * math.cos(seconds * .61)),
    );
    // A crossing every four seconds; both objects move in two dimensions.
    final separation = math.cos(seconds * math.pi / 4);
    final delta = Offset(
      size.width * .19 * separation,
      size.height * .13 * separation,
    );
    return EyeTargets(
      centre + delta,
      centre - delta,
      radius * .48,
      radius,
      (seconds / 4).floor(),
    );
  }
}

class EyeModes extends StatefulWidget {
  final String mode, locale;
  final int elapsed;
  final bool running;
  final VoidCallback? onHit;
  const EyeModes({
    super.key,
    required this.mode,
    required this.elapsed,
    required this.running,
    required this.locale,
    this.onHit,
  });

  @override
  State<EyeModes> createState() => _EyeModesState();
}

class _EyeModesState extends State<EyeModes> {
  int hits = 0, misses = 0;
  int? lastWindow, lastTap;
  String feedback = '';
  String tr(String ru, String en) => widget.locale == 'ru' ? ru : en;

  @override
  void didUpdateWidget(covariant EyeModes oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.mode != oldWidget.mode || widget.elapsed < oldWidget.elapsed) {
      hits = misses = 0;
      lastWindow = lastTap = null;
      feedback = '';
    }
  }

  void tap(EyeTargets targets) {
    if (!widget.running ||
        (lastTap != null && widget.elapsed - lastTap! < 250)) {
      return;
    }
    setState(() {
      lastTap = widget.elapsed;
      if (targets.matches) {
        if (lastWindow == targets.window) return;
        lastWindow = targets.window;
        hits++;
        widget.onHit?.call();
        feedback = tr('Попадание!', 'Hit!');
      } else {
        misses++;
        feedback = tr('Пока не совпали', 'Not aligned yet');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final catchMode = widget.mode == 'catch-overlap';
    return Column(
      children: [
        if (catchMode)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              tr(
                'Попадания: $hits · Промахи: $misses',
                'Hits: $hits · Misses: $misses',
              ),
              textAlign: TextAlign.center,
            ),
          ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, box) {
              final size = box.biggest;
              final targets = EyeTargets.at(widget.elapsed, size);
              final paint = CustomPaint(
                key: const ValueKey('eye-mode-canvas'),
                size: size,
                painter: _EyePainter(
                  targets,
                  widget.elapsed,
                  catchMode,
                  Theme.of(context).colorScheme.onSurface,
                ),
              );
              if (!catchMode) return paint;
              return Semantics(
                button: true,
                label: tr(
                  'Нажмите, когда круг внутри кольца',
                  'Tap when the disc is inside the ring',
                ),
                child: GestureDetector(
                  key: const ValueKey('eye-overlap-tap-area'),
                  behavior: HitTestBehavior.opaque,
                  onTapDown: widget.running ? (_) => tap(targets) : null,
                  child: paint,
                ),
              );
            },
          ),
        ),
        if (catchMode)
          SizedBox(
            height: 28,
            child: Text(feedback, textAlign: TextAlign.center),
          ),
      ],
    );
  }
}

class _EyePainter extends CustomPainter {
  final EyeTargets targets;
  final int elapsed;
  final bool catchMode;
  final Color dotColor;
  const _EyePainter(this.targets, this.elapsed, this.catchMode, this.dotColor);

  @override
  void paint(Canvas canvas, Size size) {
    if (catchMode) {
      canvas.drawCircle(
        targets.ring,
        targets.ringRadius + 3,
        Paint()
          ..color = const Color(0xffff726b)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 6,
      );
      canvas.drawCircle(
        targets.disc,
        targets.discRadius,
        Paint()..color = const Color(0xff70baff),
      );
    } else {
      final radius = math.min(size.width, size.height) * .065;
      final spread =
          radius +
          (size.width * .27 - radius) *
              (1 + math.cos(elapsed / 1000 * math.pi / 5)) /
              2;
      for (final sign in [-1, 1]) {
        canvas.drawCircle(
          Offset(size.width / 2 + sign * spread, size.height / 2),
          radius,
          Paint()..color = dotColor,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _EyePainter oldDelegate) => true;
}
