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

  /// Примеры разбора: согласованная проба и конфликтная — обе рисуются ТЕМ ЖЕ
  /// полем, что в партии, иначе помеха позиции из задачи исчезнет.
  List<DemoTrial> _demoTrials() => [
        for (final t in simonDemoTrials())
          DemoTrial(
            text: '',
            art: SimonStimulus(trial: t),
            answer: correctSide(t.color) == SimonSide.left ? L.t('a11yLeft') : L.t('a11yRight'),
            ruleKey: 'hint_simon_color_rule',
          ),
      ];

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
      measureStimulusFrame('Flutter/Simon');
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
      // Тексты — из общего словаря теми же ключами, что зовёт веб-версия игры.
      title: L.t('simon'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.numbers),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('reaction'), value: '${g.meanRtMs ?? 0}', icon: Icons.bolt),
      ],
      onLesson: _game == null
          ? null
          : () => openDemoLesson(context, title: L.t('simon'), trials: _demoTrials()),
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

/// 🔴 ПОЛЕ СТИМУЛА ОТДЕЛЬНЫМ ВИДЖЕТОМ — ЧТОБЫ РАЗБОР ПОКАЗЫВАЛ ТО ЖЕ САМОЕ.
///
/// Поле ШИРОКОЕ, и квадрат вспыхивает слева или справа от центра: именно эта
/// сторона и мешает ответу по цвету — в ней весь эффект Саймона. Нарисуй разбор
/// свой квадрат по центру — он показал бы задачу БЕЗ помехи, то есть другую.
class SimonStimulus extends StatelessWidget {
  const SimonStimulus({
    super.key,
    required this.trial,
    this.shown = true,
    this.border,
    this.thick = false,
  });

  final SimonTrial trial;
  final bool shown;
  final Color? border;
  final bool thick;

  @override
  Widget build(BuildContext context) => Container(
        height: 160,
        margin: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: border ?? Theme.of(context).dividerColor,
            width: thick ? 3 : 1,
          ),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Крестик фиксации: человек знает, куда смотреть до стимула.
            Opacity(
              opacity: 0.4,
              child: Text('+', style: Theme.of(context).textTheme.headlineSmall),
            ),
            if (shown)
              Align(
                alignment:
                    trial.position == SimonSide.left ? Alignment.centerLeft : Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 30),
                  child: Container(
                    key: Key('simon-stimulus-${trial.position.name}'),
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: _hex(trial.color == SimonColor.blue ? simonBlueHex : simonRedHex),
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
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
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('hint_simon_color_rule'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('simonLvlParams')
                  .replaceAll('{n}', '${game.trialsTotal}')
                  .replaceAll('{p}', '${(simonIncongruentProb * 100).round()}')
                  .replaceAll('{w}', (game.params.windowMs / 1000).toStringAsFixed(1)),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case SimonPhase.done:
        final effect = game.simonEffectMs;
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
            Text(effect == null
                ? '${L.t('hud_interference')}: —'
                : '${L.t('hud_interference')}: $effect ${L.t('msShort')}'),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
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
              SimonStimulus(
                trial: t,
                shown: game.stimulusShown,
                border: border,
                thick: flash != null,
              ),
              const SizedBox(height: 12),
              Text(L.t('hint_simon_color_rule'), textAlign: TextAlign.center),
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
                      where: 'Flutter/Simon',
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
