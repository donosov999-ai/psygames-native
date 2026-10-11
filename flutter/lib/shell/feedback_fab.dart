import 'dart:convert';

import 'package:flutter/material.dart';

import 'l10n.dart';
import 'shared_state.dart';

/// КНОПКА ОТЗЫВА НА ВКЛАДКАХ, КОТОРЫЕ РИСУЕТ ОБОЛОЧКА (задачи 5136754e, 99628ecf).
///
/// 📍 Замер 07.10.2026, парные кадры веб/Flutter вкладки «Игры»: на вебе в левом нижнем углу
/// висит красная кнопка отзыва (`FeedbackWidget.tsx`, подключена в `_layout.tsx` на каждый
/// экран), а нативная вкладка закрывает страницу вместе с ней — пожаловаться из вкладки было
/// нечем. Правило Дениса 4e679f41: перенос без потерь. Поэтому здесь — та же кнопка:
///   · минимум 48×48, скругление 21, прозрачность 0,92, тень, жук и подпись bugFX;
///   · место по умолчанию — слева 14, поднята на 92 над безопасной зоной (`FAB_BOTTOM`);
///   · перетаскивается после порога 8 точек, место хранится долей экрана и подрезается под
///     безопасную зону (`fabPosition.ts`: `readSpot`, `toSpot`, `spotToPixels`, `isDrag`);
///   · скрыта, если человек выключил её в настройках (`psygames_devchat_on` = '0').
/// Числа, цвета и ключи — выгрузкой `tabs.json` (`fab`, сторож `flutter-tabs-asset-fresh`).
class FabRules {
  FabRules._();

  static double size = 48;
  static double bottom = 92;

  /// Сколько места снизу занято кнопкой, питомцем и полосой — отступ низа ленты (`FAB_CLEARANCE`).
  static double clearance = 156;
  static double edge = 6;
  static double dragThreshold = 8;
  static Color color = const Color(0xFFEF4444);
  static Color iconColor = const Color(0xFF000000);
  static String spotKey = 'psygames_feedback_fab_spot';
  static String visibleKey = 'psygames_devchat_on';

  static Color _hex(String s) =>
      Color(0xFF000000 | int.parse(s.substring(1, 7), radix: 16));

  static void use(Map<String, dynamic>? j) {
    if (j == null) return;
    size = (j['size'] as num).toDouble();
    bottom = (j['bottom'] as num).toDouble();
    clearance = (j['clearance'] as num?)?.toDouble() ?? clearance;
    edge = (j['edge'] as num).toDouble();
    dragThreshold = (j['dragThreshold'] as num).toDouble();
    color = _hex(j['color'] as String);
    iconColor = _hex(j['iconColor'] as String);
    spotKey = j['spotKey'] as String;
    visibleKey = j['visibleKey'] as String;
  }

  /// `readSpot`: мусор читается как «не сохранено», а не как угол под шторкой.
  static Offset? readSpot(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final p = jsonDecode(raw);
      if (p is! Map) return null;
      final fx = p['fx'], fy = p['fy'];
      if (fx is! num || fy is! num || !fx.isFinite || !fy.isFinite) return null;
      return Offset(fx.toDouble().clamp(0, 1), fy.toDouble().clamp(0, 1));
    } catch (_) {
      return null;
    }
  }

  static double _clamp(double v, double lo, double hi) =>
      hi < lo ? lo : v.clamp(lo, hi);

  /// `toSpot`: где отпустили палец → доля экрана.
  static Offset toSpot(Offset topLeft, Size win, {Size? buttonSize}) {
    final maxX = (win.width - (buttonSize?.width ?? size)).clamp(
      1.0,
      double.infinity,
    );
    final maxY = (win.height - (buttonSize?.height ?? size)).clamp(
      1.0,
      double.infinity,
    );
    return Offset(
      _clamp(topLeft.dx / maxX, 0, 1),
      _clamp(topLeft.dy / maxY, 0, 1),
    );
  }

  /// `spotToPixels`: доля → точки, подрезанные под безопасную зону.
  static Offset spotToPixels(
    Offset spot,
    Size win,
    EdgeInsets insets, {
    Size? buttonSize,
  }) {
    final maxX = (win.width - (buttonSize?.width ?? size)).clamp(
      0.0,
      double.infinity,
    );
    final maxY = (win.height - (buttonSize?.height ?? size)).clamp(
      0.0,
      double.infinity,
    );
    return safePosition(
      Offset(spot.dx * maxX, spot.dy * maxY),
      win,
      insets,
      buttonSize: buttonSize,
    );
  }

  static Offset safePosition(
    Offset p,
    Size win,
    EdgeInsets insets, {
    Size? buttonSize,
  }) => Offset(
    _clamp(
      p.dx,
      insets.left + edge,
      win.width - insets.right - edge - (buttonSize?.width ?? size),
    ),
    _clamp(
      p.dy,
      insets.top + edge,
      win.height - insets.bottom - edge - (buttonSize?.height ?? size),
    ),
  );

  /// Место по умолчанию: слева 14 (в RTL — справа), снизу — безопасная зона + [bottom].
  static Offset home(Size win, EdgeInsets insets, {bool rtl = false}) => Offset(
    rtl ? win.width - 14 - size : 14,
    win.height - insets.bottom - bottom - size,
  );

  static bool isDrag(Offset d) =>
      d.dx.abs() > dragThreshold || d.dy.abs() > dragThreshold;
}

/// Один видимый знак для шапки и плавающей кнопки; название бренда не переводится.
class FeedbackBugMark extends StatelessWidget {
  const FeedbackBugMark({super.key, this.color});

  final Color? color;
  static const labelStyle = TextStyle(
    inherit: false,
    fontSize: 11,
    fontWeight: FontWeight.w700,
    height: 1.2,
  );

  static Size sizeOf(BuildContext context) {
    final label = TextPainter(
      text: const TextSpan(text: 'bugFX', style: labelStyle),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
    )..layout();
    final nominal = TextPainter(
      text: const TextSpan(text: 'bugFX', style: labelStyle),
      textDirection: Directionality.of(context),
    )..layout();
    final size = Size(
      // Сохраняем компактные 48 px при обычном тексте, растём вместе с
      // системным масштабом. FittedBox ниже страхует широкие запасные шрифты.
      (FabRules.size + label.width - nominal.width).clamp(
        FabRules.size,
        double.infinity,
      ),
      (label.height + 19 + 8).clamp(FabRules.size, double.infinity),
    );
    label.dispose();
    nominal.dispose();
    return size;
  }

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.bug_report, size: 19, color: color),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            'bugFX',
            style: labelStyle.copyWith(
              color: color ?? Theme.of(context).colorScheme.onSurface,
            ),
          ),
        ),
      ),
    ],
  );
}

/// Кнопка во весь экран оболочки: координаты — от края окна, как у веба (`position: absolute`).
class FeedbackFab extends StatefulWidget {
  const FeedbackFab({super.key, required this.state, required this.onOpen});

  final SharedState state;
  final VoidCallback onOpen;

  @override
  State<FeedbackFab> createState() => _FeedbackFabState();
}

class _FeedbackFabState extends State<FeedbackFab> {
  /// Палец ведёт кнопку: смещение от места, где она стояла при касании.
  Offset? _drag;
  bool _down = false;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<int>(
    valueListenable: widget.state.writes,
    builder: (context, _, _) {
      if (widget.state.get(FabRules.visibleKey) == '0') {
        return const SizedBox.shrink();
      }
      // Координаты относительно реального Stack, не всего окна: работает и
      // внутри SafeArea, и при клавиатуре/маленьком игровом экране.
      return Positioned.fill(
        child: LayoutBuilder(
          builder: (context, constraints) =>
              Stack(children: [_button(context, constraints.biggest)]),
        ),
      );
    },
  );

  Widget _button(BuildContext context, Size win) {
    final mq = MediaQuery.of(context);
    final insets = mq.padding;
    final buttonSize = FeedbackBugMark.sizeOf(context);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final spot = FabRules.readSpot(widget.state.get(FabRules.spotKey));
    final placed = spot == null
        ? FabRules.safePosition(
            Offset(
              rtl ? win.width - 14 - buttonSize.width : 14,
              win.height - insets.bottom - FabRules.bottom - buttonSize.height,
            ),
            win,
            insets,
            buttonSize: buttonSize,
          )
        : FabRules.spotToPixels(spot, win, insets, buttonSize: buttonSize);
    final live = FabRules.safePosition(
      _drag != null && FabRules.isDrag(_drag!) ? placed + _drag! : placed,
      win,
      insets,
      buttonSize: buttonSize,
    );
    return Positioned(
      left: live.dx,
      top: live.dy,
      width: buttonSize.width,
      height: buttonSize.height,
      child: Semantics(
        button: true,
        label: L.t('feedbackFabLabel'),
        onTap: widget.onOpen,
        excludeSemantics: true,
        child: Tooltip(
          message: L.t('feedbackFabLabel'),
          child: Listener(
            key: const ValueKey('feedback-fab'),
            onPointerDown: (_) => setState(() {
              _down = true;
              _drag = Offset.zero;
            }),
            onPointerMove: (e) =>
                setState(() => _drag = (_drag ?? Offset.zero) + e.delta),
            onPointerCancel: (_) => setState(() {
              _down = false;
              _drag = null;
            }),
            onPointerUp: (_) {
              final d = _drag ?? Offset.zero;
              setState(() {
                _down = false;
                _drag = null;
              });
              if (FabRules.isDrag(d)) {
                final dropped = FabRules.safePosition(
                  placed + d,
                  win,
                  insets,
                  buttonSize: buttonSize,
                );
                final next = FabRules.toSpot(
                  dropped,
                  win,
                  buttonSize: buttonSize,
                );
                widget.state.set(
                  FabRules.spotKey,
                  jsonEncode({'fx': next.dx, 'fy': next.dy}),
                );
              } else {
                widget.onOpen();
              }
            },
            child: Opacity(
              // TouchableOpacity веба: 0,92 в покое, 0,85 под пальцем, 1 — пока тащат.
              opacity: _drag != null && FabRules.isDrag(_drag!)
                  ? 1
                  : (_down ? 0.85 : 0.92),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: FabRules.color,
                  borderRadius: BorderRadius.circular(21),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x4D000000),
                      blurRadius: 6,
                      offset: Offset(0, 3),
                    ),
                  ],
                ),
                child: Center(
                  child: FeedbackBugMark(color: FabRules.iconColor),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
