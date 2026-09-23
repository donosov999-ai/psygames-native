import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

/// «Цвет против позиции» (проба Саймона) на Flutter.
///
/// Два срока подряд, как у «Стрелок»: пауза перед стимулом (preMin + дрожание),
/// потом окно ответа уровня. Просрочка — ошибка. Таймеры умирают с экраном.
enum SimonPhase { ready, playing, done }

/// Порог прохода уровня — 80 % верных, как в веб-версии.
const double simonPassAccuracy = 0.8;

/// Партия начинается сама (флаг сборки AUTOSTART) — нужен замеру отклика.
const bool simonAutostart = bool.fromEnvironment('AUTOSTART');

/// Пауза на отклик между пробами, мс — то же число, что в веб-версии.
const int simonFeedbackMs = 350;

class SimonScreen extends StatefulWidget {
  const SimonScreen({super.key, required this.state, this.clock, this.rnd});

  final SharedState state;

  /// Часы для замеров и проб. Не заданы — настоящие.
  final int Function()? clock;

  /// Случайность. Не задана — настоящая; пробе нужна заданная.
  final Random? rnd;

  @override
  State<SimonScreen> createState() => _SimonScreenState();
}

class _SimonScreenState extends State<SimonScreen> {
  late LevelLadder _ladder;
  SimonGame? _game;
  SimonPhase _phase = SimonPhase.ready;
  SimonOutcome? _flash;
  Timer? _timer;
  bool _passed = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'simon', store: SharedLevelStore(widget.state));
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
    if (simonAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = SimonGame(level: _ladder.level, nowMs: widget.clock, rnd: widget.rnd);
    _phase = SimonPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    setState(() {
      _phase = SimonPhase.playing;
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
      if (!mounted || _phase != SimonPhase.playing) return;
      setState(g.showStimulus);
      measureStimulusFrame('Flutter/Саймон');
      _timer = Timer(Duration(milliseconds: g.params.windowMs), () {
        if (!mounted || _phase != SimonPhase.playing) return;
        _after(g.timeout());
      });
    });
  }

  void _answer(SimonSide side) {
    final g = _game;
    if (g == null || _phase != SimonPhase.playing || !g.stimulusShown) return;
    _after(g.answer(side));
  }

  void _after(SimonOutcome outcome) {
    _timer?.cancel();
    setState(() => _flash = outcome);
    _timer = Timer(const Duration(milliseconds: simonFeedbackMs), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    final passed = g.accuracy >= simonPassAccuracy;
    setState(() {
      _phase = SimonPhase.done;
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
      title: 'Цвет против позиции',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Проба', value: '${g.round}/${g.trialsTotal}', icon: Icons.numbers),
        HudItem(label: 'Верно', value: '${g.hits}', icon: Icons.check),
        HudItem(label: 'Реакция', value: '${g.meanRtMs ?? 0} мс', icon: Icons.bolt),
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
      toolbar: _phase == SimonPhase.playing ? _Answers(onPick: _answer) : null,
    );
  }
}

Color _hex(String hex) => Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFEF4444);

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

  final SimonGame game;
  final SimonPhase phase;
  final SimonOutcome? flash;
  final bool passed;

  /// Высота поля приходит числом от каркаса.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case SimonPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('Уровень ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const Text('Синий — левая кнопка, красный — правая. Сторона, где вспыхнул квадрат, не важна.',
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              'Проб: ${game.trialsTotal} · окно ответа ${game.params.windowMs} мс',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: const Text('Начать')),
          ],
        );
      case SimonPhase.done:
        final effect = game.simonEffectMs;
        return _Centered(
          height: height,
          children: [
            Text(passed ? 'Уровень пройден' : 'Уровень не пройден',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('Верно ${game.hits} из ${game.trialsTotal} · ошибок ${game.errors}'),
            Text(game.meanRtMs == null
                ? 'Среднее время: нет верных проб'
                : 'Среднее время: ${game.meanRtMs} мс'),
            Text(effect == null
                ? 'Эффект Саймона: не набрано обеих половин'
                : 'Эффект Саймона: $effect мс'),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: const Text('Ещё раз')),
          ],
        );
      case SimonPhase.playing:
        final t = game.trial!;
        final border = switch (flash) {
          SimonOutcome.hit => _good,
          SimonOutcome.wrong => _bad,
          SimonOutcome.miss => _bad,
          null => Theme.of(context).dividerColor,
        };
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Поле стимула ШИРОКОЕ: квадрат вспыхивает слева или справа от центра,
              // и именно эта сторона мешает ответу по цвету.
              Container(
                height: 160,
                margin: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: border, width: flash == null ? 1 : 3),
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Крестик фиксации: человек знает, куда смотреть до стимула.
                    Opacity(
                      opacity: 0.4,
                      child: Text('+', style: Theme.of(context).textTheme.headlineSmall),
                    ),
                    if (game.stimulusShown)
                      Align(
                        alignment: t.position == SimonSide.left ? Alignment.centerLeft : Alignment.centerRight,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 30),
                          child: Container(
                            key: Key('simon-stimulus-${t.position.name}'),
                            width: 64,
                            height: 64,
                            decoration: BoxDecoration(
                              color: _hex(t.color == SimonColor.blue ? simonBlueHex : simonRedHex),
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              const Text('Синий — влево, красный — вправо'),
              const SizedBox(height: 12),
              SizedBox(
                height: 28,
                child: switch (flash) {
                  SimonOutcome.hit => const Icon(Icons.check_circle, color: _good, key: Key('simon-hit')),
                  SimonOutcome.wrong => const Icon(Icons.cancel, color: _bad, key: Key('simon-wrong')),
                  SimonOutcome.miss => const Icon(Icons.timer_off, color: _bad, key: Key('simon-miss')),
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

/// Кнопки ответа: синяя слева, красная справа.
///
/// ⚠️ RTL-ПИН. Стимул ставится физическими сторонами и не зеркалится, поэтому и
/// кнопки обязаны остаться физически на своих местах: зеркальная раскладка
/// ИНВЕРТИРОВАЛА БЫ согласованность проб — конфликтные стали бы согласованными.
class _Answers extends StatelessWidget {
  const _Answers({required this.onPick});
  final void Function(SimonSide) onPick;

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.ltr,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Row(
            children: [
              for (final side in SimonSide.values)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: TapLatency(
                      where: 'Flutter/Саймон',
                      child: SizedBox(
                        height: 56,
                        child: FilledButton(
                          key: Key('simon-answer-${side.name}'),
                          onPressed: () => onPick(side),
                          style: FilledButton.styleFrom(
                            backgroundColor: _hex(side == SimonSide.left ? simonBlueHex : simonRedHex),
                            foregroundColor: Colors.white,
                          ),
                          child: Icon(
                            side == SimonSide.left ? Icons.arrow_back : Icons.arrow_forward,
                            size: 32,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}
