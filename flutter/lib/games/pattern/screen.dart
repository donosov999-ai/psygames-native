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
import 'model.dart';

/// «Паттерны» на общем каркасе: игрок видит ряд и называет следующее число.
///
/// 🔴 РАСКЛАДКА РЯДА ПЕРЕНЕСЕНА ПРАВИЛОМ (`cellSize`), а не нарисована заново.
/// В ряду бывает пять и шесть чисел (L17, L19), а в смеси (L23+) числа в тысячи:
/// клетки и кегль считаются от ШИРИНЫ ПОЛЯ, иначе «?» уезжает на вторую строку —
/// ровно это и чинил замер 17.09.2026 в вебе.
///
/// Подсказка в две ступени, как в вебе: сперва класс ряда, потом само правило.
class PatternScreen extends StatefulWidget {
  const PatternScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  @override
  State<PatternScreen> createState() => _PatternScreenState();
}

enum _Phase { playing, feedback, result }

class _PatternScreenState extends State<PatternScreen> {
  static const _feedbackDelay = Duration(milliseconds: 700);

  late LevelLadder _ladder;
  late Rng _rng;

  Sequence? _seq;
  List<int> _options = const [];
  int _round = 1;

  /// Проб в партии. В шаге зарядки число задаёт шаг (`trials`, по умолчанию
  /// 10) — так же, как в вебе (`pattern.tsx`: `num('trials', 10)`); вне
  /// зарядки — постоянное число партии.
  int _trials = trialsPerRound;
  int _hits = 0;
  int _errors = 0;
  int _hintStage = 0;
  bool _hintUsed = false;
  bool? _right;
  _Phase _phase = _Phase.playing;
  bool _won = false;
  bool _ready = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    final base = math.Random();
    _rng = widget.rnd ?? base.nextDouble;
    _ladder = LevelLadder(gameId: 'pattern', store: SharedLevelStore(widget.state));
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
    // Новая партия — снова зачётная (договор shell/lesson.dart: отметку «разбор
    // смотрели» снимает новая раздача). Отметка общая на всё приложение, и без
    // сброса один открытый разбор выключал бы рост уровня во всех играх.
    LessonUsed.reset();
    _timer?.cancel();
    _trials = GamePreset.isPreset ? GamePreset.num('trials', trialsPerRound) : trialsPerRound;
    _round = 1;
    _hits = 0;
    _errors = 0;
    _hintUsed = false;
    _won = false;
    _phase = _Phase.playing;
    _newRound();
  }

  void _newRound() {
    _hintStage = 0;
    _right = null;
    final s = makeSequence(_ladder.level, _rng);
    _seq = s;
    // Приманка у хвоста: «последний + последний шаг» стоит среди вариантов (задача 94f9c7c1).
    _options = makeOptions(s.answer, _rng, tail: tailLure(s.items));
  }

  /// 🔴 МЕТРИКА ДОМЕНА «ОЦЕНКИ» — те же поля, что `saveSession` веба (`pattern.tsx:177`).
  /// Биомаркер — ДОЛЯ `hit_rate` (норма в `assessment.ts` 0,8 ± 0,2), а не сырые
  /// попадания: число проб задаёт шаг, и 12 из 15 давало бы z = +8 за длину партии.
  Map<String, Object?> _details() => {
        'level': _ladder.level,
        'hits': _hits,
        'errors': _errors,
        'trials': _trials,
        'hint_used': _hintUsed,
        'hit_rate': _trials > 0 ? double.parse((_hits / _trials).toStringAsFixed(3)) : 0,
      };

  Future<void> _answer(int value) async {
    if (_phase != _Phase.playing) return;
    final correct = value == _seq!.answer;
    setState(() {
      _right = correct;
      _phase = _Phase.feedback;
      if (correct) {
        _hits += 1;
      } else {
        _errors += 1;
      }
    });
    _timer = Timer(_feedbackDelay, () async {
      if (!mounted) return;
      if (_round >= _trials) {
        final passed = _hits / _trials >= passHitRate;
        final details = _details();
        if (passed) {
          await _ladder.win(details: details);
        } else {
          await _ladder.fail(details: details);
        }
        if (!mounted) return;
        setState(() {
          _won = passed;
          _phase = _Phase.result;
        });
        return;
      }
      setState(() {
        _round += 1;
        _phase = _Phase.playing;
        _newRound();
      });
    });
  }

  /// Звёзды как в вебе: без ошибок — три, до двух — две, дальше одна;
  /// подсказка за партию опускает потолок до двух.
  int get _stars {
    final base = _errors == 0 ? 3 : (_errors <= 2 ? 2 : 1);
    return _hintUsed ? math.min(2, base) : base;
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => L.t('pattern');

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachPatternPeriod')),
      ];

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final seq = _seq!;
    return GameShell(
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('round'), value: '$_round/$_trials', icon: Icons.repeat),
        HudItem(label: L.t('hud_correct'), value: '$_hits', icon: Icons.check_circle_outline),
        HudItem(label: L.t('errors'), value: '$_errors', icon: Icons.error_outline),
      ],
      field: (context, h) => _Field(
        seq: seq,
        height: h,
        right: _right,
        hintStage: _hintStage,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: _hintStage == 0
              ? L.t('btn_hint')
              : (_hintStage == 1 ? L.t('hintMoreRule') : L.t('hintUsed')),
          active: _hintStage > 0,
          onPressed: _phase == _Phase.playing && _hintStage < 2
              ? () => setState(() {
                    _hintStage = math.min(2, _hintStage + 1);
                    _hintUsed = true;   // подсказка за партию → потолок 2 звезды
                  })
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
      final percent = (_hits / _trials * 100).round();
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(
            _won
                ? L.f('patResultWin', {'p': '$percent', 'stars': '$_stars'})
                : L.f('qcResultFail', {'p': '$percent', 'need': '${(passHitRate * 100).round()}'}),
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
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        alignment: WrapAlignment.center,
        children: [
          for (final o in _options)
            SizedBox(
              height: 56,
              child: FilledButton(
                key: Key('ответ$o'),
                onPressed: _phase == _Phase.playing ? () => _answer(o) : null,
                child: Text(showNumber(o), style: const TextStyle(fontSize: 18)),
              ),
            ),
        ],
      ),
    );
  }
}

/// Поле: строка-вопрос, ряд клеток по правилу `cellSize` и — по запросу — подсказка.
class _Field extends StatelessWidget {
  const _Field({required this.seq, required this.height, required this.right, required this.hintStage});

  final Sequence seq;
  final double height;
  final bool? right;
  final int hintStage;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: LayoutBuilder(builder: (context, c) {
        final labels = [...seq.items.map(showNumber), '?'];
        final size = cellSizeFor(c.maxWidth, height, labels, hasHint: hintStage >= 1);
        final cellH = cellHeight(size.font);
        return Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(L.t('patternHint'), style: text.bodyMedium, textAlign: TextAlign.center),
            SizedBox(height: math.min(16, height * 0.04)),
            Wrap(
              key: const Key('ряд'),
              spacing: size.gap,
              runSpacing: size.gap,
              alignment: WrapAlignment.center,
              children: [
                for (var i = 0; i < labels.length; i += 1)
                  Container(
                    key: i == labels.length - 1 ? const Key('клетка-вопрос') : Key('клетка$i'),
                    // ⚠️ ШИРИНА КЛЕТКИ ЗАДАЁТСЯ ЧИСЛОМ ПРАВИЛА, а не минимумом:
                    // с `minWidth` контейнер растягивался на всю ширину поля, и
                    // ряд вставал СТОЛБЦОМ — поймано пробой раскладки.
                    width: size.cell,
                    height: cellH,
                    padding: EdgeInsets.symmetric(horizontal: size.pad),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: i < labels.length - 1
                          ? scheme.surfaceContainerHighest
                          : (right == null
                              ? Colors.transparent
                              : (right! ? const Color(0xFF22C55E) : const Color(0xFFF43F5E))),
                      border: Border.all(
                        color: i < labels.length - 1 ? scheme.outlineVariant : scheme.primary,
                        width: i < labels.length - 1 ? 1 : 2,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      labels[i],
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: size.font,
                        fontWeight: FontWeight.w700,
                        color: i < labels.length - 1
                            ? scheme.onSurface
                            : (right == null ? scheme.primary : Colors.white),
                      ),
                    ),
                  ),
              ],
            ),
            if (hintStage >= 1) ...[
              SizedBox(height: math.min(16, height * 0.04)),
              Container(
                key: const Key('подсказка'),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  border: Border.all(color: scheme.primary, width: 1.5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(
                    L.t(seq.classKey),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  if (hintStage >= 2)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        fillParams(L.t(seq.ruleKey), seq.ruleParams),
                        textAlign: TextAlign.center,
                        style: text.bodySmall,
                      ),
                    ),
                ]),
              ),
            ],
          ],
        );
      }),
    );
  }
}
