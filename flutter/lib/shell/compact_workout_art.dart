import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'game_colors.dart';
import 'pilot_press_response.dart';
import 'tab_chrome.dart';

/// Artwork contains symbols only; every label/state remains native and localized.
class WorkoutTimeGem extends StatelessWidget {
  const WorkoutTimeGem({
    super.key,
    required this.id,
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });
  final String id, label;
  final bool selected, enabled;
  final VoidCallback onTap;
  static Color tint(String id) => switch (id) {
    'morning' => ChromePilot.timeMorning,
    'day' => ChromePilot.timeDay,
    'evening' => ChromePilot.timeEvening,
    _ => ChromePilot.timeNight,
  };
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    enabled: enabled,
    onTap: enabled ? onTap : null,
    label: label,
    excludeSemantics: true,
    child: InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(16),
      child: Opacity(
        opacity: enabled ? 1 : .45,
        child: Stack(
          fit: StackFit.expand,
          children: [
            ClipRect(
              clipper: selected ? const _OpenGemSeam() : null,
              child: Image.asset(
                'assets/workout_gems/$id.png',
                fit: BoxFit.fill,
                excludeFromSemantics: true,
              ),
            ),
            PositionedDirectional(
              start: 5,
              end: 5,
              bottom: 7,
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.1,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
            if (selected)
              const PositionedDirectional(
                end: 4,
                top: 3,
                child: Icon(
                  Icons.check_circle,
                  color: ChromePilot.controlGold,
                  size: 19,
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

/// The selected tab and body are ONE silhouette, including an open shared seam.
/// The joining shape is painted independently of labels, so it works in RTL too.
class ConnectedWorkoutProgram extends StatelessWidget {
  const ConnectedWorkoutProgram({
    super.key,
    required this.tabs,
    required this.selected,
    required this.id,
    required this.child,
    required this.labels,
  });
  final List<Widget> tabs;
  final List<String> labels;
  final int selected;
  final String id;
  final Widget child;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final scale = MediaQuery.textScalerOf(context);
      final cols = scale.scale(1) > 1.25 ? 2 : 4;
      final width = (box.maxWidth - 8 * (cols - 1)) / cols;
      var labelHeight = 0.0;
      for (final label in labels) {
        final p = TextPainter(
          text: TextSpan(
            text: label,
            style: const TextStyle(
              fontSize: 12,
              height: 1.1,
              fontWeight: FontWeight.w700,
            ),
          ),
          textDirection: Directionality.of(context),
          textScaler: scale,
        )..layout(maxWidth: math.max(30, width - 10));
        labelHeight = math.max(labelHeight, p.height);
        p.dispose();
      }
      final height = math.max(72.0, labelHeight + 46);
      final rows = (tabs.length / cols).ceil();
      final top = rows * height + (rows - 1) * 8;
      final index = selected.clamp(0, math.max(0, tabs.length - 1));
      final col = index % cols;
      final rtl = Directionality.of(context) == TextDirection.rtl;
      final left = rtl
          ? box.maxWidth - (col + 1) * width - col * 8
          : col * (width + 8);
      final activeTop = (index ~/ cols) * (height + 8);
      final shape = _JoinedProgramShape(
        tab: Rect.fromLTWH(left, activeTop, width, height),
        bodyTop: top,
      );
      final dark = Theme.of(context).brightness == Brightness.dark;
      return CustomPaint(
        key: const ValueKey('workout-connected-outline'),
        foregroundPainter: _JoinedProgramBorder(shape, WorkoutTimeGem.tint(id)),
        child: Stack(
          children: [
            Positioned.fill(
              child: ClipPath(
                clipper: shape,
                child: Image.asset(
                  'assets/workout_gems/program-${dark ? 'dark' : 'light'}.png',
                  fit: BoxFit.fill,
                  excludeFromSemantics: true,
                ),
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var i = 0; i < tabs.length; i++)
                      SizedBox(width: width, height: height, child: tabs[i]),
                  ],
                ),
                ConfirmedProgramReveal(id: id, child: child),
              ],
            ),
          ],
        ),
      );
    },
  );
}

class _OpenGemSeam extends CustomClipper<Rect> {
  const _OpenGemSeam();
  @override
  Rect getClip(Size size) => Rect.fromLTWH(0, 0, size.width, size.height - 8);
  @override
  bool shouldReclip(_OpenGemSeam old) => false;
}

class ConfirmedProgramReveal extends StatelessWidget {
  const ConfirmedProgramReveal({
    super.key,
    required this.id,
    required this.child,
  });
  final String id;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final enabled =
        uiMotionPilot &&
        !media.disableAnimations &&
        !media.accessibleNavigation;
    return ValueListenableBuilder<String?>(
      valueListenable: TabChromeHost.route,
      builder: (context, route, _) {
        // Dispose outgoing transitions on exit; never resume an obsolete model.
        if (route != null && route != '/warmup-picker') return child;
        return AnimatedSwitcher(
          duration: enabled ? const Duration(milliseconds: 200) : Duration.zero,
          switchInCurve: Curves.easeOut,
          layoutBuilder: (current, previous) => Stack(
            alignment: Alignment.topCenter,
            children: [
              ...previous.map(
                (w) => Positioned.fill(child: IgnorePointer(child: w)),
              ),
              ?current,
            ],
          ),
          child: KeyedSubtree(key: ValueKey(id), child: child),
        );
      },
    );
  }
}

class _JoinedProgramShape extends CustomClipper<Path> {
  const _JoinedProgramShape({required this.tab, required this.bodyTop});
  final Rect tab;
  final double bodyTop;
  @override
  Path getClip(Size size) {
    final body = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTRB(0, bodyTop, size.width, size.height),
          const Radius.circular(20),
        ),
      );
    final head = Path()
      ..addRRect(RRect.fromRectAndRadius(tab, const Radius.circular(16)));
    final bridge = Path()
      ..addRect(
        Rect.fromLTRB(tab.left, tab.bottom - 18, tab.right, bodyTop + 20),
      );
    return Path.combine(
      PathOperation.union,
      body,
      Path.combine(PathOperation.union, head, bridge),
    );
  }

  @override
  bool shouldReclip(_JoinedProgramShape old) =>
      old.tab != tab || old.bodyTop != bodyTop;
}

class _JoinedProgramBorder extends CustomPainter {
  const _JoinedProgramBorder(this.shape, this.tint);
  final _JoinedProgramShape shape;
  final Color tint;
  @override
  void paint(Canvas canvas, Size size) {
    final path = shape.getClip(size).shift(const Offset(0, 0));
    canvas.drawPath(
      path,
      Paint()
        ..color = tint.withValues(alpha: .35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5,
    );
    canvas.drawPath(
      path,
      Paint()
        ..shader = const LinearGradient(
          colors: [
            ChromePilot.selectedSkin,
            Colors.white,
            ChromePilot.controlGold,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ).createShader(Offset.zero & size)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6,
    );
  }

  @override
  bool shouldRepaint(_JoinedProgramBorder old) =>
      old.tint != tint ||
      old.shape.tab != shape.tab ||
      old.shape.bodyTop != shape.bodyTop;
}
