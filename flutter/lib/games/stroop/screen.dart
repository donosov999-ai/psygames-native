import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/game_preset.dart';
import '../../shell/setup_scroll.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

/// «Струп: цвет и слово» — первая проба раздела «Конфликт внимания» на Flutter.
///
/// Экран держит ТЕМП: у каждой пробы своё окно ответа (`windowMs`), просрочка —
/// ошибка. Поэтому здесь, в отличие от первых перенесённых игр, есть таймер, и он
/// умирает вместе с экраном.
///
/// 🔴 ЧТО ЗДЕСЬ ГЛАВНОЕ ПРИ ПЕРЕЕЗДЕ — ВРЕМЯ РЕАКЦИИ. Мера прохода Струпа это
/// РАЗНОСТЬ времён (неконгруэнтные − конгруэнтные), и она чувствительна к тому,
/// от какого момента считать. Отсчёт начинается там же, где в веб-версии: в момент
/// показа стимула (`nextTrial`), а не в момент планирования таймера.
enum StroopPhase { ready, playing, done }

/// Порог прохода уровня — 85 % верных, как в веб-версии (`accuracy >= 0.85`).
const double stroopPassAccuracy = 0.85;

/// Партия начинается сама, без нажатия «Начать».
///
/// Так устроена зарядка в нынешней версии (`?autostart=1` у пресета), и это же нужно
/// замеру: касания в нативный слой панель симулятора не доставляет, а стимулы должны
/// смениться сами. Включается флагом сборки:
///   flutter run --dart-define=AUTOSTART=true
const bool stroopAutostart = bool.fromEnvironment('AUTOSTART');

/// Базовое правило партии из адреса — как веб (`str('mode', 'ink') === 'word' ? 'word' : 'ink'`):
/// любое иное имя (шаг зарядки шлёт и `classic`) — цвет чернил. Без параметра — правило экрана.
String stroopModeFor(String fallback) {
  final m = GamePreset.str('mode');
  if (m.isEmpty) return fallback;
  return m == 'word' ? 'word' : 'ink';
}

class StroopScreen extends StatefulWidget {
  const StroopScreen({super.key, required this.state, this.mode = 'ink', this.clock});

  final SharedState state;

  /// Базовое правило партии: 'ink' — назови цвет чернил, 'word' — назови слово.
  final String mode;

  /// Часы для замеров и проб. Не заданы — настоящие.
  final int Function()? clock;

  @override
  State<StroopScreen> createState() => _StroopScreenState();
}

class _StroopScreenState extends State<StroopScreen> {
  late LevelLadder _ladder;
  StroopGame? _game;
  StroopPhase _phase = StroopPhase.ready;
  StroopOutcome? _flash;
  Timer? _window;
  bool _passed = false;

  /// Правило партии: из адреса, затем выбор на настройке, как у веба.
  late String _mode;

  @override
  void initState() {
    super.initState();
    _mode = stroopModeFor(widget.mode);
    _ladder = LevelLadder(gameId: 'stroop', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _window?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_reset);
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (stroopAutostart || GamePreset.autostart) _start();
  }

  void _reset() {
    _window?.cancel();
    _game = StroopGame(
      level: _ladder.level,
      mode: _mode,
      nowMs: widget.clock,
      trialsOverride: GamePreset.isPreset ? GamePreset.num('trials', StroopLevel.of(_ladder.level).trials) : null,
    );
    _phase = StroopPhase.ready;
    _flash = null;
    _passed = false;
  }

  /// Выбор правила — только до начала партии.
  void _pickMode(String m) {
    if (_phase != StroopPhase.ready || m == _mode) return;
    setState(() {
      _mode = m;
      _reset();
    });
  }

  void _start() {
    setState(() {
      _phase = StroopPhase.playing;
      _flash = null;
    });
    _nextTrial();
  }

  /// Примеры разбора: данные берутся у модели, экран только красит.
  ///
  /// ⚠️ «Что здесь верно» считает `stroopCorrect` — та же функция, которой партия
  /// засчитывает ответ. Второй такой функции быть не должно: разойдясь, они
  /// научили бы человека не той игре.
  List<DemoTrial> _demoTrials() {
    final palette = _game!.palette;
    StroopColor byName(String n) => palette.firstWhere((c) => c.name == n);
    return [
      for (final d in stroopDemoTrials(palette))
        DemoTrial(
          text: stroopWord(d.trial.word),
          color: _hex(d.trial.ink.hex),
          answer: stroopWord(byName(stroopCorrect(d.trial, d.rule))),
          ruleKey: d.rule == 'ink' ? 'stroopByInk' : 'stroopByWord',
        ),
    ];
  }

  void _nextTrial() {
    final g = _game!;
    _window?.cancel();
    if (!g.nextTrial()) {
      _finish();
      return;
    }
    setState(() {});
    // Замер: отметка показа уже поставлена в nextTrial(), меряем до кадра.
    measureStimulusFrame('Flutter/Stroop');
    _window = Timer(Duration(milliseconds: g.params.windowMs), () {
      if (!mounted || _phase != StroopPhase.playing) return;
      _after(g.timeout());
    });
  }

  void _answer(StroopColor c) {
    if (_phase != StroopPhase.playing) return;
    _after(_game!.answer(c));
  }

  /// Общий хвост ответа и просрочки: отклик, пауза на него и следующая проба.
  void _after(StroopOutcome outcome) {
    _window?.cancel();
    setState(() => _flash = outcome);
    // Короткий отклик, как в веб-версии: человек должен увидеть, что ответ принят.
    _window = Timer(const Duration(milliseconds: 220), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  void _finish() {
    final g = _game!;
    _window?.cancel();
    final passed = g.accuracy >= stroopPassAccuracy;
    setState(() {
      _phase = StroopPhase.done;
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
      // Правило уровня объявляет каркас — в спокойный момент, не поверх партии (задача e371fd3a).
      levelRule: LevelRuleSpot(gameId: 'stroop', level: _ladder.level, state: widget.state, calm: _phase != StroopPhase.playing),
      // Тексты — из общего словаря теми же ключами, что зовёт веб-версия игры.
      title: L.t('stroop'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.numbers),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('hud_errors'), value: '${g.errors}', icon: Icons.close),
      ],
      onLesson: _game == null
          ? null
          : () => openDemoLesson(context, title: L.t('stroop'), trials: _demoTrials()),
      field: (context, h) => _Field(game: g, phase: _phase, flash: _flash, passed: _passed, height: h, onStart: _start, onAgain: () => setState(_reset), onMode: _pickMode),
      toolbar: _phase == StroopPhase.playing ? _Answers(game: g, onPick: _answer) : null,
    );
  }
}

/// Слово цвета на языке интерфейса — из общего словаря, заглавными, как в вебе.
///
/// 🔴 СЛОВО — ПОЛОВИНА ПРОБЫ. Струп мерит, как прочитанное слово мешает назвать цвет
/// чернил; слово, которого человек не читает бегло, не мешает, и разность времён уже
/// не интерференция. Веб брал слово по языку (`language === 'ru' ? word.ru : word.en`),
/// перенос взял `.ru` везде — в английской локали стимул был «КРАСНЫЙ». Ключи
/// `color_*` переведены на все двенадцать языков: немец читает ROT, японец 赤.
/// Каждый ключ — своим `L.t('…')`: сборщик словаря видит только литерал.
String stroopWord(StroopColor c) {
  final word = switch (c.name) {
    'red' => L.t('color_red'),
    'blue' => L.t('color_blue'),
    'green' => L.t('color_green'),
    'yellow' => L.t('color_yellow'),
    _ => throw ArgumentError.value(c.name, 'name', 'no dictionary word for this colour'),
  };
  return word.toUpperCase();
}

Color _hex(String hex) => Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.flash,
    required this.passed,
    required this.height,
    required this.onStart,
    required this.onAgain,
    required this.onMode,
  });

  final StroopGame game;
  final StroopPhase phase;
  final StroopOutcome? flash;
  final bool passed;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;
  final ValueChanged<String> onMode;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case StroopPhase.ready:
        // Выбор правила — как у веба («По цвету чернил / По смыслу слова»); с ним настройка
        // выше поля на малых экранах — прокрутка, «Начать» прибита.
        return SetupScroll(
          height: height,
          onStart: onStart,
          children: [
            Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            SetupChoice<String>(
              label: L.t('stroopModeLabel'),
              options: [('ink', L.t('stroopByInk'), 'stroop-mode-ink'), ('word', L.t('stroopByWord'), 'stroop-mode-word')],
              value: game.mode,
              onPick: onMode,
            ),
            const SizedBox(height: 8),
            Text(
              game.mode == 'ink' ? L.t('stroopHintInk') : L.t('stroopHintWord'),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              L.t('stroopLvlParams')
                  .replaceAll('{n}', '${game.trialsTotal}')
                  .replaceAll('{w}', (game.params.windowMs / 1000).toStringAsFixed(1))
                  .replaceAll('{p}', '${(incongruentRatio * 100).round()}'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            // С L5 часть проб идёт по ДРУГОМУ правилу (до 40 % на L15): без этой строки человек
            // узнавал бы о смене только ошибкой посреди партии.
            if (game.params.switchRate > 0) ...[
              const SizedBox(height: 4),
              Text(
                L.t('stroopLvlSwitch').replaceAll('{s}', '${(game.params.switchRate * 100).round()}'),
                key: const Key('stroop-switch-line'),
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
          ],
        );
      case StroopPhase.done:
        final interference = game.interferenceMs;
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
              // Прочерк честнее нуля: ноль означал бы «интерференции нет».
              interference == null
                  ? '${L.t('hud_interference')}: —'
                  : '${L.t('hud_interference')}: $interference ${L.t('msShort')}',
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case StroopPhase.playing:
        final t = game.trial!;
        final decoys = t.decoys;
        return SizedBox(
          height: height,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _DecoyRow(glyphs: decoys.take(2).toList()),
              const SizedBox(height: 12),
              Text(
                stroopWord(t.word),
                key: const Key('stroop-stimulus'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 44,
                  fontWeight: FontWeight.w800,
                  color: _hex(t.ink.hex),
                ),
              ),
              const SizedBox(height: 12),
              // Правило пробы — под стимулом: часть проб идёт по другому правилу,
              // и человек узнаёт об этом только отсюда.
              Text(
                game.trialRule == 'ink' ? L.t('stroopByInk') : L.t('stroopByWord'),
                key: const Key('stroop-rule'),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 12),
              _DecoyRow(glyphs: decoys.skip(2).toList()),
              const SizedBox(height: 12),
              SizedBox(
                height: 28,
                child: switch (flash) {
                  StroopOutcome.hit => const Icon(Icons.check_circle, color: Color(0xFF22C55E), key: Key('stroop-hit')),
                  StroopOutcome.wrong => const Icon(Icons.cancel, color: Color(0xFFEF4444), key: Key('stroop-wrong')),
                  StroopOutcome.miss => const Icon(Icons.timer_off, color: Color(0xFFEF4444), key: Key('stroop-miss')),
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

class _DecoyRow extends StatelessWidget {
  const _DecoyRow({required this.glyphs});
  final List<String> glyphs;

  /// Помехи — геометрические фигуры: буква рядом со словом читалась бы вместе с ним.
  static const _icons = {
    'ellipse-outline': Icons.circle_outlined,
    'square-outline': Icons.square_outlined,
    'triangle-outline': Icons.change_history,
    'diamond-outline': Icons.diamond_outlined,
    'cube-outline': Icons.view_in_ar_outlined,
    'prism-outline': Icons.hexagon_outlined,
  };

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 24,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (final g in glyphs)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Icon(_icons[g] ?? Icons.circle_outlined, size: 20, color: Theme.of(context).disabledColor),
              ),
          ],
        ),
      );
}

class _Answers extends StatelessWidget {
  const _Answers({required this.game, required this.onPick});
  final StroopGame game;
  final void Function(StroopColor) onPick;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            for (final c in game.palette)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: TapLatency(
                    where: 'Flutter/Stroop',
                    child: SizedBox(
                    height: 56,
                    child: FilledButton(
                      key: Key('stroop-answer-${c.name}'),
                      onPressed: () => onPick(c),
                      style: FilledButton.styleFrom(
                        backgroundColor: _hex(c.hex),
                        // Подпись — по светлоте фона: белым по жёлтой кнопке контраст был 1,9 при норме 4,5.
                        foregroundColor: _hex(stroopLabelColor(c.hex)),
                        padding: EdgeInsets.zero,
                      ),
                      child: FittedBox(child: Text(stroopWord(c), style: const TextStyle(fontWeight: FontWeight.w700))),
                    ),
                  ),
                  ),
                ),
              ),
          ],
        ),
      );
}
