import 'game_clock.dart';
import 'game_pet.dart';
import 'game_rules.dart';
import 'l10n.dart';
import 'level_rules.dart';
import 'package:flutter/material.dart';
import 'restart_scope.dart';

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
    this.levelRule,
    this.fieldOnly = false,
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

  /*
   * 🔴 ПРАВИЛО УРОВНЯ — ТОЖЕ ДЕЛО КАРКАСА (задача e371fd3a).
   *
   * Экран сообщает только «какая игра, какой уровень, спокойный ли момент». Что за
   * правило на этом уровне, показывал ли человек его раньше и когда открыть карточку —
   * решает каркас по таблице `assets/level_rules.json` (см. `level_rules.dart`). Нет
   * правила на уровне — нет и значка в шапке.
   */
  final LevelRuleSpot? levelRule;

  /*
   * 🔴 ТОЛЬКО ПОЛЕ — решение Дениса для «Гимнастики для глаз» (задача a72e77a1):
   * «во всех режимах игровое поле занимает весь экран; во время занятия видна
   * только жёлтая круглая кнопка паузы сбоку, остальные действия — в меню паузы».
   * Шапки, счётчиков и ряда значков нет: глаза заняты точкой, и любая надпись
   * рядом с ней — помеха. Счётчики и действия — в меню паузы, как обычно.
   * По умолчанию выключено: остальные экраны каркаса не меняются.
   */
  final bool fieldOnly;

  /// Отступ справа сверху, который в режиме [fieldOnly] занимает кнопка паузы.
  static const fieldOnlyPauseClear = 72.0;

  @override
  Widget build(BuildContext context) {
    if (fieldOnly) {
      return Scaffold(
        body: SafeArea(
          child: Stack(children: [
            Positioned.fill(
              child: LayoutBuilder(
                key: const Key('game-field'),
                builder: (context, c) => field(context, c.maxHeight),
              ),
            ),
            Positioned(
              top: 8,
              right: 12,
              child: Semantics(
                button: true,
                label: L.t('gamePauseOpen'),
                child: Material(
                  key: const Key('field-only-pause'),
                  color: const Color(0xFFFBBF24),
                  shape: const CircleBorder(),
                  elevation: 3,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => _pause(context),
                    child: const SizedBox(
                      width: 52,
                      height: 52,
                      child: Icon(Icons.pause, size: 28, color: Color(0xFF201500)),
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ),
      );
    }
    final scheme = Theme.of(context).colorScheme;
    final spot = levelRule;
    final ruleKey = spot == null ? null : LevelRules.activeKey(spot.gameId, spot.level);
    final hasRule = spot != null && ruleKey != null && LevelRules.hasText(spot.gameId, ruleKey);
    final body = Column(
          children: [
            _Header(
              title: title,
              // Кнопка в шапке есть ВСЕГДА: раздел уточняет, куда вести, но не
              // решает, можно ли уйти. См. `_leave`.
              onBack: () => _leave(context),
              /*
               * 🔴 СПРАВКА ЕСТЬ У КАЖДОЙ ИГРЫ, И ЭКРАН ЕЁ НЕ ПЕРЕДАЁТ.
               *
               * Заводить кнопку в каждый из полусотни перенесённых экранов —
               * полсотни мест её забыть. Так уже вышло с выходом: `onBack`
               * передавал ОДИН экран из тридцати восьми. Поэтому правило каркас
               * спрашивает сам, по адресу открытой игры (`GameRules`), а экран
               * может уточнить своё — тогда берётся его.
               */
              onRules: onRules ?? _rulesByRoute(context),
              onLesson: onLesson,
              onPause: () => _pause(context),
              levelRuleTitle: hasRule ? L.t(LevelRules.textKey(spot.gameId, ruleKey, 'title')) : null,
              onLevelRule: hasRule ? () => showLevelRule(context, spot.gameId, ruleKey) : null,
            ),
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
        );
    return Scaffold(
      body: SafeArea(
        child: spot == null ? body : LevelRuleWatcher(spot: spot, child: body),
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
  /// Справка по адресу открытой игры; null — правила для неё нет.
  VoidCallback? _rulesByRoute(BuildContext context) {
    final key = GameRules.keyFor(GameRules.currentRoute);
    if (key == null) return null;
    return () => showGameRules(context, title: title, ruleKey: key);
  }

  void _leave(BuildContext context) {
    if (onBack != null) {
      onBack!();
      return;
    }
    Navigator.of(context).maybePop();
  }

  /// Свой «Заново» у игры уже есть: значок обновления или подпись перезапуска.
  static bool _isRestart(PauseAction a) =>
      a.icon == Icons.refresh ||
      a.label == L.t('restart') ||
      a.label == 'Начать заново' ||
      a.label == 'Новая партия';

  void _pause(BuildContext context) {
    // 🔴 «ЗАНОВО» У КАЖДОЙ ИГРЫ (задача 1e21b974): нет своего — каркас добавляет пункт,
    // который пересоздаёт экран через RestartScope (проигрыш не пишется). Замер 01.10:
    // своего «Заново» не было у 43 экранов из 86.
    final restart = RestartScope.of(context);
    final actions = [
      if (restart != null && !pauseActions.any(_isRestart))
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: restart),
      ...pauseActions,
    ];
    Navigator.of(context).push(MaterialPageRoute<void>(
      // Пауза — страница ПОВЕРХ игры: пока она видна, часы и таймеры партии стоят
      // (game_clock.dart, задача 430d1299). Без этого игра под паузой жила дальше.
      builder: (_) => GameHoldScope(
        child: _PauseScreen(
          title: title,
          ruleKey: GameRules.keyFor(GameRules.currentRoute),
          hud: hud,
          actions: actions,
          onLeave: () => _leave(context),
        ),
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
  /// Opens the shared feedback form without leaving/restarting the game.
  static VoidCallback? feedback;
}

/// Пауза во весь экран — как в веб-версии, а не лист снизу.
///
/// 📍 Образец прислал Денис 23.09.2026 кадром: счётчики сверху, «Продолжить игру»
/// главной кнопкой, ниже служебные пункты, и ДВА ухода в конце. Лист снизу на три
/// пункта, который стоял здесь до этого, не давал ни выхода, ни счётчиков.
class _PauseScreen extends StatelessWidget {
  const _PauseScreen({required this.title, this.ruleKey, required this.hud, required this.actions, required this.onLeave});

  final String title;
  final String? ruleKey;

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
                      Text(title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                      if (ruleKey != null)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: SizedBox(
                            height: (MediaQuery.sizeOf(context).height * .35).clamp(100.0, 280.0),
                            child: SingleChildScrollView(
                              key: const Key('pause-rules'),
                              child: Text(L.t(ruleKey!), style: const TextStyle(fontSize: 16, height: 1.35)),
                            ),
                          ),
                        ),
                      button(L.t('exitConfirmStay'), Icons.play_arrow,
                          () => Navigator.of(context).pop(),
                          primary: true, key: const Key('pause-resume')),
                      for (final a in actions)
                        button(a.label, a.icon, () {
                          Navigator.of(context).pop();
                          a.onPressed();
                        }),
                      if (GameExit.feedback != null)
                        button(L.t('feedbackFabLabel'), Icons.chat_bubble_outline,
                            GameExit.feedback!, key: const Key('pause-feedback')),
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
  const _Header({
    required this.title,
    this.onBack,
    this.onRules,
    this.onLesson,
    this.onPause,
    this.onLevelRule,
    this.levelRuleTitle,
  });
  final String title;
  final VoidCallback? onBack;
  final VoidCallback? onRules;
  final VoidCallback? onLesson;
  final VoidCallback? onPause;
  final VoidCallback? onLevelRule;
  final String? levelRuleTitle;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 2),
        child: Row(
          children: [
            IconButton(
              onPressed: onPause,
              icon: const Icon(Icons.pause),
              tooltip: L.t('teachPause'),
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
            if (onLevelRule != null)
              IconButton(
                key: const Key('game-level-rule'),
                onPressed: onLevelRule,
                icon: const Icon(Icons.new_releases_outlined),
                tooltip: levelRuleTitle,
              ),
            if (onLesson != null)
              IconButton(
                key: const Key('game-lesson'),
                onPressed: onLesson,
                icon: const Icon(Icons.school_outlined),
                tooltip: L.t('teachButton'),
              ),
            if (onRules != null)
              IconButton(onPressed: onRules, icon: const Icon(Icons.help_outline), tooltip: L.t('btn_rules')),
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
