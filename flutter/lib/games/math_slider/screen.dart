import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../counting_common/generator_shadow.dart';
import 'model.dart';

/// «Математическая шкала» на общем каркасе — первая перенесённая игра с
/// ПЕРЕТАСКИВАНИЕМ. Жалоба Дениса 23.09.2026, с которой начался переезд, названа
/// им прямо: «везде, где перетаскивание тапом или соединением, глюки сильнее
/// всего». Здесь палец ведёт маркер напрямую, без веб-слоя между ним и игрой.
///
/// 🔴 ПОЛЕ БЕРЁТ ВЫСОТУ У КАРКАСА ЧИСЛОМ (`field: (context, h)`). Именно эта
/// игра стояла первой в задаче «игры ездят» (отчёт e5bfc2f0): на 360×640 её поле
/// не помещалось в высоту на 137 px. Считать от окна нечего — окно не знает ни
/// про шапку, ни про счётчики, ни про липкий низ.
///
/// Что перенесено как ПРАВИЛО, а не как вёрстка (модуль `model.dart`): лестница
/// из 13 полос, раздача по зерну `math-slider-<уровень>`, прилипание значения к
/// шагу шкалы, счёт очков и трёхсекундное самозасчитывание после отпускания.
class MathSliderScreen extends StatefulWidget {
  const MathSliderScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<MathSliderScreen> createState() => _MathSliderScreenState();
}

enum _Phase { training, trainingFeedback, playing, feedback, result }

class _MathSliderScreenState extends State<MathSliderScreen> {
  late LevelLadder _ladder;

  List<MathSliderQuestion> _questions = const [];
  MathSliderQuestion? _training;
  _Phase _phase = _Phase.training;
  int _index = 0;
  double _estimate = 0;
  bool _touched = false;
  bool _won = false;
  TrialScore? _last;
  final List<TrialScore> _trials = [];

  Timer? _auto;
  Timer? _advance;

  /// Тень генератора уровней (звено 4, задача 4e584381): раздача с новой партией, исход до лестницы.
  late final LadderShadow _shadow =
      LadderShadow(widget.state, gameId: 'math_slider', stepKeys: sliderStepKeys);
  final Stopwatch _watch = Stopwatch();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'math_slider', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _auto?.cancel();
    _advance?.cancel();
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

  /// Зерно партии — `math-slider-<уровень>`, как в вебе: один и тот же уровень
  /// даёт одни и те же примеры, поэтому «повторить эти же» имеет смысл.
  /// 🔴 УРОВЕНЬ ПАРТИИ — ИЗ ШАГА ЗАРЯДКИ, ЕСЛИ ШАГ ЕГО ЗАДАЛ, ИНАЧЕ ЛИЧНЫЙ.
  ///
  /// Шаг передаёт уровень по правилу Дениса от 13.09.2026 «освоенный минус 20 %»
  /// (`warmup.ts`, `уровеньШага`): разминка заходит чуть ниже потолка, а не
  /// пытается взять максимум. Веб делает ровно так (`math-slider.tsx`:
  /// `num('level', lvl.level)`), и от этого же уровня строит зерно. Лестница при
  /// этом не двигается — это держит каркас.
  int get _playLevel => GamePreset.num('level', _ladder.level);

  String get _seed => 'math-slider-$_playLevel';

  void _reset() {
    // Новая партия — снова зачётная (договор shell/lesson.dart: отметку «разбор
    // смотрели» снимает новая раздача). Отметка общая на всё приложение, и без
    // сброса один открытый разбор выключал бы рост уровня во всех играх.
    LessonUsed.reset();
    _auto?.cancel();
    _advance?.cancel();
    _questions = generateMathSliderQuestions(_seed, _playLevel, trialsPerRound);
    _shadow.deal(_playLevel);
    _training = generateTrainingQuestion(_seed);
    _trials.clear();
    _phase = _Phase.training;
    _index = 0;
    _won = false;
    _last = null;
    _startTrial(_training!);
  }

  void _startTrial(MathSliderQuestion q) {
    _touched = false;
    _estimate = snapValue(q.midpoint, q.scale);
    _watch
      ..reset()
      ..start();
  }

  MathSliderQuestion get _question =>
      _phase == _Phase.training || _phase == _Phase.trainingFeedback
          ? _training!
          : _questions[math.min(_index, _questions.length - 1)];

  bool get _answering => _phase == _Phase.training || _phase == _Phase.playing;

  void _change(double raw) {
    if (!_answering) return;
    final q = _question;
    setState(() {
      _estimate = snapValue(raw, q.scale);
      _touched = true;
    });
    // Отсчёт самозасчитывания идёт от ПОСЛЕДНЕГО касания, а не от показа вопроса.
    _auto?.cancel();
    _auto = Timer(autoConfirmDelay, () {
      if (mounted && _answering) _confirm();
    });
  }

  void _nudge(double delta) => _change(_estimate + delta);

  void _confirm() {
    if (!_answering) return;
    _auto?.cancel();
    _watch.stop();
    final score = scoreEstimate(_question, _estimate, _watch.elapsedMilliseconds);
    setState(() {
      _last = score;
      if (_phase == _Phase.training) {
        _phase = _Phase.trainingFeedback;   // тренировка в счёт не идёт
      } else {
        _trials.add(score);
        _phase = _Phase.feedback;
      }
    });
    _advance?.cancel();
    _advance = Timer(feedbackDelay, () {
      if (mounted) _next();
    });
  }

  Future<void> _next() async {
    _advance?.cancel();
    if (_phase == _Phase.trainingFeedback) {
      setState(() {
        _phase = _Phase.playing;
        _index = 0;
        _startTrial(_questions[0]);
      });
      return;
    }
    if (_phase != _Phase.feedback) return;
    if (_index + 1 < _questions.length) {
      setState(() {
        _index += 1;
        _phase = _Phase.playing;
        _startTrial(_questions[_index]);
      });
      return;
    }
    final won = _accuracy >= passAccuracy;
    _shadow.outcome(passed: won, errors: _outside);
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

  double get _accuracy {
    if (_trials.isEmpty) return 0;
    var sum = 0.0;
    for (final t in _trials) {
      sum += t.accuracy;
    }
    return sum / _trials.length;
  }

  int get _outside => _trials.where((t) => t.outsideTarget).length;

  /// Разделитель дробей — по языку человека, как в вебе: «6,25» по-русски, «6.25» иначе.
  String _fmt(double v) => formatNumber(v, locale: numberLocale(L.locale));

  String get _prompt {
    final e = _question.expression;
    if (e is IntegralArea) {
      return e.heights.any((h) => h < 0)
          ? L.t('sliderPromptSigned')
          : L.t('sliderPromptArea');
    }
    return L.t('sliderPromptWhere');
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => L.t('mathSlider');

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachSliderAnchor')),
      ];

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final q = _question;
    return GameShell(
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '$_playLevel', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(
          label: L.t('round'),
          value: _phase == _Phase.training || _phase == _Phase.trainingFeedback
              ? L.t('sliderTrialValue')
              : '${math.min(_index + 1, _questions.length)}/${_questions.length}',
          icon: Icons.format_list_numbered,
        ),
        HudItem(
          label: L.t('hudAccuracy'),
          value: _trials.isEmpty ? '—' : '${(_accuracy * 100).round()}%',
          icon: Icons.center_focus_strong_outlined,
        ),
        HudItem(label: L.t('sliderOutside'), value: '$_outside', icon: Icons.error_outline),
      ],
      field: (context, h) => _Field(
        question: q,
        estimate: _estimate,
        height: h,
        prompt: _prompt,
        training: _phase == _Phase.training || _phase == _Phase.trainingFeedback,
        revealed: _phase == _Phase.feedback || _phase == _Phase.trainingFeedback,
        touched: _touched,
        enabled: _answering,
        onChange: _change,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.chevron_left,
          label: L.t('sliderNudgeLeft'),
          onPressed: _answering ? () => _nudge(-q.scale.keyboardStep) : null,
        ),
        AuxAction(
          icon: Icons.chevron_right,
          label: L.t('sliderNudgeRight'),
          onPressed: _answering ? () => _nudge(q.scale.keyboardStep) : null,
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
                ? L.f('sliderResultWin', {'p': '${(_accuracy * 100).round()}'})
                : L.f('sliderResultFail', {'p': '${(_accuracy * 100).round()}', 'need': '${(passAccuracy * 100).round()}'}),
            key: const Key('итог'),
            textAlign: TextAlign.center,
            style: text.titleMedium,
          ),
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

    final score = _last;
    if (!_answering && score != null) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(
            L.f('sliderFeedback', {
              'a': _fmt(score.answer),
              'e': _fmt(score.estimate),
              'p': '${(score.normalizedError * 100).round()}',
            }),
            key: const Key('разбор'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const Key('дальше'),
            onPressed: _next,
            icon: const Icon(Icons.arrow_forward),
            label: Text(_phase == _Phase.trainingFeedback ? L.t('sliderStartGame') : L.t('sliderNextQuestion')),
          ),
        ]),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(
          _touched
              ? L.f('sliderReleaseHint', {'n': '${autoConfirmDelay.inSeconds}'})
              : L.t('sliderPlaceHint'),
          key: const Key('подсказка'),
          style: text.bodySmall,
        ),
        const SizedBox(height: 6),
        FilledButton.icon(
          key: const Key('подтвердить'),
          onPressed: _confirm,
          icon: const Icon(Icons.check),
          label: Text(L.t('sliderConfirm')),
        ),
      ]),
    );
  }
}

/// Поле: вопрос, фигура (у интеграла) и числовая прямая под отведённую высоту.
class _Field extends StatelessWidget {
  const _Field({
    required this.question,
    required this.estimate,
    required this.height,
    required this.prompt,
    required this.training,
    required this.revealed,
    required this.touched,
    required this.enabled,
    required this.onChange,
  });

  final MathSliderQuestion question;
  final double estimate;
  final double height;
  final String prompt;
  final bool training, revealed, touched, enabled;
  final void Function(double) onChange;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final figure = question.expression is IntegralArea;
    // Высота делится ОТ ЧИСЛА каркаса: прямая держит свои 128, фигура забирает
    // не больше половины остатка, подпись живёт в том, что осталось.
    const lineBlock = 128.0;
    final rest = math.max(0.0, height - lineBlock - 24);
    final figureHeight = figure ? math.min(rest * 0.62, 200.0) : 0.0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          const SizedBox(height: 8),
          if (training)
            Text(L.t('sliderTrainingNote'),
                key: const Key('тренировка'), style: text.bodySmall),
          Flexible(
            child: Center(
              child: Text(
                formatExpression(question.expression, locale: numberLocale(L.locale)),
                key: const Key('вопрос'),
                textAlign: TextAlign.center,
                style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
          ),
          if (figure)
            SizedBox(
              height: figureHeight,
              width: double.infinity,
              child: CustomPaint(
                painter: _AreaPainter(
                  area: question.expression as IntegralArea,
                  fill: scheme.primary,
                  negative: scheme.error,
                  axis: scheme.outline,
                ),
              ),
            ),
          Text(prompt, style: text.bodyMedium, textAlign: TextAlign.center),
          SizedBox(
            height: lineBlock,
            child: _NumberLine(
              question: question,
              estimate: estimate,
              revealed: revealed,
              enabled: enabled,
              onChange: onChange,
            ),
          ),
        ],
      ),
    );
  }
}

/// Числовая прямая: деления с подписями, маркер оценки и — после ответа —
/// метка точного ответа. Касание в любой точке дорожки переносит маркер туда:
/// так же ведёт себя веб-версия (PanResponder на всей дорожке).
class _NumberLine extends StatelessWidget {
  const _NumberLine({
    required this.question,
    required this.estimate,
    required this.revealed,
    required this.enabled,
    required this.onChange,
  });

  final MathSliderQuestion question;
  final double estimate;
  final bool revealed, enabled;
  final void Function(double) onChange;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final scale = question.scale;
    return LayoutBuilder(builder: (context, c) {
      // 🔴 ДОРОЖКА УЖЕ ПОЛЯ НА ПОЛПОДПИСИ С КАЖДОЙ СТОРОНЫ. Подписи делений и
      // маркер рисуются ОТ СЕРЕДИНЫ своей позиции, поэтому крайнее деление
      // выносило подпись за край поля на 8 точек (замер 23.09.2026, гейт раздела
      // «доска вписана в поле», 360×640 и 390×844). Обрезать нельзя: под подписью
      // человек и целится. Дорожка сжимается, отсчёт по ней остаётся тем же.
      const pad = 24.0;   // половина самой широкой подписи деления (width: 48)
      final w = math.max(1.0, c.maxWidth - 2 * pad);
      void fromX(double x) {
        final ratio = math.min(1.0, math.max(0.0, (x - pad) / w));
        onChange(scale.min + ratio * scale.width);
      }

      final pos = pad + ((estimate - scale.min) / scale.width).clamp(0.0, 1.0) * w;
      final answerPos = pad + ((question.answer - scale.min) / scale.width).clamp(0.0, 1.0) * w;

      return GestureDetector(
        key: const Key('шкала'),
        behavior: HitTestBehavior.opaque,
        onTapDown: enabled ? (d) => fromX(d.localPosition.dx) : null,
        onHorizontalDragStart: enabled ? (d) => fromX(d.localPosition.dx) : null,
        onHorizontalDragUpdate: enabled ? (d) => fromX(d.localPosition.dx) : null,
        child: Stack(children: [
          Positioned(
            left: pad,
            width: w,
            top: 46,
            child: Container(height: 4, color: scheme.outlineVariant),
          ),
          for (var i = 0; i < scale.ticks.length; i += 1)
            Positioned(
              left: pad + (i / scale.tickCount) * w - 24,
              top: 52,
              width: 48,
              child: Column(children: [
                Container(width: 2, height: 8, color: scheme.outline),
                Text(formatNumber(scale.ticks[i], locale: numberLocale(L.locale)),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.labelSmall),
              ]),
            ),
          if (revealed)
            Positioned(
              left: answerPos - 10,
              top: 26,
              child: Icon(Icons.arrow_drop_down, size: 20, color: scheme.tertiary, key: const Key('ответ')),
            ),
          Positioned(
            left: pos - 22,
            top: 0,
            child: Semantics(
              key: const Key('маркер'),
              slider: true,
              label: L.f('sliderMarkerA11y', {'x': formatNumber(estimate, locale: numberLocale(L.locale))}),
              child: Column(children: [
                Text(formatNumber(estimate, locale: numberLocale(L.locale)),
                    style: TextStyle(fontWeight: FontWeight.w700, color: scheme.primary)),
                Icon(Icons.place, color: scheme.primary, size: 28),
              ]),
            ),
          ),
        ]),
      );
    });
  }
}

/// Фигура «интеграл-оценка»: рисуется ТЕМИ ЖЕ срезами, которыми считается
/// площадь (`sampleAreaHeights`) — что видишь, то и считается.
class _AreaPainter extends CustomPainter {
  _AreaPainter({required this.area, required this.fill, required this.negative, required this.axis});

  final IntegralArea area;
  final Color fill, negative, axis;

  @override
  void paint(Canvas canvas, Size size) {
    final steps = area.form == 'steps';
    final k = steps ? area.heights.length : 60;
    final samples = sampleAreaHeights(area, k);
    final signed = area.heights.any((h) => h < 0);
    var maxAbs = 1.0;
    for (final v in samples) {
      if (v.abs() > maxAbs) maxAbs = v.abs();
    }
    final base = signed ? size.height / 2 : size.height - 12;
    final unit = (signed ? size.height / 2 : size.height - 16) / maxAbs;
    final cell = size.width / k;

    final up = Paint()..color = fill.withValues(alpha: 0.55);
    final down = Paint()..color = negative.withValues(alpha: 0.55);
    final line = Paint()
      ..color = axis
      ..strokeWidth = 1.5;

    if (steps) {
      for (var i = 0; i < samples.length; i += 1) {
        final h = samples[i] * unit;
        final r = Rect.fromLTRB(i * cell + 1, h >= 0 ? base - h : base, (i + 1) * cell - 1,
            h >= 0 ? base : base - h);
        canvas.drawRect(r, h >= 0 ? up : down);
      }
    } else {
      final path = Path()..moveTo(0, base);
      for (var i = 0; i < samples.length; i += 1) {
        path.lineTo((i + 0.5) * cell, base - samples[i] * unit);
      }
      path
        ..lineTo(size.width, base)
        ..close();
      canvas.drawPath(path, up);
      if (signed) {
        canvas.save();
        canvas.clipRect(Rect.fromLTWH(0, base, size.width, size.height - base));
        canvas.drawPath(path, down);
        canvas.restore();
      }
    }
    canvas.drawLine(Offset(0, base), Offset(size.width, base), line);
  }

  @override
  bool shouldRepaint(covariant _AreaPainter old) => old.area != area;
}
