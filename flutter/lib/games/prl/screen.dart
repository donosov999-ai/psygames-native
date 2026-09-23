/// PRL — «Смена правил», четырнадцатый экран раздела «Конфликт внимания».
///
/// 🔴 ПРАВИЛО НАЗВАНО СРАЗУ, ДО ПЕРВОЙ ПРОБЫ. Отчёт тестировщицы 15.08.2026:
/// «Что значит скрытно меняется? Как угадать???? Что за тупая игра». Игра,
/// смысл которой не назван, читается как издевательство — поэтому подсказка
/// «угадывать не нужно, нужно замечать» стоит на экране готовности с первого
/// уровня, а не с какого-то порога.
///
/// ⚠️ САМ РАЗВОРОТ ЧЕЛОВЕКУ НЕ ПОКАЗЫВАЕТСЯ — в этом вся проба. На экране нет
/// ни отметки «правило сменилось», ни подсветки «хорошей» карточки: заметить
/// смену можно только по обратной связи.
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

enum PrlPhase { ready, playing, done }

/// Сколько держится исход, мс. Из веб-версии.
const int prlFeedbackMs = 600;

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool prlAutostart = bool.fromEnvironment('AUTOSTART');

class PrlScreen extends StatefulWidget {
  const PrlScreen({super.key, required this.state, this.classic = false, this.preset, this.rnd});

  final SharedState state;

  /// Классический режим: пресет вместо лестницы, исхода нет.
  final bool classic;
  final String? preset;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  @override
  State<PrlScreen> createState() => _PrlScreenState();
}

class _PrlScreenState extends State<PrlScreen> {
  late LevelLadder _ladder;
  PrlGame? _game;
  PrlPhase _phase = PrlPhase.ready;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'prl', store: SharedLevelStore(widget.state), maxLevel: prlMaxLevel);
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_reset);
    if (prlAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = PrlGame(
      level: _ladder.level,
      classic: widget.classic,
      preset: widget.classic ? (prlClassicPresets[widget.preset ?? 'medium'] ?? prlClassicPresets['medium']) : null,
      rnd: widget.rnd,
    );
    _phase = PrlPhase.ready;
  }

  void _start() {
    _game!.begin();
    setState(() => _phase = PrlPhase.playing);
  }

  void _choose(Choice c) {
    if (_phase != PrlPhase.playing) return;
    final g = _game!;
    if (g.choose(c) == null) return;
    setState(() {});
    _timer = Timer(Duration(milliseconds: g.params.feedbackDelayMs), () {
      if (!mounted) return;
      setState(g.revealPending);
      _timer = Timer(const Duration(milliseconds: prlFeedbackMs), () {
        if (!mounted) return;
        setState(g.closeTrial);
        if (g.finished) _finish();
      });
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    setState(() => _phase = PrlPhase.done);
    // ⚠️ В классике лестницы нет вовсе: партия не двигает уровень ни в какую
    // сторону, потому что там нет и уровня.
    if (widget.classic) return;
    final errors = g.metrics.totalErrors;
    if (g.passed) {
      _ladder.win(score: g.bank < 0 ? 0 : g.bank, errors: errors);
    } else {
      _ladder.fail(score: g.bank < 0 ? 0 : g.bank, errors: errors);
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('prl'),
      hud: [
        if (!widget.classic) HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.trials.length}/${g.params.trialsTotal}', icon: Icons.repeat),
        HudItem(label: L.t('hud_bank'), value: '${g.bank}', icon: Icons.account_balance_wallet_outlined),
        // Число разворотов показывается ПОСТФАКТУМ: сам момент смены — нет.
        HudItem(label: L.t('hud_reversals'), value: '${g.blockIndex}', icon: Icons.swap_horiz),
      ],
      field: (context, h) => _Field(
        game: g,
        classic: widget.classic,
        phase: _phase,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == PrlPhase.playing ? _Choices(onPick: _choose) : null,
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.classic,
    required this.phase,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final PrlGame game;
  final bool classic;
  final PrlPhase phase;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case PrlPhase.ready:
        final p = game.params;
        return _Centered(
          height: height,
          children: [
            Text(L.t('prl'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            // 🔴 Правило — СРАЗУ: «угадывать не нужно, нужно замечать».
            Text(L.t('lr_prl_reversal_title'),
                key: const Key('prl-rule'),
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(L.t('prlHint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('prlLvlParams')
                  .replaceAll('{n}', '${p.trialsTotal}')
                  .replaceAll('{p}', '${(p.rewardProb * 100).round()}')
                  .replaceAll('{a}', '${p.revMin}')
                  .replaceAll('{b}', '${p.revMax}'),
              key: const Key('prl-params'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case PrlPhase.done:
        final m = game.metrics;
        return _Centered(
          height: height,
          children: [
            Text(
              // В классике исхода нет: показываем числа, а не вердикт.
              classic
                  ? '${L.t('hud_bank')}: ${game.bank}'
                  : (game.passed ? L.t('levelDone').replaceAll('{n}', '${game.level}') : L.t('sameLevelRetry')),
              key: const Key('prl-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_bank')}: ${game.bank} · ${L.t('hud_reversals')}: ${m.reversals}'),
            Text(L.t('prlPass'), style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('start'))),
          ],
        );
      case PrlPhase.playing:
        final t = game.pending;
        final revealed = t != null && game.revealed;
        return SizedBox(
          height: height,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${L.t('hud_bank')}: ${game.bank}',
                    key: const Key('prl-live-bank'),
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800)),
                const SizedBox(height: 24),
                // Пока задержка идёт, коробка исхода ПУСТА — в этом ось сложности.
                SizedBox(
                  height: 72,
                  child: revealed
                      ? Icon(
                          t.rewarded ? Icons.add_circle : Icons.remove_circle,
                          key: Key(t.rewarded ? 'prl-reward' : 'prl-punish'),
                          size: 56,
                          color: t.rewarded ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                        )
                      : const SizedBox.shrink(key: Key('prl-waiting')),
                ),
                const SizedBox(height: 8),
                // ⚠️ Ни отметки «правило сменилось», ни подсветки «хорошей»
                // карточки на поле нет: заметить смену можно только по исходам.
                Text(L.t('prlNote'),
                    style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
              ],
            ),
          ),
        );
    }
  }
}

class _Centered extends StatelessWidget {
  const _Centered({required this.height, required this.children});
  final double height;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: children),
          ),
        ),
      );
}

class _Choices extends StatelessWidget {
  const _Choices({required this.onPick});
  final void Function(Choice) onPick;

  /// Цвета карточек постоянны и к правилу отношения не имеют: «хорошая»
  /// карточка меняется, а цвет — нет, иначе разворот читался бы с экрана.
  static const _colors = {Choice.a: Color(0xFF3B82F6), Choice.b: Color(0xFFF59E0B)};

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            for (final c in Choice.values)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: TapLatency(
                    where: 'Flutter/PRL',
                    child: SizedBox(
                      height: 56,
                      child: FilledButton(
                        key: Key('prl-choice-${c.name}'),
                        // Кнопки остаются нажимаемыми и во время задержки: замок
                        // держит модель. Гасить их значило бы подсказывать, что
                        // ход уже принят.
                        onPressed: () => onPick(c),
                        style: FilledButton.styleFrom(backgroundColor: _colors[c], padding: EdgeInsets.zero),
                        child: const SizedBox.shrink(),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}
