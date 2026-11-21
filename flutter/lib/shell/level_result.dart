// ИТОГ УРОВНЯ — ОДИН НА ВСЕ ИГРЫ, С АВТОПЕРЕХОДОМ (задача e90a53d5, 13.11.2026).
//
// Денис 13.11 (кадр «Фонемы: пары» — пустой экран «Уровень 3 пройден! · Дальше сразу · Пропустить»):
// «должна же во всех играх автопереход быть… это для каждого отдельно или общая проблема?». Замер по
// main: 55 игр рисовали свой экран итога с кнопкой «Следующий»/«Дальше сразу», автоперехода — ни у одной.
// По канону «элемент большинства игр — один компонент каркаса» итог живёт здесь, игра отдаёт ДАННЫЕ:
// исход, сыгранный уровень, строку счёта, свои подробности (разбор ответов и т. п.) и два колбэка —
// «дальше» (у игры это её старт партии: после победы лестница уже на следующем уровне, после провала —
// на том же) и «настройки».
//
// Поведение: пройдено — через [winDelay] сама стартует следующая партия, провал — через [failDelay]
// «Ещё раз»; тап по итогу — сразу. «Настройки» и «Выйти» останавливают отсчёт. В зарядке и пресете
// автоперехода нет: следующий шаг ведёт мост зарядки, а не игра. Вид — «Аврора» ([GameResultPanel])
// или классика, как у итога «Паузы».
library;

import 'package:flutter/material.dart';

import 'aurora_scope.dart';
import 'chrome_art.dart';
import 'game_clock.dart';
import 'game_colors.dart';
import 'game_outcome_adapter.dart';
import 'game_preset.dart';
import 'game_shell.dart';
import 'l10n.dart';
import 'level_ladder.dart';
import 'level_map.dart';
import 'reward_effects.dart';
import 'ui_kit/game_result.dart';

export 'game_outcome_adapter.dart';

class LevelResultNotice extends StatelessWidget {
  const LevelResultNotice({super.key, required this.unavailable});

  final LevelResultUnavailable unavailable;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          unavailable.message,
          key: const Key('level-result-unavailable'),
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (unavailable.detail case final detail?)
          Text(detail, textAlign: TextAlign.center),
      ],
    ),
  );
}

class LevelResult extends StatefulWidget {
  const LevelResult({
    super.key,
    required this.passed,
    this.onNext,
    this.nextUnavailable,
    this.nextLabel,
    this.level,
    this.score,
    this.details,
    this.onSettings,
    this.auto = true,
  }) : report = null,
       titleKey = null,
       nextKey = null,
       settingsKey = null,
       settingsLabel = null,
       waitForWin = false,
       layout = GameOutcomeLayout.screen,
       assert((onNext == null) != (nextUnavailable == null));

  const LevelResult._({
    super.key,
    required this.passed,
    this.onNext,
    this.nextUnavailable,
    this.nextLabel,
    this.level,
    this.score,
    this.details,
    this.onSettings,
    this.auto = true,
    this.titleKey,
    this.nextKey,
    this.settingsKey,
    this.settingsLabel,
    this.report,
    this.waitForWin = false,
    this.layout = GameOutcomeLayout.screen,
  });

  factory LevelResult.adapt(GameOutcomeAdapter adapter, {Key? key}) =>
      switch (adapter) {
        LevelOutcomeAdapter a => LevelResult._(
          key: key,
          passed: a.passed,
          level: a.playedLevel,
          score: a.score,
          details: a.details,
          onNext: a.playNext,
          nextUnavailable: a.unavailable,
          nextLabel: a.nextLabel,
          nextKey: a.nextKey,
          titleKey: a.titleKey,
          onSettings: a.settings,
          settingsKey: a.settingsKey,
          settingsLabel: a.settingsLabel,
          auto: a.auto,
          waitForWin: a.waitForWin,
          layout: a.layout,
        ),
        ReportOutcomeAdapter a => LevelResult._(
          key: key,
          passed: false,
          score: a.score,
          details: a.details,
          report: a,
          titleKey: a.titleKey,
          auto: false,
          layout: a.layout,
        ),
      };

  final ReportOutcomeAdapter? report;
  final Key? titleKey;
  final Key? nextKey;
  final Key? settingsKey;
  final String? settingsLabel;
  final bool waitForWin;
  final GameOutcomeLayout layout;

  /// Уровень пройден (иначе — «Ещё раз» на том же).
  final bool passed;

  /// Сыгранный уровень — для заголовка «Уровень N пройден!» и звёзд. Нет лестницы — `null`.
  final int? level;

  /// Счёт партии строкой, как его пишет игра («Верно: 9 / 10 · Ошибок: 1»).
  final String? score;

  /// Своё у игры под счётом: разбор ответов, рекорд, подсказка. Не кнопки «Дальше» — их рисует каркас.
  final Widget? details;

  /// Старт следующей партии: после победы — следующий уровень, после провала — тот же.
  final VoidCallback? onNext;

  /// No playable next round. Do not show a button, make the card tappable,
  /// or run the countdown in this state.
  final LevelResultUnavailable? nextUnavailable;

  /// Optional label for a game that knows the actual destination level.
  final String? nextLabel;

  /// Вернуться к настройке игры. `null` — у игры её нет, кнопки нет.
  final VoidCallback? onSettings;

  /// Игра может отключить автопереход (например, итог серии, где «дальше» уводит из игры).
  final bool auto;

  /// Задержка автоперехода после победы и после провала.
  static const winDelay = Duration(milliseconds: 1500);
  static const failDelay = Duration(milliseconds: 2500);

  /// Пробы игр смотрят на итог дольше задержки и не ждут, что партия начнётся сама: общая настройка проб
  /// (`test/flutter_test_config.dart`) выключает автопереход, проба каркаса включает обратно.
  static bool autoAdvance = true;

  /// Анимация победы (Lottie-звезда и Flame-искры, ~1,2 с — раньше автоперехода). При «Уменьшить
  /// движение» её нет: звезда стоит, искр нет. Пробы игр её не грузят (`flutter_test_config.dart`).
  static bool effects = true;

  @override
  State<LevelResult> createState() => _LevelResultState();
}

class _LevelResultState extends State<LevelResult>
    with SingleTickerProviderStateMixin {
  late final AnimationController _countdown = AnimationController(
    vsync: this,
    duration: widget.passed ? LevelResult.winDelay : LevelResult.failDelay,
  );
  bool _gone = false;
  bool _manualAfterMap = false;
  bool _mapOpen = false;
  late final VoidCallback _stopListeningToHold;

  bool _winReady(LevelResult result) {
    if (!result.waitForWin) return true;
    final win = LevelLadder.lastWin.value;
    return win != null &&
        win.gameId == LevelLadder.current?.gameId &&
        win.level == result.level;
  }

  bool _allowsAuto(LevelResult result) =>
      result.onNext != null &&
      _winReady(result) &&
      result.auto &&
      LevelResult.autoAdvance &&
      !GamePreset.isWarmup;

  bool get _auto => !_manualAfterMap && _allowsAuto(widget);

  @override
  void initState() {
    super.initState();
    _countdown.addStatusListener((s) {
      if (s == AnimationStatus.completed) _go(widget.onNext);
    });
    if (widget.waitForWin) LevelLadder.lastWin.addListener(_onWinRecorded);
    _stopListeningToHold = onGameHold((held) {
      if (held) {
        _countdown.stop();
      } else {
        _resumeCountdown();
      }
    });
    _resumeCountdown();
  }

  @override
  void didUpdateWidget(covariant LevelResult oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.report?.action?.onTap == null &&
        widget.report?.action?.onTap != null) {
      _gone = false;
    }
    if (widget.waitForWin != oldWidget.waitForWin) {
      if (widget.waitForWin) {
        LevelLadder.lastWin.addListener(_onWinRecorded);
      } else {
        LevelLadder.lastWin.removeListener(_onWinRecorded);
      }
    }
    if (oldWidget.onNext != null && widget.onNext == null) {
      _countdown.stop();
      _gone = false;
    } else if (oldWidget.onNext == null && widget.onNext != null) {
      _gone = false;
      _countdown.reset();
    }
    _resumeCountdown();
  }

  void _onWinRecorded() {
    if (!mounted || !widget.waitForWin) return;
    _resumeCountdown();
    setState(() {});
  }

  void _resumeCountdown() {
    if (!_auto || isGameHeld()) {
      _countdown.stop();
    } else if (!_gone && !_countdown.isAnimating && _countdown.value < 1) {
      _countdown.forward();
    }
  }

  @override
  void dispose() {
    _stopListeningToHold();
    if (widget.waitForWin) LevelLadder.lastWin.removeListener(_onWinRecorded);
    _countdown.dispose();
    super.dispose();
  }

  /// Один уход с итога: автопереход, тап и кнопка не срабатывают дважды.
  void _go(VoidCallback? action) {
    if (_gone || _mapOpen || action == null || !mounted) return;
    _gone = true;
    _countdown.stop();
    action();
  }

  Future<void> _openMap(Future<void> Function() open) async {
    if (_gone || _mapOpen) return;
    _countdown.stop();
    setState(() {
      _manualAfterMap = true;
      _mapOpen = true;
    });
    try {
      await open();
    } finally {
      if (mounted) setState(() => _mapOpen = false);
    }
  }

  Widget _trail({bool compact = false}) {
    if (!widget.passed || widget.level == null || GamePreset.isWarmup) {
      return const SizedBox.shrink();
    }
    return ValueListenableBuilder<({String gameId, int level, int stars})?>(
      valueListenable: LevelLadder.lastWin,
      builder: (context, win, _) {
        final ladder = LevelLadder.current;
        if (win == null ||
            ladder == null ||
            ladder.gameId != win.gameId ||
            win.level != widget.level) {
          return const SizedBox.shrink();
        }
        final open = GameShell.levelMapForVictory(context, ladder);
        if (open == null) return const SizedBox.shrink();
        return Padding(
          padding: EdgeInsets.only(top: compact ? 0 : 8),
          child: VictoryLevelTrail(
            played: win.level,
            current: ladder.level,
            stars: win.stars,
            openMap: () => _openMap(open),
          ),
        );
      },
    );
  }

  String get _title {
    if (widget.report case final report?) return report.title;
    if (!widget.passed) return L.t('sameLevelRetry');
    final n = widget.level;
    return n == null ? L.t('done') : L.t('levelDone').replaceAll('{n}', '$n');
  }

  String get _primaryLabel =>
      widget.nextLabel ??
      (widget.passed
          ? (widget.level == null
                ? L.t('nextLabel')
                : '${L.t('nextLabel')} · ${L.t('label_level_short')} ${widget.level! + 1}')
          : L.t('retry'));

  /// Звёзды ЭТОЙ партии — из последней засчитанной победы на экране ([LevelLadder.lastWin]). Итог может
  /// открыться раньше, чем игра засчитает победу (у «Шульте» — так): строка подписана и появится, когда
  /// победа записана. Нет засчитанной победы этого уровня (разбор, переигровка) — строки нет.
  Widget _starsRow(Color color) {
    final report = widget.report;
    if (report?.awardStars case final award?) {
      final stars = award.clamp(0, 3);
      return Text(
        '★' * stars + '☆' * (3 - stars),
        key: report!.starsKey,
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 34, letterSpacing: 6, color: color),
      );
    }
    if (!widget.passed || widget.level == null) return const SizedBox.shrink();
    return ValueListenableBuilder<({String gameId, int level, int stars})?>(
      valueListenable: LevelLadder.lastWin,
      builder: (_, last, _) {
        if (last == null || last.level != widget.level) {
          return const SizedBox.shrink();
        }
        return Text(
          '★' * last.stars + '☆' * (3 - last.stars),
          key: const Key('level-result-stars'),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 34, letterSpacing: 6, color: color),
        );
      },
    );
  }

  /// Значок исхода: победа — звезда с искрами (решение Дениса 13.11, пилот `reward_effects.dart`
  /// у всех игр), провал — значок «ещё раз».
  Widget _badge(double size, Color won, Color lost) {
    if (widget.report case final report?) {
      return Icon(
        report.icon,
        size: size,
        color: report.awardStars == null ? lost : won,
      );
    }
    if (!widget.passed) {
      return Icon(Icons.replay_circle_filled_rounded, size: size, color: lost);
    }
    if (!LevelResult.effects) {
      return Icon(Icons.emoji_events_rounded, size: size, color: won);
    }
    return SizedBox(
      width: size * 2.2,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          RewardStar(
            key: const Key('level-result-star'),
            enabled: true,
            size: size,
          ),
          const Positioned.fill(
            child: VictorySparks(
              key: Key('level-result-sparks'),
              enabled: true,
            ),
          ),
        ],
      ),
    );
  }

  Widget _progress(Color color) => _auto
      ? AnimatedBuilder(
          animation: _countdown,
          builder: (_, _) => LinearProgressIndicator(
            key: const Key('level-result-countdown'),
            value: _countdown.value,
            minHeight: 4,
            color: color,
            backgroundColor: color.withValues(alpha: 0.18),
          ),
        )
      : const SizedBox.shrink();

  @override
  Widget build(BuildContext context) {
    if (widget.layout == GameOutcomeLayout.inline) return _inline(context);
    final frame = AuroraFrame.of(context);
    final body = frame != null || ChromeArt.aurora(context)
        ? Theme(
            data: frame ?? Theme.of(context),
            child: Builder(builder: _aurora),
          )
        : _classic(context);
    // Тап по итогу — сразу дальше (кнопки забирают свой тап сами).
    return GestureDetector(
      key: const Key('level-result'),
      behavior: HitTestBehavior.translucent,
      onTap: widget.onNext == null || !_winReady(widget)
          ? null
          : () => _go(widget.onNext),
      child: body,
    );
  }

  /// Solved boards and undoable games keep their field; presentation and
  /// primary navigation still go through the same adapter and countdown.
  Widget _inline(BuildContext context) => Padding(
    key: const Key('game-outcome-inline'),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          _title,
          key: widget.titleKey ?? const Key('level-result-title'),
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        if (widget.score case final score?)
          Text(score, textAlign: TextAlign.center),
        ?widget.details,
        if (widget.nextUnavailable case final unavailable?)
          LevelResultNotice(unavailable: unavailable),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _trail(compact: true),
            if (_primaryAction() case final action?)
              _classicAction(action, primary: true),
            for (final action
                in widget.report?.moreActions ?? <GameResultAction>[])
              _classicAction(action, primary: false),
          ],
        ),
        if (_auto) _progress(Theme.of(context).colorScheme.primary),
      ],
    ),
  );

  Widget _aurora(BuildContext context) {
    final roles = GameColors.aurora(Theme.of(context).brightness);
    return GameResultPanel(
      won: widget.passed || widget.report?.awardStars != null,
      title: _title,
      titleKey: widget.titleKey,
      subtitle: widget.score,
      stats: widget.report?.stats ?? const [],
      hero: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _badge(110, roles.reward, roles.muted),
          _starsRow(roles.reward),
        ],
      ),
      board: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _trail(),
          ?widget.details,
          if (widget.nextUnavailable case final unavailable?)
            LevelResultNotice(unavailable: unavailable),
          if (_auto) ...[const SizedBox(height: 10), _progress(roles.selected)],
        ],
      ),
      primary: _primaryAction(),
      pair: [
        if (widget.onSettings != null)
          GameResultAction(
            key: widget.settingsKey ?? const Key('level-result-settings'),
            label: widget.settingsLabel ?? L.t('settings'),
            icon: Icons.tune_rounded,
            onTap: () => _go(widget.onSettings),
          ),
        _exitAction(context),
      ],
      extra: widget.report?.moreActions ?? const [],
    );
  }

  GameResultAction? _primaryAction() {
    if (widget.report case final report?) {
      return report.action == null ? null : _oneShot(report.action!);
    }
    if (widget.onNext == null) return null;
    return GameResultAction(
      key: widget.nextKey ?? const Key('level-result-next'),
      label: _primaryLabel,
      icon: widget.passed ? Icons.arrow_forward_rounded : Icons.replay,
      trailing: widget.passed,
      onTap: _winReady(widget) ? () => _go(widget.onNext) : null,
    );
  }

  GameResultAction _oneShot(GameResultAction action) => GameResultAction(
    key: action.key,
    label: action.label,
    icon: action.icon,
    trailing: action.trailing,
    onTap: action.onTap == null ? null : () => _go(action.onTap),
  );

  GameResultAction _exitAction(BuildContext context) => _oneShot(
    widget.report?.exit ??
        GameResultAction(
          key: const Key('level-result-leave'),
          label: L.t('pauseExitGame'),
          icon: Icons.exit_to_app,
          onTap: () => GameShell.leaveFrom(context),
        ),
  );

  Widget _classicAction(GameResultAction action, {required bool primary}) =>
      primary
      ? FilledButton.icon(
          key: action.key,
          onPressed: action.onTap,
          icon: Icon(action.icon),
          label: Text(action.label),
        )
      : OutlinedButton.icon(
          key: action.key,
          onPressed: action.onTap,
          icon: Icon(action.icon),
          label: Text(action.label),
        );

  Widget _classic(BuildContext context) {
    final theme = Theme.of(context);
    final roles = GameColors.of(context);
    final exit = _exitAction(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(child: _badge(64, roles.reward, roles.muted)),
            _starsRow(roles.reward),
            const SizedBox(height: 8),
            Text(
              _title,
              key: widget.titleKey ?? const Key('level-result-title'),
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge,
            ),
            if (widget.score != null) ...[
              const SizedBox(height: 8),
              Text(
                widget.score!,
                key: const Key('level-result-score'),
                textAlign: TextAlign.center,
              ),
            ],
            _trail(),
            if (widget.report case final report? when report.stats.isNotEmpty)
              _classicStats(report.stats, roles.reward),
            if (widget.details != null) ...[
              const SizedBox(height: 12),
              widget.details!,
            ],
            const SizedBox(height: 20),
            if (widget.nextUnavailable case final unavailable?)
              LevelResultNotice(unavailable: unavailable),
            if (_auto) ...[
              _progress(theme.colorScheme.primary),
              const SizedBox(height: 10),
            ],
            if (_primaryAction() case final action?)
              _classicAction(action, primary: true),
            for (final action
                in widget.report?.moreActions ?? <GameResultAction>[])
              _classicAction(action, primary: false),
            const SizedBox(height: 6),
            Row(
              children: [
                if (widget.onSettings != null)
                  Expanded(
                    child: TextButton.icon(
                      key:
                          widget.settingsKey ??
                          const Key('level-result-settings'),
                      onPressed: () => _go(widget.onSettings),
                      icon: const Icon(Icons.tune_rounded),
                      label: Text(widget.settingsLabel ?? L.t('settings')),
                    ),
                  ),
                Expanded(
                  child: TextButton.icon(
                    key: exit.key,
                    onPressed: exit.onTap,
                    icon: Icon(exit.icon),
                    label: Text(exit.label, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _classicStats(List<GameResultStat> stats, Color reward) => Wrap(
    alignment: WrapAlignment.center,
    spacing: 12,
    runSpacing: 8,
    children: [
      for (final stat in stats)
        SizedBox(
          key: stat.key,
          width: 140,
          child: Column(
            children: [
              Icon(stat.icon, color: stat.iconColor ?? reward),
              Text(stat.value, textAlign: TextAlign.center),
              Text(stat.label, textAlign: TextAlign.center),
            ],
          ),
        ),
    ],
  );
}
