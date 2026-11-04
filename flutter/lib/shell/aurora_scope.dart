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
  // Раздел «Судоку» (задача 6016f895): поле на ролях GameColors, сверено с листом 11 в обеих темах.
  // «Самурай», «Фрактал», «Кошки» — не сверены с листом 25 (своя клавиатура и заливка выбора,
  // пять рамок полей, палитра областей), остаются классическими до своего PR.
  '/games/sudoku',
  // «Поиск глазами» и «Счёт» (29a06aa2): поля на ролях GameColors с #401, Classic прежний.
  // Сверка с листами 11/14/23/24/27/28 — ~/Documents/TeamOps/psygames-design/acceptance-20261029/search-counting/.
  '/games/visual-search',
  '/games/find-differences',
  '/games/mahjong',
  '/games/schulte',
  '/games/schulte?series=1',
  '/games/object-tracker',
  '/games/sdmt',
  '/games/set-game',
  '/games/hidden-character',
  '/games/monster-traits',
  '/games/monster-traits?mode=missing',
  '/games/kids-find',
  '/games/search-runner',
  '/games/submarines',
  '/games/counter',
  '/games/math-slider',
  '/games/math-sprint',
  '/games/number-bonds',
  '/games/number-run',
  '/games/pattern',
  '/games/quick-count',
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
