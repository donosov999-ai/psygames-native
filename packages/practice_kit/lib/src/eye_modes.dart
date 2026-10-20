import 'dart:math' as math;

import 'package:flutter/material.dart';

double _ease(double p) => p * p * (3 - 2 * p);

/// Five smoothly joined motions, each starting/ending at rest in the centre.
/// Coordinates span -1..1; mapping to pixels reserves the painted dot radius.
Offset _twoDotMotion(int elapsedMs) {
  final seconds = math.max(0, elapsedMs) / 1000;
  final segment = (seconds / 8).floor();
  final p = (seconds % 8) / 8;
  final phase = _ease(p) * 2 * math.pi;
  final sweep = math.sin(phase);
  return switch (segment % 5) {
    0 => Offset(sweep, 0),
    1 => Offset(0, sweep),
    2 => Offset(sweep, sweep),
    3 => Offset(sweep, -sweep),
    // Ease into/out of a full orbit; the middle traverses > one revolution
    // at full extent. No jump or velocity discontinuity between directions.
    _ =>
      Offset(math.cos(phase * 2), math.sin(phase * 2)) *
          (p < .2
              ? _ease(p / .2)
              : p > .8
              ? _ease((1 - p) / .2)
              : 1),
  };
}

/// The exact positions used by the painter, also usable for bounds QA.
class EyeDots {
  final Offset first, second;
  final double radius;
  const EyeDots(this.first, this.second, this.radius);

  static EyeDots at(int elapsedMs, Size size) {
    final radius = math.min(size.width, size.height) * .065;
    final margin = radius + math.min(1.0, radius);
    final extent = Offset(
      math.max(0, size.width / 2 - margin),
      math.max(0, size.height / 2 - margin),
    );
    final motion = _twoDotMotion(elapsedMs);
    final delta = Offset(motion.dx * extent.dx, motion.dy * extent.dy);
    final centre = Offset(size.width / 2, size.height / 2);
    return EyeDots(centre + delta, centre - delta, radius);
  }
}

/// Geometry and scoring share the same logical clock and coordinate space.
/// No independent timer: the practice clock freezes on pause/background.
class EyeTargets {
  final Offset disc, ring;
  final double discRadius, ringRadius;
  final int window;
  final double ringStrokeWidth;
  const EyeTargets(
    this.disc,
    this.ring,
    this.discRadius,
    this.ringRadius,
    this.window, {
    this.ringStrokeWidth = 6,
  });

  bool get matches => (disc - ring).distance + discRadius <= ringRadius;

  static EyeTargets at(int elapsedMs, Size size) {
    final seconds = elapsedMs / 1000;
    final radius = math.min(size.width, size.height) * .105;
    final stroke = math.min(6.0, math.min(size.width, size.height) * .1);
    // The drawn ring extends strokeWidth beyond its scoring radius.
    final margin = radius + stroke + math.min(1.0, radius);
    final extent = Offset(
      math.max(0, size.width / 2 - margin),
      math.max(0, size.height / 2 - margin),
    );
    final centre = Offset(
      size.width / 2 + extent.dx * .55 * math.sin(seconds * .73),
      size.height / 2 + extent.dy * .55 * math.cos(seconds * .61),
    );
    // A crossing every four seconds; both objects move in two dimensions.
    final separation = math.cos(seconds * math.pi / 4);
    final delta = Offset(
      extent.dx * .45 * separation,
      extent.dy * .45 * separation,
    );
    return EyeTargets(
      centre + delta,
      centre - delta,
      radius * .48,
      radius,
      (seconds / 4).floor(),
      ringStrokeWidth: stroke,
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
        targets.ringRadius + targets.ringStrokeWidth / 2,
        Paint()
          ..color = const Color(0xffff726b)
          ..style = PaintingStyle.stroke
          ..strokeWidth = targets.ringStrokeWidth,
      );
      canvas.drawCircle(
        targets.disc,
        targets.discRadius,
        Paint()..color = const Color(0xff70baff),
      );
    } else {
      final dots = EyeDots.at(elapsed, size);
      for (final position in [dots.first, dots.second]) {
        canvas.drawCircle(position, dots.radius, Paint()..color = dotColor);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _EyePainter oldDelegate) => true;
}
