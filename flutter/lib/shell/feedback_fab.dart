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
///   · 48×48, скругление 21, прозрачность 0,92, тень, значок пузыря 19 (`styles.fabInner`);
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

  static Color _hex(String s) => Color(0xFF000000 | int.parse(s.substring(1, 7), radix: 16));

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

  static double _clamp(double v, double lo, double hi) => hi < lo ? lo : v.clamp(lo, hi);

  /// `toSpot`: где отпустили палец → доля экрана.
  static Offset toSpot(Offset topLeft, Size win) {
    final maxX = (win.width - size).clamp(1.0, double.infinity);
    final maxY = (win.height - size).clamp(1.0, double.infinity);
    return Offset(_clamp(topLeft.dx / maxX, 0, 1), _clamp(topLeft.dy / maxY, 0, 1));
  }

  /// `spotToPixels`: доля → точки, подрезанные под безопасную зону.
  static Offset spotToPixels(Offset spot, Size win, EdgeInsets insets) {
    final maxX = (win.width - size).clamp(0.0, double.infinity);
    final maxY = (win.height - size).clamp(0.0, double.infinity);
    return Offset(
      _clamp(spot.dx * maxX, insets.left + edge, win.width - insets.right - edge - size),
      _clamp(spot.dy * maxY, insets.top + edge, win.height - insets.bottom - edge - size),
    );
  }

  /// Место по умолчанию: слева 14 (в RTL — справа), снизу — безопасная зона + [bottom].
  static Offset home(Size win, EdgeInsets insets, {bool rtl = false}) => Offset(
        rtl ? win.width - 14 - size : 14,
        win.height - insets.bottom - bottom - size,
      );

  static bool isDrag(Offset d) => d.dx.abs() > dragThreshold || d.dy.abs() > dragThreshold;
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
  Widget build(BuildContext context) {
    if (widget.state.get(FabRules.visibleKey) == '0') return const SizedBox.shrink();
    final mq = MediaQuery.of(context);
    final win = mq.size;
    final insets = mq.padding;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final spot = FabRules.readSpot(widget.state.get(FabRules.spotKey));
    final placed = spot == null ? FabRules.home(win, insets, rtl: rtl) : FabRules.spotToPixels(spot, win, insets);
    final live = _drag != null && FabRules.isDrag(_drag!) ? placed + _drag! : placed;
    return Positioned(
      left: live.dx,
      top: live.dy,
      width: FabRules.size,
      height: FabRules.size,
      child: Semantics(
        button: true,
        label: L.t('feedbackFabLabel'),
        child: Listener(
          key: const ValueKey('feedback-fab'),
          onPointerDown: (_) => setState(() {
            _down = true;
            _drag = Offset.zero;
          }),
          onPointerMove: (e) => setState(() => _drag = (_drag ?? Offset.zero) + e.delta),
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
              final next = FabRules.toSpot(placed + d, win);
              widget.state.set(FabRules.spotKey, jsonEncode({'fx': next.dx, 'fy': next.dy}));
            } else {
              widget.onOpen();
            }
          },
          child: Opacity(
            // TouchableOpacity веба: 0,92 в покое, 0,85 под пальцем, 1 — пока тащат.
            opacity: _drag != null && FabRules.isDrag(_drag!) ? 1 : (_down ? 0.85 : 0.92),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: FabRules.color,
                borderRadius: BorderRadius.circular(21),
                boxShadow: const [BoxShadow(color: Color(0x4D000000), blurRadius: 6, offset: Offset(0, 3))],
              ),
              // Ionicons `chatbubble-ellipses` — пузырь с тремя точками.
              child: Icon(Icons.sms_rounded, size: 19, color: FabRules.iconColor),
            ),
          ),
        ),
      ),
    );
  }
}
