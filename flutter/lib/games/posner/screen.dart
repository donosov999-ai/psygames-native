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

/// «Позиция» (проба Познера) на Flutter.
///
/// Три срока подряд: пауза до подсказки → подсказка 100 мс → пауза SOA → мишень
/// и окно ответа. Все таймеры умирают вместе с экраном.
enum PosnerPhase { ready, playing, done }

/// Порог прохода уровня — 80 % верных, как в веб-версии.
const double posnerPassAccuracy = 0.8;

/// Подсказка видна 100 мс — как в веб-версии.
const int posnerCueMs = 100;

/// Пауза на отклик между пробами, мс.
const int posnerFeedbackMs = 350;

/// Партия начинается сама (флаг сборки AUTOSTART) — нужен замеру отклика.
const bool posnerAutostart = bool.fromEnvironment('AUTOSTART');

class PosnerScreen extends StatefulWidget {
  const PosnerScreen({super.key, required this.state, this.clock, this.rnd});

  final SharedState state;
  final int Function()? clock;
  final Random? rnd;

  @override
  State<PosnerScreen> createState() => _PosnerScreenState();
}

class _PosnerScreenState extends State<PosnerScreen> {
  late LevelLadder _ladder;
  PosnerGame? _game;
  PosnerPhase _phase = PosnerPhase.ready;
  PosnerOutcome? _flash;
  Timer? _timer;
  bool _passed = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'posner', store: SharedLevelStore(widget.state));
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
    if (posnerAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = PosnerGame(level: _ladder.level, nowMs: widget.clock, rnd: widget.rnd);
    _phase = PosnerPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    setState(() {
      _phase = PosnerPhase.playing;
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
    _timer = Timer(Duration(milliseconds: g.cueDelayMs), () {
      if (!mounted || _phase != PosnerPhase.playing) return;
      setState(g.showCue);
      _timer = Timer(const Duration(milliseconds: posnerCueMs), () {
        if (!mounted || _phase != PosnerPhase.playing) return;
        setState(g.hideCue);
        // Пауза «подсказка → мишень»: её разброс и есть ось сложности.
        _timer = Timer(Duration(milliseconds: g.soaMs), () {
          if (!mounted || _phase != PosnerPhase.playing) return;
          setState(g.showTarget);
          measureStimulusFrame('Flutter/Posner');
          _timer = Timer(Duration(milliseconds: g.params.windowMs), () {
            if (!mounted || _phase != PosnerPhase.playing) return;
            _after(g.timeout());
          });
        });
      });
    });
  }

  void _answer(PosnerSide side) {
    final g = _game;
    if (g == null || _phase != PosnerPhase.playing || !g.targetShown) return;
    _after(g.answer(side));
  }

  void _after(PosnerOutcome outcome) {
    _timer?.cancel();
    setState(() => _flash = outcome);
    _timer = Timer(const Duration(milliseconds: posnerFeedbackMs), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    final passed = g.accuracy >= posnerPassAccuracy;
    setState(() {
      _phase = PosnerPhase.done;
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
      title: L.t('posner'),
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
      toolbar: _phase == PosnerPhase.playing ? _Answers(onPick: _answer) : null,
    );
  }
}

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

  final PosnerGame game;
  final PosnerPhase phase;
  final PosnerOutcome? flash;
  final bool passed;
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  /// Одна половина поля: рамка слева или справа от центра.
  Widget _box(BuildContext context, PosnerSide side) {
    final t = game.trial;
    final cueHere = game.cueShown && t?.cueDir == side;
    final targetHere = game.targetShown && t?.targetSide == side;
    return Container(
      key: Key('posner-box-${side.name}'),
      width: 96,
      height: 120,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          // Подсказка — это ВСПЫШКА РАМКИ той стороны, а не стрелка в центре:
          // так проба меряет непроизвольное ориентирование, а не чтение знака.
          color: cueHere ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor,
          width: cueHere ? 4 : 1,
        ),
      ),
      child: Center(
        child: targetHere
            ? Container(
                key: Key('posner-target-${side.name}'),
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  shape: BoxShape.circle,
                ),
              )
            : const SizedBox.shrink(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case PosnerPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('posnerHint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('posnerLvlParams')
                  .replaceAll('{n}', '${game.trialsTotal}')
                  .replaceAll('{p}', '${(validRatio * 100).round()}')
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
      case PosnerPhase.done:
        final effect = game.validityEffectMs;
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
            // Прочерк честнее нуля: ноль означал бы «подсказка не помогает».
            Text(effect == null
                ? '${L.t('hud_cueGain')}: —'
                : '${L.t('hud_cueGain')}: $effect ${L.t('msShort')}'),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case PosnerPhase.playing:
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _box(context, PosnerSide.left),
                  // Точка фиксации между рамками: смотреть надо в центр.
                  const SizedBox(width: 24),
                  const Text('+', style: TextStyle(fontSize: 28)),
                  const SizedBox(width: 24),
                  _box(context, PosnerSide.right),
                ],
              ),
              const SizedBox(height: 12),
              Text(L.t('posnerHint'), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              SizedBox(
                height: 28,
                child: switch (flash) {
                  PosnerOutcome.hit => const Icon(Icons.check_circle, color: _good, key: Key('posner-hit')),
                  PosnerOutcome.wrong => const Icon(Icons.cancel, color: _bad, key: Key('posner-wrong')),
                  PosnerOutcome.miss => const Icon(Icons.timer_off, color: _bad, key: Key('posner-miss')),
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

/// Две кнопки ответа.
///
/// ⚠️ RTL-пин: сторона ответа обязана совпадать со стороной мишени физически.
/// Зеркальная раскладка превратила бы валидные подсказки в обманные.
class _Answers extends StatelessWidget {
  const _Answers({required this.onPick});
  final void Function(PosnerSide) onPick;

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.ltr,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Row(
            children: [
              for (final s in PosnerSide.values)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: TapLatency(
                      where: 'Flutter/Posner',
                      child: SizedBox(
                        height: 56,
                        child: FilledButton(
                          key: Key('posner-answer-${s.name}'),
                          onPressed: () => onPick(s),
                          child: Icon(
                            s == PosnerSide.left ? Icons.arrow_back : Icons.arrow_forward,
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
