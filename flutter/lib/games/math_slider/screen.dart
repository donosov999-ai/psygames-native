import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/answer_feedback.dart';
import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_result.dart';
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
  late final _answerFeedback = AnswerFeedback(widget.state);

  List<MathSliderQuestion> _questions = const [];
  MathSliderQuestion? _training;
  _Phase _phase = _Phase.training;
  int _index = 0;
  double _estimate = 0;
  bool _touched = false;
  bool _won = false;

  /// Уровень раздачи — для итога: после победы лестница уже на следующем.
  int _levelPlayed = 1;
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
    unawaited(_answerFeedback.dispose());
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
  /// Шаг передаёт уровень по правилу Дениса от 13.09.2026 «освоенный минус 20 %"
  /// (`warmup.ts`, `уровеньШага`): разминка заходит чуть ниже потолка, а не
  /// пытается взять максимум. Веб делает ровно так (`math-slider.tsx`:
  /// `num('level', lvl.level)`), и от этого же уровня строит зерно. Лестница при
  /// этом не двигается — это держит каркас.
  int get _playLevel => GamePreset.num('level', _ladder.level);

  String get _seed => 'math-slider-$_playLevel';

  /// Вопросов в партии — из адреса (`?trials=`), как веб: `math-slider.tsx:108` читает его всегда,
  /// 0 — значит «не задано», 8. В 1…20 зажимает сам генератор (`generateMathSliderQuestions`, как
  /// `session.ts:32`). Шаги наборов его сейчас не шлют, но веб читает — и молчаливая потеря стоит
  /// дороже строки (строгий сторож #273, задача 945f9d4d).
  int get _trialCount {
    final want = GamePreset.num('trials', 0);
    return want == 0 ? trialsPerRound : want;
  }

  void _reset() {
    // Новая партия — снова зачётная (договор shell/lesson.dart: отметку «разбор
    // смотрели» снимает новая раздача). Отметка общая на всё приложение, и без
    // сброса один открытый разбор выключал бы рост уровня во всех играх.
    LessonUsed.reset();
    _auto?.cancel();
    _advance?.cancel();
    _answerFeedback.clear();
    _levelPlayed = _playLevel;
    _questions = generateMathSliderQuestions(_seed, _playLevel, _trialCount);
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
    final right = !score.outsideTarget;
    unawaited(_answerFeedback.show('scale', right ? 'scale' : null, right: right));
    setState(() {
      _last = score;
      if (_phase == _Phase.training) {
        _phase = _Phase.trainingFeedback; // тренировка в счёт не идёт
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
      // Итог — общий каркаса ([LevelResult], задача e90a53d5): автопереход на следующий уровень.
      field: (context, h) => _phase == _Phase.result
          ? SizedBox(
              height: h,
              child: LevelResult(
                passed: _won,
                level: _levelPlayed,
                score: _won
                    ? L.f('sliderResultWin', {'p': '${(_accuracy * 100).round()}'})
                    : L.f('sliderResultFail',
                        {'p': '${(_accuracy * 100).round()}', 'need': '${(passAccuracy * 100).round()}'}),
                onNext: () => setState(_reset),
              ),
            )
          : AnswerMark(
              feedback: _answerFeedback,
              value: 'scale',
              child: _Field(
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
        AuxAction(inPause: true, icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _phase == _Phase.result ? null : _toolbar(context),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }

  Widget _toolbar(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final score = _last;
    if (!_answering && score != null) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _FeedbackCard(score: score),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.icon(
                key: const Key('дальше'),
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: Text(_phase == _Phase.trainingFeedback ? L.t('sliderStartGame') : L.t('sliderNextQuestion')),
              ),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton.icon(
              key: const Key('подтвердить'),
              onPressed: _confirm,
              icon: const Icon(Icons.check),
              label: Text(L.t('sliderConfirm')),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _touched
                ? L.f('sliderAutoConfirmHint', {'n': '${autoConfirmDelay.inSeconds}'})
                : L.t('sliderDragOrTap'),
            key: const Key('подсказка'),
            textAlign: TextAlign.center,
            style: text.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }
}

/// Карточка разбора: четыре показателя, цвет не единственный носитель значения.
class _FeedbackCard extends StatelessWidget {
  const _FeedbackCard({required this.score});

  final TrialScore score;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = numberLocale(L.locale);
    final answer = formatNumber(score.answer, locale: locale);
    final estimate = formatNumber(score.estimate, locale: locale);
    final signedError = formatNumber(score.signedError.abs(), locale: locale);
    final errorSign = score.signedError >= 0 ? '+' : '−';
    final accuracy = '${(score.accuracy * 100).round()}%';
    final isPerfect = score.accuracy >= 0.9999;

    return Card(
      key: const Key('разбор'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: _FeedbackItem(
                    label: L.t('sliderYourAnswer'),
                    value: estimate,
                    color: scheme.primary,
                  ),
                ),
                Container(width: 1, height: 40, color: scheme.outlineVariant),
                Expanded(
                  child: _FeedbackItem(
                    label: L.t('sliderExactAnswer'),
                    value: answer,
                    color: scheme.tertiary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _FeedbackItem(
                    label: L.t('sliderError'),
                    value: '$errorSign$signedError',
                    color: isPerfect ? scheme.outline : scheme.error,
                  ),
                ),
                Container(width: 1, height: 40, color: scheme.outlineVariant),
                Expanded(
                  child: _FeedbackItem(
                    label: L.t('hudAccuracy'),
                    value: accuracy,
                    color: isPerfect ? scheme.tertiary : scheme.primary,
                  ),
                ),
              ],
            ),

          ],
        ),
      ),
    );
  }
}

class _FeedbackItem extends StatelessWidget {
  const _FeedbackItem({required this.label, required this.value, required this.color});

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: text.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 2),
        Text(value, style: text.titleLarge?.copyWith(color: color, fontWeight: FontWeight.w800)),
      ],
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

    // Компактный блок: вопрос, подсказка, фигура, шкала. Без огромных пустот.
    final figureHeight = figure ? math.min(120.0, math.max(64.0, height * 0.22)) : 0.0;
    final lineHeight = math.min(160.0, math.max(120.0, height * 0.32));

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: height),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              if (training)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    L.t('sliderTrainingNote'),
                    key: const Key('тренировка'),
                    style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    textAlign: TextAlign.center,
                  ),
                ),
              Text(
                formatExpression(question.expression, locale: numberLocale(L.locale)),
                key: const Key('вопрос'),
                textAlign: TextAlign.center,
                style: text.displaySmall?.copyWith(fontWeight: FontWeight.w800, height: 1.1),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Text(
                  prompt,
                  style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                  textAlign: TextAlign.center,
                ),
              ),
              if (figure) ...[
                const SizedBox(height: 8),
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
              ],
              const SizedBox(height: 8),
              SizedBox(
                height: lineHeight,
                child: _NumberLine(
                  question: question,
                  estimate: estimate,
                  revealed: revealed,
                  enabled: enabled,
                  onChange: onChange,
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
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
    final locale = numberLocale(L.locale);

    return LayoutBuilder(builder: (context, c) {
      final pad = _sidePadding(c.maxWidth, scale);
      final w = math.max(1.0, c.maxWidth - 2 * pad);

      void fromX(double x) {
        final ratio = math.min(1.0, math.max(0.0, (x - pad) / w));
        onChange(scale.min + ratio * scale.width);
      }

      final pos = pad + ((estimate - scale.min) / scale.width).clamp(0.0, 1.0) * w;
      final answerPos = pad + ((question.answer - scale.min) / scale.width).clamp(0.0, 1.0) * w;

      // Мелкие деления: не меняют шаг ответа, только визуальная сетка.
      final majorWidth = w / scale.tickCount;
      final minorCount = majorWidth > 56 ? 4 : (majorWidth > 28 ? 1 : 0);

      return GestureDetector(
        key: const Key('шкала'),
        behavior: HitTestBehavior.opaque,
        onTapDown: enabled ? (d) => fromX(d.localPosition.dx) : null,
        onHorizontalDragStart: enabled ? (d) => fromX(d.localPosition.dx) : null,
        onHorizontalDragUpdate: enabled ? (d) => fromX(d.localPosition.dx) : null,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // Дорожка.
            Positioned(
              left: pad,
              width: w,
              top: _trackTop,
              child: Container(
                height: 4,
                decoration: BoxDecoration(
                  color: scheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            // Мелкие деления.
            if (minorCount > 0)
              for (var i = 0; i < scale.tickCount; i += 1)
                for (var j = 1; j <= minorCount; j += 1)
                  Positioned(
                    left: pad + (i + j / (minorCount + 1)) / scale.tickCount * w - 1,
                    top: _trackTop + 2,
                    child: Container(
                      width: 2,
                      height: 6,
                      color: scheme.outline.withValues(alpha: 0.5),
                    ),
                  ),
            // Крупные деления и подписи.
            for (var i = 0; i < scale.ticks.length; i += 1)
              Positioned(
                left: pad + (i / scale.tickCount) * w - _labelWidth / 2,
                top: _trackTop + 2,
                width: _labelWidth,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(width: 2, height: 10, color: scheme.outline),
                    const SizedBox(height: 4),
                    Text(
                      formatNumber(scale.ticks[i], locale: locale),
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ],
                ),
              ),
            // Точный ответ.
            if (revealed)
              _ValueBubble(
                left: answerPos,
                value: formatNumber(question.answer, locale: locale),
                color: scheme.tertiary,
                onSurface: scheme.onTertiary,
                offset: _bubbleOffset(answerPos, pos, c.maxWidth),
                key: const Key('ответ'),
              ),
            // Маркер оценки пользователя.
            _ValueBubble(
              left: pos,
              value: formatNumber(estimate, locale: locale),
              color: scheme.primary,
              onSurface: scheme.onPrimary,
              offset: revealed && (answerPos - pos).abs() < 40 ? 44.0 : 0.0,
              isMarker: true,
              semanticsKey: const Key('маркер'),
              semanticsLabel: L.f('sliderMarkerA11y', {'x': formatNumber(estimate, locale: locale)}),
            ),
          ],
        ),
      );
    });
  }

  static const double _trackTop = 96.0;
  static const double _labelWidth = 48.0;

  double _sidePadding(double maxWidth, MathSliderScale scale) {
    // На узком экране уменьшаем запас, но оставляем место для крайних подписей.
    final want = maxWidth > 360 ? 32.0 : 26.0;
    return math.min(want, maxWidth * 0.12);
  }

  double _bubbleOffset(double answerPos, double estimatePos, double maxWidth) {
    // Если маркеры близко, разводим их по высоте: ответ выше.
    if ((answerPos - estimatePos).abs() < 40) return -44.0;
    return 0.0;
  }
}

/// Пузырёк со значением над маркером. При необходимости смещается внутрь поля.
class _ValueBubble extends StatelessWidget {
  const _ValueBubble({
    required this.left,
    required this.value,
    required this.color,
    required this.onSurface,
    this.offset = 0.0,
    this.isMarker = false,
    this.semanticsKey,
    this.semanticsLabel,
    super.key,
  });

  final double left;
  final String value;
  final Color color;
  final Color onSurface;
  final double offset;
  final bool isMarker;
  final Key? semanticsKey;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bubble = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: 0.12),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        value,
        style: TextStyle(
          color: onSurface,
          fontWeight: FontWeight.w800,
          fontSize: 14,
        ),
      ),
    );

    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        bubble,
        const SizedBox(height: 2),
        Icon(
          isMarker ? Icons.location_on : Icons.arrow_drop_down,
          size: isMarker ? 26 : 22,
          color: isMarker ? color : color.withValues(alpha: 0.9),
        ),
      ],
    );

    return Positioned(
      left: left,
      top: _NumberLine._trackTop - 44 + offset,
      child: FractionalTranslation(
        translation: const Offset(-0.5, 0),
        child: semanticsKey != null
            ? Semantics(
                key: semanticsKey,
                slider: true,
                label: semanticsLabel,
                child: content,
              )
            : content,
      ),
    );
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
        final r = Rect.fromLTRB(
          i * cell + 1,
          h >= 0 ? base - h : base,
          (i + 1) * cell - 1,
          h >= 0 ? base : base - h,
        );
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
