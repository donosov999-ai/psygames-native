import 'game_pet.dart';
import 'l10n.dart';
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
    this.onLesson,
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

  /*
   * 🔴 РАЗБОР ПО ШАГАМ — КНОПКА В КАРКАСЕ, А НЕ В 38 ЭКРАНАХ.
   *
   * Решение Дениса 24.09.2026: «решатель и учитель вообще должны быть в каждом
   * упражнении… кнопку решателя и учителя не забудь поставить в игры». Поставить
   * её по одной в каждый экран — это тридцать восемь мест разойтись: где-то
   * значок другой, где-то её забудут вовсе. Поэтому место у кнопки одно, рядом с
   * «Правилами», и выглядит она везде одинаково.
   *
   * Игра передаёт сюда только «что делать по нажатию». Нет разбора у игры — нет и
   * кнопки: объяснять отсутствие того, чего не видно, незачем.
   */
  final VoidCallback? onLesson;

  /// Пункты меню паузы: те же служебные действия плюс выход.
  final List<PauseAction> pauseActions;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(
              title: title,
              // Кнопка в шапке есть ВСЕГДА: раздел уточняет, куда вести, но не
              // решает, можно ли уйти. См. `_leave`.
              onBack: () => _leave(context),
              onRules: onRules,
              onLesson: onLesson,
              onPause: () => _pause(context),
            ),
            if (hud.isNotEmpty) _HudRow(items: hud),
            Expanded(
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

  /*
   * 🔴 ИЗ ИГРЫ ОБЯЗАН БЫТЬ ВЫХОД, И ОТВЕЧАЕТ ЗА ЭТО КАРКАС.
   *
   * Найдено живьём 23.09.2026, Денис на iPhone: «даже выйти сейчас нельзя из игры».
   * В листе паузы было «Начать заново», «Отменить ход», «Продолжить» — и всё.
   * Свайп от края нативный экран тоже не закрывает.
   *
   * Замер по коду: экранов на каркасе 38, `onBack` передаёт ОДИН. Тридцать семь
   * разделов не сговаривались — их одинаково не заставили: поле было
   * необязательным, и каркас молча рисовал шапку без кнопки.
   *
   * Поэтому выход берёт на себя каркас: `onBack`, если раздел его дал, иначе
   * `Navigator.maybePop` — то самое, что делает системный жест. Раздел может
   * уточнить поведение, но не может его ОТМЕНИТЬ, и это верно: экран без выхода
   * — не экран, а ловушка.
   */
  void _leave(BuildContext context) {
    if (onBack != null) {
      onBack!();
      return;
    }
    Navigator.of(context).maybePop();
  }

  void _pause(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => _PauseScreen(
        hud: hud,
        actions: pauseActions,
        onLeave: () => _leave(context),
      ),
    ));
  }
}

/// 🔴 «НА ГЛАВНУЮ» — ЭТО НЕ ТО ЖЕ, ЧТО «ВЫЙТИ ИЗ УПРАЖНЕНИЯ».
///
/// В веб-версии в паузе ДВА разных ухода (`GameShell.tsx:1343-1345`): шаг назад — в
/// развилку раздела, откуда человек пришёл, и уход на самую главную минуя развилки.
/// Нативный экран сам про главную ничего не знает — её показывает веб-половина внутри
/// оболочки. Поэтому оболочка вешает сюда свой обработчик, а каркас его только зовёт.
class GameExit {
  /// Ставит [HybridApp]; пусто — значит главной нет (настольная проба), и пункт не рисуем.
  static VoidCallback? home;
}

/// Пауза во весь экран — как в веб-версии, а не лист снизу.
///
/// 📍 Образец прислал Денис 23.09.2026 кадром: счётчики сверху, «Продолжить игру»
/// главной кнопкой, ниже служебные пункты, и ДВА ухода в конце. Лист снизу на три
/// пункта, который стоял здесь до этого, не давал ни выхода, ни счётчиков.
class _PauseScreen extends StatelessWidget {
  const _PauseScreen({required this.hud, required this.actions, required this.onLeave});

  final List<HudItem> hud;
  final List<PauseAction> actions;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget button(String label, IconData icon, VoidCallback onTap, {bool primary = false, Key? key}) {
      final child = Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 22, color: primary ? scheme.onPrimary : scheme.onSurface),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: primary ? scheme.onPrimary : scheme.onSurface,
              ),
            ),
          ),
        ],
      );
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: SizedBox(
          width: double.infinity,
          height: 58,
          child: Material(
            key: key,
            color: primary ? scheme.primary : scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(29),
            child: InkWell(borderRadius: BorderRadius.circular(29), onTap: onTap, child: Center(child: child)),
          ),
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              const SizedBox(height: 28),
              // Счётчики те же, что в шапке игры: человек видит, на чём остановился.
              if (hud.isNotEmpty)
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  alignment: WrapAlignment.center,
                  children: [
                    for (final h in hud)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: scheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          children: [
                            Text(h.label, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                            Text(h.value,
                                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                  ],
                ),
              const SizedBox(height: 28),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      button(L.t('exitConfirmStay'), Icons.play_arrow,
                          () => Navigator.of(context).pop(),
                          primary: true, key: const Key('pause-resume')),
                      for (final a in actions)
                        button(a.label, a.icon, () {
                          Navigator.of(context).pop();
                          a.onPressed();
                        }),
                      // Шаг назад: туда, откуда пришли, — в развилку раздела.
                      button(L.t('pauseExitGame'), Icons.exit_to_app, () {
                        Navigator.of(context).pop();
                        onLeave();
                      }, key: const Key('pause-leave')),
                      // И на самую главную, минуя развилки, — если оболочка её знает.
                      if (GameExit.home != null)
                        button(L.t('goHome'), Icons.home, () {
                          Navigator.of(context).pop();
                          GameExit.home!();
                        }, key: const Key('pause-home')),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
            ],
          ),
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
  const _Header({required this.title, this.onBack, this.onRules, this.onLesson, this.onPause});
  final String title;
  final VoidCallback? onBack;
  final VoidCallback? onRules;
  final VoidCallback? onLesson;
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
            // Питомец в шапке — как в веб-половине. Его нет, пока оболочка не
            // назвала адрес раздачи: кадры лежат во вложенной веб-сборке.
            if (PetHost.ready)
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: GamePet(state: PetHost.state!, origin: PetHost.origin!, size: 34),
              ),
            if (onLesson != null)
              IconButton(
                key: const Key('game-lesson'),
                onPressed: onLesson,
                icon: const Icon(Icons.school_outlined),
                tooltip: L.t('teachButton'),
              ),
            if (onRules != null)
              IconButton(onPressed: onRules, icon: const Icon(Icons.help_outline), tooltip: 'Правила'),
            if (onBack != null)
              IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back), tooltip: L.t('back')),
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
