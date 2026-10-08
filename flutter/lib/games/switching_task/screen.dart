/// «Переключение задач» — девятый экран раздела «Конфликт внимания» на Flutter.
///
/// 🔴 ЧТО ГЛАВНОЕ ПРИ ПЕРЕЕЗДЕ — ЦЕНА ПЕРЕКЛЮЧЕНИЯ. Это РАЗНОСТЬ времён switch- и
/// repeat-проб, и она чувствительна к тому, от какого момента идёт отсчёт. Считаем
/// оттуда же, откуда веб-версия: от показа стимула (`showStimulus`), а не от
/// планирования таймера и не от конца паузы.
///
/// ⚠️ Плашка правила стоит ВНЕ ПОТОКА (`Stack` + `Positioned`) по той же причине,
/// что в веб-версии: участвуя в центрировании, она сдвигала коробку стимула вниз
/// (293 против 237…249).
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/boss_round.dart';
import '../../shell/game_preset.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import 'model.dart';

/// Поля партии для «Оценки» — как веб (`switching-task.tsx`, saveSession details). Домен
/// «Гибкость» читает `switch_cost_ms` (норма 150±80); без ключа домен молча «средний».
/// Формула — `switchCostMs`, та же, что в вебе и в итоге партии.
///
/// 🔴 НЕ ОПРЕДЕЛЕНА — НЕ ПИШЕТСЯ. Веб в таком случае пишет число-мусор: пустое плечо он
/// считает нулём, и «Оценка» (`extractMetric`) берёт его как измерение. Нет ключа —
/// домен честно «без данных», а не фантастический z.
Map<String, Object?> switchingSessionDetails(SwitchingGame g) {
  final rt = g.meanRtMs;
  return {
    'level': g.level,
    'mean_rt': ?rt,
    if (g.switchRts.isNotEmpty && g.repeatRts.isNotEmpty) 'switch_cost_ms': g.switchCost,
    'n_trials': g.trialsTotal,
  };
}

enum SwitchPhase { ready, playing, done }

/// Порог прохода уровня — 80 % верных, как в веб-версии (`accuracy >= 0.8`).
const double switchingPassAccuracy = 0.8;

/// Пауза перед показом стимула, мс. В веб-версии — 500.
const int switchingPreDelayMs = 500;

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool switchingAutostart = bool.fromEnvironment('AUTOSTART');

/// Режим стимула из адреса — как веб (`str('stimMode', 'mix')`): ссылка или шаг зарядки
/// задают материал партии. До 07.10.2026 натив параметр не читал, и адрес с `num3` молча
/// открывал «цифру+букву» (сторож параметров, задача b02a91c2). Неизвестное имя — режим
/// экрана, а не падение.
StimMode switchingStimMode(StimMode fallback) => StimMode.values.asNameMap()[GamePreset.str('stimMode')] ?? fallback;

/// Подпись режима на выборе — тем же словом, что у веба (`switchMode_<режим>`). Ключи
/// написаны целиком: составленный из кусков ключ сборщик словаря не находит.
String switchModeLabel(StimMode m) => switch (m) {
      StimMode.mix => L.t('switchMode_mix'),
      StimMode.num2 => L.t('switchMode_num2'),
      StimMode.num3 => L.t('switchMode_num3'),
      StimMode.letters => L.t('switchMode_letters'),
    };

/// Что показывает плашка «ОЦЕНИ» и что написано на кнопках.
class TaskMeta {
  const TaskMeta({required this.cue, required this.left, required this.right, required this.icon, required this.color});
  final String cue;
  final String left;
  final String right;
  final IconData icon;
  final Color color;
}

TaskMeta taskMeta(StimMode mode, int idx) {
  switch (mode) {
    case StimMode.mix:
      return idx == 0
          ? TaskMeta(cue: L.t('cueNumber'), left: L.t('ansOdd'), right: L.t('ansEven'), icon: Icons.calculate_outlined, color: const Color(0xFF3B82F6))
          : TaskMeta(cue: L.t('cueLetter'), left: L.t('ansVowel'), right: L.t('ansConsonant'), icon: Icons.text_fields, color: const Color(0xFFF59E0B));
    case StimMode.num2:
    case StimMode.num3:
      final mid = midFor(mode);
      return idx == 0
          ? TaskMeta(cue: L.t('cueParity'), left: L.t('ansOdd'), right: L.t('ansEven'), icon: Icons.calculate_outlined, color: const Color(0xFF3B82F6))
          // Подписи «< 50» и «≥ 500» — числа, а не текст: перевода не требуют и
          // сами называют порог, который у num2 и num3 разный.
          : TaskMeta(cue: L.t('cueSize'), left: '< $mid', right: '≥ $mid', icon: Icons.straighten, color: const Color(0xFF10B981));
    case StimMode.letters:
      return idx == 0
          ? TaskMeta(cue: L.t('cueVowelQ'), left: L.t('ansVowel'), right: L.t('ansConsonant'), icon: Icons.text_fields, color: const Color(0xFFF59E0B))
          : TaskMeta(cue: L.t('cueHalf'), left: 'A–M', right: 'N–Z', icon: Icons.swap_horiz, color: const Color(0xFF8B5CF6));
  }
}

class SwitchingTaskScreen extends StatefulWidget {
  const SwitchingTaskScreen({super.key, required this.state, this.mode = StimMode.mix, this.clock});

  final SharedState state;

  /// Чем показывать стимул, пока его не задал адрес (`stimMode`) или выбор на экране.
  /// Режим — не ось сложности, а другой материал.
  final StimMode mode;
  final int Function()? clock;

  @override
  State<SwitchingTaskScreen> createState() => _SwitchingTaskScreenState();
}

class _SwitchingTaskScreenState extends State<SwitchingTaskScreen> {
  late LevelLadder _ladder;
  SwitchingGame? _game;
  SwitchPhase _phase = SwitchPhase.ready;
  SwitchOutcome? _flash;
  Timer? _timer;
  bool _passed = false;
  bool? _boss; // итог боя на вехе; null — боя не было

  /// Материал партии: адрес, затем выбор на экране настройки, как у веба.
  late StimMode _mode;

  @override
  void initState() {
    super.initState();
    _mode = switchingStimMode(widget.mode);
    _ladder = LevelLadder(gameId: 'switching_task', store: SharedLevelStore(widget.state));
    _boot();
  }

  /// Выбор материала — только до начала партии: смена посреди неё смешала бы пробы
  /// двух режимов в одну цену переключения.
  void _pickMode(StimMode m) {
    if (_phase != SwitchPhase.ready || m == _mode) return;
    setState(() {
      _mode = m;
      _reset();
    });
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
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (switchingAutostart || GamePreset.autostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    // Шаг «Оценки» и зарядки задаёт длину партии, как в вебе (`num('trials', p.trials)`).
    _game = SwitchingGame(
        level: _ladder.level,
        mode: _mode,
        nowMs: widget.clock,
        trialsOverride: GamePreset.isPreset ? GamePreset.num('trials', SwitchLevel.of(_ladder.level).trials) : null);
    _phase = SwitchPhase.ready;
    _flash = null;
    _passed = false;
  }

  void _start() {
    _game!.begin();
    setState(() {
      _phase = SwitchPhase.playing;
      _flash = null;
    });
    _nextTrial();
  }

  /// Примеры разбора: один стимул под обеими задачами режима — видно, что
  /// верная кнопка меняется от ЗАДАЧИ, а не от стимула.
  List<DemoTrial> _demoTrials() => [
        for (final t in switchDemoTrials(_mode))
          DemoTrial(
            text: t.full,
            sub: taskMeta(_mode, t.taskIdx).cue,
            answer: t.correctLeft
                ? taskMeta(_mode, t.taskIdx).left
                : taskMeta(_mode, t.taskIdx).right,
            // Правило одно на оба примера: смотри на ПОДСКАЗКУ задачи (ЧИСЛО /
            // БУКВА) и отвечай по ней, а не по прошлой пробе.
            ruleKey: 'switchingTaskDesc',
          ),
      ];

  void _nextTrial() {
    final g = _game!;
    _timer?.cancel();
    if (!g.nextTrial()) {
      _finish();
      return;
    }
    // Пустая коробка перед стимулом: плашка правила уже видна, и человек успевает
    // её прочитать до того, как пойдёт отсчёт.
    setState(() {});
    _timer = Timer(const Duration(milliseconds: switchingPreDelayMs), () {
      if (!mounted || _phase != SwitchPhase.playing) return;
      setState(g.showStimulus);
      // Замер: отметка показа уже поставлена в showStimulus(), меряем до кадра.
      measureStimulusFrame('Flutter/SwitchingTask');
      _timer = Timer(Duration(milliseconds: g.params.windowMs), () {
        if (!mounted || _phase != SwitchPhase.playing) return;
        _after(g.timeout());
      });
    });
  }

  void _answer(bool left) {
    if (_phase != SwitchPhase.playing) return;
    final g = _game!;
    // `finished` — партия уже сдана в `_finish`, а фаза ещё «игра»: пока лестница пишет
    // победу и открывается бой, нажатие сдало бы партию второй раз.
    if (!g.stimulusShown || g.finished) return;
    _after(g.answer(left));
  }

  void _after(SwitchOutcome outcome) {
    _timer?.cancel();
    setState(() => _flash = outcome);
    _timer = Timer(const Duration(milliseconds: 220), () {
      if (!mounted) return;
      setState(() => _flash = null);
      _nextTrial();
    });
  }

  Future<void> _finish() async {
    final g = _game!;
    _timer?.cancel();
    final passed = g.accuracy >= switchingPassAccuracy;
    // Веха как в вебе: каждый третий ЗАСЧИТАННЫЙ уровень — бой «впиши пропуск», потом итог.
    bool? boss;
    if (passed) {
      boss = await BossRound.winThenBoss(context, _ladder,
          type: BossType.lightning, color: const Color(0xFF7873F5),
          win: () => _ladder.win(details: switchingSessionDetails(g)));
    } else {
      await _ladder.fail(details: switchingSessionDetails(g));
    }
    if (!mounted) return;
    setState(() {
      _phase = SwitchPhase.done;
      _passed = passed;
      _boss = boss;
    });
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final meta = g.trial == null ? null : taskMeta(_mode, g.trial!.taskIdx);
    return GameShell(
      // Правило уровня объявляет каркас — в спокойный момент, не поверх партии (задача e371fd3a).
      levelRule: LevelRuleSpot(gameId: 'switching_task', level: _ladder.level, state: widget.state, calm: _phase != SwitchPhase.playing),
      title: L.t('switchingTask'),
      // ⚠️ Счётчика ошибок здесь нет намеренно: при подстройке сложности ошибки —
      // норма по построению, и красный счётчик наказывает ровно за то, чего
      // требует обучение (§12.4 карты геймификации). Так же и в веб-версии.
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${g.round}/${g.trialsTotal}', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '${g.hits}', icon: Icons.check),
        HudItem(label: L.t('reaction'), value: '${g.meanRtMs ?? 0}', icon: Icons.bolt),
      ],
      onLesson: _game == null
          ? null
          : () => openDemoLesson(context, title: L.t('switchingTask'), trials: _demoTrials()),
      field: (context, h) => _Field(
        game: g,
        mode: _mode,
        phase: _phase,
        flash: _flash,
        passed: _passed,
        boss: _boss,
        height: h,
        onStart: _start,
        onAgain: () => setState(_reset),
        onMode: _pickMode,
      ),
      toolbar: _phase == SwitchPhase.playing && meta != null ? _Answers(meta: meta, onPick: _answer) : null,
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
    required this.boss,
    required this.height,
    required this.onStart,
    required this.onAgain,
    required this.onMode,
  });

  final SwitchingGame game;
  final StimMode mode;
  final SwitchPhase phase;
  final SwitchOutcome? flash;
  final bool passed;
  final bool? boss;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final VoidCallback onStart;
  final VoidCallback onAgain;
  final ValueChanged<StimMode> onMode;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case SwitchPhase.ready:
        final a = taskMeta(mode, 0);
        final b = taskMeta(mode, 1);
        // ⚠️ С выбором материала настройка на 320×568 выше поля на 36–88 px (замер
        // 07.10.2026: ru, de, hi, ar). Поэтому как у «Объёма цифр»: настройки
        // прокручиваются, «Начать» прибита снизу и видна без прокрутки.
        return SizedBox(
          height: height,
          child: Column(
            children: [
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${L.t('level')} ${game.level}', style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 8),
                        // Что показывать — выбор материала, как у веба («Стимул»). Правила
                        // сразу под ним и меняются вместе с ним: у режима своя пара задач.
                        Text(L.t('stimulusLabel'), style: Theme.of(context).textTheme.labelLarge),
                        const SizedBox(height: 6),
                        Wrap(
                          alignment: WrapAlignment.center,
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final m in StimMode.values)
                              ChoiceChip(
                                key: Key('switching-mode-${m.name}'),
                                label: Text(switchModeLabel(m)),
                                selected: m == mode,
                                onSelected: (_) => onMode(m),
                              ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        // Оба правила режима — до начала: человек не должен узнавать второе
                        // правило в первой же пробе, где оно стоит денег.
                        Text(
                          '${a.cue} → ${a.left}/${a.right}\n${b.cue} → ${b.left}/${b.right}',
                          key: const Key('switching-rules'),
                          style: Theme.of(context).textTheme.bodySmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(L.t('switchTopBadgeHint'), textAlign: TextAlign.center),
                        const SizedBox(height: 8),
                        Text(
                          L.t('switchLvlParams')
                              .replaceAll('{n}', '${game.trialsTotal}')
                              .replaceAll('{p}', '${(switchProb * 100).round()}')
                              .replaceAll('{w}', (game.params.windowMs / 1000).toStringAsFixed(1)),
                          style: Theme.of(context).textTheme.bodySmall,
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
                child: FilledButton(onPressed: onStart, child: Text(L.t('start'))),
              ),
            ],
          ),
        );
      case SwitchPhase.done:
        final cost = game.switchCost;
        final both = game.switchRts.isNotEmpty && game.repeatRts.isNotEmpty;
        return _Centered(
          height: height,
          children: [
            Text(
              passed ? L.t('levelDone').replaceAll('{n}', '${game.level}') : L.t('sameLevelRetry'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text('${L.t('hud_correct')}: ${game.hits}/${game.trialsTotal}'),
            Text(game.meanRtMs == null
                ? '${L.t('meanReaction')}: —'
                : '${L.t('meanReaction')}: ${game.meanRtMs} ${L.t('msShort')}'),
            // Цена переключения подписана тем же знаком ↻, которым в партии помечена
            // проба со сменой задачи. Прочерк честнее нуля: пустое плечо означает
            // «меры нет», а не «разницы нет».
            Text(
              both ? '↻ $cost ${L.t('msShort')}' : '↻ —',
              key: const Key('switching-cost'),
            ),
            BossOutcomeLine(boss),
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('retry'))),
          ],
        );
      case SwitchPhase.playing:
        final t = game.trial!;
        final meta = taskMeta(mode, t.taskIdx);
        final shown = game.stimulusShown;
        return SizedBox(
          height: height,
          child: Stack(
            children: [
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Center(child: _CueBadge(meta: meta, isSwitch: t.isSwitch && shown)),
              ),
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _DecoyRow(glyphs: t.decoys.take(2).toList()),
                    const SizedBox(height: 12),
                    Container(
                      width: 200,
                      height: 132,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          width: 2,
                          color: switch (flash) {
                            SwitchOutcome.hit => const Color(0xFF22C55E),
                            SwitchOutcome.wrong || SwitchOutcome.miss => const Color(0xFFF43F5E),
                            null => Theme.of(context).dividerColor,
                          },
                        ),
                      ),
                      child: Text(
                        shown ? t.full : '',
                        key: const Key('switching-stimulus'),
                        style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _DecoyRow(glyphs: t.decoys.skip(2).toList()),
                  ],
                ),
              ),
            ],
          ),
        );
    }
  }
}

class _CueBadge extends StatelessWidget {
  const _CueBadge({required this.meta, required this.isSwitch});
  final TaskMeta meta;
  final bool isSwitch;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: meta.color, borderRadius: BorderRadius.circular(20)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(meta.icon, size: 20, color: Colors.white),
            const SizedBox(width: 8),
            Text(
              '${L.t('judgeCue')}: ${meta.cue}',
              key: const Key('switching-cue'),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
            // ↻ появляется только когда задача сменилась — это и есть тот сигнал,
            // за который человек платит временем.
            if (isSwitch)
              const Padding(
                padding: EdgeInsets.only(left: 8),
                child: Text('↻', key: Key('switching-switch-mark'), style: TextStyle(color: Colors.white, fontSize: 18)),
              ),
          ],
        ),
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

class _DecoyRow extends StatelessWidget {
  const _DecoyRow({required this.glyphs});
  final List<String> glyphs;

  /// Помехи — фигуры того же набора, что у Струпа: рисунок помех общий у раздела.
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
  const _Answers({required this.meta, required this.onPick});
  final TaskMeta meta;
  final void Function(bool) onPick;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            Expanded(child: _Btn(label: '← ${meta.left}', slot: 'left', onTap: () => onPick(true))),
            const SizedBox(width: 8),
            Expanded(child: _Btn(label: '${meta.right} →', slot: 'right', onTap: () => onPick(false))),
          ],
        ),
      );
}

class _Btn extends StatelessWidget {
  const _Btn({required this.label, required this.slot, required this.onTap});
  final String label;
  final String slot;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TapLatency(
        where: 'Flutter/SwitchingTask',
        child: SizedBox(
          height: 56,
          child: FilledButton(
            key: Key('switching-answer-$slot'),
            onPressed: onTap,
            style: FilledButton.styleFrom(padding: EdgeInsets.zero),
            child: FittedBox(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700))),
          ),
        ),
      );
}
