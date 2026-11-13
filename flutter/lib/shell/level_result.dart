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
import 'game_colors.dart';
import 'game_preset.dart';
import 'game_shell.dart';
import 'l10n.dart';
import 'level_ladder.dart';
import 'reward_effects.dart';
import 'ui_kit/game_result.dart';

class LevelResult extends StatefulWidget {
  const LevelResult({
    super.key,
    required this.passed,
    required this.onNext,
    this.level,
    this.score,
    this.details,
    this.onSettings,
    this.auto = true,
  });

  /// Уровень пройден (иначе — «Ещё раз» на том же).
  final bool passed;

  /// Сыгранный уровень — для заголовка «Уровень N пройден!» и звёзд. Нет лестницы — `null`.
  final int? level;

  /// Счёт партии строкой, как его пишет игра («Верно: 9 / 10 · Ошибок: 1»).
  final String? score;

  /// Своё у игры под счётом: разбор ответов, рекорд, подсказка. Не кнопки «Дальше» — их рисует каркас.
  final Widget? details;

  /// Старт следующей партии: после победы — следующий уровень, после провала — тот же.
  final VoidCallback onNext;

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

class _LevelResultState extends State<LevelResult> with SingleTickerProviderStateMixin {
  late final AnimationController _countdown = AnimationController(
    vsync: this,
    duration: widget.passed ? LevelResult.winDelay : LevelResult.failDelay,
  );
  bool _gone = false;
  Future<Map<int, int>>? _stars;

  bool get _auto => widget.auto && LevelResult.autoAdvance && !GamePreset.isWarmup;

  @override
  void initState() {
    super.initState();
    final ladder = LevelLadder.current;
    if (widget.passed && widget.level != null && ladder != null) _stars = ladder.stars();
    _countdown.addStatusListener((s) {
      if (s == AnimationStatus.completed) _go(widget.onNext);
    });
    if (_auto) _countdown.forward();
  }

  @override
  void dispose() {
    _countdown.dispose();
    super.dispose();
  }

  /// Один уход с итога: автопереход, тап и кнопка не срабатывают дважды.
  void _go(VoidCallback? action) {
    if (_gone || action == null || !mounted) return;
    _gone = true;
    _countdown.stop();
    action();
  }

  String get _title {
    if (!widget.passed) return L.t('sameLevelRetry');
    final n = widget.level;
    return n == null ? L.t('done') : L.t('levelDone').replaceAll('{n}', '$n');
  }

  String get _primaryLabel => widget.passed
      ? (widget.level == null
            ? L.t('nextLabel')
            : '${L.t('nextLabel')} · ${L.t('label_level_short')} ${widget.level! + 1}')
      : L.t('retry');

  Widget _starsRow(Color color) => _stars == null
      ? const SizedBox.shrink()
      : FutureBuilder<Map<int, int>>(
          future: _stars,
          builder: (_, s) {
            // Звёзды ЭТОЙ партии — у лестницы сразу (запись в хранилище ещё может идти); нет их — лучшее
            // из хранилища.
            final last = LevelLadder.current?.lastStars;
            final n = (last != null && last.level == widget.level ? last.stars : s.data?[widget.level] ?? 0).clamp(0, 3);
            return Text(
              '★' * n + '☆' * (3 - n),
              key: const Key('level-result-stars'),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 34, letterSpacing: 6, color: color),
            );
          },
        );

  /// Значок исхода: победа — звезда с искрами (решение Дениса 13.11, пилот `reward_effects.dart`
  /// у всех игр), провал — значок «ещё раз».
  Widget _badge(double size, Color won, Color lost) {
    if (!widget.passed) return Icon(Icons.replay_circle_filled_rounded, size: size, color: lost);
    if (!LevelResult.effects) return Icon(Icons.emoji_events_rounded, size: size, color: won);
    return SizedBox(
      width: size * 2.2,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          RewardStar(key: const Key('level-result-star'), enabled: true, size: size),
          const Positioned.fill(child: VictorySparks(key: Key('level-result-sparks'), enabled: true)),
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
      onTap: () => _go(widget.onNext),
      child: body,
    );
  }

  Widget _aurora(BuildContext context) {
    final roles = GameColors.aurora(Theme.of(context).brightness);
    return GameResultPanel(
      won: widget.passed,
      title: _title,
      subtitle: widget.score,
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
          ?widget.details,
          if (_auto) ...[const SizedBox(height: 10), _progress(roles.selected)],
        ],
      ),
      primary: GameResultAction(
        key: const Key('level-result-next'),
        label: _primaryLabel,
        icon: widget.passed ? Icons.arrow_forward_rounded : Icons.replay,
        trailing: widget.passed,
        onTap: () => _go(widget.onNext),
      ),
      pair: [
        if (widget.onSettings != null)
          GameResultAction(
            key: const Key('level-result-settings'),
            label: L.t('settings'),
            icon: Icons.tune_rounded,
            onTap: () => _go(widget.onSettings),
          ),
        GameResultAction(
          key: const Key('level-result-leave'),
          label: L.t('pauseExitGame'),
          icon: Icons.exit_to_app,
          onTap: () => _go(() => GameShell.leaveFrom(context)),
        ),
      ],
    );
  }

  Widget _classic(BuildContext context) {
    final theme = Theme.of(context);
    final roles = GameColors.of(context);
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
              key: const Key('level-result-title'),
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge,
            ),
            if (widget.score != null) ...[
              const SizedBox(height: 8),
              Text(widget.score!, key: const Key('level-result-score'), textAlign: TextAlign.center),
            ],
            if (widget.details != null) ...[const SizedBox(height: 12), widget.details!],
            const SizedBox(height: 20),
            if (_auto) ...[_progress(theme.colorScheme.primary), const SizedBox(height: 10)],
            FilledButton.icon(
              key: const Key('level-result-next'),
              onPressed: () => _go(widget.onNext),
              icon: Icon(widget.passed ? Icons.arrow_forward_rounded : Icons.replay),
              label: Text(_primaryLabel),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                if (widget.onSettings != null)
                  Expanded(
                    child: TextButton.icon(
                      key: const Key('level-result-settings'),
                      onPressed: () => _go(widget.onSettings),
                      icon: const Icon(Icons.tune_rounded),
                      label: Text(L.t('settings')),
                    ),
                  ),
                Expanded(
                  child: TextButton.icon(
                    key: const Key('level-result-leave'),
                    onPressed: () => _go(() => GameShell.leaveFrom(context)),
                    icon: const Icon(Icons.exit_to_app),
                    label: Text(L.t('pauseExitGame'), overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
