import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Быстрый счёт» на общем каркасе: точки вспыхивают, надо назвать сколько.
///
/// 🔴 ДВА ПРАВИЛА ВЁРСТКИ ПЕРЕНЕСЕНЫ КАК ПРАВИЛА, А НЕ НАРИСОВАНЫ ЗАНОВО:
/// · ряд ответов считает столбцы от САМОГО УЗКОГО экрана (`answerGrid`) —
///   иначе полоса прыгает между телефонами (замер веба: 133 против 193);
/// · точки раскидываются с отступом от края и зазором между собой
///   (`scatterDots`) — от них зависит, читается ли картинка как отдельные точки.
///
/// Поле берёт высоту у каркаса числом, поэтому низ под ряд ответов резервировать
/// вручную не нужно: ряд живёт в липком низу, а полю достаётся ровно остаток.
class QuickCountScreen extends StatefulWidget {
  const QuickCountScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final math.Random? rnd;

  @override
  State<QuickCountScreen> createState() => _QuickCountScreenState();
}

enum _Phase { ready, flash, hold, answer, result }

class _QuickCountScreenState extends State<QuickCountScreen> {
  static const double dotR = 16;

  late LevelLadder _ladder;
  late math.Random _rnd;
  late LevelParams _params;

  _Phase _phase = _Phase.ready;
  int _trial = 0;
  int _correct = 0;
  int _wrong = 0;
  int _n = 0;
  int _shift = 0;
  int? _picked;
  bool _won = false;
  bool _ready = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _rnd = widget.rnd ?? math.Random();
    _ladder = LevelLadder(gameId: 'quick_count', store: SharedLevelStore(widget.state), maxLevel: quickCountLevels);
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
    setState(() {
      _reset();
      _ready = true;
    });
  }

  void _reset() {
    _timer?.cancel();
    _params = levelParams(_ladder.level);
    _phase = _Phase.ready;
    _trial = 0;
    _correct = 0;
    _wrong = 0;
    _picked = null;
    _won = false;
  }

  void _startTrial() {
    _timer?.cancel();
    setState(() {
      _n = _params.minN + _rnd.nextInt(_params.maxN - _params.minN + 1);
      // Сдвиг окна тянется ОДИН раз на пробу: иначе кнопки перескакивали бы
      // при каждой перерисовке, пока человек целится.
      _shift = rollWindowShift(_rnd);
      _picked = null;
      _phase = _Phase.flash;
    });
    _timer = Timer(Duration(milliseconds: _params.exposureMs), () {
      if (!mounted) return;
      setState(() => _phase = _Phase.hold);
      // Задержка — третья ось лестницы: с 32-го уровня число надо продержать в уме.
      _timer = Timer(Duration(milliseconds: _params.holdMs), () {
        if (!mounted) return;
        setState(() => _phase = _Phase.answer);
      });
    });
  }

  Future<void> _answer(int value) async {
    if (_phase != _Phase.answer) return;
    final right = value == _n;
    setState(() {
      _picked = value;
      if (right) {
        _correct += 1;
      } else {
        _wrong += 1;
      }
      _trial += 1;
    });
    if (_trial < trialsPerRound) {
      _startTrial();
      return;
    }
    final accuracy = _correct / trialsPerRound * 100;
    final won = accuracy >= passAccuracyPercent;
    if (won) {
      await _ladder.win();
    } else {
      await _ladder.fail();
    }
    if (!mounted) return;
    setState(() {
      _won = won;
      _phase = _Phase.result;
    });
  }

  String get _line {
    switch (_phase) {
      case _Phase.ready:
        return 'Точки вспыхнут на мгновение — назови, сколько их';
      case _Phase.flash:
        return 'Смотри';
      case _Phase.hold:
        return _params.holdMs > 0 ? 'Держи число в уме' : '…';
      case _Phase.answer:
        return 'Сколько было точек?';
      case _Phase.result:
        final accuracy = (_correct / trialsPerRound * 100).round();
        return _won ? 'Уровень взят: $accuracy% верных' : 'Верных $accuracy% — нужно 80%';
    }
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => 'Быстрый счёт';

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachCountGroups')),
      ];

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: 'Проба', value: '${math.min(_trial + 1, trialsPerRound)}/$trialsPerRound', icon: Icons.repeat),
        HudItem(label: 'Верно', value: '$_correct', icon: Icons.check_circle_outline),
        HudItem(label: 'Ошибки', value: '$_wrong', icon: Icons.error_outline),
      ],
      field: (context, h) => _Field(
        phase: _phase,
        n: _n,
        trial: _trial,
        height: h,
        dotR: dotR,
        rnd: widget.rnd,
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: () => setState(_reset)),
      ]),
      toolbar: _toolbar(context),
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }

  Widget _toolbar(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final screenW = MediaQuery.sizeOf(context).width;
    final window = answerWindow(_params, _n, _shift);
    final grid = answerGrid(window.length, screenW);

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(_line, key: const Key('строка'), textAlign: TextAlign.center, style: text.bodyMedium),
        const SizedBox(height: 8),
        if (_phase == _Phase.ready)
          FilledButton.icon(
            key: const Key('начать'),
            onPressed: _startTrial,
            icon: const Icon(Icons.play_arrow),
            label: const Text('Начать'),
          ),
        if (_phase == _Phase.answer)
          SizedBox(
            key: const Key('ряд-ответов'),
            height: grid.rows * grid.size + (grid.rows - 1) * btnGap,
            child: Wrap(
              spacing: btnGap,
              runSpacing: btnGap,
              alignment: WrapAlignment.center,
              children: [
                for (final value in window)
                  SizedBox(
                    width: grid.size,
                    height: grid.size,
                    child: FilledButton(
                      key: Key('ответ$value'),
                      style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                      onPressed: () => _answer(value),
                      child: Text('$value'),
                    ),
                  ),
              ],
            ),
          ),
        if (_phase == _Phase.result)
          FilledButton.icon(
            key: const Key('дальше'),
            onPressed: () => setState(_reset),
            icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
            label: Text(_won ? 'Следующий уровень' : 'Ещё раз'),
          ),
        if (_picked != null && _phase != _Phase.result && _phase != _Phase.answer)
          Text('было $_n', key: const Key('было'), style: text.bodySmall),
      ]),
    );
  }
}

/// Поле с точками. Точки раскидываются ТЕМ ЖЕ правилом, что в вебе, и считаются
/// от размера поля, а не от окна: высоту поле получает числом от каркаса.
class _Field extends StatelessWidget {
  const _Field({
    required this.phase,
    required this.n,
    required this.trial,
    required this.height,
    required this.dotR,
    this.rnd,
  });

  final _Phase phase;
  final int n, trial;
  final double height, dotR;
  final math.Random? rnd;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth - 16;
      final fieldH = math.max(0.0, height - 16);
      if (phase != _Phase.flash) {
        return Center(
          child: Icon(
            phase == _Phase.hold ? Icons.hourglass_empty : Icons.visibility_outlined,
            size: 48,
            color: scheme.outlineVariant,
          ),
        );
      }
      // Раздача точек повторяема внутри пробы: зерно — номер пробы, поэтому
      // перерисовка не перекладывает точки под пальцем.
      final dots = scatterDots(n, w, fieldH, dotR, rnd ?? math.Random(trial * 7919 + n));
      return Center(
        child: SizedBox(
          key: const Key('поле'),
          width: w,
          height: fieldH,
          child: Stack(children: [
            for (var i = 0; i < dots.length; i += 1)
              Positioned(
                key: Key('точка$i'),
                left: dots[i].x - dotR,
                top: dots[i].y - dotR,
                child: Container(
                  width: dotR * 2,
                  height: dotR * 2,
                  decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle),
                ),
              ),
          ]),
        ),
      );
    });
  }
}
