import 'aurora_glass.dart';
import 'aux_action.dart';
import 'aurora_scope.dart';
import 'design_template.dart';
import 'game_clock.dart';
import 'game_colors.dart';
import 'feedback_fab.dart';
import 'game_pet.dart';
import 'game_rules.dart';
import 'l10n.dart';
import 'level_rules.dart';
import 'package:flutter/material.dart';
import 'restart_scope.dart';
import 'game_preset.dart';
import 'warmup_owner.dart';
import 'lesson.dart';

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
    this.practice,
  });

  final String title;

  /// Null uses the shared scoring flag. Games with their own durable attempt
  /// state (Sudoku) supply it explicitly, including after restoration.
  final bool? practice;

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

  /// Жёлтая круглая пауза — одна на fieldOnly и нижний ряд «Авроры».
  static const pauseYellow = Color(0xFFFBBF24);
  static const onPauseYellow = Color(0xFF201500);

  /// Главная кнопка паузы «Авроры» — оранжевая, как на листе 15, а не акцент профиля:
  /// решение Дениса 29.10 15:03 («оранжевая»). Оттенок снят с листа (≈ 248,168,72) и равен
  /// оранжевому «Авроры» в `GameColors.aurora` (берётся оттуда, без второго литерала —
  /// храповик цветов); на листе он один в обеих темах. Текст на нём тёмный, как на листе.
  static final auroraAction = GameColors.aurora(Brightness.dark).highlight;

  /*
   * 🔴 ЧТО НА ЭКРАНЕ — В ОТЧЁТ (задача 75348e44, 08.10.2026).
   *
   * Отзыв из нативной игры нёс маршрут и параметры адреса, но не живое состояние партии:
   * уровень, ошибки, время. Ни один из 116 экранов его не публиковал. Каркас знает всё это сам —
   * заголовок и счётчики шапки, — поэтому снимок делает он, одной правкой на все экраны.
   * Режим с развилки приходит хвостом маршрута (`?mode=…`), его здесь не дублируем.
   * Читает [GameExit.feedback] в `hybrid_app.dart` → поле `game_state` отчёта.
   */
  static Map<String, Object?>? feedbackState;

  Map<String, Object?> _feedbackState() => {
        'title': title,
        'practice': practice ?? LessonUsed.inRound,
        if (levelRule != null) 'level': levelRule!.level,
        if (hud.isNotEmpty) 'hud': {for (final h in hud) h.label: h.value},
      };

  @override
  Widget build(BuildContext context) {
    feedbackState = _feedbackState();
    if (fieldOnly) {
      return Scaffold(
        body: _withFeedback(SafeArea(
          child: Stack(children: [
            Positioned.fill(
              child: LayoutBuilder(
                key: const Key('game-field'),
                builder: (context, c) => field(context, c.maxHeight),
              ),
            ),
            Positioned(top: 8, left: 12, child: _practiceHud(fieldOnly: true)),
            Positioned(
              top: 8,
              right: 12,
              child: Semantics(
                button: true,
                label: L.t('gamePauseOpen'),
                child: Material(
                  key: const Key('field-only-pause'),
                  color: pauseYellow,
                  shape: const CircleBorder(),
                  elevation: 3,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => _pause(context),
                    child: const SizedBox(
                      width: 52,
                      height: 52,
                      child: Icon(Icons.pause, size: 28, color: onPauseYellow),
                    ),
                  ),
                ),
              ),
            ),
          ]),
        )),
      );
    }
    final scheme = Theme.of(context).colorScheme;
    final spot = levelRule;
    final ruleKey = spot == null ? null : LevelRules.activeKey(spot.gameId, spot.level);
    final hasRule = spot != null && ruleKey != null && LevelRules.hasText(spot.gameId, ruleKey);
    final frame = auroraFrameOf(context);
    if (frame != null) {
      final body = _auroraBody(
        context,
        frame,
        _AuroraHeader(
          title: title,
          onBack: () => _leave(context),
          onRules: onRules ?? _rulesByRoute(context),
          onLesson: onLesson,
          onFeedback: GameExit.feedback,
          levelRuleTitle: hasRule ? L.t(LevelRules.textKey(spot.gameId, ruleKey, 'title')) : null,
          onLevelRule: hasRule ? () => showLevelRule(context, spot.gameId, ruleKey) : null,
        ),
      );
      return Scaffold(
        backgroundColor: auroraToken('background', dark: frame.brightness == Brightness.dark),
        // Тот же фон, что у паузы (стандарт: стекло и золото на глубоком синем).
        body: DecoratedBox(
          decoration: AuroraGlass.backdrop(frame.brightness == Brightness.dark),
          child: SafeArea(child: spot == null ? body : LevelRuleWatcher(spot: spot, child: body)),
        ),
      );
    }
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
              // Отзыв из игры — значком в шапке, а не только пунктом паузы (задача e780e5b0):
              // нативная игра закрывает плавающую веб-кнопку, и 2.56.11 не давал написать вовсе.
              onFeedback: GameExit.feedback,
              levelRuleTitle: hasRule ? L.t(LevelRules.textKey(spot.gameId, ruleKey, 'title')) : null,
              onLevelRule: hasRule ? () => showLevelRule(context, spot.gameId, ruleKey) : null,
            ),
            _practiceHud(),
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
      body: _withFeedback(SafeArea(
        child: spot == null ? body : LevelRuleWatcher(spot: spot, child: body),
      )),
    );
  }

  Widget _practiceHud({bool fieldOnly = false}) => ValueListenableBuilder<bool>(
    valueListenable: LessonUsed.changes,
    builder: (context, sharedPractice, _) {
      final isPractice = practice ?? sharedPractice;
      final items = <HudItem>[
        if (!fieldOnly) ...hud,
        if (isPractice) HudItem(
          label: L.t('sudokuPracticeOnly'),
          value: L.t('sudokuPracticeBadge'),
          icon: Icons.school_outlined,
        ),
      ];
      return items.isEmpty ? const SizedBox.shrink() : _HudRow(items: items);
    },
  );

  Widget _withFeedback(Widget body) {
    // HybridApp уже публикует общую память здесь; отдельного хранилища нет.
    final state = PetHost.state;
    final open = GameExit.feedback;
    if (state == null || open == null) return body;
    return Stack(fit: StackFit.expand, children: [
      body,
      FeedbackFab(state: state, onOpen: open),
    ]);
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
    final key = GameRules.fullKeyFor(GameRules.currentRoute);
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

  /// Тема рамки в «Авроре»: от [AuroraGameScope] (поле может остаться классическим) или
  /// сама тема экрана; null — Classic, рамка прежняя.
  static ThemeData? auroraFrameOf(BuildContext context) {
    final frame = AuroraFrame.of(context);
    if (frame != null) return frame;
    final theme = Theme.of(context);
    return theme.extension<UiTemplateTheme>()?.template == UiTemplate.aurora ? theme : null;
  }

  /*
   * «АВРОРА» (листы 15 и 32, LAYOUT_CORRECTIONS п. 1 и 3, задача 045be21d).
   *
   * Шапка «‹ Название» в одну строку, справа значки — те же действия, что в Classic.
   * Пауза уходит из шапки вниз: жёлтая круглая слева в нижнем ряду игры, справа от неё
   * служебные значки игры (AuxBar); клавиатура игры — над этим рядом, как на листе 32.
   * Рамка — в теме [frame], поле и клавиатура — в своей (классической, пока маршрут
   * не в [auroraReadyRoutes]), поэтому у поля и свой фон.
   */
  Widget _auroraBody(BuildContext context, ThemeData frame, Widget header) {
    Widget chrome(Widget w) => Theme(data: frame, child: w);
    return Column(children: [
      chrome(header),
      if (hud.isNotEmpty) chrome(_HudRow(items: hud, aurora: true)),
      Expanded(
        key: const Key('game-field'),
        child: ColoredBox(
          color: Theme.of(context).scaffoldBackgroundColor,
          child: LayoutBuilder(builder: (context, c) => field(context, c.maxHeight)),
        ),
      ),
      if (toolbar != null)
        Container(width: double.infinity, color: Theme.of(context).colorScheme.surface, child: toolbar),
      chrome(_AuroraGameBar(onPause: () => _pause(context), aux: auxRow)),
    ]);
  }

  /// Свой «Заново» у игры уже есть: значок обновления или подпись перезапуска.
  static bool _isRestart(PauseAction a) =>
      a.icon == Icons.refresh ||
      a.icon == Icons.replay ||
      a.label == L.t('restart') ||
      a.label == 'Начать заново' ||
      a.label == 'Новая партия';

  void _pause(BuildContext context) {
    // 🔴 «ЗАНОВО» У КАЖДОЙ ИГРЫ (задача 1e21b974): нет своего — каркас добавляет пункт,
    // который пересоздаёт экран через RestartScope (проигрыш не пишется). Замер 01.10:
    // своего «Заново» не было у 43 экранов из 86.
    final restart = RestartScope.of(context);
    final ownedWarmup = GamePreset.isWarmup && WarmupOwner.fromQuery(GamePreset.params) != null;
    final actions = [
      if (restart != null && (ownedWarmup || !pauseActions.any(_isRestart)))
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: restart),
      ...pauseActions.where((a) => !(restart != null && ownedWarmup && _isRestart(a))),
    ];
    Navigator.of(context).push(MaterialPageRoute<void>(
      // Пауза — страница ПОВЕРХ игры: пока она видна, часы и таймеры партии стоят
      // (game_clock.dart, задача 430d1299). Без этого игра под паузой жила дальше.
      builder: (_) => GameHoldScope(
        child: _PauseScreen(
          title: title,
          ruleKey: GameRules.fullKeyFor(GameRules.currentRoute),
          hud: hud,
          actions: actions,
          onLeave: () => _leave(context),
          frame: auroraFrameOf(context),
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
  const _PauseScreen({
    required this.title,
    this.ruleKey,
    required this.hud,
    required this.actions,
    required this.onLeave,
    this.frame,
  });

  final String title;
  final String? ruleKey;

  final List<HudItem> hud;
  final List<PauseAction> actions;
  final VoidCallback onLeave;

  /// Тема «Авроры» — пауза по листу 15; null — Classic.
  final ThemeData? frame;

  @override
  Widget build(BuildContext context) {
    final f = frame;
    if (f != null) return Theme(data: f, child: Builder(builder: _aurora));
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
                      // «Продолжить» и «Отзыв» — над блоком правил (задача e780e5b0): блок до 280 px
                      // уводил отзыв за нижний край, и найти его можно было только прокруткой.
                      button(L.t('exitConfirmStay'), Icons.play_arrow,
                          () => Navigator.of(context).pop(),
                          primary: true, key: const Key('pause-resume')),
                      if (GameExit.feedback != null)
                        button(L.t('feedbackFabLabel'), Icons.chat_bubble_outline,
                            GameExit.feedback!, key: const Key('pause-feedback')),
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

extension on _PauseScreen {
  /*
   * Пауза «Авроры» — реф Codex 30.10 `pause-grouped-levels-v4`, палитра и размеры сняты с него
   * ([ChromePalette], экран 390 pt): поля 18; шапка 70 — Синапс в фиолетовом кольце, «<игра> ·
   * Пауза» крупно по центру, ✕ в золотом кольце; «Правила» 66 — значок в золотом квадрате,
   * заголовок и первая фраза, свёрнуты; ряд 64 — «Заново» слева, «Продолжить» (жёлтый глянец)
   * справа; пункты игры строками 56; «Сообщить о проблеме»; два ухода 58 рядом; промежутки 11.
   * Набор пунктов тот же, что в Classic: каркас не выдумывает действий, «Заново» — тот же пункт
   * игры с тем же подтверждением (`leaveWith`).
   */
  Widget _aurora(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final p = ChromePalette.of(dark);
    const gap = 11.0;

    void leaveWith(VoidCallback go) {
      Navigator.of(context).pop();
      go();
    }

    Widget pressable({required Widget child, Key? key, required VoidCallback onTap, required BoxDecoration decoration, required double height}) =>
        Container(
          key: key,
          decoration: decoration,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: onTap,
              child: ConstrainedBox(constraints: BoxConstraints(minHeight: height), child: child),
            ),
          ),
        );

    Widget centered(String text, IconData icon, Color fg, double size, {bool chevron = false}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, size: size + 9, color: fg),
            const SizedBox(width: 8),
            // Уменьшается, а не режется: половина ряда на 390 pt.
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(text, maxLines: 1, style: TextStyle(fontSize: size, fontWeight: FontWeight.w800, color: fg)),
              ),
            ),
            if (chevron) Icon(Icons.chevron_right_rounded, size: size + 8, color: fg),
          ]),
        );

    Widget row(String title, IconData icon, VoidCallback onTap, {Key? key}) => Padding(
          padding: const EdgeInsets.only(top: gap),
          child: pressable(
            key: key,
            onTap: onTap,
            height: 56,
            decoration: AuroraGlass.panel(dark, radius: 18),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(children: [
                Icon(icon, size: 28, color: p.text),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(title,
                      maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: p.text)),
                ),
                Icon(Icons.chevron_right_rounded, size: 30, color: p.text),
              ]),
            ),
          ),
        );

    final restart = actions.where(GameShell._isRestart).firstOrNull;
    final others = [for (final a in actions) if (!identical(a, restart)) a];

    return Scaffold(
      backgroundColor: p.background,
      body: Container(
        key: const Key('pause-aurora-bg'),
        decoration: AuroraGlass.backdrop(dark),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 18),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                key: const Key('pause-card'),
                constraints: const BoxConstraints(minHeight: 70),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                decoration: AuroraGlass.panel(dark, radius: 22),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    // Синапс — настоящий питомец в фиолетовом кольце; нет питомца — жёлтая пауза.
                    Container(
                      width: 48,
                      height: 48,
                      padding: const EdgeInsets.all(2.5),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: p.ringFill,
                        border: Border.all(color: p.petRing, width: 2.5),
                        boxShadow: [BoxShadow(color: p.petRing.withValues(alpha: 0.5), blurRadius: 12)],
                      ),
                      child: ClipOval(
                        child: Center(
                          child: PetHost.ready
                              ? GamePet(state: PetHost.state!, origin: PetHost.origin!, size: 40)
                              : Icon(Icons.pause_rounded, size: 26, color: p.primaryBottom),
                        ),
                      ),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text.rich(
                            TextSpan(children: [TextSpan(text: title), const TextSpan(text: ' · '), TextSpan(text: L.t('teachPause'))]),
                            maxLines: 1,
                            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: p.text),
                          ),
                        ),
                      ),
                    ),
                    Semantics(
                      button: true,
                      label: L.t('exitConfirmStay'),
                      excludeSemantics: true,
                      child: InkResponse(
                        key: const Key('pause-close'),
                        onTap: () => Navigator.of(context).pop(),
                        radius: 26,
                        // Реф: в тёмной — золотой ✕ в кольце, в светлой — тёмный ✕ на золотой заливке.
                        child: Container(
                          width: 46,
                          height: 46,
                          decoration: AuroraGlass.ring(dark, active: dark ? null : p.primaryBottom),
                          child: Icon(Icons.close_rounded, color: dark ? p.gold : p.onPrimary, size: 30),
                        ),
                      ),
                    ),
                  ]),
                  if (hud.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    _HudRow(items: hud, aurora: true, padding: EdgeInsets.zero),
                  ],
                ]),
              ),
              if (ruleKey != null)
                Padding(
                  padding: const EdgeInsets.only(top: gap),
                  child: _AuroraPauseRules(text: L.t(ruleKey!), dark: dark),
                ),
              const SizedBox(height: gap),
              // «Заново» слева, «Продолжить» справа — одним рядом (требование Дениса 30.10).
              Row(children: [
                if (restart != null) ...[
                  Expanded(
                    child: pressable(
                      key: const Key('pause-restart'),
                      onTap: () => leaveWith(restart.onPressed),
                      height: 64,
                      decoration: AuroraGlass.panel(dark, radius: 18),
                      child: centered(restart.label, restart.icon, p.text, 17),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: pressable(
                    key: const Key('pause-resume'),
                    onTap: () => Navigator.of(context).pop(),
                    height: 64,
                    decoration: AuroraGlass.primary(dark),
                    child: centered(L.t('exitConfirmStay'), Icons.play_arrow_rounded, p.onPrimary, 19),
                  ),
                ),
              ]),
              // Выбор из нескольких (пункты игры со значком-кружком: дорога сложности Судоку и т. п.)
              // — одним рядом сегментов, выбранный подсвечен (реф: «Полегче · Обычная · Пожёстче»).
              // Те же пункты и обработчики игры, каркас только раскладывает.
              for (final group in _groupChoices(others))
                if (group.length > 1 && _isChoice(group.first))
                  for (var i = 0; i < group.length; i += 3)
                    Padding(
                      padding: const EdgeInsets.only(top: gap),
                      child: Row(children: [
                        for (var k = i; k < i + 3; k++) ...[
                          if (k > i) const SizedBox(width: 8),
                          Expanded(
                            child: k < group.length
                                ? _choiceSegment(group[k], dark, () => leaveWith(group[k].onPressed))
                                : const SizedBox.shrink(),
                          ),
                        ],
                      ]),
                    )
                else
                  for (final a in group) row(a.label, a.icon, () => leaveWith(a.onPressed)),
              if (GameExit.feedback != null)
                row(L.t('feedbackFabLabel'), Icons.bug_report_outlined, GameExit.feedback!, key: const Key('pause-feedback')),
              const SizedBox(height: gap),
              Row(children: [
                Expanded(
                  child: pressable(
                    key: const Key('pause-leave'),
                    onTap: () => leaveWith(onLeave),
                    height: 58,
                    decoration: AuroraGlass.panel(dark, radius: 18),
                    child: centered(L.t('pauseExitGame'), Icons.sports_esports_outlined, p.text, 16, chevron: true),
                  ),
                ),
                if (GameExit.home != null) ...[
                  const SizedBox(width: 12),
                  Expanded(
                    child: pressable(
                      key: const Key('pause-home'),
                      onTap: () => leaveWith(GameExit.home!),
                      height: 58,
                      decoration: AuroraGlass.panel(dark, radius: 18),
                      child: centered(L.t('goHome'), Icons.home_outlined, p.text, 16, chevron: true),
                    ),
                  ),
                ],
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Пункт выбора «один из нескольких»: игра рисует его кружком (отмеченный — выбран).
bool _isChoice(PauseAction a) => a.icon == Icons.radio_button_checked || a.icon == Icons.radio_button_unchecked;

/// Подряд идущие пункты выбора — одной группой, остальные — по одному.
List<List<PauseAction>> _groupChoices(List<PauseAction> actions) {
  final out = <List<PauseAction>>[];
  for (final a in actions) {
    if (_isChoice(a) && out.isNotEmpty && _isChoice(out.last.first)) {
      out.last.add(a);
    } else {
      out.add([a]);
    }
  }
  return out;
}

/// Сегмент выбора в паузе: кружок сверху, подпись под ним; выбранный — золотая кромка и ореол.
Widget _choiceSegment(PauseAction a, bool dark, VoidCallback onTap) {
  final p = ChromePalette.of(dark);
  final on = a.icon == Icons.radio_button_checked;
  return Semantics(
    button: true,
    selected: on,
    label: a.label,
    excludeSemantics: true,
    onTap: onTap,
    child: Container(
      decoration: on
          ? AuroraGlass.panel(dark, radius: 16).copyWith(
              border: Border.all(color: p.goldSoft, width: 2.2),
              boxShadow: [BoxShadow(color: p.gold.withValues(alpha: 0.6), blurRadius: 18)],
            )
          : AuroraGlass.panel(dark, radius: 16, glow: false),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 72),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(a.icon, size: 26, color: on ? p.gold : p.text),
                const SizedBox(height: 4),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(a.label, maxLines: 1, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: p.text)),
                ),
              ]),
            ),
          ),
        ),
      ),
    ),
  );
}

/// «Правила» в паузе «Авроры» (реф): значок в золотом квадрате, заголовок, первая фраза; свёрнуты,
/// по нажатию раскрываются целиком.
class _AuroraPauseRules extends StatefulWidget {
  const _AuroraPauseRules({required this.text, required this.dark});
  final String text;
  final bool dark;

  @override
  State<_AuroraPauseRules> createState() => _AuroraPauseRulesState();
}

class _AuroraPauseRulesState extends State<_AuroraPauseRules> {
  var _open = false;

  @override
  Widget build(BuildContext context) {
    final p = ChromePalette.of(widget.dark);
    final first = widget.text.split(RegExp(r'(?<=[.!?])\s')).first;
    return Container(
      constraints: const BoxConstraints(minHeight: 66),
      decoration: AuroraGlass.panel(widget.dark, radius: 18),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          key: const Key('pause-rules-toggle'),
          borderRadius: BorderRadius.circular(18),
          onTap: () => setState(() => _open = !_open),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: p.gold.withValues(alpha: widget.dark ? 0.2 : 0.35),
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(color: p.gold, width: 1.5),
                  ),
                  child: Icon(Icons.menu_book_rounded, color: widget.dark ? p.gold : p.text, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(L.t('btn_rules'), style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: p.text)),
                    if (!_open)
                      Text(first, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, color: p.textSecondary)),
                  ]),
                ),
                Icon(_open ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 30, color: p.text),
              ]),
              if (_open) ...[
                const SizedBox(height: 8),
                ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: (MediaQuery.sizeOf(context).height * .4).clamp(120.0, 320.0)),
                  child: SingleChildScrollView(
                    key: const Key('pause-rules'),
                    child: Text(widget.text, style: TextStyle(fontSize: 15.5, height: 1.4, color: p.text)),
                  ),
                ),
              ],
            ]),
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
    this.onFeedback,
  });
  final String title;
  final VoidCallback? onBack;
  final VoidCallback? onRules;
  final VoidCallback? onLesson;
  final VoidCallback? onPause;
  final VoidCallback? onLevelRule;
  final String? levelRuleTitle;
  final VoidCallback? onFeedback;

  // На узком окне кнопки шапки компактнее: с отзывом их бывает до шести плюс питомец,
  // и на 320 px ряд обычных 48-px кнопок не помещается.
  @override
  Widget build(BuildContext context) => IconButtonTheme(
      data: IconButtonThemeData(
          style: IconButton.styleFrom(
              visualDensity: MediaQuery.sizeOf(context).width < 380 ? VisualDensity.compact : null)),
      child: Padding(
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
            if (onFeedback != null)
              _feedbackButton(context),
            if (onBack != null)
              IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back), tooltip: L.t('back')),
          ],
        ),
      ));

  Widget _feedbackButton(BuildContext context) {
    Widget button() {
      final size = FeedbackBugMark.sizeOf(context);
      return Semantics(
        button: true,
        label: L.t('feedbackFabLabel'),
        onTap: onFeedback,
        excludeSemantics: true,
        child: IconButton(
        key: const Key('game-feedback'),
        onPressed: onFeedback,
        icon: const ExcludeSemantics(child: FeedbackBugMark()),
        padding: EdgeInsets.zero,
        constraints: BoxConstraints.tight(size),
        style: IconButton.styleFrom(
          fixedSize: size,
          minimumSize: size,
          visualDensity: VisualDensity.standard,
        ),
        tooltip: L.t('feedbackFabLabel'),
        ),
      );
    }

    final state = PetHost.state;
    if (state == null) return button();
    return ValueListenableBuilder<int>(
      valueListenable: state.writes,
      builder: (context, _, _) => state.get(FabRules.visibleKey) == '0' ? const SizedBox.shrink() : button(),
    );
  }
}

class _HudRow extends StatelessWidget {
  const _HudRow({
    required this.items,
    this.aurora = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
  });
  final List<HudItem> items;

  /// «Аврора»: фишки на поверхности рамки с обводкой, текст — токены рамки.
  final bool aurora;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = aurora ? ChromePalette.of(dark).text : null;
    return Padding(
      padding: padding,
      child: Wrap(
        alignment: aurora ? WrapAlignment.center : WrapAlignment.start,
        spacing: aurora ? 12 : 8,
        runSpacing: 4,
        children: [
          for (final i in items)
            Container(
              // Реф: пилюли ~28 pt с золотым ободком, цифра крупно и жирно.
              padding: aurora ? const EdgeInsets.symmetric(horizontal: 16, vertical: 5) : const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: aurora
                  ? AuroraGlass.panel(dark, radius: 16, glow: false)
                  : BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(14)),
              child: Semantics(
                label: '${i.label}: ${i.value}',
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  if (i.icon != null) ...[Icon(i.icon, size: aurora ? 17 : 14, color: ink), SizedBox(width: aurora ? 8 : 4)],
                  Text(i.value, style: TextStyle(fontWeight: aurora ? FontWeight.w800 : FontWeight.w700, fontSize: aurora ? 17 : null, color: ink)),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}

/// Шапка «Авроры» — LAYOUT_CORRECTIONS п. 1: одна строка 56 pt, «‹» слева от названия,
/// название в одну строку, справа Синапс и значки. Паузы здесь нет — она в нижнем ряду.
class _AuroraHeader extends StatelessWidget {
  const _AuroraHeader({
    required this.title,
    required this.onBack,
    this.onRules,
    this.onLesson,
    this.onLevelRule,
    this.levelRuleTitle,
    this.onFeedback,
  });
  final String title;
  final VoidCallback onBack;
  final VoidCallback? onRules;
  final VoidCallback? onLesson;
  final VoidCallback? onLevelRule;
  final String? levelRuleTitle;
  final VoidCallback? onFeedback;

  /// Круглая кнопка шапки — стеклянный шар в золотом кольце (реф header-help-dropdown-v1).
  static Widget ring(BuildContext context, {Key? key, required IconData icon, required String tooltip, required VoidCallback onTap, required double size}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Tooltip(
        message: tooltip,
        child: Semantics(
          button: true,
          label: tooltip,
          excludeSemantics: true,
          onTap: onTap,
          child: Container(
            key: key,
            width: size,
            height: size,
            decoration: AuroraGlass.ring(dark),
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onTap,
                child: Icon(icon, size: size * 0.55, color: ChromePalette.of(dark).text),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final p = ChromePalette.of(dark);
    final m = ChromeMetrics.of(context);
    final narrow = MediaQuery.sizeOf(context).width < 380;
    final size = narrow ? m.headerRing - 4 : m.headerRing;
    // Реф: стеклянная полоса во всю ширину, «‹» слева в кольце, крупное название, справа Синапс
    // в фиолетовом кольце, «Обучение и справка» и жук — в золотых кольцах.
    return Container(
      key: const Key('game-header-aurora'),
      margin: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      height: m.headerHeight,
      decoration: AuroraGlass.panel(dark, radius: 22),
      child: Row(children: [
        ring(context, key: const Key('game-back'), icon: Icons.chevron_left_rounded, tooltip: L.t('back'), onTap: onBack, size: size),
        const SizedBox(width: 8),
        Expanded(
          child: Align(
            alignment: Alignment.centerLeft,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(title,
                  key: const Key('game-title'),
                  maxLines: 1,
                  style: TextStyle(fontSize: m.titleSize, fontWeight: FontWeight.w800, color: p.text)),
            ),
          ),
        ),
        if (PetHost.ready)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 4),
            width: size + 4,
            height: size + 4,
            padding: const EdgeInsets.all(2.5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: p.ringFill,
              border: Border.all(color: p.petRing, width: 2.5),
              boxShadow: [BoxShadow(color: p.petRing.withValues(alpha: 0.5), blurRadius: 10)],
            ),
            child: ClipOval(child: GamePet(state: PetHost.state!, origin: PetHost.origin!, size: size - 4)),
          ),
        if (onLevelRule != null)
          ring(context, key: const Key('game-level-rule'), icon: Icons.new_releases_outlined, tooltip: levelRuleTitle ?? '', onTap: onLevelRule!, size: size),
        // Учитель и правила — ОДНОЙ кнопкой «Обучение и справка» с раздельными пунктами (реф Codex
        // 30.10, header-help-dropdown-v1): открытие меню само ничего не включает, учебной попытку
        // делает только «Разбор», как и раньше. Есть одно из двух — один значок, как было.
        if (onLesson != null && onRules != null)
          _AuroraHelpMenu(onLesson: onLesson!, onRules: onRules!, size: size)
        else ...[
          if (onLesson != null)
            ring(context, key: const Key('game-lesson'), icon: Icons.school_outlined, tooltip: L.t('teachButton'), onTap: onLesson!, size: size),
          if (onRules != null) ring(context, icon: Icons.help_outline, tooltip: L.t('btn_rules'), onTap: onRules!, size: size),
        ],
        // Отзыв — значком жука, как плавающая bugFX: облачко не читалось как «сообщить о проблеме».
        if (onFeedback != null)
          ring(context,
              key: const Key('game-feedback'), icon: Icons.bug_report_outlined, tooltip: L.t('feedbackFabLabel'), onTap: onFeedback!, size: size),
      ]),
    );
  }
}

/// «Обучение и справка» шапки «Авроры» (реф header-help-dropdown-v1): шапочка в золотом кольце
/// с ▾; меню — стеклянная панель с заголовком и раздельными пунктами «Разбор» и «Правила».
class _AuroraHelpMenu extends StatelessWidget {
  const _AuroraHelpMenu({required this.onLesson, required this.onRules, required this.size});
  final VoidCallback onLesson;
  final VoidCallback onRules;
  final double size;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final p = ChromePalette.of(dark);
    PopupMenuItem<VoidCallback> item(String key, IconData icon, String label, VoidCallback go) => PopupMenuItem(
          key: Key(key),
          value: go,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          child: Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: AuroraGlass.panel(dark, radius: 14, glow: false),
            child: Row(children: [
              Icon(icon, color: p.text, size: 24),
              const SizedBox(width: 12),
              Flexible(child: Text(label, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.text))),
            ]),
          ),
        );
    return PopupMenuButton<VoidCallback>(
      key: const Key('game-help-menu'),
      tooltip: '${L.t('teachButton')} · ${L.t('btn_rules')}',
      color: p.glass,
      elevation: 8,
      shadowColor: p.gold.withValues(alpha: 0.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: p.gold, width: 1.5)),
      position: PopupMenuPosition.under,
      onSelected: (go) => go(),
      itemBuilder: (_) => [
        item('game-lesson', Icons.school_outlined, L.t('teachButton'), onLesson),
        item('game-rules', Icons.help_outline, L.t('btn_rules'), onRules),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Container(
          width: size + 4,
          height: size + 4,
          decoration: AuroraGlass.ring(dark),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.school_outlined, size: size * 0.5, color: p.text),
            Icon(Icons.keyboard_arrow_down_rounded, size: size * 0.32, color: p.text),
          ]),
        ),
      ),
    );
  }
}

/// Нижний ряд игры в «Авроре» — реф sudoku-even-toolbar-v4: стеклянная панель во всю ширину,
/// жёлтая глянцевая «Пауза» и кнопки игры — ОДНИМ рядом равных колонок (пауза — первая колонка),
/// подписи под кругами. Пятивкладочной панели оболочки поверх игры нет.
class _AuroraGameBar extends StatelessWidget {
  const _AuroraGameBar({required this.onPause, this.aux});
  final VoidCallback onPause;
  final Widget? aux;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final p = ChromePalette.of(dark);
    final m = ChromeMetrics.of(context);
    final pause = Semantics(
      button: true,
      label: L.t('gamePauseOpen'),
      excludeSemantics: true,
      onTap: onPause,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPause,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            key: const Key('game-pause'),
            decoration: AuroraGlass.pause(dark),
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onPause,
                child: SizedBox(
                  width: m.barCircle,
                  height: m.barCircle,
                  child: Icon(Icons.pause_rounded, size: m.barCircle * 0.56, color: p.onPrimary),
                ),
              ),
            ),
          ),
          SizedBox(height: m.compact ? 3 : 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(L.t('teachPause'), maxLines: 1, style: TextStyle(fontSize: m.barLabel, height: 1.1, color: p.text)),
          ),
        ]),
      ),
    );
    // Кнопки игры из её AuxBar — в те же равные колонки, что и пауза (реф: пять равных колонок).
    final items = aux is AuxBar ? (aux! as AuxBar).children : null;
    return Container(
      key: const Key('game-bar-aurora'),
      margin: const EdgeInsets.fromLTRB(8, 2, 8, 4),
      padding: m.barPadding,
      decoration: AuroraGlass.panel(dark, radius: 24),
      child: items != null
          ? Row(key: const Key('aux-bar-aurora'), crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Center(child: pause)),
              for (final c in items) Expanded(child: Center(child: c)),
            ])
          : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 72, child: pause),
              Expanded(child: aux ?? const SizedBox.shrink()),
            ]),
    );
  }
}
