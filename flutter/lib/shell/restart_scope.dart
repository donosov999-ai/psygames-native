import 'package:flutter/widgets.dart';

/// «ЗАНОВО» ДЛЯ ЛЮБОЙ НАТИВНОЙ ИГРЫ — ЭКРАН ПЕРЕСОЗДАЁТСЯ С НУЛЯ, ПРОИГРЫШ НЕ ПИШЕТСЯ.
///
/// 📍 ПОВОД. Отчёт тестировщика 5be4998f (09.09.2026): «чтобы начать новую партию, тыкаю
/// неправильные числа три раза, чтобы жизни закончились». Веб тогда завёл «Заново» в меню
/// паузы экранов «Слов»; при переносе на Flutter пункт не доехал — замер 01.10.2026: «Заново»
/// в паузе у 43 экранов из 86, у второй половины его нет (анаграммы, корректура, «Струп»…).
///
/// КАК. Оболочка (`HybridApp._openNative`) кладёт каждый нативный экран в [RestartScope].
/// Перезапуск меняет ключ поддерева: старое состояние уходит через `dispose` (таймеры гасятся),
/// новое начинается с `initState` — та же ступень лестницы из общей памяти, новая раздача.
/// `LevelLadder.fail` при этом не зовётся — «Заново» не проигрыш. Настройки шага зарядки
/// (`GamePreset`) живут, пока открыт маршрут, поэтому шаг перезапускается шагом.
class RestartScope extends StatefulWidget {
  const RestartScope({super.key, required this.builder});

  final WidgetBuilder builder;

  /// Перезапуск ближайшего экрана; `null` — экран открыт не оболочкой (настольная проба).
  static VoidCallback? of(BuildContext context) =>
      context.findAncestorStateOfType<_RestartScopeState>()?._restart;

  @override
  State<RestartScope> createState() => _RestartScopeState();
}

class _RestartScopeState extends State<RestartScope> {
  int _generation = 0;

  void _restart() {
    if (mounted) setState(() => _generation++);
  }

  @override
  Widget build(BuildContext context) =>
      KeyedSubtree(key: ValueKey<int>(_generation), child: Builder(builder: widget.builder));
}
