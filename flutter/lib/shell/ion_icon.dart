import 'package:flutter/widgets.dart';

import 'ionicons.g.dart';

/// ЗНАЧОК ВЕБА — ТЕМ ЖЕ ШРИФТОМ И В СТРОКЕ ТОЙ ЖЕ ВЫСОТЫ.
///
/// На вебе значок Ionicons — текстовый элемент: его строка равна «нормальной» высоте строки шрифта,
/// а не размеру значка. Замер 07.10.2026 по `assets/fonts/Ionicons.ttf`: флаг USE_TYPO_METRICS,
/// типографские метрики 448 / −64 / 46 при 512 на кегль → строка 1,09 размера. Во Flutter `Icon` —
/// квадрат ровно своего размера, и каждая карточка со значком в строке выходила на 2–4 точки ниже
/// веба (ряд «замка» 72 против 75 px, вся лента Главной — на 10 точек короче).
class IonIcon extends StatelessWidget {
  const IonIcon(this.name, {super.key, required this.size, this.color, this.fallback = const IconData(0xe5c8, fontFamily: 'MaterialIcons')});

  /// Имя Ionicons веба (`play`, `chevron-forward`…).
  final String? name;
  final double size;
  final Color? color;
  final IconData fallback;

  /// (448 + 64 + 46) / 512 — типографская строка шрифта значков.
  static const lineRatio = 1.0898;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: size * lineRatio,
        child: Center(widthFactor: 1, child: Icon(Ion.of(name) ?? fallback, size: size, color: color)),
      );
}
