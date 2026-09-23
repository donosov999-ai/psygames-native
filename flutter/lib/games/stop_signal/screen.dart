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
import 'strings.dart';

/// «Стоп-сигнал» на Flutter.
///
/// 🔴 ЛЕСТНИЦА ЗАДЕРЖКИ ОБЩАЯ С ВЕБ-ВЕРСИЕЙ: и ступень, и окно проб лежат под тем
/// же ключом `psygames_stop_signal_ladder`. Заведи свой ключ — у человека станет
/// две лестницы с разными точками схождения, и SSRT в истории будет считаться то
/// по одной, то по другой.
///
/// ⚠️ Ответ — нажатие ПО ПОЛЮ: у пробы на торможение рука должна лететь к стимулу.
enum StopSignalPhase { ready, playing, done }

/// Порог прохода уровня — 80 % верных проб, как в веб-версии.
const double stopSignalPassAccuracy = 0.8;

/// Партия начинается сама (флаг сборки AUTOSTART) — нужен замеру отклика.
const bool stopSignalAutostart = bool.fromEnvironment('AUTOSTART');

/// Пауза на отклик после закрытия пробы, мс.
const int stopSignalFeedbackMs = 300;

class StopSignalScreen extends StatefulWidget {
  const StopSignalScreen({super.key, required this.state, this.clock, this.rnd});

  final SharedState state;
  final int Function()? clock;
  final Random? rnd;

  @override
  State<StopSignalScreen> createState() => _StopSignalScreenState();
}

class _StopSignalScreenState extends State<StopSignalScreen> {
  late LevelLadder _ladder;
  StopSignalGame? _game;
  StopSignalPhase _phase = StopSignalPhase.ready;
  StopOutcome? _flash;
  Timer? _timer;
  Timer? _stopTimer;
  bool _passed = false;

  /// Накопленное окно проб и ступень — общие с веб-версией.
  LadderState _state = emptyLadder;
  SsrtEstimate? _estimate;
  StopSignalStrings? _text;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'stop_signal', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _stopTimer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final text = await StopSignalStrings.load();
    if (!mounted) return;
    setState(() {
      _text = text;
      _state = parseLadder(widget.state.get(ladderKey));
      _estimate = estimateSsrt(_state.trials);
      _reset();
    });
    if (stopSignalAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _stopTimer?.cancel();
    _game = StopSignalGame(
      level: _ladder.level,
      startSsd: _state.ssdMs,
      nowMs: widget.clock,
      rnd: widget.rnd,
    );
    _phase = StopSignalPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    setState(() {
      _phase = StopSignalPhase.playing;
      _flash = null;
    });
    _game!.begin();
    _nextTrial();
  }

  void _nextTrial() {
    final g = _game!;
    _timer?.cancel();
    _stopTimer?.cancel();
    if (!g.nextTrial()) {
      _finish();
      return;
    }
    setState(() {});
    // Пауза фиксации: на экране крестик, GO ещё нет.
    _timer = Timer(Duration(milliseconds: g.fixationMs), () {
      if (!mounted || _phase != StopSignalPhase.playing) return;
      setState(g.showGo);
      measureStimulusFrame('Flutter/StopSignal');
      if (g.isStopTrial) {
        // Знак «стоп» приходит через ступень лестницы ПОСЛЕ GO.
        _stopTimer = Timer(Duration(milliseconds: g.trialSsd), () {
          if (!mounted || _phase != StopSignalPhase.playing) return;
          setState(g.showStop);
        });
      }
      _timer = Timer(Duration(milliseconds: g.params.goWindowMs), () {
        if (!mounted || _phase != StopSignalPhase.playing) return;
        _after(g.closeTrial());
      });
    });
  }

  void _press() {
    final g = _game;
    if (g == null || _phase != StopSignalPhase.playing) return;
    final outcome = g.press();
    if (outcome == null) return;
    _after(outcome);
  }

  void _after(StopOutcome outcome) {
    _timer?.cancel();
    _stopTimer?.cancel();
    setState(() => _flash = outcome);
    _timer = Timer(Duration(milliseconds: stopSignalFeedbackMs + _game!.params.interTrialMs), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    _stopTimer?.cancel();
    // Пробы партии доливаются в окно, ступень сохраняется как есть — общий ключ.
    final pool = appendTrials(_state.trials, g.runTrials);
    final next = LadderState(ssdMs: g.ssdMs, trials: pool);
    final passed = g.accuracy >= stopSignalPassAccuracy;
    setState(() {
      _state = next;
      _estimate = estimateSsrt(pool);
      _phase = StopSignalPhase.done;
      _passed = passed;
    });
    widget.state.set(ladderKey, serializeLadder(next));
    if (passed) {
      _ladder.win();
    } else {
      _ladder.fail();
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    final text = _text;
    if (g == null || text == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('stopSignal'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.numbers),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('hud_held'), value: '${g.inhibited}', icon: Icons.pan_tool_outlined),
      ],
      field: (context, h) => _Field(
        game: g,
        text: text,
        estimate: _estimate,
        pool: _state,
        phase: _phase,
        flash: _flash,
        passed: _passed,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
        onPress: _press,
      ),
    );
  }
}

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFEF4444);
const Color _stopRed = Color(0xFFDC2626);

/// Текст причины, по которой числа нет. Ключи те же, что у веб-версии.
String _doubtText(StopSignalStrings text, SsrtEstimate est) {
  switch (est.doubt) {
    case SsrtDoubt.noStopTrials:
    case SsrtDoubt.noGoResponses:
      return text.t('doubtNoData');
    case SsrtDoubt.tooFewStopTrials:
      return text.fill('doubtFewStops', {'have': est.stopTrials, 'need': minStopTrials});
    case SsrtDoubt.pRespondOffTarget:
      return text.fill('doubtOffTarget', {'pct': (est.pInhibit * 100).round()});
    case SsrtDoubt.raceModelViolated:
      return text.t('doubtRaceViolated');
    case SsrtDoubt.tooManyOmissions:
      return text.fill('doubtOmissions', {
        'pct': est.goTrials == 0 ? 0 : (est.goOmissions / est.goTrials * 100).round(),
      });
    case null:
      return '';
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.text,
    required this.estimate,
    required this.pool,
    required this.phase,
    required this.flash,
    required this.passed,
    required this.height,
    required this.onStart,
    required this.onAgain,
    required this.onPress,
  });

  final StopSignalGame game;
  final StopSignalStrings text;
  final SsrtEstimate? estimate;
  final LadderState pool;
  final StopSignalPhase phase;
  final StopOutcome? flash;
  final bool passed;
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;
  final VoidCallback onPress;

  Widget _ssrtBlock(BuildContext context) {
    final est = estimate;
    if (est == null) return const SizedBox.shrink();
    final small = Theme.of(context).textTheme.bodySmall;
    if (est.trustworthy && est.ssrtMs != null) {
      return Column(
        children: [
          Text('${text.t('ssrtLabel')}: ${est.ssrtMs} ${L.t('msShort')}',
              key: const Key('stopsignal-ssrt'),
              style: Theme.of(context).textTheme.titleMedium),
          Text(text.fill('poolLabel', {'n': pool.trials.length, 'stop': est.stopTrials}), style: small),
        ],
      );
    }
    return Column(
      children: [
        // 🔴 Вместо правдоподобного числа — причина, по которой числа нет.
        Text(text.t('ssrtUnsure'), key: const Key('stopsignal-no-ssrt'), textAlign: TextAlign.center),
        Text(_doubtText(text, est), style: small, textAlign: TextAlign.center),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case StopSignalPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(text.t('raceHint'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              text.fill('lvlParams', {
                'n': game.trialsTotal,
                'p': (stopProb * 100).round(),
                'w': (game.params.goWindowMs / 1000).toStringAsFixed(1),
                'f': (game.params.fixMinMs / 1000).toStringAsFixed(1),
              }),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            // Ступень лестницы видна ДО партии и спрятана во время неё.
            Text('${text.t('ssdLabel')}: ${game.ssdMs} ${L.t('msShort')}',
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            _ssrtBlock(context),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case StopSignalPhase.done:
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
            Text('${L.t('hud_correct')}: ${game.hits} · ${L.t('hud_held')}: ${game.inhibited}'),
            Text('${L.t('hud_missed')}: ${game.misses} · ${L.t('hud_errors')}: ${game.failedStops}'),
            Text(game.meanGoRtMs == null
                ? '${text.t('goRtLabel')}: —'
                : '${text.t('goRtLabel')}: ${game.meanGoRtMs} ${L.t('msShort')}'),
            const SizedBox(height: 12),
            _ssrtBlock(context),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case StopSignalPhase.playing:
        return TapLatency(
          where: 'Flutter/StopSignal',
          child: GestureDetector(
            key: const Key('stopsignal-field'),
            behavior: HitTestBehavior.opaque,
            onTap: onPress,
            child: SizedBox(
              height: height,
              width: double.infinity,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    height: 200,
                    child: Center(
                      child: !game.goShown
                          // Пауза фиксации: крестик, куда смотреть.
                          ? const Text('+', style: TextStyle(fontSize: 44))
                          : game.stopShown
                              // Знак «стоп» поверх GO — движение надо отменить.
                              ? Container(
                                  key: const Key('stopsignal-stop'),
                                  width: 150,
                                  height: 150,
                                  decoration: const BoxDecoration(color: _stopRed, shape: BoxShape.circle),
                                  child: const Icon(Icons.pan_tool, size: 72, color: Colors.white),
                                )
                              : Icon(Icons.arrow_forward,
                                  key: const Key('stopsignal-go'),
                                  size: 96,
                                  color: Theme.of(context).colorScheme.primary),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(text.t('ssdHidden'),
                      style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 28,
                    child: switch (flash) {
                      StopOutcome.go => const Icon(Icons.check_circle, color: _good, key: Key('stopsignal-hit')),
                      StopOutcome.inhibited =>
                        const Icon(Icons.verified, color: _good, key: Key('stopsignal-inhibited')),
                      StopOutcome.failedStop =>
                        const Icon(Icons.cancel, color: _bad, key: Key('stopsignal-failed')),
                      StopOutcome.goMiss => const Icon(Icons.timer_off, color: _bad, key: Key('stopsignal-miss')),
                      null => const SizedBox.shrink(),
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
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Column(mainAxisSize: MainAxisSize.min, children: children),
            ),
          ),
        ),
      );
}
