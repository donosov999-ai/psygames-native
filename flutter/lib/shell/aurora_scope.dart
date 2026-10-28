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
const Set<String> auroraReadyRoutes = {};

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
    if (theme.extension<UiTemplateTheme>()?.template != UiTemplate.aurora || ready.contains(route)) {
      return child;
    }
    return Theme(data: classicShellTheme(theme.brightness), child: child);
  }
}
