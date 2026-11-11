/// Материал интерфейса «Числового забега» по UI-референсу Кодекса v1.0 (06.11.2026,
/// `~/Downloads/Number_Run_UI_Reference_RU.pdf`, листы 01–03, `UI_Tokens.json`): «конфеты» —
/// ровный тон, блик по краю, золотой кант 1–2, мягкая тень; ярлыки-вкладки; пунктирный слот.
///
/// Цвета — палитра набора дизайна `CandyPalette` (lib/shell/game_colors.dart), не литералы в игре:
/// храповик зашитых цветов не растёт, другие HUD могут взять ту же палитру.
library;

import 'package:flutter/material.dart';

import '../../shell/game_colors.dart';

typedef Nr = CandyPalette;

/// Глянец: блик сверху, ровный тон, тень снизу; кант по краю.
BoxDecoration nrGloss(Color base, {Color? rim = Nr.gold, double radius = 16, double rimWidth = 2, bool shadow = true}) =>
    BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color.lerp(base, Colors.white, .22)!, base, Color.lerp(base, Colors.black, .18)!],
        stops: const [0, .5, 1],
      ),
      borderRadius: BorderRadius.circular(radius),
      border: rim == null ? null : Border.all(color: rim, width: rimWidth),
      boxShadow: shadow
          ? [BoxShadow(color: Colors.black.withValues(alpha: .28), offset: const Offset(0, 2), blurRadius: 4)]
          : null,
    );

/// Начертание по токенам: жирное, табличные цифры.
TextStyle nrText(double size, Color color, {double? height}) => TextStyle(
      fontSize: size,
      height: height,
      fontWeight: FontWeight.w800,
      color: color,
      fontFeatures: const [FontFeature.tabularFigures()],
      shadows: color == Colors.white
          ? [Shadow(color: Colors.black.withValues(alpha: .3), offset: const Offset(0, 1), blurRadius: 1.5)]
          : null,
    );

/// Конфета с надписью (капсула уровня, таймер, табло, состояния).
class NrCandy extends StatelessWidget {
  const NrCandy({
    super.key,
    required this.text,
    this.color = Nr.navy,
    this.ink = Colors.white,
    this.rim = Nr.gold,
    this.icon,
    this.size = 16,
    this.height = 32,
    this.padding = 14,
    this.radius,
  });
  final String text;
  final Color color, ink;
  final Color? rim;
  final IconData? icon;
  final double size, height, padding;
  final double? radius;

  @override
  Widget build(BuildContext context) => Container(
        constraints: BoxConstraints(minHeight: height),
        padding: EdgeInsets.symmetric(horizontal: padding, vertical: 3),
        decoration: nrGloss(color, rim: rim, radius: radius ?? height / 2),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, color: ink, size: size * 1.1), const SizedBox(width: 5)],
          Flexible(child: Text(text, textAlign: TextAlign.center, style: nrText(size, ink))),
        ]),
      );
}

/// Ярлык-вкладка: «СОБРАНО», «ПЕРЕБОР», «ЗАПОМНИ», «В ЗАПАСЕ».
class NrTab extends StatelessWidget {
  const NrTab(this.text, {super.key, this.ink = Nr.navy, this.upper = true});
  final String text;
  final Color ink;

  /// Капсом — подписи-состояния («СОБРАНО»); строчными — значения («Порог 515», лист 03).
  final bool upper;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
        decoration: BoxDecoration(
          color: Nr.ivory,
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: Nr.gold, width: 1.2),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .15), offset: const Offset(0, 1), blurRadius: 2)],
        ),
        child: Text(upper ? text.toUpperCase() : text, style: nrText(upper ? 11 : 14, ink).copyWith(letterSpacing: upper ? .3 : 0)),
      );
}

/// Пунктирная рамка пустого слота («ПУСТО»).
class NrDashedBox extends StatelessWidget {
  const NrDashedBox({super.key, required this.size});
  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _Dashes(), child: SizedBox(width: size, height: size));
}

class _Dashes extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final r = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(14));
    canvas.drawRRect(r, Paint()..color = Nr.ivory.withValues(alpha: .92));
    final path = Path()..addRRect(r.deflate(4));
    final paint = Paint()
      ..color = Nr.muted
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round;
    for (final m in path.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 10) {
        canvas.drawPath(m.extractPath(d, d + 5.5), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_Dashes old) => false;
}

/// Щит стража: фиолетовый с золотым кантом (лист 02 «Цель стража»).
class NrShield extends StatelessWidget {
  const NrShield({super.key, this.size = 30, this.passed = false});
  final double size;
  final bool passed;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: Stack(alignment: Alignment.center, children: [
          Icon(Icons.shield, size: size, color: Nr.gold),
          Icon(Icons.shield, size: size * .8, color: passed ? Nr.success : Nr.violet),
          Icon(passed ? Icons.check : Icons.security, size: size * .36, color: Colors.white),
        ]),
      );
}
