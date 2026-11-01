import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'pilot_press_response.dart';
import 'game_colors.dart';

/// Finite reveal of the real portrait. IndexedStack callers pass actual visibility.
class PetMaterialization extends StatefulWidget {
  const PetMaterialization({
    super.key,
    required this.child,
    required this.active,
    this.enabled = uiMotionPilot,
  });
  final Widget child;
  final bool active;
  final bool enabled;
  @override
  State<PetMaterialization> createState() => _PetMaterializationState();
}

class _PetMaterializationState extends State<PetMaterialization>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final _animation = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1000),
    value: 1,
  );
  bool _visible = false;
  bool _allowed = false;
  bool _foreground = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  void _sync() {
    final media = MediaQuery.of(context);
    _allowed =
        widget.enabled &&
        !media.disableAnimations &&
        !media.accessibleNavigation;
    final visible =
        widget.active && TickerMode.valuesOf(context).enabled && _foreground;
    if (!_allowed || !visible) {
      _animation.value = 1;
    } else if (!_visible) {
      _animation.forward(from: 0);
    }
    _visible = visible;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant PetMaterialization oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    // Calls/background cancel the effect; resume is not a fresh tab entry.
    if (!_foreground) _animation.value = 1;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _animation,
    child: widget.child,
    builder: (context, child) {
      final t = _animation.value;
      if (!_allowed) return child!;
      final running = t < 1;
      final reveal = Curves.easeInOutCubic.transform((t / .8).clamp(0, 1));
      return Stack(
        fit: StackFit.passthrough,
        children: [
          ShaderMask(
            key: const ValueKey('pet-radial-reveal'),
            blendMode: BlendMode.dstIn,
            shaderCallback: (bounds) => RadialGradient(
              radius: .02 + reveal * 1.04,
              colors: running
                  ? const [Colors.white, Colors.white, Colors.transparent]
                  : const [Colors.white, Colors.white, Colors.white],
              stops: const [0, .76, 1],
            ).createShader(bounds),
            child: child,
          ),
          if (running)
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(
                  key: const ValueKey('pet-materialization-light'),
                  painter: _MaterializationLight(
                    t,
                    Theme.of(context).brightness == Brightness.dark,
                  ),
                ),
              ),
            ),
        ],
      );
    },
  );
}

class _MaterializationLight extends CustomPainter {
  const _MaterializationLight(this.t, this.dark);
  final double t;
  final bool dark;
  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final extent = size.shortestSide * .49;
    final fade = math.sin(math.pi * t).clamp(0.0, 1.0);
    final blue = dark ? ChromePilot.materializationGlowDark : ChromePilot.materializationGlowLight;
    const gold = ChromePilot.materializationGold;
    final coreRadius = extent * (.12 + t * .24);
    canvas.drawCircle(
      center,
      coreRadius,
      Paint()
        ..shader = RadialGradient(
          colors: [
            gold.withValues(alpha: .32 * fade * (1 - t)),
            blue.withValues(alpha: .14 * fade * (1 - t)),
            blue.withValues(alpha: 0),
          ],
        ).createShader(Rect.fromCircle(center: center, radius: coreRadius)),
    );
    final radius = extent * (.08 + .9 * Curves.easeOutCubic.transform(t));
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..shader = RadialGradient(
          colors: [
            blue.withValues(alpha: .16 * fade),
            blue.withValues(alpha: 0),
          ],
        ).createShader(Rect.fromCircle(center: center, radius: radius)),
    );
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = blue.withValues(alpha: .42 * fade),
    );
    // Stable sparse trajectories, no RNG, reward event, timer or idle sparkle.
    for (var i = 0; i < 18; i++) {
      final angle = i * 2.399963;
      final travel = (t * 1.22 - (i % 4) * .045).clamp(0.0, 1.0);
      final distance = extent * (.06 + travel * (.68 + (i % 3) * .09));
      final point =
          center + Offset(math.cos(angle), math.sin(angle)) * distance;
      final a = fade * (1 - travel) * .85;
      final color = (i.isEven ? gold : blue).withValues(alpha: a);
      final r = 1.1 + (i % 3) * .45;
      canvas.drawCircle(
        point,
        r * 2.7,
        Paint()..color = color.withValues(alpha: a * .12),
      );
      canvas.drawCircle(point, r, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(covariant _MaterializationLight oldDelegate) =>
      t != oldDelegate.t || dark != oldDelegate.dark;
}
