/// «Торможение» — одиннадцатый экран раздела «Конфликт внимания» на Flutter.
///
/// 🔴 ДВЕ ПАРАДИГМЫ РАЗНО УСТРОЕНЫ ВО ВРЕМЕНИ, и это главное при переезде.
/// В Go/No-Go стимул показывается СРАЗУ, и отсчёт идёт от него. В стоп-сигнальной
/// пробе сперва пауза со случайной длиной (600…1000 мс), потом «жми», и только
/// потом — если проба стоп-сигнальная — через SSD приходит «стоп». Считать время
/// от начала пробы нельзя ни там, ни там: в одном случае в него попала бы пауза,
/// в другом — задержка сигнала.
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

enum InhibitionPhase { ready, playing, done }

/// Пауза после ответа и между пробами, мс. Числа из веб-версии.
const int inhibitionFeedbackMs = 500;
const int inhibitionGngGapMinMs = 500;
const int inhibitionGngGapSpreadMs = 300;

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool inhibitionAutostart = bool.fromEnvironment('AUTOSTART');

class InhibitionScreen extends StatefulWidget {
  const InhibitionScreen({super.key, required this.state, this.mode = SubMode.goNoGo, this.clock, this.rnd});

  final SharedState state;

  /// Парадигма. Режим меняет ПРАВИЛО игры, а не сложность.
  final SubMode mode;
  final int Function()? clock;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  @override
  State<InhibitionScreen> createState() => _InhibitionScreenState();
}

class _InhibitionScreenState extends State<InhibitionScreen> {
  late LevelLadder _ladder;
  InhibitionGame? _game;
  InhibitionPhase _phase = InhibitionPhase.ready;
  InhibitionOutcome? _flash;
  Timer? _timer;
  Timer? _stopTimer;
  bool _passed = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'inhibition', store: SharedLevelStore(widget.state), maxLevel: inhibitionMaxLevel);
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
    if (!mounted) return;
    setState(_reset);
    if (inhibitionAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _stopTimer?.cancel();
    _game = InhibitionGame(level: _ladder.level, mode: widget.mode, rnd: widget.rnd, nowMs: widget.clock);
    _phase = InhibitionPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    _game!.begin();
    setState(() {
      _phase = InhibitionPhase.playing;
      _flash = null;
    });
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
    if (g.kind == TrialKind.gng) {
      // Стимул уже на экране: отсчёт пошёл в nextTrial().
      measureStimulusFrame('Flutter/Inhibition');
      _timer = Timer(Duration(milliseconds: g.params.goWindowMs), () {
        if (!mounted || _phase != InhibitionPhase.playing) return;
        _after(g.timeout());
      });
      return;
    }
    // Стоп-сигнальная: пауза → «жми» → (если надо) «стоп» → конец окна.
    _timer = Timer(Duration(milliseconds: g.fixationMs()), () {
      if (!mounted || _phase != InhibitionPhase.playing) return;
      setState(g.showSsGo);
      measureStimulusFrame('Flutter/Inhibition');
      if (g.isStopTrial) {
        _stopTimer = Timer(Duration(milliseconds: g.params.ssdMs), () {
          if (!mounted || _phase != InhibitionPhase.playing) return;
          setState(g.showSsStop);
        });
      }
      _timer = Timer(Duration(milliseconds: g.params.goWindowMs), () {
        if (!mounted || _phase != InhibitionPhase.playing) return;
        _after(g.timeout());
      });
    });
  }

  void _press() {
    if (_phase != InhibitionPhase.playing) return;
    _after(_game!.press());
  }

  void _after(InhibitionOutcome? outcome) {
    if (outcome == null) return;
    _timer?.cancel();
    _stopTimer?.cancel();
    final g = _game!;
    setState(() {
      _flash = outcome;
      // Стимул гаснет вместе с ответом: круг, висящий всю паузу, читается как
      // «всё ещё жми», и границы проб пропадают.
      g.clearStimulus();
    });
    // Пауза между пробами: у Go/No-Go со случайной добавкой, как в веб-версии —
    // ровная пауза учила бы жать по счёту.
    final gap = g.kind == TrialKind.gng ? g.gngGapMs() : inhibitionFeedbackMs;
    _timer = Timer(Duration(milliseconds: gap), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    _stopTimer?.cancel();
    final passed = g.accuracy >= inhibitionPassAccuracy;
    setState(() {
      _phase = InhibitionPhase.done;
      _passed = passed;
    });
    final seconds = g.elapsedSeconds.round();
    if (passed) {
      _ladder.win(score: g.score, timeSeconds: seconds, errors: g.falseAlarms + g.misses, mode: widget.mode.name);
    } else {
      _ladder.fail(score: g.score, timeSeconds: seconds, errors: g.falseAlarms + g.misses, mode: widget.mode.name);
    }
  }

  /// Примеры разбора — по ПОДРЕЖИМУ, а не все четыре подряд: человек играет
  /// либо «жми и держись», либо стоп-сигнал, либо их смесь, и показывать ему
  /// чужой стимул значит объяснять не ту задачу.
  List<DemoTrial> _demoTrials() {
    final mode = widget.mode;
    final rule = switch (mode) {
      SubMode.goNoGo => L.t('inhibitionGngHint'),
      SubMode.stopSignal => L.t('inhibitionSsHint'),
      SubMode.mixed => L.t('inhibitionMixedHint'),
    };
    return [
      if (mode != SubMode.stopSignal) ...[
        DemoTrial(
          text: '',
          art: const InhibitionStimulus.fixed(gng: GngStim.go),
          answer: L.t('demoPress'),
          rule: rule,
        ),
        DemoTrial(
          text: '',
          art: const InhibitionStimulus.fixed(gng: GngStim.nogo),
          answer: L.t('demoHold'),
          rule: rule,
        ),
      ],
      if (mode != SubMode.goNoGo) ...[
        DemoTrial(
          text: '',
          art: const InhibitionStimulus.fixed(ss: SsSignal.go),
          answer: L.t('demoPress'),
          rule: rule,
        ),
        DemoTrial(
          text: '',
          art: const InhibitionStimulus.fixed(ss: SsSignal.stop),
          answer: L.t('demoHold'),
          rule: rule,
        ),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('inhibition'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        // Удержанные — вторая половина точности, и без неё счётчик врал бы:
        // «ничего не нажал» в этой игре тоже бывает верным ответом.
        HudItem(label: L.t('hud_held'), value: '${g.correctRejections}', icon: Icons.pan_tool_outlined),
      ],
      onLesson: () => openDemoLesson(context, title: L.t('inhibition'), trials: _demoTrials()),
      field: (context, h) => _Field(
        game: g,
        mode: widget.mode,
        phase: _phase,
        flash: _flash,
        passed: _passed,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == InhibitionPhase.playing ? _GoButton(onTap: _press) : null,
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.mode,
    required this.phase,
    required this.flash,
    required this.passed,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final InhibitionGame game;
  final SubMode mode;
  final InhibitionPhase phase;
  final InhibitionOutcome? flash;
  final bool passed;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  String get _hint => switch (mode) {
        SubMode.goNoGo => L.t('inhibitionGngHint'),
        SubMode.stopSignal => L.t('inhibitionSsHint'),
        SubMode.mixed => L.t('inhibitionMixedHint'),
      };

  String get _modeName => switch (mode) {
        SubMode.goNoGo => L.t('goNoGo'),
        SubMode.stopSignal => L.t('stopSignal'),
        SubMode.mixed => L.t('mixedMode'),
      };

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case InhibitionPhase.ready:
        final p = game.params;
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(_modeName, key: const Key('inhibition-mode'), style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            Text(_hint, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              // У стоп-сигнала своя строка параметров: там есть и доля, и задержка.
              mode == SubMode.goNoGo
                  ? L.t('trialsWindowParams')
                      .replaceAll('{n}', '${game.trialsTotal}')
                      .replaceAll('{w}', (p.goWindowMs / 1000).toStringAsFixed(1))
                  : L.t('inhibStopLvlParams')
                      .replaceAll('{n}', '${game.trialsTotal}')
                      .replaceAll('{w}', (p.goWindowMs / 1000).toStringAsFixed(1))
                      .replaceAll('{p}', '${(p.stopProb * 100).round()}')
                      .replaceAll('{d}', '${p.ssdMs}'),
              key: const Key('inhibition-params'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case InhibitionPhase.done:
        return _Centered(
          height: height,
          children: [
            Text(
              passed ? L.t('levelDone').replaceAll('{n}', '${game.level}') : L.t('sameLevelRetry'),
              key: const Key('inhibition-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: ${game.hits} · ${L.t('hud_held')}: ${game.correctRejections}'),
            Text(game.meanRtMs == null
                ? '${L.t('meanReaction')}: —'
                : '${L.t('meanReaction')}: ${game.meanRtMs} ${L.t('msShort')}'),
            const SizedBox(height: 8),
            Text(L.t('inhibPass'), style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case InhibitionPhase.playing:
        return SizedBox(
          height: height,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                InhibitionStimulus(game: game),
                const SizedBox(height: 16),
                SizedBox(
                  height: 28,
                  child: switch (flash) {
                    InhibitionOutcome.hit => const Icon(Icons.check_circle, color: Color(0xFF22C55E), key: Key('inhibition-hit')),
                    InhibitionOutcome.correctReject => const Icon(Icons.verified_outlined, color: Color(0xFF22C55E), key: Key('inhibition-held')),
                    InhibitionOutcome.falseAlarm => const Icon(Icons.cancel, color: Color(0xFFEF4444), key: Key('inhibition-wrong')),
                    InhibitionOutcome.miss => const Icon(Icons.timer_off, color: Color(0xFFEF4444), key: Key('inhibition-miss')),
                    null => const SizedBox.shrink(),
                  },
                ),
              ],
            ),
          ),
        );
    }
  }
}

/// Сам стимул. Ключ фигуры называет, ЧТО сейчас на экране: пробе этого хватает,
/// чтобы играть по правилам, не заглядывая в модель.
class InhibitionStimulus extends StatelessWidget {
  const InhibitionStimulus({super.key, required this.game}) : gng = null, ss = null;

  /// Стимул БЕЗ партии — для разбора: там партии ещё нет, а показать надо ровно
  /// те же четыре вида, что увидит человек.
  const InhibitionStimulus.fixed({super.key, this.gng, this.ss}) : game = null;

  final InhibitionGame? game;
  final GngStim? gng;
  final SsSignal? ss;

  TrialKind get _kind => game?.kind ?? (gng != null ? TrialKind.gng : TrialKind.ss);

  @override
  Widget build(BuildContext context) {
    final game = this.game;
    if (_kind == TrialKind.gng) {
      final stim = game?.gngStim ?? gng;
      if (stim == null) return const SizedBox(width: 160, height: 160, key: Key('inhibition-blank'));
      final go = stim == GngStim.go;
      return Container(
        key: Key(go ? 'inhibition-gng-go' : 'inhibition-gng-nogo'),
        width: 160,
        height: 160,
        decoration: BoxDecoration(
          color: go ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
          shape: BoxShape.circle,
        ),
      );
    }
    // Стоп-сигнальная: пока идёт пауза, поле пустое — и это не «экран завис».
    switch (game?.ssSignal ?? ss ?? SsSignal.idle) {
      case SsSignal.idle:
      case SsSignal.feedback:
        return const SizedBox(width: 160, height: 160, key: Key('inhibition-blank'));
      case SsSignal.go:
        return Container(
          key: const Key('inhibition-ss-go'),
          width: 160,
          height: 160,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle),
          child: Text(L.t('goBtn'), style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w900)),
        );
      case SsSignal.stop:
        return Container(
          key: const Key('inhibition-ss-stop'),
          width: 160,
          height: 160,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: Color(0xFFEF4444), shape: BoxShape.circle),
          child: const Icon(Icons.pan_tool, color: Colors.white, size: 64),
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

class _GoButton extends StatelessWidget {
  const _GoButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: TapLatency(
          where: 'Flutter/Inhibition',
          child: SizedBox(
            height: 56,
            width: double.infinity,
            child: FilledButton(
              key: const Key('inhibition-press'),
              onPressed: onTap,
              child: FittedBox(
                child: Text(L.t('goBtn'), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20)),
              ),
            ),
          ),
        ),
      );
}
