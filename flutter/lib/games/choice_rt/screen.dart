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

/// «Выбор-реакция» на Flutter.
///
/// 🔴 КРЕСТОВИНА РИСУЕТ ВСЕ ЧЕТЫРЕ ПОЗИЦИИ ВСЕГДА, неактивные — пустыми. Это не
/// украшение, а условие меры: если при двух вариантах кнопки стоят ближе, чем при
/// четырёх, в замер влезает закон Фиттса (время ∝ log₂(2D/W)), и наклон Хика выйдет
/// смесью двух законов. Расстояние до любой живой кнопки обязано не зависеть от их числа.
enum ChoiceRtPhase { ready, playing, done }

/// Порог прохода уровня — 80 % верных, как в веб-версии.
const double choiceRtPassAccuracy = 0.8;

/// Партия начинается сама (флаг сборки AUTOSTART) — нужен замеру отклика.
const bool choiceRtAutostart = bool.fromEnvironment('AUTOSTART');

/// Пауза на отклик между пробами, мс — то же число, что в веб-версии.
const int choiceRtFeedbackMs = 350;

class ChoiceRtScreen extends StatefulWidget {
  const ChoiceRtScreen({super.key, required this.state, this.clock, this.rnd});

  final SharedState state;

  /// Часы для замеров и проб. Не заданы — настоящие.
  final int Function()? clock;

  /// Случайность. Не задана — настоящая; пробе нужна заданная.
  final Random? rnd;

  @override
  State<ChoiceRtScreen> createState() => _ChoiceRtScreenState();
}

class _ChoiceRtScreenState extends State<ChoiceRtScreen> {
  late LevelLadder _ladder;
  ChoiceRtGame? _game;
  ChoiceRtPhase _phase = ChoiceRtPhase.ready;
  ChoiceOutcome? _flash;
  Timer? _timer;
  bool _passed = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'choice_rt', store: SharedLevelStore(widget.state));
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
    if (choiceRtAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = ChoiceRtGame(level: _ladder.level, nowMs: widget.clock, rnd: widget.rnd);
    _phase = ChoiceRtPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    setState(() {
      _phase = ChoiceRtPhase.playing;
      _flash = null;
    });
    _game!.begin();
    _nextTrial();
  }

  void _nextTrial() {
    final g = _game!;
    _timer?.cancel();
    if (!g.nextTrial()) {
      _finish();
      return;
    }
    setState(() {});
    _timer = Timer(Duration(milliseconds: g.preDelayMs), () {
      if (!mounted || _phase != ChoiceRtPhase.playing) return;
      setState(g.showStimulus);
      measureStimulusFrame('Flutter/ChoiceRt');
      _timer = Timer(Duration(milliseconds: g.params.windowMs), () {
        if (!mounted || _phase != ChoiceRtPhase.playing) return;
        _after(g.timeout());
      });
    });
  }

  void _answer(ChoiceDirection d) {
    final g = _game;
    if (g == null || _phase != ChoiceRtPhase.playing || !g.stimulusShown) return;
    _after(g.answer(d));
  }

  void _after(ChoiceOutcome outcome) {
    _timer?.cancel();
    setState(() => _flash = outcome);
    _timer = Timer(const Duration(milliseconds: choiceRtFeedbackMs), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    final passed = g.accuracy >= choiceRtPassAccuracy;
    setState(() {
      _phase = ChoiceRtPhase.done;
      _passed = passed;
    });
    if (passed) {
      _ladder.win();
    } else {
      _ladder.fail();
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      // Тексты — из общего словаря теми же ключами, что зовёт веб-версия игры.
      title: L.t('choiceRt'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.numbers),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('reaction'), value: '${g.meanRtMs ?? 0}', icon: Icons.bolt),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        flash: _flash,
        passed: _passed,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == ChoiceRtPhase.playing ? _Pad(game: g, onPick: _answer) : null,
    );
  }
}

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFEF4444);

/// Знак направления: три начертания, одно на уровень.
IconData _glyphIcon(ChoiceGlyph glyph, ChoiceDirection d) {
  switch (glyph) {
    case ChoiceGlyph.arrow:
      return switch (d) {
        ChoiceDirection.left => Icons.arrow_back,
        ChoiceDirection.right => Icons.arrow_forward,
        ChoiceDirection.up => Icons.arrow_upward,
        ChoiceDirection.down => Icons.arrow_downward,
      };
    case ChoiceGlyph.chevron:
      return switch (d) {
        ChoiceDirection.left => Icons.chevron_left,
        ChoiceDirection.right => Icons.chevron_right,
        ChoiceDirection.up => Icons.expand_less,
        ChoiceDirection.down => Icons.expand_more,
      };
    case ChoiceGlyph.bracket:
      return switch (d) {
        ChoiceDirection.left => Icons.first_page,
        ChoiceDirection.right => Icons.last_page,
        ChoiceDirection.up => Icons.vertical_align_top,
        ChoiceDirection.down => Icons.vertical_align_bottom,
      };
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.flash,
    required this.passed,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final ChoiceRtGame game;
  final ChoiceRtPhase phase;
  final ChoiceOutcome? flash;
  final bool passed;

  /// Высота поля приходит числом от каркаса.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case ChoiceRtPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('choiceRtHint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('choiceRtLvlParams')
                  .replaceAll('{n}', '${game.trialsTotal}')
                  .replaceAll('{d}', '${game.params.dirs.length}')
                  .replaceAll('{w}', (game.params.windowMs / 1000).toStringAsFixed(1)),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(L.t('passCorrect80Window'),
                style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case ChoiceRtPhase.done:
        return _Centered(
          height: height,
          children: [
            Text(
              passed
                  ? L.t('levelDone').replaceAll('{n}', '${game.level}')
                  : L.t('sameLevelRetry'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: ${game.hits}/${game.trialsTotal} · '
                '${L.t('hud_errors')}: ${game.errors}'),
            Text(game.meanRtMs == null
                ? '${L.t('meanReaction')}: —'
                : '${L.t('meanReaction')}: ${game.meanRtMs} ${L.t('msShort')}'),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case ChoiceRtPhase.playing:
        final border = switch (flash) {
          ChoiceOutcome.hit => _good,
          ChoiceOutcome.heldOnNeutral => _good,
          null => Theme.of(context).dividerColor,
          _ => _bad,
        };
        final stim = game.stimulus;
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: border, width: flash == null ? 1 : 3),
                ),
                child: Center(
                  child: !game.stimulusShown
                      // До показа — точка фиксации.
                      ? const Text('•', style: TextStyle(fontSize: 36))
                      : stim == null
                          // Нейтраль — полноправный стимул, а не отсутствие стимула:
                          // круг означает «жать нельзя».
                          ? Icon(Icons.circle_outlined,
                              key: const Key('choicert-neutral'),
                              size: 72,
                              color: Theme.of(context).colorScheme.onSurface)
                          : Icon(_glyphIcon(game.params.glyph, stim),
                              key: Key('choicert-stim-${stim.name}'),
                              size: 72,
                              color: Theme.of(context).colorScheme.onSurface),
                ),
              ),
              const SizedBox(height: 12),
              Text(L.t('choiceRtHint'), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              SizedBox(
                height: 28,
                child: switch (flash) {
                  ChoiceOutcome.hit => const Icon(Icons.check_circle, color: _good, key: Key('choicert-hit')),
                  ChoiceOutcome.heldOnNeutral =>
                    const Icon(Icons.check_circle, color: _good, key: Key('choicert-held')),
                  ChoiceOutcome.falseAlarm =>
                    const Icon(Icons.cancel, color: _bad, key: Key('choicert-false-alarm')),
                  ChoiceOutcome.wrong => const Icon(Icons.cancel, color: _bad, key: Key('choicert-wrong')),
                  ChoiceOutcome.miss => const Icon(Icons.timer_off, color: _bad, key: Key('choicert-miss')),
                  null => const SizedBox.shrink(),
                },
              ),
            ],
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

/// Крестовина «перевёрнутой Т»: вверх сверху, влево-вниз-вправо снизу.
///
/// 🔴 ВСЕ ЧЕТЫРЕ ПОЗИЦИИ ЗАНЯТЫ ВСЕГДА. Неактивное направление рисуется ПУСТЫМ
/// местом того же размера, а не исчезает: иначе расстояние до живых кнопок
/// зависело бы от их числа, и в наклон Хика влез бы закон Фиттса.
/// ⚠️ RTL-пин: раскладка физическая, не зеркалится — сторона ответа обязана
/// совпадать со стороной знака.
class _Pad extends StatelessWidget {
  const _Pad({required this.game, required this.onPick});

  final ChoiceRtGame game;
  final void Function(ChoiceDirection) onPick;

  static const double _cell = 64;

  Widget _slot(BuildContext context, ChoiceDirection d) {
    final live = game.activeDirs.contains(d);
    if (!live) {
      return const SizedBox(key: Key('choicert-empty'), width: _cell, height: _cell);
    }
    return TapLatency(
      where: 'Flutter/ChoiceRt',
      child: SizedBox(
        width: _cell,
        height: _cell,
        child: FilledButton(
          key: Key('choicert-answer-${d.name}'),
          onPressed: () => onPick(d),
          style: FilledButton.styleFrom(padding: EdgeInsets.zero),
          child: Icon(_glyphIcon(game.params.glyph, d), size: 28),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.ltr,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _slot(context, ChoiceDirection.up),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _slot(context, ChoiceDirection.left),
                  const SizedBox(width: 8),
                  _slot(context, ChoiceDirection.down),
                  const SizedBox(width: 8),
                  _slot(context, ChoiceDirection.right),
                ],
              ),
            ],
          ),
        ),
      );
}
