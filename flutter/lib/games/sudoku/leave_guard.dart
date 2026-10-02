/// ВЫХОД И «ЗАНОВО» — С ВОПРОСОМ, КОГДА В ПАРТИИ ЕСТЬ ЧТО ТЕРЯТЬ.
///
/// Сверка «веб против натива» 138f7818, задача b5df5096 п.2: веб спрашивает перед выходом
/// (`GameShell confirmExit={liveGame && hist.canUndo}`) и перед «Начать заново», а натив
/// уходил молча — стрелка «назад», «Выйти из игры» в паузе и значок «Заново» стирали
/// двадцатиминутную доску одним касанием.
///
/// Каркас (`game_shell.dart`) выходит через `Navigator.maybePop`, поэтому охрана — обычный
/// [PopScope]: и стрелку, и пункт паузы, и системный жест «назад» он перехватывает одинаково.
/// Подписи — общие ключи словаря (`exitConfirm*`, `restartConfirmTitle`), новых нет.
library;

import 'package:flutter/material.dart';

import '../../shell/l10n.dart';

/// Спросить, терять ли партию. [restart] — вопрос перед «Заново», иначе — перед выходом.
/// `true` — человек подтвердил потерю.
Future<bool> confirmLoss(BuildContext context, {bool restart = false}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      key: const Key('confirm-loss'),
      title: Text(L.t(restart ? 'restartConfirmTitle' : 'exitConfirmTitle')),
      content: Text(L.t('exitConfirmLost')),
      actions: [
        TextButton(
          key: const Key('confirm-stay'),
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(L.t('exitConfirmStay')),
        ),
        FilledButton(
          key: const Key('confirm-go'),
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(L.t(restart ? 'restart' : 'exitConfirmLeave')),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Охрана выхода: пока [live], уход с экрана спрашивает; подтвердил — экран закрывается.
class LeaveGuard extends StatelessWidget {
  const LeaveGuard({super.key, required this.live, required this.child});

  /// В партии есть что терять: ход, ошибка или подсказка — и она не кончилась.
  final bool live;
  final Widget child;

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !live,
        onPopInvokedWithResult: (didPop, _) async {
          if (didPop) return;
          if (await confirmLoss(context) && context.mounted) Navigator.of(context).pop();
        },
        child: child,
      );
}

/// «Заново» с вопросом: живую партию — только после «да», остальное — сразу.
Future<void> restartGuarded(BuildContext context, {required bool live, required VoidCallback deal}) async {
  if (live && !await confirmLoss(context, restart: true)) return;
  deal();
}
