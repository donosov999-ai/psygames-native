import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
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
    _timer?.cancel();
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
    _options = makeOptions(s.answer, _rng);
  }

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
      if (_round >= trialsPerRound) {
        final passed = _hits / trialsPerRound >= passHitRate;
        if (passed) {
          await _ladder.win();
        } else {
          await _ladder.fail();
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

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final seq = _seq!;
    return GameShell(
      title: 'Паттерны',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: 'Проба', value: '$_round/$trialsPerRound', icon: Icons.repeat),
        HudItem(label: 'Верно', value: '$_hits', icon: Icons.check_circle_outline),
        HudItem(label: 'Ошибки', value: '$_errors', icon: Icons.error_outline),
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
              ? 'Подсказка'
              : (_hintStage == 1 ? 'Ещё подсказка' : 'Подсказка использована'),
          active: _hintStage > 0,
          onPressed: _phase == _Phase.playing && _hintStage < 2
              ? () => setState(() {
                    _hintStage = math.min(2, _hintStage + 1);
                    _hintUsed = true;   // подсказка за партию → потолок 2 звезды
                  })
              : null,
        ),
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
    if (_phase == _Phase.result) {
      final percent = (_hits / trialsPerRound * 100).round();
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(
            _won ? 'Уровень взят: $percent% верных, звёзд $_stars' : 'Верных $percent% — нужно 70%',
            key: const Key('итог'),
            textAlign: TextAlign.center,
            style: text.titleMedium,
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const Key('дальше'),
            onPressed: () => setState(_reset),
            icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
            label: Text(_won ? 'Следующий уровень' : 'Ещё раз'),
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
            Text('Какое число продолжает ряд?', style: text.bodyMedium, textAlign: TextAlign.center),
            SizedBox(height: math.min(16, height * 0.04)),
            Wrap(
              key: const Key('ряд'),
              spacing: size.gap,
              runSpacing: size.gap,
              alignment: WrapAlignment.center,
              children: [
                for (var i = 0; i < labels.length; i += 1)
                  Container(
                    key: Key(i == labels.length - 1 ? 'клетка-вопрос' : 'клетка$i'),
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
                    patternClassRu[seq.classKey] ?? seq.classKey,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  if (hintStage >= 2)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        fillParams(patternRuleRu[seq.ruleKey] ?? seq.ruleKey, seq.ruleParams),
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
