/// ANT — «Сети внимания», двенадцатый экран раздела «Конфликт внимания» на Flutter.
///
/// 🔴 ПОСЛЕДОВАТЕЛЬНОСТЬ ПРОБЫ ЗДЕСЬ И ЕСТЬ МЕТОДИКА, а не оформление:
/// пред-пауза (400 мс + разброс уровня) → подсказка на 100 мс → пустой экран
/// (300 мс + разброс, а без подсказки 400 мс + разброс) → мишень. Отсчёт идёт
/// ОТ МИШЕНИ: посчитай от начала пробы — и в каждое время попадут обе паузы,
/// которые к сетям внимания отношения не имеют, зато гуляют на сотни
/// миллисекунд и растут с уровнем.
///
/// ⚠️ Пауза «без подсказки» длиннее ровно на время подсказки. Иначе пробы без
/// подсказки приходили бы раньше остальных, и alerting мерил бы разницу в
/// МОМЕНТЕ появления мишени, а не в готовности к ней.
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

enum AntPhase { ready, playing, done }

/// Пауза на отклик после ответа, мс. Из веб-версии.
const int antFeedbackMs = 350;

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool antAutostart = bool.fromEnvironment('AUTOSTART');

class AntScreen extends StatefulWidget {
  const AntScreen({super.key, required this.state, this.clock, this.rnd});

  final SharedState state;
  final int Function()? clock;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  @override
  State<AntScreen> createState() => _AntScreenState();
}

class _AntScreenState extends State<AntScreen> {
  late LevelLadder _ladder;
  AntGame? _game;
  AntPhase _phase = AntPhase.ready;
  AntOutcome? _flash;
  bool _cueVisible = false;
  Timer? _timer;
  bool _passed = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'ant', store: SharedLevelStore(widget.state), maxLevel: antMaxLevel);
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
    if (antAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = AntGame(level: _ladder.level, rnd: widget.rnd, nowMs: widget.clock);
    _phase = AntPhase.ready;
    _flash = null;
    _cueVisible = false;
    _passed = false;
  }

  void _start() {
    _game!.begin();
    setState(() {
      _phase = AntPhase.playing;
      _flash = null;
    });
    _nextTrial();
  }

  void _nextTrial() {
    final g = _game!;
    _timer?.cancel();
    if (!g.nextTrial()) {
      _finish();
      return;
    }
    setState(() => _cueVisible = false);
    final t = g.trial!;
    _timer = Timer(Duration(milliseconds: g.preDelayMs()), () {
      if (!mounted || _phase != AntPhase.playing) return;
      if (t.cue == CueType.none) {
        // Подсказки нет — сразу пустой экран, но на 100 мс длиннее.
        _timer = Timer(Duration(milliseconds: g.blankMs(t.cue)), _showTarget);
        return;
      }
      setState(() => _cueVisible = true);
      _timer = Timer(const Duration(milliseconds: AntGame.cueMs), () {
        if (!mounted || _phase != AntPhase.playing) return;
        setState(() => _cueVisible = false);
        _timer = Timer(Duration(milliseconds: g.blankMs(t.cue)), _showTarget);
      });
    });
  }

  void _showTarget() {
    if (!mounted || _phase != AntPhase.playing) return;
    final g = _game!;
    setState(g.showTarget);
    // Замер: отметка показа уже поставлена в showTarget(), меряем до кадра.
    measureStimulusFrame('Flutter/ANT');
    _timer = Timer(Duration(milliseconds: g.params.windowMs), () {
      if (!mounted || _phase != AntPhase.playing) return;
      _after(g.timeout());
    });
  }

  void _answer(Direction d) {
    if (_phase != AntPhase.playing) return;
    final g = _game!;
    if (!g.targetShown) return;
    _after(g.answer(d));
  }

  void _after(AntOutcome outcome) {
    _timer?.cancel();
    setState(() => _flash = outcome);
    _timer = Timer(const Duration(milliseconds: antFeedbackMs), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    final passed = g.accuracy >= antPassAccuracy;
    setState(() {
      _phase = AntPhase.done;
      _passed = passed;
    });
    final seconds = g.elapsedSeconds.round();
    if (passed) {
      _ladder.win(score: g.hits * 10, timeSeconds: seconds, errors: g.errors);
    } else {
      _ladder.fail(score: g.hits * 10, timeSeconds: seconds, errors: g.errors);
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('ant'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('reaction'), value: '${g.meanRtMs ?? 0}', icon: Icons.bolt),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        flash: _flash,
        cueVisible: _cueVisible,
        passed: _passed,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == AntPhase.playing ? _Answers(onPick: _answer) : null,
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.flash,
    required this.cueVisible,
    required this.passed,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final AntGame game;
  final AntPhase phase;
  final AntOutcome? flash;
  final bool cueVisible;
  final bool passed;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case AntPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('hint_center_arrow'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('antLvlParams')
                  .replaceAll('{n}', '${game.trialsTotal}')
                  .replaceAll('{p}', '${(antIncongruentProb * 100).round()}')
                  .replaceAll('{w}', (game.params.windowMs / 1000).toStringAsFixed(1)),
              key: const Key('ant-params'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case AntPhase.done:
        final n = game.networks;
        return _Centered(
          height: height,
          children: [
            Text(
              passed ? L.t('levelDone').replaceAll('{n}', '${game.level}') : L.t('sameLevelRetry'),
              key: const Key('ant-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: ${game.hits}/${game.trialsTotal}'),
            // Три сети — рядом и подписаны каждая своим именем: общее имя не дало
            // бы понять, какая из трёх просела.
            Text('${L.t('hud_netAlerting')}: ${n.alertingMs} ${L.t('msShort')}', key: const Key('ant-alerting')),
            Text('${L.t('hud_netOrienting')}: ${n.orientingMs} ${L.t('msShort')}', key: const Key('ant-orienting')),
            Text('${L.t('hud_netExecutive')}: ${n.executiveMs} ${L.t('msShort')}', key: const Key('ant-executive')),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case AntPhase.playing:
        final t = game.trial!;
        final shown = game.targetShown;
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Две строки — верх и низ: мишень приходит в одну из них, и
              // пространственная подсказка показывает, в какую.
              _Row(
                slot: 'top',
                active: t.pos == Position.top,
                trial: t,
                cueVisible: cueVisible,
                targetShown: shown,
              ),
              const SizedBox(height: 24),
              // Точка фиксации — центр экрана, от неё и меряется «ориентир».
              const Text('+', key: Key('ant-fixation'), style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 24),
              _Row(
                slot: 'bottom',
                active: t.pos == Position.bottom,
                trial: t,
                cueVisible: cueVisible,
                targetShown: shown,
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 28,
                child: switch (flash) {
                  AntOutcome.hit => const Icon(Icons.check_circle, color: Color(0xFF22C55E), key: Key('ant-hit')),
                  AntOutcome.wrong => const Icon(Icons.cancel, color: Color(0xFFEF4444), key: Key('ant-wrong')),
                  AntOutcome.miss => const Icon(Icons.timer_off, color: Color(0xFFEF4444), key: Key('ant-miss')),
                  null => const SizedBox.shrink(),
                },
              ),
            ],
          ),
        );
    }
  }
}

/// Одна строка поля: подсказка над ней и, если мишень пришла сюда, сами стрелки.
class _Row extends StatelessWidget {
  const _Row({
    required this.slot,
    required this.active,
    required this.trial,
    required this.cueVisible,
    required this.targetShown,
  });

  final String slot;
  final bool active;
  final AntTrial trial;
  final bool cueVisible;
  final bool targetShown;

  /// Показывать ли звёздочку подсказки над ЭТОЙ строкой.
  ///
  /// ⚠️ Пространственная подсказка стоит только над той строкой, куда придёт
  /// мишень, — в этом и весь её смысл. Двойная — над обеими: она говорит
  /// «сейчас», но не говорит «где».
  bool get _cueHere {
    if (!cueVisible) return false;
    switch (trial.cue) {
      case CueType.none:
        return false;
      case CueType.center:
        return false;
      case CueType.double_:
        return true;
      case CueType.spatial:
        return active;
    }
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 56,
        child: Center(
          child: _cueHere
              ? Text('*', key: Key('ant-cue-$slot'), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900))
              : (active && targetShown
                  ? _Arrows(trial: trial, slot: slot)
                  : const SizedBox.shrink()),
        ),
      );
}

/// Пять стрелок: цель в середине, по две с каждой стороны.
class _Arrows extends StatelessWidget {
  const _Arrows({required this.trial, required this.slot});
  final AntTrial trial;
  final String slot;

  static const _left = '◀';
  static const _right = '▶';
  static const _flat = '—';

  String _glyph(Direction d) => d == Direction.left ? _left : _right;

  @override
  Widget build(BuildContext context) {
    final f = trial.flankers;
    // Нейтральная проба: вместо флангов чёрточки. Флангов НЕТ, а не «они
    // смотрят куда-то» — отсутствие флангов и есть отсутствие конфликта.
    final side = f == null ? [_flat, _flat] : [_glyph(f[0]), _glyph(f[1])];
    final side2 = f == null ? [_flat, _flat] : [_glyph(f[2]), _glyph(f[3])];
    return Row(
      key: Key('ant-target-$slot'),
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (final g in side) _Glyph(g),
        _Glyph(_glyph(trial.dir), key: Key('ant-center-${trial.dir.name}')),
        for (final g in side2) _Glyph(g),
      ],
    );
  }
}

class _Glyph extends StatelessWidget {
  const _Glyph(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Text(text, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700)),
      );
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

class _Answers extends StatelessWidget {
  const _Answers({required this.onPick});
  final void Function(Direction) onPick;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            Expanded(child: _Btn(label: '◀', side: Direction.left, onPick: onPick)),
            const SizedBox(width: 8),
            Expanded(child: _Btn(label: '▶', side: Direction.right, onPick: onPick)),
          ],
        ),
      );
}

class _Btn extends StatelessWidget {
  const _Btn({required this.label, required this.side, required this.onPick});
  final String label;
  final Direction side;
  final void Function(Direction) onPick;

  @override
  Widget build(BuildContext context) => TapLatency(
        where: 'Flutter/ANT',
        child: SizedBox(
          height: 56,
          child: FilledButton(
            key: Key('ant-answer-${side.name}'),
            onPressed: () => onPick(side),
            style: FilledButton.styleFrom(padding: EdgeInsets.zero),
            child: FittedBox(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22))),
          ),
        ),
      );
}
