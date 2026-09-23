import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Спринт» на общем каркасе: минута на счёт, ответ набирается цифрами.
///
/// 🔴 ВЕРНЫЙ ОТВЕТ ЗАСЧИТЫВАЕТСЯ САМ, как только набранное с ним совпало, —
/// правило веб-версии: на скорости лишнее нажатие «Проверить» стоит секунды.
/// Кнопка «Проверить» нужна, чтобы СДАТЬ неверный ответ и пойти дальше.
///
/// Раскладка клавиатуры взята правилом (`keypadFor`), а не нарисована заново:
/// её числа — живой замер, из-за которого на 375×667 и 360×640 когда-то пропадала
/// строка подсказки.
class MathSprintScreen extends StatefulWidget {
  const MathSprintScreen({super.key, required this.state, this.rnd, this.seconds = sprintSeconds});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;
  final int seconds;

  @override
  State<MathSprintScreen> createState() => _MathSprintScreenState();
}

enum _Phase { ready, playing, result }

class _MathSprintScreenState extends State<MathSprintScreen> {
  late LevelLadder _ladder;
  late Rng _rng;

  SprintProblem? _problem;
  String _typed = '';
  int _correct = 0;
  int _errors = 0;
  int _score = 0;
  int _streak = 0;
  int _bestStreak = 0;
  double _left = 0;
  bool _won = false;
  bool _ready = false;
  _Phase _phase = _Phase.ready;
  Timer? _tick;
  int _elapsedMs = 0;

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(gameId: 'math_sprint', store: SharedLevelStore(widget.state), maxLevel: 999);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
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
    _tick?.cancel();
    _phase = _Phase.ready;
    _typed = '';
    _correct = 0;
    _errors = 0;
    _score = 0;
    _streak = 0;
    _bestStreak = 0;
    _won = false;
    _left = widget.seconds.toDouble();
    _problem = generateSprintProblem(_ladder.level, _rng);
  }

  void _start() {
    setState(() => _phase = _Phase.playing);
    _elapsedMs = 0;
    // ⚠️ Прошедшее копится ЦЕЛЫМИ миллисекундами, а остаток считается вычитанием
    // один раз. Складывать по 0,1 в double — копить ошибку: «2 с» показывались
    // как «3 с» на третьей секунде. Часами (Stopwatch) мерить тоже нельзя: они
    // идут по настоящему времени, а на паузе экран обязан замирать вместе с игрой.
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      _elapsedMs += 100;
      setState(() => _left = math.max(0, widget.seconds - _elapsedMs / 1000));
      if (_left <= 0) _finish();
    });
  }

  void _press(String key) {
    if (_phase != _Phase.playing) return;
    setState(() {
      if (key == '⌫') {
        _typed = _typed.isEmpty ? _typed : _typed.substring(0, _typed.length - 1);
      } else if (key == '−') {
        _typed = _typed.startsWith('-') ? _typed.substring(1) : '-$_typed';
      } else if (_typed.replaceAll('-', '').length < sprintMaxDigits) {
        _typed = '$_typed$key';
      }
    });
    // Автозачёт: как только набранное совпало с ответом.
    if (int.tryParse(_typed) == _problem!.answer) _submit();
  }

  void _submit() {
    if (_phase != _Phase.playing || _typed.isEmpty) return;
    final right = int.tryParse(_typed) == _problem!.answer;
    setState(() {
      if (right) {
        _streak += 1;
        _bestStreak = math.max(_bestStreak, _streak);
        _correct += 1;
        _score += pointsForStreak(_streak);
      } else {
        _errors += 1;
        _streak = 0;
        _score = math.max(0, _score - sprintPenalty);
      }
      _typed = '';
      _problem = generateSprintProblem(_ladder.level, _rng);
    });
  }

  Future<void> _finish() async {
    _tick?.cancel();
    final passed = _correct >= sprintCorrectToPass;
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
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: 'Спринт',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: 'Время', value: '${_left.ceil()} с', icon: Icons.timer_outlined),
        HudItem(label: 'Верно', value: '$_correct/$sprintCorrectToPass', icon: Icons.check_circle_outline),
        HudItem(label: 'Очки', value: '$_score', icon: Icons.star_outline),
        HudItem(label: 'Ошибки', value: '$_errors', icon: Icons.error_outline),
        if (_streak >= 3) HudItem(label: 'Серия', value: '$_streak', icon: Icons.local_fire_department_outlined),
      ],
      field: (context, h) => _Field(problem: _problem!, typed: _typed, height: h),
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
    if (_phase == _Phase.result) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(
            _won
                ? 'Уровень взят: верных $_correct, очков $_score, лучшая серия $_bestStreak'
                : 'Верных $_correct — нужно $sprintCorrectToPass',
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
    if (_phase == _Phase.ready) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('${widget.seconds} секунд на счёт — считай как можно больше', style: text.bodyMedium),
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const Key('начать'),
            onPressed: _start,
            icon: const Icon(Icons.play_arrow),
            label: const Text('Начать'),
          ),
        ]),
      );
    }

    final size = MediaQuery.sizeOf(context);
    final pad = keypadFor(size.width, size.height);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', '⌫'];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(
          key: const Key('клавиатура'),
          width: pad.keyW * 3 + 16 + 2,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              for (final k in keys)
                SizedBox(
                  width: pad.keyW,
                  height: pad.keyH,
                  child: FilledButton(
                    key: Key('клавиша$k'),
                    style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                    onPressed: () => _press(k),
                    child: Text(k, style: const TextStyle(fontSize: 20)),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: actionRow - 8,
          child: FilledButton.icon(
            key: const Key('проверить'),
            onPressed: _typed.isEmpty ? null : _submit,
            icon: const Icon(Icons.check),
            label: const Text('Проверить'),
          ),
        ),
      ]),
    );
  }
}

/// Поле: задача и то, что игрок уже набрал.
class _Field extends StatelessWidget {
  const _Field({required this.problem, required this.typed, required this.height});

  final SprintProblem problem;
  final String typed;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          FittedBox(
            child: Text(
              problem.display,
              key: const Key('задача'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700),
            ),
          ),
          SizedBox(height: math.min(20.0, height * 0.06)),
          Container(
            key: const Key('набрано'),
            width: double.infinity,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              border: Border.all(color: scheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              typed.isEmpty ? '—' : typed.replaceAll('-', '−'),
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w700,
                color: typed.isEmpty ? scheme.outline : scheme.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
