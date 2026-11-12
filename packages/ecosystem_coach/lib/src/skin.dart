/// «Одежда» кабинета (вариант А, Денис 11.11): код экранов один на все приложения, а вид карточек даёт
/// приложение. Рамку экрана задаёт [CoachFrame]; карточки внутри — [CoachSkin] через [CoachSkinScope].
/// Без скина — обычная карточка Material (как было).
library;

import 'package:flutter/material.dart';

import 'v2_model.dart';

typedef CoachPanelBuilder = Widget Function(BuildContext context, Widget child);

class CoachSkin {
  const CoachSkin({this.panel = defaultCoachPanel, this.progressColor});

  /// Подложка карточки: группа, задание, шаг урока, метрика.
  final CoachPanelBuilder panel;

  /// Цвета статусов задания; null — из темы (primary / tertiary / outlineVariant / error).
  final Color? Function(BuildContext context, CoachProgress p)? progressColor;

  static const material = CoachSkin();

  static CoachSkin of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CoachSkinScope>()?.skin ?? material;
}

Widget defaultCoachPanel(BuildContext context, Widget child) => Card(child: child);

/// Ставится приложением вокруг тела экрана (удобно — внутри своей [CoachFrame]).
class CoachSkinScope extends InheritedWidget {
  const CoachSkinScope({super.key, required this.skin, required super.child});
  final CoachSkin skin;

  @override
  bool updateShouldNotify(CoachSkinScope oldWidget) => oldWidget.skin != skin;
}

/// Карточка кабинета в «одежде» приложения.
class CoachPanel extends StatelessWidget {
  const CoachPanel({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => CoachSkin.of(context).panel(context, child);
}
