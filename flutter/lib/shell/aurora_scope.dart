import 'package:flutter/material.dart';

import 'app_theme.dart';
import 'design_template.dart';

/// 🔴 ИГРЫ ПЕРЕХОДЯТ НА «АВРОРУ» ПО ОДНОЙ (план обновления дизайна, 28.10.2026).
///
/// «Аврора» меняет общую тему, а игры читают её (`Theme.of`, `colorScheme`,
/// [WebTheme.of]) — без этой рамки переключатель перекрасил бы поле каждой
/// игры раньше, чем её раздел сверил его с референсом. Поэтому экран игры,
/// чьего маршрута нет в [auroraReadyRoutes], рисуется в классической теме,
/// даже когда человек выбрал «Аврору». Оболочка вокруг — уже в «Авроре».
///
/// Раздел добавляет сюда маршрут ТЕМ ЖЕ PR, где поле переведено на общие
/// цвета и сверено с листом референса (`flutter/DESIGN_SYSTEM.md`).
const Set<String> auroraReadyRoutes = {
  // Раздел «Судоку» (задача 6016f895): поле на ролях GameColors, сверено в обеих темах — «Судоку» с листом 11,
  // «Самурай», «Фрактал», «Бездна», «Кошки» с листом 25 (цвета по ответу каркаса ffc61832; раскладка листа —
  // рамки полей, путь уровней, мини-карты — отдельно, см. DISCREPANCIES пакетов приёмки 29.10).
  '/games/sudoku',
  '/games/sudoku-samurai',
  '/games/sudoku-fractal',
  '/games/sudoku-fractal-deep',
  '/games/cats',
};

class AuroraGameScope extends StatelessWidget {
  const AuroraGameScope({
    super.key,
    required this.route,
    required this.child,
    this.ready = auroraReadyRoutes,
  });

  /// Ключ игры в `HybridApp.native` — тот же, по которому она открывается.
  final String route;
  final Widget child;
  final Set<String> ready;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (theme.extension<UiTemplateTheme>()?.template != UiTemplate.aurora) return child;
    // Рамка игры (шапка, счётчики, пауза — GameShell) в «Авроре» всегда, поле — только
    // когда маршрут готов (этап 6а, задача 045be21d).
    return AuroraFrame(
      theme: theme,
      child: ready.contains(route) ? child : Theme(data: classicShellTheme(theme.brightness), child: child),
    );
  }
}

/// Тема рамки игры. [GameShell] рисует шапку, счётчики, нижний ряд и паузу в ней, даже
/// когда поле под [AuroraGameScope] ещё классическое: рамку переводит один раз каркас,
/// поле — раздел, своим PR.
class AuroraFrame extends InheritedWidget {
  const AuroraFrame({super.key, required this.theme, required super.child});

  final ThemeData theme;

  static ThemeData? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AuroraFrame>()?.theme;

  @override
  bool updateShouldNotify(AuroraFrame oldWidget) => oldWidget.theme != theme;
}
