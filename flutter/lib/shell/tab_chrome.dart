import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'chrome_art.dart';
import 'game_pet.dart';
import 'game_colors.dart';
import 'ion_icon.dart';
import 'l10n.dart';
import 'pilot_liquid_surface.dart';
import 'pilot_press_response.dart';

/// Root-owned routing only. A disposed/older review host cannot clear a new one.
class TabChromeHost {
  static Object? _owner;
  static ValueChanged<String>? open;
  static final route = ValueNotifier<String?>(null);
  static void bind(Object owner, ValueChanged<String> onOpen) {
    _owner = owner;
    open = onOpen;
  }

  static void update(Object owner, String? path) {
    if (identical(owner, _owner) && route.value != path) route.value = path;
  }

  static void unbind(Object owner) {
    if (!identical(owner, _owner)) return;
    _owner = null;
    open = null;
    // Do not notify descendants during root disposal.
  }
}

/// Shared finite entry clock for header glints and top-down Progress blocks.
class TabEntryMotion extends StatefulWidget {
  const TabEntryMotion({
    super.key,
    required this.route,
    required this.builder,
    this.child,
    this.duration = const Duration(milliseconds: 450),
  });
  final String route;
  final Widget? child;
  final Duration duration;
  final Widget Function(BuildContext, double, Widget?) builder;
  @override
  State<TabEntryMotion> createState() => _TabEntryMotionState();
}

class _TabEntryMotionState extends State<TabEntryMotion>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final _clock = AnimationController(
    vsync: this,
    duration: widget.duration,
    value: 1,
  );
  bool _active = false;
  bool _foreground = true;
  bool _allowed = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    TabChromeHost.route.addListener(_route);
  }

  void _route() {
    if (mounted) _sync();
  }

  void _sync() {
    final media = MediaQuery.of(context);
    _allowed =
        uiMotionPilot &&
        !media.disableAnimations &&
        !media.accessibleNavigation &&
        ChromeArt.aurora(context);
    final active =
        _foreground &&
        TabChromeHost.route.value == widget.route &&
        TickerMode.valuesOf(context).enabled;
    if (!active || !_allowed) {
      _clock.value = 1;
    } else if (!_active) {
      _clock.forward(from: 0);
    }
    _active = active;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant TabEntryMotion oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (!_foreground) _clock.value = 1;
  }

  @override
  void dispose() {
    TabChromeHost.route.removeListener(_route);
    WidgetsBinding.instance.removeObserver(this);
    _clock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _clock,
    child: widget.child,
    builder: (context, child) =>
        widget.builder(context, _allowed ? _clock.value : 1, child),
  );
}

/// Same title slots, typography and min height on all five main tabs.
class AuroraTabHeader extends StatelessWidget {
  const AuroraTabHeader({
    super.key,
    required this.route,
    required this.title,
    this.subtitle = '',
    this.titleWidget,
    this.pet,
    this.onOpen,
    this.petKey,
    this.settingsKey,
    this.subtitleKey,
  });
  final String route;
  final String title;
  final String subtitle;
  final Widget? titleWidget;
  final Widget? pet;
  final ValueChanged<String>? onOpen;
  final Key? petKey, settingsKey, subtitleKey;

  static const titleStyle = TextStyle(
    fontSize: 28,
    height: 1.2,
    fontWeight: FontWeight.w700,
  );
  static double titleHeight(BuildContext context, double width) {
    var height = MediaQuery.textScalerOf(context).scale(28) * 1.2;
    for (final key in [
      'home',
      'tabGames',
      'warmupPickerTitle',
      'progress',
      'tabPet',
    ]) {
      final painter = TextPainter(
        text: TextSpan(
          text: L.t(key),
          style: DefaultTextStyle.of(context).style.merge(titleStyle),
        ),
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
        maxLines: 2,
      )..layout(maxWidth: math.max(40, width - 136));
      height = math.max(height, painter.height);
      painter.dispose();
    }
    return height;
  }

  static double height(BuildContext context, double width) => math.max(
    104,
    20 +
        titleHeight(context, width) +
        4 +
        MediaQuery.textScalerOf(context).scale(14) * 2.5 +
        10,
  );

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final dark = Theme.of(context).brightness == Brightness.dark;
      final text = Theme.of(context).colorScheme.onSurface;
      final secondary = Theme.of(context).colorScheme.onSurfaceVariant;
      final open = onOpen ?? TabChromeHost.open;
      final titleSlot = titleHeight(context, box.maxWidth);
      Widget action(Key? key, String label, Widget child, String destination) =>
          IconButton(
            key: key,
            tooltip: label,
            onPressed: open == null ? null : () => open(destination),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints.tightFor(width: 44, height: 44),
            icon: child,
          );
      final content = Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(20, 20, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    height: titleSlot,
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child:
                          titleWidget ??
                          Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: titleStyle.copyWith(color: text),
                          ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  SizedBox(
                    height: MediaQuery.textScalerOf(context).scale(14) * 2.5,
                    child: Text(
                      subtitle,
                      key: subtitleKey,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.25,
                        color: secondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            action(
              petKey,
              L.t('tabPet'),
              pet ??
                  (PetHost.ready
                      ? GamePet(
                          state: PetHost.state!,
                          origin: PetHost.origin!,
                          size: 38,
                        )
                      : Icon(Icons.pets_outlined, size: 26, color: secondary)),
              '/pet',
            ),
            const SizedBox(width: 8),
            action(
              settingsKey,
              L.t('settings'),
              Image.asset(
                'assets/aurora_game_chrome/home_icons_approved/settings.png',
                width: 30,
                height: 30,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) =>
                    IonIcon('settings-outline', size: 24, color: text),
              ),
              '/settings',
            ),
          ],
        ),
      );
      return SizedBox(
        height: height(context, box.maxWidth),
        child: DecoratedBox(
          key: const ValueKey('aurora-tab-header'),
          decoration: BoxDecoration(image: ChromeArt.header(dark)),
          child: TabEntryMotion(
            route: route,
            child: PilotLiquidSurface(child: content),
            builder: (context, value, child) => ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  child!,
                  if (value < 1)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: CustomPaint(
                          key: const ValueKey('tab-header-entry-glint'),
                          painter: _HeaderGlint(value),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}

class _HeaderGlint extends CustomPainter {
  const _HeaderGlint(this.t);
  final double t;
  @override
  void paint(Canvas c, Size s) {
    final x = (s.width + 120) * t - 60;
    c.drawRect(
      Offset.zero & s,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.transparent,
            ChromePilot.headerGlint,
            Colors.transparent,
          ],
        ).createShader(Rect.fromLTWH(x - 45, 0, 90, s.height))
        ..blendMode = BlendMode.plus,
    );
  }

  @override
  bool shouldRepaint(covariant _HeaderGlint old) => t != old.t;
}

/// Real list children; animation never delays their semantics or actions.
class ProgressEntryList extends StatelessWidget {
  const ProgressEntryList({
    super.key,
    required this.children,
    required this.padding,
  });
  final List<Widget> children;
  final EdgeInsets padding;
  @override
  Widget build(BuildContext context) {
    if (!ChromeArt.aurora(context)) {
      return ListView(padding: padding, children: children);
    }
    return TabEntryMotion(
      route: '/statistics',
      duration: const Duration(milliseconds: 600),
      builder: (context, progress, _) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: padding,
        children: [
          for (var i = 0; i < children.length; i++)
            Builder(
              builder: (_) {
                final start = math.min(i, 5) * .12;
                final t = Curves.easeOutCubic.transform(
                  ((progress - start) / .3).clamp(0, 1),
                );
                return Opacity(
                  opacity: t,
                  alwaysIncludeSemantics: true,
                  child: Transform.translate(
                    offset: Offset(0, -6 * (1 - t)),
                    child: children[i],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

/// Only the first six real catalog tiles, finite <=450ms; filters remain immediate.
class CatalogTileEntry extends StatelessWidget {
  const CatalogTileEntry({super.key, required this.index, required this.child});
  final int index;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    if (index >= 6 || !ChromeArt.aurora(context)) return child;
    return TabEntryMotion(
      route: '/games',
      duration: const Duration(milliseconds: 450),
      child: child,
      builder: (context, t, child) => Opacity(
        alwaysIncludeSemantics: true,
        opacity: Curves.easeOut.transform(
          ((t - index * .05) / .75).clamp(0, 1),
        ),
        child: child,
      ),
    );
  }
}
