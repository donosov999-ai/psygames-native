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

/// «Стрелки» — фланкерная проба Эриксена на Flutter.
///
/// Экран держит ДВА срока подряд: подготовительный интервал 500–1100 мс, потом
/// окно ответа уровня. Просрочка окна — ошибка. Оба таймера умирают вместе с
/// экраном, иначе партия продолжала бы идти на закрытом экране.
enum FlankerPhase { ready, playing, done }

/// Порог прохода уровня — 80 % верных, как в веб-версии (`accuracy >= 0.8`).
const double flankerPassAccuracy = 0.8;

/// Партия начинается сама, без нажатия «Начать» (флаг сборки AUTOSTART).
/// Нужен замеру: касания в нативный слой панель симулятора не доставляет.
const bool flankerAutostart = bool.fromEnvironment('AUTOSTART');

/// Пауза на отклик между пробами, мс. То же число, что в веб-версии (`advance`).
const int flankerFeedbackMs = 350;

class FlankerScreen extends StatefulWidget {
  const FlankerScreen({super.key, required this.state, this.clock, this.rnd});

  final SharedState state;

  /// Часы для замеров и проб. Не заданы — настоящие.
  final int Function()? clock;

  /// Случайность. Не задана — настоящая. Пробе нужна заданная: иначе «обе половины
  /// набрались» верно лишь с какой-то вероятностью, и набор мигал бы раз в N прогонов.
  final Random? rnd;

  @override
  State<FlankerScreen> createState() => _FlankerScreenState();
}

class _FlankerScreenState extends State<FlankerScreen> {
  late LevelLadder _ladder;
  FlankerGame? _game;
  FlankerPhase _phase = FlankerPhase.ready;
  FlankerOutcome? _flash;
  Timer? _timer;
  bool _passed = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'flanker', store: SharedLevelStore(widget.state));
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
    if (flankerAutostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _game = FlankerGame(level: _ladder.level, nowMs: widget.clock, rnd: widget.rnd);
    _phase = FlankerPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    setState(() {
      _phase = FlankerPhase.playing;
      _flash = null;
    });
    _game!.begin();
    _nextTrial();
  }

  /// Примеры разбора: ряд рисует ТОТ ЖЕ виджет, что и партия (`FlankerRow`).
  ///
  /// ⚠️ Зазор берётся у уровня партии: он и есть ось трудности фланкера, и
  /// разбор с чужим зазором показывал бы другую задачу.
  List<DemoTrial> _demoTrials(BuildContext context) {
    final g = _game!;
    final color = Theme.of(context).colorScheme.onSurface;
    return [
      for (final t in flankerDemoTrials())
        DemoTrial(
          text: '',
          art: FlankerRow(trial: t, gapPx: g.params.gapPx, centerColor: color),
          // ⚠️ Ключи — ЛИТЕРАЛАМИ в каждой ветке. Сборщик словаря
          // (`tools/embed-l10n.mjs`) видит только `L.t('имя')`, и запись
          // `L.t(условие ? 'a' : 'b')` он молча пропустил бы: замер показал
          // словарь без обоих ключей, а экран показал бы человеку «a11yLeft».
          answer: flankerCorrect(t) == FlankerDirection.left ? L.t('a11yLeft') : L.t('a11yRight'),
          ruleKey: 'hint_center_arrow',
        ),
    ];
  }

  void _nextTrial() {
    final g = _game!;
    _timer?.cancel();
    if (!g.nextTrial()) {
      _finish();
      return;
    }
    setState(() {});
    // Подготовительный интервал: на экране точка, стимула ещё нет.
    _timer = Timer(Duration(milliseconds: g.preDelayMs), () {
      if (!mounted || _phase != FlankerPhase.playing) return;
      setState(g.showStimulus);
      // Замер: отметка показа поставлена в showStimulus(), меряем до кадра.
      measureStimulusFrame('Flutter/Flanker');
      _timer = Timer(Duration(milliseconds: g.params.windowMs), () {
        if (!mounted || _phase != FlankerPhase.playing) return;
        _after(g.timeout());
      });
    });
  }

  void _answer(FlankerDirection d) {
    final g = _game;
    if (g == null || _phase != FlankerPhase.playing || !g.stimulusShown) return;
    _after(g.answer(d));
  }

  /// Общий хвост ответа и просрочки: отклик, пауза на него и следующая проба.
  void _after(FlankerOutcome outcome) {
    _timer?.cancel();
    setState(() => _flash = outcome);
    _timer = Timer(const Duration(milliseconds: flankerFeedbackMs), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _timer?.cancel();
    final passed = g.accuracy >= flankerPassAccuracy;
    setState(() {
      _phase = FlankerPhase.done;
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
      title: L.t('flanker'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.numbers),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('reaction'), value: '${g.meanRtMs ?? 0}', icon: Icons.bolt),
      ],
      onLesson: _game == null
          ? null
          : () => openDemoLesson(context, title: L.t('flanker'), trials: _demoTrials(context)),
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        flash: _flash,
        passed: _passed,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
      ),
      toolbar: _phase == FlankerPhase.playing ? _Answers(onPick: _answer) : null,
    );
  }
}

const Color _good = Color(0xFF22C55E);
const Color _bad = Color(0xFFEF4444);

/// Цвет флангов — серый: они НЕ ответ, и цветом их выделять нельзя.
const Color _flankGrey = Color(0xFF888888);

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

  final FlankerGame game;
  final FlankerPhase phase;
  final FlankerOutcome? flash;
  final bool passed;

  /// Высота поля приходит числом от каркаса — ряд не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case FlankerPhase.ready:
        return _Centered(
          height: height,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('hint_center_arrow'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              L.t('flankerLvlParams')
                  .replaceAll('{p}', '${(flankerPIncong * 100).round()}')
                  .replaceAll('{w}', (game.params.windowMs / 1000).toStringAsFixed(1)),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ],
        );
      case FlankerPhase.done:
        final effect = game.flankerEffectMs;
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
            Text(
              // Прочерк честнее нуля: ноль означал бы «конфликт не мешает».
              effect == null
                  ? '${L.t('hud_interference')}: —'
                  : '${L.t('hud_interference')}: $effect ${L.t('msShort')}',
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case FlankerPhase.playing:
        final t = game.trial!;
        final fb = switch (flash) {
          FlankerOutcome.hit => _good,
          FlankerOutcome.wrong => _bad,
          FlankerOutcome.miss => _bad,
          null => Theme.of(context).colorScheme.onSurface,
        };
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: flash == null ? Theme.of(context).dividerColor : fb,
                    width: flash == null ? 1 : 3,
                  ),
                ),
                child: game.stimulusShown
                    ? FlankerRow(trial: t, gapPx: game.params.gapPx, centerColor: fb)
                    // До показа — точка фиксации: человек знает, куда смотреть.
                    : const SizedBox(
                        height: 56,
                        child: Center(child: Text('•', style: TextStyle(fontSize: 36))),
                      ),
              ),
              const SizedBox(height: 12),
              Text(L.t('hint_center_arrow'), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              SizedBox(
                height: 28,
                child: switch (flash) {
                  FlankerOutcome.hit => const Icon(Icons.check_circle, color: _good, key: Key('flanker-hit')),
                  FlankerOutcome.wrong => const Icon(Icons.cancel, color: _bad, key: Key('flanker-wrong')),
                  FlankerOutcome.miss => const Icon(Icons.timer_off, color: _bad, key: Key('flanker-miss')),
                  null => const SizedBox.shrink(),
                },
              ),
            ],
          ),
        );
    }
  }
}

/// Ряд стимулов: два фланга, цель, два фланга. Зазор ОДИНАКОВЫЙ между всеми —
/// как у Эриксена, где знаки расставлены ровно. Свой отступ у центра означал бы
/// не «разнос цель ↔ фланги», а что-то другое.
class FlankerRow extends StatelessWidget {
  const FlankerRow({super.key, required this.trial, required this.gapPx, required this.centerColor});

  final FlankerTrial trial;
  final double gapPx;
  final Color centerColor;

  Widget _arrow(FlankerDirection d, double size, Color color) => Icon(
        d == FlankerDirection.left ? Icons.arrow_back : Icons.arrow_forward,
        size: size,
        color: color,
      );

  /// Нейтральная проба: вместо стрелок чёрточки — помеха есть, направления нет.
  Widget _dash() => const SizedBox(
        width: 36,
        child: Center(child: Text('—', style: TextStyle(fontSize: 36, color: _flankGrey))),
      );

  @override
  Widget build(BuildContext context) {
    final f = trial.flankers;
    Widget side(int from) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = from; i < from + 2; i++) ...[
              f == null ? _dash() : _arrow(f[i], 36, _flankGrey),
              SizedBox(width: gapPx),
            ],
          ],
        );
    return Row(
      key: const Key('flanker-row'),
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        side(0),
        // Цель крупнее флангов: 56 против 36, как в веб-версии.
        Container(
          key: const Key('flanker-stimulus'),
          child: _arrow(trial.center, 56, centerColor),
        ),
        SizedBox(width: gapPx),
        side(2),
      ],
    );
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
/// ⚠️ RTL-ПИН: кнопка «влево» обязана быть ФИЗИЧЕСКИ слева. Это совместимость
/// «стимул — ответ»: при зеркальной раскладке (арабский, иврит) проба мерила бы
/// ещё и перекодировку стороны, а не торможение. В веб-версии это сделано
/// принудительным `direction: ltr` у ряда.
class _Answers extends StatelessWidget {
  const _Answers({required this.onPick});
  final void Function(FlankerDirection) onPick;

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.ltr,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Row(
            children: [
              for (final d in FlankerDirection.values)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: TapLatency(
                      where: 'Flutter/Flanker',
                      child: SizedBox(
                        height: 56,
                        child: FilledButton(
                          key: Key('flanker-answer-${d.name}'),
                          onPressed: () => onPick(d),
                          child: Icon(
                            d == FlankerDirection.left ? Icons.arrow_back : Icons.arrow_forward,
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
