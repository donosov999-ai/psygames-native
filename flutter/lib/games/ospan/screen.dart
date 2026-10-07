import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/game_shell.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// OSpan на общем каркасе: равенство → буква → равенство → буква, потом назвать
/// буквы по порядку.
///
/// 🔴 ВСПОМИНАНИЕ — ВВОДОМ, А НЕ ВЫБОРОМ ИЗ СПИСКА. Это не придирка к вёрстке:
/// узнавание среди подсказанных букв — другая задача и другой навык. В вебе тут
/// поле ввода, и здесь тоже поле.
class OspanScreen extends StatefulWidget {
  const OspanScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  @override
  State<OspanScreen> createState() => _OspanScreenState();
}

enum _Phase { equation, letter, recall, result }

class _OspanScreenState extends State<OspanScreen> {
  late LevelLadder _ladder;
  late Rng _rng;
  late OspanParams _params;

  Equation? _eq;
  final List<String> _letters = [];
  int _step = 0;
  int _mathHits = 0;
  int _mathErrors = 0;
  int _recallErrors = 0;
  bool _won = false;
  bool _ready = false;
  _Phase _phase = _Phase.equation;
  final TextEditingController _input = TextEditingController();
  Timer? _letterTimer;

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(gameId: 'ospan', store: SharedLevelStore(widget.state), maxLevel: 999);
    _boot();
  }

  @override
  void dispose() {
    _letterTimer?.cancel();
    _input.dispose();
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

  /// Письменность как в вебе: у русского языка кириллица, иначе латиница.
  List<String> get _pool {
    final lang = widget.state.get('${SharedState.prefix}language') ?? widget.state.get('language') ?? 'ru';
    return lang.startsWith('ru') ? lettersRu : lettersEn;
  }

  void _reset() {
    // Новая партия — снова зачётная (договор shell/lesson.dart: отметку «разбор
    // смотрели» снимает новая раздача). Отметка общая на всё приложение, и без
    // сброса один открытый разбор выключал бы рост уровня во всех играх.
    LessonUsed.reset();
    _letterTimer?.cancel();
    _params = levelParams(_ladder.level);
    _letters.clear();
    _input.clear();
    _step = 0;
    _mathHits = 0;
    _mathErrors = 0;
    _recallErrors = 0;
    _won = false;
    _phase = _Phase.equation;
    _eq = makeEquation(_params.mathLoad, _params.hardMath, _rng);
  }

  void _answerEquation(bool saidCorrect) {
    if (_phase != _Phase.equation) return;
    setState(() {
      if (saidCorrect == _eq!.isCorrect) {
        _mathHits += 1;
      } else {
        _mathErrors += 1;
      }
      // Буква показывается ПОСЛЕ ответа на равенство — счёт мешает запоминанию,
      // в этом и смысл упражнения.
      final pool = _pool;
      _letters.add(pool[(_rng() * pool.length).floor()]);
      _phase = _Phase.letter;
    });
    _letterTimer = Timer(Duration(milliseconds: _params.letterMs), () {
      if (!mounted) return;
      setState(() {
        _step += 1;
        if (_step >= _params.setSize) {
          _phase = _Phase.recall;
        } else {
          _phase = _Phase.equation;
          _eq = makeEquation(_params.mathLoad, _params.hardMath, _rng);
        }
      });
    });
  }

  Future<void> _checkRecall() async {
    if (_phase != _Phase.recall) return;
    final typed = _input.text.toUpperCase().replaceAll(RegExp(r'[^А-ЯЁA-Z]'), '').split('');
    var errors = 0;
    for (var i = 0; i < _letters.length; i += 1) {
      if (i >= typed.length || typed[i] != _letters[i]) errors += 1;
    }
    errors += math.max(0, typed.length - _letters.length);   // лишние буквы — тоже промах
    final passed = ospanPassed(errors);
    if (passed) {
      await _ladder.win();
    } else {
      await _ladder.fail();
    }
    if (!mounted) return;
    setState(() {
      _recallErrors = errors;
      _won = passed;
      _phase = _Phase.result;
    });
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => L.t('ospan');

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachOspanOrder')),
        DemoTrial(text: '', rule: L.t('teachSpanChunks')),
      ];

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      // Правило уровня объявляет каркас — в спокойный момент, не поверх партии (задача e371fd3a).
      levelRule: LevelRuleSpot(gameId: 'ospan', level: _ladder.level, state: widget.state, calm: (_phase == _Phase.equation && _step == 0) || _phase == _Phase.result),
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('hud_step'), value: '${math.min(_step + 1, _params.setSize)}/${_params.setSize}', icon: Icons.directions_walk),
        HudItem(label: L.t('hud_correct'), value: '$_mathHits', icon: Icons.check_circle_outline),
        HudItem(label: L.t('hud_errors'), value: '$_mathErrors', icon: Icons.error_outline),
      ],
      field: (context, h) => _Field(
        phase: _phase,
        eq: _eq,
        letter: _letters.isEmpty ? '' : _letters.last,
        letters: _letters,
        recallErrors: _recallErrors,
        won: _won,
        input: _input,
        height: h,
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _toolbar(context),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }

  Widget _toolbar(BuildContext context) {
    switch (_phase) {
      case _Phase.equation:
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            SizedBox(
              height: 56,
              child: FilledButton.icon(
                key: const Key('верно'),
                onPressed: () => _answerEquation(true),
                icon: const Icon(Icons.check),
                // Короткие подписи, как были: «Правильно / Неправильно» не влезают в ряд на 360 px.
                label: Text(L.t('hud_correct')),
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              height: 56,
              child: FilledButton.icon(
                key: const Key('неверно'),
                onPressed: () => _answerEquation(false),
                icon: const Icon(Icons.close),
                label: Text(L.t('a11yWrong')),
              ),
            ),
          ]),
        );
      case _Phase.letter:
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Text(L.t('ospanRememberLetter'), key: const Key('подсказка'), textAlign: TextAlign.center),
        );
      case _Phase.recall:
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
              key: const Key('ввод'),
              controller: _input,
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                labelText: L.t('ospanRecallTitle'),
                // Пример — из букв ТОГО набора, которым идёт игра: «АБВ» по-русски, «ABC» иначе.
                hintText: L.f('ospanExample', {'x': _pool.take(3).join()}),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('проверить'),
              onPressed: _checkRecall,
              icon: const Icon(Icons.check),
              label: Text(L.t('check')),
            ),
          ]),
        );
      case _Phase.result:
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
              _won
                  ? L.f('ospanResultWin', {'n': '${_letters.length}'})
                  : L.f('ospanResultFail', {'n': '$_recallErrors'}),
              key: const Key('итог'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
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
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.phase,
    required this.eq,
    required this.letter,
    required this.letters,
    required this.recallErrors,
    required this.won,
    required this.input,
    required this.height,
  });

  final _Phase phase;
  final Equation? eq;
  final String letter;
  final List<String> letters;
  final int recallErrors;
  final bool won;
  final TextEditingController input;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: switch (phase) {
          _Phase.equation => FittedBox(
              child: Text(
                '${eq!.left} = ${eq!.right}',
                key: const Key('равенство'),
                style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w700),
              ),
            ),
          _Phase.letter => Text(
              letter,
              key: const Key('буква'),
              style: TextStyle(fontSize: 72, fontWeight: FontWeight.w800, color: scheme.primary),
            ),
          _Phase.recall => Text(
              L.f('ospanRecallPrompt', {'n': '${letters.length}'}),
              key: const Key('спросили'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          _Phase.result => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  letters.join(' '),
                  key: const Key('правда'),
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w700,
                    color: won ? const Color(0xFF22C55E) : scheme.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                Text(L.f('ospanYouSaid', {'x': input.text.toUpperCase()}),
                    style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
        },
      ),
    );
  }
}
