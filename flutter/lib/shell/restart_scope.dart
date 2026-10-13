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
  const RestartScope({super.key, required this.builder, this.beforeRestart});

  final WidgetBuilder builder;
  /// Playlist attempts must be revoked and reissued before rebuilding the game.
  final Future<bool> Function()? beforeRestart;

  /// Перезапуск ближайшего экрана; `null` — экран открыт не оболочкой (настольная проба).
  static VoidCallback? of(BuildContext context) =>
      context.findAncestorStateOfType<_RestartScopeState>()?._restart;

  @override
  State<RestartScope> createState() => _RestartScopeState();
}

class _RestartScopeState extends State<RestartScope> {
  int _generation = 0;
  bool _restarting = false;

  void _restart() async {
    if (_restarting || !mounted) return;
    _restarting = true;
    try {
      final accepted = await widget.beforeRestart?.call() ?? true;
      if (mounted && accepted) setState(() => _generation++);
    } finally {
      _restarting = false;
    }
  }

  @override
  Widget build(BuildContext context) =>
      KeyedSubtree(key: ValueKey<int>(_generation), child: Builder(builder: widget.builder));
}
