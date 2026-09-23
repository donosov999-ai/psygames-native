/// CPT — «Поток букв», семнадцатый экран раздела «Конфликт внимания».
///
/// 🔴 ПАРТИЯ ИДЁТ ПО ЧАСАМ, А НЕ ПО ЧИСЛУ ПРОБ: девяносто секунд на любом
/// уровне. Сколько проб в них влезет, решает темп уровня — одна проба стоит ДВА
/// ISI (пауза до буквы плюс окно ответа).
///
/// ⚠️ БУКВА ВИДНА 250 мс, а окно ответа длится полный ISI: человек отвечает по
/// памяти о только что мелькнувшей букве. Гасить окно вместе с буквой значило бы
/// мерить скорость чтения, а не устойчивость внимания.
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

enum CptPhase { ready, playing, done }

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool cptAutostart = bool.fromEnvironment('AUTOSTART');

/// Цвета стимула. Значения те же, что в веб-версии.
const Map<StimColor, Color> cptColorHex = {
  StimColor.red: Color(0xFFE11D48),
  StimColor.blue: Color(0xFF2563EB),
  StimColor.green: Color(0xFF15803D),
  StimColor.ink: Color(0xFF1F2937),
};

class CptScreen extends StatefulWidget {
  const CptScreen({super.key, required this.state, this.clock, this.rnd, this.durationSec});

  final SharedState state;
  final int Function()? clock;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  /// Длительность партии. Не задана — 90 секунд уровня.
  final int? durationSec;

  @override
  State<CptScreen> createState() => _CptScreenState();
}

class _CptScreenState extends State<CptScreen> {
  late LevelLadder _ladder;
  CptGame? _game;
  CptPhase _phase = CptPhase.ready;
  bool _letterVisible = false;
  bool _flashWrong = false;
  bool _flashRight = false;
  Timer? _isiTimer;
  Timer? _offTimer;
  Timer? _windowTimer;
  Timer? _flashTimer;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'cpt', store: SharedLevelStore(widget.state), maxLevel: cptMaxLevel);
    _boot();
  }

  @override
  void dispose() {
    _cancelAll();
    super.dispose();
  }

  void _cancelAll() {
    _isiTimer?.cancel();
    _offTimer?.cancel();
    _windowTimer?.cancel();
    _flashTimer?.cancel();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_reset);
    if (cptAutostart) _start();
  }

  void _reset() {
    _cancelAll();
    _game = CptGame(
      level: _ladder.level,
      rnd: widget.rnd,
      nowMs: widget.clock,
      durationOverrideSec: widget.durationSec,
    );
    _phase = CptPhase.ready;
    _letterVisible = false;
    _flashWrong = false;
    _flashRight = false;
  }

  void _start() {
    _game!.begin();
    setState(() {
      _phase = CptPhase.playing;
      _letterVisible = false;
    });
    _schedule();
  }

  void _schedule() {
    final g = _game!;
    if (!mounted || _phase != CptPhase.playing) return;
    if (g.timeUp) {
      _finish();
      return;
    }
    _isiTimer = Timer(Duration(milliseconds: g.nextIsiMs()), () {
      if (!mounted || _phase != CptPhase.playing) return;
      setState(() {
        g.showNext();
        _letterVisible = true;
      });
      // Замер: отметка показа уже поставлена в showNext(), меряем до кадра.
      measureStimulusFrame('Flutter/CPT');
      // Буква гаснет раньше, чем закрывается окно ответа.
      _offTimer = Timer(const Duration(milliseconds: cptStimDurationMs), () {
        if (!mounted) return;
        setState(() => _letterVisible = false);
      });
      _windowTimer = Timer(Duration(milliseconds: g.trialWindowMs), () {
        if (!mounted || _phase != CptPhase.playing) return;
        final t = g.current;
        // Пропуск цели — единственное, что отмечается откликом: верное
        // бездействие на не-цели молчит, иначе экран мигал бы всю партию.
        if (t != null && !t.responded && t.isTarget) _flash(false);
        setState(g.closeTrial);
        _schedule();
      });
    });
  }

  void _tap() {
    if (_phase != CptPhase.playing) return;
    final g = _game!;
    final t = g.current;
    if (t == null) return;
    if (!g.tap()) return;
    _flash(t.isTarget);
    setState(() {});
  }

  void _flash(bool right) {
    _flashTimer?.cancel();
    setState(() {
      _flashRight = right;
      _flashWrong = !right;
    });
    _flashTimer = Timer(const Duration(milliseconds: 220), () {
      if (!mounted) return;
      setState(() {
        _flashRight = false;
        _flashWrong = false;
      });
    });
  }

  void _finish() {
    final g = _game!;
    _cancelAll();
    setState(() => _phase = CptPhase.done);
    // 🔴 Оборванная партия уровень НЕ ДВИГАЕТ — ни вверх, ни вниз.
    final verdict = g.passed;
    if (verdict == null) return;
    if (verdict) {
      _ladder.win(score: g.score, timeSeconds: g.elapsedSec.round(), errors: g.metrics.omissions + g.metrics.commissions);
    } else {
      _ladder.fail(score: g.score, timeSeconds: g.elapsedSec.round(), errors: g.metrics.omissions + g.metrics.commissions);
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final m = g.metrics;
    final left = (g.durationSec - g.elapsedSec).clamp(0, g.durationSec.toDouble());
    return GameShell(
      title: L.t('cpt'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('timeLeftLabel'), value: '${left.round()}', icon: Icons.timer_outlined),
        HudItem(label: L.t('hud_correct'), value: '${m.hits}', icon: Icons.check),
        HudItem(label: L.t('hud_missed'), value: '${m.omissions}', icon: Icons.visibility_off_outlined),
        HudItem(label: L.t('hud_false'), value: '${m.commissions}', icon: Icons.close),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        letterVisible: _letterVisible,
        flashRight: _flashRight,
        flashWrong: _flashWrong,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == CptPhase.playing ? _TapButton(onTap: _tap) : null,
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.letterVisible,
    required this.flashRight,
    required this.flashWrong,
    required this.height,
    required this.onStart,
    required this.onAgain,
  });

  final CptGame game;
  final CptPhase phase;
  final bool letterVisible;
  final bool flashRight;
  final bool flashWrong;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  /// Строка правил уровня: у каждой ступени своя, и она называет, ЧТО поменялось.
  String get _rules {
    final p = game.params;
    if (p.colorRule) return L.t('cptLvlParamsColor').replaceAll('{letter}', p.target);
    if (p.target != 'X') return L.t('cptLvlParamsLetter').replaceAll('{letter}', p.target);
    if (p.mode == CptMode.ax) {
      return game.level >= 11 ? L.t('cptLvlParamsAXHard') : L.t('cptLvlParamsAX');
    }
    return L.t('cptLvlParamsX');
  }

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case CptPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(_rules, key: const Key('cpt-rules'), textAlign: TextAlign.center),
            if (game.params.colorRule) ...[
              const SizedBox(height: 6),
              Text(L.t('cptTapColor').replaceAll('{letter}', game.params.target),
                  key: const Key('cpt-color-rule'),
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case CptPhase.done:
        final m = game.metrics;
        return _Centered(
          height: height,
          children: [
            Text(
              // 🔴 У оборванной партии исхода НЕТ: ни «взято», ни «ещё раз».
              game.passed == null
                  ? L.t('hud_trials')
                  : (game.passed! ? L.t('levelDone').replaceAll('{n}', '${game.level}') : L.t('sameLevelRetry')),
              key: const Key('cpt-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: ${m.hits} · ${L.t('hud_missed')}: ${m.omissions} · '
                '${L.t('hud_false')}: ${m.commissions}'),
            Text('${L.t('hud_trials')}: ${m.played}', key: const Key('cpt-played')),
            const SizedBox(height: 8),
            Text(L.t('cptPass'), style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('start'))),
          ],
        );
      case CptPhase.playing:
        final t = game.current;
        return SizedBox(
          height: height,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  height: 160,
                  child: Center(
                    child: (letterVisible && t != null)
                        ? Text(
                            t.letter,
                            key: Key('cpt-letter-${t.letter}-${t.color.name}'),
                            style: TextStyle(
                              fontSize: 120,
                              fontWeight: FontWeight.w800,
                              color: cptColorHex[t.color],
                            ),
                          )
                        : const SizedBox.shrink(key: Key('cpt-blank')),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 32,
                  child: flashRight
                      ? const Icon(Icons.check_circle, color: Color(0xFF22C55E), key: Key('cpt-right'))
                      : (flashWrong
                          ? const Icon(Icons.cancel, color: Color(0xFFEF4444), key: Key('cpt-wrong'))
                          : const SizedBox.shrink()),
                ),
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

class _TapButton extends StatelessWidget {
  const _TapButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: TapLatency(
          where: 'Flutter/CPT',
          child: SizedBox(
            height: 56,
            width: double.infinity,
            child: FilledButton(
              key: const Key('cpt-tap'),
              onPressed: onTap,
              child: FittedBox(
                child: Text(L.t('cptTapBtn'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              ),
            ),
          ),
        ),
      );
}
