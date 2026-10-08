import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';
import 'screen.dart' show MonsterPainter, traitLabel;

/// «КОГО НЕ ХВАТАЕТ» — второй режим «Найди признак» (`/games/monster-traits?mode=missing`).
///
/// Движок MindLab `mindsters/monsters.py`, класс `Missing` (решение Дениса 30.09.2026:
/// режимом этой же игры). Показ руки монстров → рука без одного (с L19 — без двоих) →
/// выбрать убранного из вариантов. Помехи — монстры, которых в руке НЕ было, с L4 похожие
/// на убранного двумя признаками из трёх: отличить можно, только если запомнил все три.
/// Три пробы на ступень, взята при двух верных — одна проба угадывается в 25 %.
class MonsterMissingScreen extends StatefulWidget {
  const MonsterMissingScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно раздачи для проб; без него — случайная.
  final int? seed;

  @override
  State<MonsterMissingScreen> createState() => _MonsterMissingScreenState();
}

enum _Phase { study, recall, feedback, result }

class _MonsterMissingScreenState extends State<MonsterMissingScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  late final LevelLadder _ladder;
  late final math.Random _rnd;
  MissingRound? _round;
  _Phase _phase = _Phase.study;
  final Set<Monster> _picked = {};
  int _trial = 0; // номер пробы с нуля
  int _correct = 0;
  bool? _lastOk;
  bool _won = false;
  int _levelNo = 1;
  // Часы партии (lib/shell/game_clock.dart): стоят под паузой, разбором и в фоне.
  int _startedMs = gameNow();
  GameTimer? _timer;

  @override
  void initState() {
    super.initState();
    _rnd = math.Random(widget.seed);
    _ladder = LevelLadder(
      gameId: missingLadderKey,
      store: SharedLevelStore(widget.state),
      sessionType: 'monster_traits',
      sessionMode: 'missing',
    );
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_newLevel);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _newLevel() {
    // Новая партия — снова зачётная: отметку разбора снимает новая раздача.
    LessonUsed.reset();
    _levelNo = _ladder.level;
    _trial = 0;
    _correct = 0;
    _won = false;
    _startedMs = gameNow();
    _deal();
  }

  void _deal() {
    _timer?.cancel();
    _round = MissingRound.deal(_levelNo, _rnd);
    _picked.clear();
    _lastOk = null;
    _phase = _Phase.study;
    _timer = gameTimeout(Duration(milliseconds: missingLevelFor(_levelNo).studyMs), () {
      if (mounted) setState(() => _phase = _Phase.recall);
    });
  }

  void _toggle(Monster m) {
    if (_phase != _Phase.recall) return;
    setState(() {
      if (!_picked.remove(m)) _picked.add(m);
    });
  }

  Future<void> _check() async {
    final round = _round!;
    if (_phase != _Phase.recall || _picked.length != round.gone.length) return;
    final ok = round.check(_picked);
    ok ? _haptics.win() : _haptics.miss();
    setState(() {
      _lastOk = ok;
      if (ok) _correct += 1;
      _phase = _Phase.feedback;
    });
    _timer = gameTimeout(const Duration(milliseconds: 1100), () async {
      if (!mounted) return;
      if (_trial + 1 < missingTrials) {
        setState(() {
          _trial += 1;
          _deal();
        });
        return;
      }
      await _finish();
    });
  }

  Future<void> _finish() async {
    final passed = _correct >= missingPassAt;
    final seconds = (gameNow() - _startedMs) ~/ 1000;
    final lv = missingLevelFor(_levelNo);
    final details = <String, Object?>{
      'hand': lv.hand,
      'gone': lv.gone,
      'options': lv.options,
      'study_ms': lv.studyMs,
      'similar': lv.similar,
      'correct': _correct,
      'trials': missingTrials,
    };
    if (passed) {
      await _ladder.win(score: _correct * 100, timeSeconds: seconds, errors: missingTrials - _correct, details: details);
    } else {
      await _ladder.fail(score: _correct * 100, timeSeconds: seconds, errors: missingTrials - _correct, details: details);
    }
    if (!mounted) return;
    setState(() {
      _won = passed;
      _phase = _Phase.result;
    });
  }

  /// РАЗБОР — ПРИЁМ: называть каждого про себя ТРЕМЯ признаками. Картинку целиком память
  /// держит плохо, а тройку слов — хорошо; убранного узнаёшь по тому, какой тройки нет.
  List<DemoTrial> _demoTrials() {
    final r = _round!;
    final gone = r.goneMonsters.first;
    String name(Monster m) =>
        '${traitLabel(Trait.color, m.color)} · ${traitLabel(Trait.body, m.body)} · ${traitLabel(Trait.eyes, m.eyes)}';
    return [
      DemoTrial(text: '', rule: L.t('teachMissingName'), art: _HandArt(monsters: r.hand)),
      DemoTrial(text: name(gone), rule: L.t('teachMissingCheck'), art: _HandArt(monsters: r.shown)),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final round = _round;
    if (round == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final lv = missingLevelFor(_levelNo);
    return GameShell(
      title: L.t('monsterMissing'),
      onLesson: _phase == _Phase.study || _phase == _Phase.recall
          ? () => openDemoLesson(context, title: L.t('monsterMissing'), trials: _demoTrials())
          : null,
      hud: [
        HudItem(label: L.t('level'), value: '$_levelNo', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${math.min(_trial + 1, missingTrials)}/$missingTrials', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '$_correct', icon: Icons.check_circle_outline),
      ],
      field: (context, h) => LayoutBuilder(builder: (context, c) {
        final text = Theme.of(context).textTheme;
        final study = _phase == _Phase.study;
        final table = study ? round.hand : round.shown;
        return Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Text(
              study
                  ? L.t('mtRemember')
                  : round.gone.length == 1
                      ? L.t('mtMissingAsk')
                      : L.t('mtMissingAsk2'),
              key: const ValueKey('mm-ask'),
              textAlign: TextAlign.center,
              style: text.titleMedium,
            ),
          ),
          if (study)
            LinearProgressIndicator(key: const ValueKey('mm-study'), minHeight: 3, value: null),
          Expanded(
            flex: 5,
            child: _Table(
              key: ValueKey(study ? 'mm-hand' : 'mm-shown'),
              monsters: table,
              maxW: c.maxWidth,
            ),
          ),
          if (!study)
            Expanded(
              flex: 4,
              child: _Options(
                options: round.options,
                picked: _picked,
                gone: _phase == _Phase.recall ? null : round.goneMonsters,
                onTap: _phase == _Phase.recall ? _toggle : null,
              ),
            ),
        ]);
      }),
      toolbar: Padding(
        padding: const EdgeInsets.all(12),
        child: switch (_phase) {
          _Phase.result => FilledButton.icon(
              key: const ValueKey('mm-next'),
              onPressed: () => setState(_newLevel),
              icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
              label: Text('${_won ? L.t('nextLabel') : L.t('retry')} · $_correct/$missingTrials'),
            ),
          _Phase.feedback => Text(
              _lastOk == true ? '✓' : '✗',
              key: const ValueKey('mm-verdict'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: _lastOk == true ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
              ),
            ),
          _ => FilledButton.icon(
              key: const ValueKey('mm-check'),
              onPressed: _phase == _Phase.recall && _picked.length == lv.gone ? _check : null,
              icon: const Icon(Icons.check),
              label: Text(L.t('check')),
            ),
        },
      ),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_newLevel)),
      ],
    );
  }
}

/// Стол: монстры рядами, клетка по ширине и не мельче пальца.
class _Table extends StatelessWidget {
  const _Table({super.key, required this.monsters, required this.maxW});

  final List<Monster> monsters;
  final double maxW;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final n = monsters.length;
      final cols = n <= 4 ? n : (n <= 6 ? 3 : 4);
      final rows = (n / cols).ceil();
      const gap = 8.0;
      final cell = math.max(
          36.0, math.min((c.maxWidth - 16 - gap * (cols - 1)) / cols, (c.maxHeight - 8 - gap * (rows - 1)) / rows));
      return Center(
        child: Wrap(
          spacing: gap,
          runSpacing: gap,
          alignment: WrapAlignment.center,
          children: [
            for (var i = 0; i < n; i++)
              SizedBox(
                key: ValueKey('mm-table-$i'),
                width: cell,
                height: cell,
                child: CustomPaint(painter: MonsterPainter(monsters[i])),
              ),
          ],
        ),
      );
    });
  }
}

/// Варианты ответа. После ответа убранные обведены зелёным, ошибочный выбор — красным.
class _Options extends StatelessWidget {
  const _Options({required this.options, required this.picked, required this.gone, this.onTap});

  final List<Monster> options;
  final Set<Monster> picked;
  final Set<Monster>? gone;
  final void Function(Monster)? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(builder: (context, c) {
      final n = options.length;
      final cols = n <= 4 ? n : 4;
      final rows = (n / cols).ceil();
      const gap = 10.0;
      final cell = math.max(
          48.0, math.min((c.maxWidth - 24 - gap * (cols - 1)) / cols, (c.maxHeight - 12 - gap * (rows - 1)) / rows));
      return Center(
        child: Wrap(
          spacing: gap,
          runSpacing: gap,
          alignment: WrapAlignment.center,
          children: [
            for (var i = 0; i < n; i++)
              Builder(builder: (_) {
                final m = options[i];
                final sel = picked.contains(m);
                final right = gone?.contains(m) ?? false;
                final border = gone == null
                    ? (sel ? scheme.primary : scheme.outlineVariant)
                    : right
                        ? const Color(0xFF16A34A)
                        : sel
                            ? const Color(0xFFDC2626)
                            : scheme.outlineVariant;
                return Semantics(
                  button: onTap != null,
                  selected: sel,
                  label: '${traitLabel(Trait.color, m.color)}, ${traitLabel(Trait.body, m.body)}, '
                      '${traitLabel(Trait.eyes, m.eyes)}',
                  child: GestureDetector(
                    key: ValueKey('mm-option-$i'),
                    behavior: HitTestBehavior.opaque,
                    onTap: onTap == null ? null : () => onTap!(m),
                    child: Container(
                      width: cell,
                      height: cell,
                      padding: EdgeInsets.all(cell * 0.06),
                      decoration: BoxDecoration(
                        color: scheme.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: border, width: sel || right ? 4 : 1.5),
                      ),
                      child: CustomPaint(painter: MonsterPainter(m)),
                    ),
                  ),
                );
              }),
          ],
        ),
      );
    });
  }
}

/// Рисунок шага разбора: рука монстров тем же рисовальщиком, что на столе.
class _HandArt extends StatelessWidget {
  const _HandArt({required this.monsters});
  final List<Monster> monsters;

  @override
  Widget build(BuildContext context) => FittedBox(
        child: SizedBox(
          width: 320,
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final m in monsters) SizedBox(width: 72, height: 72, child: CustomPaint(painter: MonsterPainter(m))),
            ],
          ),
        ),
      );
}
