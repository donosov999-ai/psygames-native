import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/boss_round.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/game_shell.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Состав числа» на общем каркасе: собрать цель из нескольких фишек.
///
/// 🔴 ВЕРНЫЙ ОТВЕТ ПРИНИМАЕТСЯ САМ, как только выбранные фишки дают цель, —
/// правило веб-версии: спорить не о чем, а лишний шаг между «решил» и
/// «засчитано» читается как «игра не заметила». НЕВЕРНУЮ сумму сама игра не
/// отвергает: человек мог не закончить набор, и мгновенная ошибка отняла бы у
/// него право доложить фишку. Поэтому кнопка «Проверить» остаётся — она для
/// «я закончил», а не для «подтверди очевидное».
class NumberBondsScreen extends StatefulWidget {
  const NumberBondsScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  @override
  State<NumberBondsScreen> createState() => _NumberBondsScreenState();
}

enum _Phase { playing, feedback, result }

class _NumberBondsScreenState extends State<NumberBondsScreen> {
  static const _feedbackDelay = Duration(milliseconds: 600);

  late LevelLadder _ladder;
  late Rng _rng;
  late BondsCfg _cfg;

  BondsPuzzle? _puzzle;
  final List<int> _picked = [];
  int _round = 1;
  int _hits = 0;
  int _errors = 0;
  bool? _right;
  bool _won = false;

  /// Итог боя с боссом после этой партии; `null` — боя не было (веб: `bossWon`).
  bool? _boss;
  bool _ready = false;
  _Phase _phase = _Phase.playing;
  int _leftMs = 0;
  Timer? _tick;
  Timer? _next;

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(gameId: 'number_bonds', store: SharedLevelStore(widget.state), maxLevel: 999);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _next?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _reset();
      _ready = true;
    });
  }

  void _reset() {
    // Новая партия — снова зачётная (договор shell/lesson.dart: отметку «разбор
    // смотрели» снимает новая раздача). Отметка общая на всё приложение, и без
    // сброса один открытый разбор выключал бы рост уровня во всех играх.
    LessonUsed.reset();
    _tick?.cancel();
    _next?.cancel();
    _cfg = levelParams(_ladder.level);
    _round = 1;
    _hits = 0;
    _errors = 0;
    _won = false;
    _phase = _Phase.playing;
    _newTask();
  }

  void _newTask() {
    _tick?.cancel();
    _picked.clear();
    _right = null;
    _puzzle = makePuzzle(_cfg, _rng);
    _leftMs = _cfg.windowMs;
    if (_cfg.windowMs <= 0) return;
    // Окно на задачу: просрочка засчитывается ошибкой, как в вебе.
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      setState(() => _leftMs = math.max(0, _leftMs - 100));
      if (_leftMs <= 0) _fail(late: true);
    });
  }

  int get _sum => _picked.fold(0, (s, i) => s + _puzzle!.chips[i]);

  void _toggle(int index) {
    if (_phase != _Phase.playing) return;
    setState(() {
      if (_picked.contains(index)) {
        _picked.remove(index);
      } else {
        _picked.add(index);
      }
    });
    // Автоприём: собранная цель засчитывается без кнопки.
    if (_picked.length >= bondsMinPicked && _sum == _puzzle!.target) _accept();
  }

  void _accept() {
    _tick?.cancel();
    setState(() {
      _hits += 1;
      _right = true;
      _phase = _Phase.feedback;
    });
    _after();
  }

  void _fail({bool late = false}) {
    _tick?.cancel();
    setState(() {
      _errors += 1;
      _right = false;
      _phase = _Phase.feedback;
    });
    _after();
  }

  void _after() {
    _next?.cancel();
    _next = Timer(_feedbackDelay, () async {
      if (!mounted) return;
      if (_round >= _cfg.trials) {
        final passed = _errors <= bondsErrorsAllowed;
        // Веха как в вебе: каждый третий ЗАСЧИТАННЫЙ уровень — бой «сложи подсвеченные».
        bool? boss;
        if (passed) {
          boss = await BossRound.winThenBoss(context, _ladder,
              type: BossType.counting, color: const Color(0xFF36D1DC));
        } else {
          await _ladder.fail();
        }
        if (!mounted) return;
        setState(() {
          _won = passed;
          _boss = boss;
          _phase = _Phase.result;
        });
        return;
      }
      setState(() {
        _round += 1;
        _phase = _Phase.playing;
        _newTask();
      });
    });
  }

  void _validate() {
    if (_phase != _Phase.playing) return;
    // Меньше двух фишек — не ответ: это ошибка, как в вебе.
    if (_picked.length < bondsMinPicked || _sum != _puzzle!.target) {
      _fail();
      return;
    }
    _accept();
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => L.t('numberBonds');

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachBondsTen')),
      ];

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final p = _puzzle!;
    return GameShell(
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('round'), value: '$_round/${_cfg.trials}', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '$_hits', icon: Icons.check_circle_outline),
        HudItem(label: L.t('errors'), value: '$_errors/$bondsErrorsAllowed', icon: Icons.error_outline),
        if (_cfg.windowMs > 0)
          HudItem(label: L.t('timeLeftLabel'), value: '${(_leftMs / 1000).ceil()} ${L.t('secShort')}', icon: Icons.timer_outlined),
      ],
      field: (context, h) => _Field(
        puzzle: p,
        picked: _picked,
        sum: _sum,
        right: _right,
        height: h,
        onTap: _toggle,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.backspace_outlined,
          label: L.t('clear'),
          onPressed: _phase == _Phase.playing && _picked.isNotEmpty
              ? () => setState(_picked.clear)
              : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _toolbar(context),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }

  Widget _toolbar(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (_phase == _Phase.result) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(
            _won
                ? L.f('nbResultWin', {'hits': '$_hits', 'errors': '$_errors'})
                : L.f('nbResultFail', {'errors': '$_errors', 'max': '$bondsErrorsAllowed'}),
            key: const Key('итог'),
            textAlign: TextAlign.center,
            style: text.titleMedium,
          ),
          BossOutcomeLine(_boss),
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const Key('дальше'),
            onPressed: () => setState(_reset),
            icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
            label: Text(_won ? L.t('nextLabel') : L.t('retry')),
          ),
        ]),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(12),
      child: FilledButton.icon(
        key: const Key('проверить'),
        onPressed: _phase == _Phase.playing ? _validate : null,
        icon: const Icon(Icons.check),
        label: Text(L.t('check')),
      ),
    );
  }
}

/// Поле: цель, набранная сумма и фишки. Размер фишки берётся от высоты поля.
class _Field extends StatelessWidget {
  const _Field({
    required this.puzzle,
    required this.picked,
    required this.sum,
    required this.right,
    required this.height,
    required this.onTap,
  });

  final BondsPuzzle puzzle;
  final List<int> picked;
  final int sum;
  final bool? right;
  final double height;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: LayoutBuilder(builder: (context, c) {
        const head = 96.0;   // цель и строка суммы
        final size = chipSize(c.maxWidth, math.max(0, height - head), puzzle.chips.length);
        return Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '${puzzle.target}',
              key: const Key('цель'),
              style: TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.w700,
                color: right == null
                    ? scheme.primary
                    : (right! ? const Color(0xFF22C55E) : const Color(0xFFF43F5E)),
              ),
            ),
            Text(
              picked.isEmpty ? L.t('nbPickChips') : L.f('nbCollected', {'sum': '$sum'}),
              key: const Key('сумма'),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 12),
            Wrap(
              key: const Key('фишки'),
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                for (var i = 0; i < puzzle.chips.length; i += 1)
                  SizedBox(
                    width: size,
                    height: size,
                    child: Material(
                      color: picked.contains(i) ? scheme.primary : scheme.surfaceContainerHighest,
                      shape: CircleBorder(
                        side: BorderSide(
                          color: picked.contains(i) ? scheme.primary : scheme.outlineVariant,
                          width: 2,
                        ),
                      ),
                      child: InkWell(
                        key: Key('фишка$i'),
                        customBorder: const CircleBorder(),
                        onTap: () => onTap(i),
                        child: Center(
                          child: Text(
                            '${puzzle.chips[i]}',
                            style: TextStyle(
                              fontSize: size * 0.33,
                              fontWeight: FontWeight.w800,
                              color: picked.contains(i) ? scheme.onPrimary : scheme.onSurface,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        );
      }),
    );
  }
}
