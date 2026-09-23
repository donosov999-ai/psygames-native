import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
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

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: 'Счёт и память',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: 'Шаг', value: '${math.min(_step + 1, _params.setSize)}/${_params.setSize}', icon: Icons.directions_walk),
        HudItem(label: 'Счёт верно', value: '$_mathHits', icon: Icons.check_circle_outline),
        HudItem(label: 'Счёт мимо', value: '$_mathErrors', icon: Icons.error_outline),
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
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: () => setState(_reset)),
      ]),
      toolbar: _toolbar(context),
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: () => setState(_reset)),
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
                label: const Text('Верно'),
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              height: 56,
              child: FilledButton.icon(
                key: const Key('неверно'),
                onPressed: () => _answerEquation(false),
                icon: const Icon(Icons.close),
                label: const Text('Неверно'),
              ),
            ),
          ]),
        );
      case _Phase.letter:
        return const Padding(
          padding: EdgeInsets.all(12),
          child: Text('Запоминай букву', key: Key('подсказка'), textAlign: TextAlign.center),
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
              decoration: const InputDecoration(
                labelText: 'Буквы по порядку',
                hintText: 'например АБВ',
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('проверить'),
              onPressed: _checkRecall,
              icon: const Icon(Icons.check),
              label: const Text('Проверить'),
            ),
          ]),
        );
      case _Phase.result:
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
              _won
                  ? 'Уровень взят: все ${_letters.length} буквы по порядку'
                  : 'Промахов $_recallErrors — уровень берётся только за чистое вспоминание',
              key: const Key('итог'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
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
              'Назови ${letters.length} буквы по порядку',
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
                Text('ты назвал: ${input.text.toUpperCase()}',
                    style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
        },
      ),
    );
  }
}
