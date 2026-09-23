import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Цифровой ряд» — ТРЕТИЙ экран пилота и первый другого устройства.
///
/// Первые две игры были про ведение пальцем по полю. Здесь поля нет вовсе:
/// сначала цифры показываются по таймеру, потом их набирают клавишами. Экран
/// взят именно поэтому — проверить, держится ли общий каркас на другом типе
/// игры или под него придётся править каркас (замер шага 2, задача 96381f4e).
enum Phase { ready, show, recall, done }

class DigitSpanScreen extends StatefulWidget {
  const DigitSpanScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<DigitSpanScreen> createState() => _DigitSpanScreenState();
}

class _DigitSpanScreenState extends State<DigitSpanScreen> {
  late LevelLadder _ladder;
  DigitSpanGame? _game;
  Phase _phase = Phase.ready;
  int _shown = -1;
  bool _gap = false;
  bool _won = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'digit_span', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    // ⚠️ Таймер обязан умереть вместе с экраном: у первых двух игр таймера не
    // было вовсе, и это первое место, где уход с экрана может оставить работу.
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (mounted) setState(_reset);
  }

  void _reset() {
    _timer?.cancel();
    _game = DigitSpanGame(level: _ladder.level, direction: _direction);
    _phase = Phase.ready;
    _shown = -1;
    _gap = false;
    _won = false;
  }

  /// Направление задаёт уровень: с L11 ввод обратный.
  Direction get _direction =>
      LevelParams.of(_ladder.level).reverse ? Direction.backward : Direction.forward;

  void _start() {
    setState(() {
      _phase = Phase.show;
      _shown = -1;
      _gap = false;
    });
    _next();
  }

  /// Показ идёт парами «цифра — пауза», длительности берутся у уровня.
  void _next() {
    final g = _game!;
    final p = g.params;
    _timer?.cancel();
    if (_gap) {
      _timer = Timer(Duration(milliseconds: p.gapMs - p.showMs < 0 ? 0 : p.gapMs - p.showMs), () {
        if (!mounted) return;
        setState(() => _gap = false);
        _next();
      });
      return;
    }
    if (_shown + 1 >= g.sequence.length) {
      // Выше потолка объёма между показом и вводом стоит задержка — это ось сложности.
      _timer = Timer(Duration(milliseconds: p.holdMs), () {
        if (!mounted) return;
        setState(() {
          _phase = Phase.recall;
          _shown = -1;
        });
      });
      return;
    }
    setState(() => _shown += 1);
    _timer = Timer(Duration(milliseconds: p.showMs), () {
      if (!mounted) return;
      setState(() => _gap = true);
      _next();
    });
  }

  void _tap(int d) {
    final g = _game!;
    if (_phase != Phase.recall || !g.enter(d)) return;
    setState(() {});
    if (g.full) {
      final ok = g.isWon;
      setState(() {
        _phase = Phase.done;
        _won = ok;
      });
      if (ok) {
        _ladder.win();
      } else {
        _ladder.fail();
      }
    }
  }

  Future<void> _nextLevel() async {
    setState(_reset);
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final backward = _direction == Direction.backward;
    return GameShell(
      title: 'Цифровой ряд',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: 'Цифр', value: '${g.sequence.length}', icon: Icons.pin_outlined),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        shown: _gap ? -1 : _shown,
        backward: backward,
        won: _won,
        height: h,
        onStart: _start,
        onTap: _tap,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.backspace_outlined,
          label: 'Стереть',
          onPressed: _phase == Phase.recall && g.entered.isNotEmpty
              ? () => setState(g.undo)
              : null,
        ),
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: () => setState(_reset)),
        AuxAction(
          icon: Icons.visibility_outlined,
          label: 'Показать ответ',
          tint: const Color(0xFFB45309),
          onPressed: _phase == Phase.recall
              ? () => setState(() {
                    _phase = Phase.done;
                    _won = false;
                  })
              : null,
        ),
      ]),
      toolbar: _phase == Phase.done
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: _nextLevel,
                icon: const Icon(Icons.arrow_forward),
                label: Text(_won ? 'Следующий уровень' : 'Ещё раз'),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

/// Поле: показ цифр, клавиши и итог. Всё внутри высоты, которую дал каркас.
class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.shown,
    required this.backward,
    required this.won,
    required this.height,
    required this.onStart,
    required this.onTap,
  });

  final DigitSpanGame game;
  final Phase phase;
  final int shown;
  final bool backward;
  final bool won;
  final double height;
  final VoidCallback onStart;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    switch (phase) {
      case Phase.ready:
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(backward ? 'Ввод — задом наперёд' : 'Ввод — как показали',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              FilledButton(onPressed: onStart, child: const Text('Показать ряд')),
            ],
          ),
        );
      case Phase.show:
        return Center(
          child: Text(
            shown >= 0 ? '${game.sequence[shown]}' : '',
            key: const Key('показ'),
            style: TextStyle(fontSize: height * 0.32, fontWeight: FontWeight.w300),
          ),
        );
      case Phase.recall:
      case Phase.done:
        return Column(
          children: [
            SizedBox(
              height: height * 0.22,
              child: Center(
                child: Text(
                  game.entered.join(' '),
                  key: const Key('набрано'),
                  style: TextStyle(fontSize: height * 0.09, letterSpacing: 2),
                ),
              ),
            ),
            if (phase == Phase.done)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  won ? 'Верно' : 'Было: ${game.expected.join(' ')}',
                  key: const Key('итог'),
                  style: TextStyle(color: won ? scheme.primary : scheme.error),
                ),
              ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  children: [
                    for (final row in const [
                      [1, 2, 3],
                      [4, 5, 6],
                      [7, 8, 9],
                      [0],
                    ])
                      Expanded(
                        child: Row(
                          children: [
                            if (row.length == 1) const Spacer(flex: 2),
                            for (final d in row)
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.all(4),
                                  child: _Key(d: d, on: phase == Phase.recall, onTap: onTap),
                                ),
                              ),
                            // Нижний ряд — один нуль по центру, ширина как у остальных клавиш.
                            if (row.length == 1) const Spacer(flex: 2),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        );
    }
  }
}

class _Key extends StatelessWidget {
  const _Key({required this.d, required this.on, required this.onTap});

  final int d;
  final bool on;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) => OutlinedButton(
        key: Key('клавиша$d'),
        onPressed: on ? () => onTap(d) : null,
        child: Text('$d', style: const TextStyle(fontSize: 22)),
      );
}
