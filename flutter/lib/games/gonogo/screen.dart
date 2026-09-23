import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

/// «Жми и держись» (go/no-go) на Flutter.
///
/// ⚠️ ОТВЕТ — НАЖАТИЕ ПО САМОМУ ПОЛЮ, а не по кнопке снизу. Так сделано в веб-версии
/// и так требует приёмка раздела: у пробы на торможение рука должна лететь к стимулу,
/// а не к отдельной кнопке — иначе меряется ещё и путь пальца.
enum GoNoGoPhase { ready, playing, done }

/// Порог прохода уровня — 80 % верных проб, как в веб-версии.
const double gonogoPassAccuracy = 0.8;

/// Партия начинается сама (флаг сборки AUTOSTART) — нужен замеру отклика.
const bool gonogoAutostart = bool.fromEnvironment('AUTOSTART');

/// Пауза перед первой пробой, мс — как в веб-версии.
const int gonogoFirstDelayMs = 800;

class GoNoGoScreen extends StatefulWidget {
  const GoNoGoScreen({super.key, required this.state, this.clock, this.rnd});

  final SharedState state;

  /// Часы для замеров и проб. Не заданы — настоящие.
  final int Function()? clock;

  /// Случайность. Не задана — настоящая; пробе нужна заданная.
  final Random? rnd;

  @override
  State<GoNoGoScreen> createState() => _GoNoGoScreenState();
}

class _GoNoGoScreenState extends State<GoNoGoScreen> {
  late LevelLadder _ladder;
  GoNoGoGame? _game;
  GoNoGoPhase _phase = GoNoGoPhase.ready;
  GoNoGoOutcome? _flash;
  Timer? _timer;
  bool _passed = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'go_no_go', store: SharedLevelStore(widget.state));
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
    if (gonogoAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = GoNoGoGame(level: _ladder.level, nowMs: widget.clock, rnd: widget.rnd);
    _phase = GoNoGoPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    setState(() {
      _phase = GoNoGoPhase.playing;
      _flash = null;
    });
    _game!.begin();
    _timer = Timer(const Duration(milliseconds: gonogoFirstDelayMs), _nextTrial);
  }

  void _nextTrial() {
    if (!mounted || _phase != GoNoGoPhase.playing) return;
    final g = _game!;
    _timer?.cancel();
    if (!g.nextTrial()) {
      _finish();
      return;
    }
    setState(() => _flash = null);
    measureStimulusFrame('Flutter/ЖмиДержись');
    _timer = Timer(Duration(milliseconds: g.params.windowMs), () {
      if (!mounted || _phase != GoNoGoPhase.playing) return;
      final outcome = g.closeTrial();
      setState(() {
        // Молча проходит только верное удержание: о нём человеку сообщать нечем.
        _flash = outcome == GoNoGoOutcome.correctRejection ? null : outcome;
      });
      // Межпробная пауза уровня — темп подачи.
      _timer = Timer(Duration(milliseconds: g.itiMs), _nextTrial);
    });
  }

  void _respond() {
    final g = _game;
    if (g == null || _phase != GoNoGoPhase.playing) return;
    final outcome = g.respond();
    if (outcome == null) return;
    setState(() => _flash = outcome);
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    final passed = g.accuracy >= gonogoPassAccuracy;
    setState(() {
      _phase = GoNoGoPhase.done;
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
      title: 'Жми и держись',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Проба', value: '${g.round}/${g.trialsTotal}', icon: Icons.numbers),
        HudItem(label: 'Верно', value: '${g.hits + g.correctRejections}', icon: Icons.check),
        HudItem(label: 'Реакция', value: '${g.meanRtMs ?? 0}', icon: Icons.bolt),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        flash: _flash,
        passed: _passed,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
        onTap: _respond,
      ),
    );
  }
}

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFEF4444);

/// Цвета стимула: зелёный круг — жми, красный квадрат — держись.
/// ⚠️ ФОРМА, А НЕ ТОЛЬКО ЦВЕТ: при дальтонизме одна заливка неразличима, и проба
/// мерила бы зрение вместо торможения.
const Color _goColor = Color(0xFF22C55E);
const Color _nogoColor = Color(0xFFEF4444);

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.flash,
    required this.passed,
    required this.height,
    required this.onStart,
    required this.onAgain,
    required this.onTap,
  });

  final GoNoGoGame game;
  final GoNoGoPhase phase;
  final GoNoGoOutcome? flash;
  final bool passed;

  /// Высота поля приходит числом от каркаса.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case GoNoGoPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('Уровень ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const Text('Жми по полю, когда появился ЗЕЛЁНЫЙ круг. На КРАСНОМ квадрате — не жми.',
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
      case GoNoGoPhase.done:
        return _Centered(
          height: height,
          children: [
            Text(passed ? 'Уровень пройден' : 'Уровень не пройден',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('Поймано ${game.hits} · удержано ${game.correctRejections}'),
            Text('Пропущено ${game.misses} · нажато на запрет ${game.falseAlarms}'),
            Text(game.meanRtMs == null
                ? 'Среднее время: нет нажатий на цель'
                : 'Среднее время: ${game.meanRtMs} мс'),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: const Text('Ещё раз')),
          ],
        );
      case GoNoGoPhase.playing:
        final s = game.stimulus;
        return TapLatency(
          where: 'Flutter/ЖмиДержись',
          child: GestureDetector(
            key: const Key('gonogo-field'),
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: SizedBox(
              height: height,
              width: double.infinity,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    height: 180,
                    child: Center(
                      child: switch (s) {
                        GoNoGoStim.go => Container(
                            key: const Key('gonogo-go'),
                            width: 140,
                            height: 140,
                            decoration: const BoxDecoration(color: _goColor, shape: BoxShape.circle),
                          ),
                        GoNoGoStim.nogo => Container(
                            key: const Key('gonogo-nogo'),
                            width: 140,
                            height: 140,
                            decoration: BoxDecoration(
                              color: _nogoColor,
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        // Между пробами поле пустое: пауза — часть темпа, а не простой.
                        null => const SizedBox.shrink(),
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text('Круг — жми. Квадрат — держись.'),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 28,
                    child: switch (flash) {
                      GoNoGoOutcome.hit => const Icon(Icons.check_circle, color: _good, key: Key('gonogo-hit')),
                      GoNoGoOutcome.falseAlarm =>
                        const Icon(Icons.cancel, color: _bad, key: Key('gonogo-false-alarm')),
                      GoNoGoOutcome.miss => const Icon(Icons.timer_off, color: _bad, key: Key('gonogo-miss')),
                      _ => const SizedBox.shrink(),
                    },
                  ),
                ],
              ),
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
