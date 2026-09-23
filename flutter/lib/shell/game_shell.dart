import 'package:flutter/material.dart';

/// Каркас игрового экрана — перенос GameShell из React-версии PsyGames.
///
/// Порядок сверху вниз закреплён решениями Дениса и не меняется играми:
///   шапка (назад, название, правила) → полоса счётчиков → ПОЛЕ →
///   ряд служебных значков под полем → липкий низ (клавиатура, ответ игрока).
///
/// Поле получает ВСЮ оставшуюся высоту и отдаёт её игре числом (`fieldHeight`):
/// доска считается от этого числа, а не от окна. В React-версии на этом
/// обожглись дважды — доска вылезала за экран, а ряд цифр уходил под кнопки.
class GameShell extends StatelessWidget {
  const GameShell({
    super.key,
    required this.title,
    required this.field,
    this.hud = const [],
    this.auxRow,
    this.toolbar,
    this.onBack,
    this.onRules,
    this.pauseActions = const [],
  });

  final String title;

  /// Игра получает высоту поля и рисует доску под неё.
  final Widget Function(BuildContext context, double fieldHeight) field;

  /// Счётчики: уровень, ошибки, время.
  final List<HudItem> hud;

  /// Ряд служебных значков ПОД полем (AuxBar).
  final Widget? auxRow;

  /// Липкий низ: клавиатура цифр, варианты ответа.
  final Widget? toolbar;

  final VoidCallback? onBack;
  final VoidCallback? onRules;

  /// Пункты меню паузы: те же служебные действия плюс выход.
  final List<PauseAction> pauseActions;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(title: title, onBack: onBack, onRules: onRules, onPause: () => _pause(context)),
            if (hud.isNotEmpty) _HudRow(items: hud),
            Expanded(
              // Ключ нужен пробам: по нему меряется, вписалась ли доска в поле.
              // Без него проверить это снаружи нечем — `Wrap` и `Stack` о
              // переполнении молчат и просто рисуют поверх нижних полос.
              key: const Key('game-field'),
              child: LayoutBuilder(
                // 🔴 Высота поля отдаётся игре числом. Игра НЕ считает доску от окна:
                // окно не знает про шапку, счётчики, ряд значков и липкий низ.
                builder: (context, c) => field(context, c.maxHeight),
              ),
            ),
            ?auxRow,
            if (toolbar != null)
              Container(
                width: double.infinity,
                color: scheme.surface,
                child: toolbar,
              ),
          ],
        ),
      ),
    );
  }

  void _pause(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final a in pauseActions)
              ListTile(
                leading: Icon(a.icon),
                title: Text(a.label),
                onTap: () {
                  Navigator.of(ctx).pop();
                  a.onPressed();
                },
              ),
            ListTile(
              leading: const Icon(Icons.close),
              title: const Text('Продолжить'),
              onTap: () => Navigator.of(ctx).pop(),
            ),
          ],
        ),
      ),
    );
  }
}

class HudItem {
  const HudItem({required this.label, required this.value, this.icon});
  final String label;
  final String value;
  final IconData? icon;
}

class PauseAction {
  const PauseAction({required this.label, required this.icon, required this.onPressed});
  final String label;
  final IconData icon;
  final VoidCallback onPressed;
}

class _Header extends StatelessWidget {
  const _Header({required this.title, this.onBack, this.onRules, this.onPause});
  final String title;
  final VoidCallback? onBack;
  final VoidCallback? onRules;
  final VoidCallback? onPause;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 2),
        child: Row(
          children: [
            IconButton(
              onPressed: onPause,
              icon: const Icon(Icons.pause),
              tooltip: 'Пауза',
            ),
            Expanded(
              child: Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium),
            ),
            if (onRules != null)
              IconButton(onPressed: onRules, icon: const Icon(Icons.help_outline), tooltip: 'Правила'),
            if (onBack != null)
              IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back), tooltip: 'Назад'),
          ],
        ),
      );
}

class _HudRow extends StatelessWidget {
  const _HudRow({required this.items});
  final List<HudItem> items;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          for (final i in items)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Semantics(
                label: '${i.label}: ${i.value}',
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  if (i.icon != null) ...[Icon(i.icon, size: 14), const SizedBox(width: 4)],
                  Text(i.value, style: const TextStyle(fontWeight: FontWeight.w700)),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}
