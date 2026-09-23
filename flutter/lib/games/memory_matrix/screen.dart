import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Матрица памяти» на общем каркасе — четвёртая перенесённая игра.
///
/// Вспышки показываются по таймеру, ответ — тычками по клеткам. Поле берёт
/// высоту, которую дал каркас: именно на этом WebView-версия и ошибалась —
/// сетка вылезала за экран, и человек не видел нижний ряд.
enum Phase { ready, flash, recall, done }

class MemoryMatrixScreen extends StatefulWidget {
  const MemoryMatrixScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<MemoryMatrixScreen> createState() => _MemoryMatrixScreenState();
}

class _MemoryMatrixScreenState extends State<MemoryMatrixScreen> {
  late LevelLadder _ladder;
  MemoryMatrixGame? _game;
  Phase _phase = Phase.ready;
  bool _lit = false;
  bool _won = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'memory_matrix', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (mounted) setState(_reset);
  }

  void _reset() {
    _timer?.cancel();
    _game = MemoryMatrixGame(level: _ladder.level);
    _phase = Phase.ready;
    _lit = false;
    _won = false;
  }

  void _start() {
    final g = _game!;
    setState(() {
      _phase = Phase.flash;
      _lit = true;
    });
    _timer = Timer(Duration(milliseconds: g.params.flashMs), () {
      if (!mounted) return;
      setState(() => _lit = false);
      // Выше потолка объёма между показом и вводом стоит задержка — ось сложности.
      _timer = Timer(Duration(milliseconds: g.params.holdMs), () {
        if (!mounted) return;
        setState(() => _phase = Phase.recall);
      });
    });
  }

  void _tap(int cell) {
    final g = _game!;
    if (_phase != Phase.recall) return;
    setState(() => g.tap(cell));
    if (!g.full) return;
    final ok = g.isWon;
    setState(() {
      _phase = Phase.done;
      _won = ok;
    });
    ok ? _ladder.win() : _ladder.fail();
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: 'Матрица памяти',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(
            label: 'Клеток',
            value: '${g.picked.length}/${g.target.length}',
            icon: Icons.grid_view),
      ],
      field: (context, h) => _Field(
        game: g,
        phase: _phase,
        lit: _lit,
        won: _won,
        height: h,
        onStart: _start,
        onTap: _tap,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.backspace_outlined,
          label: 'Снять отметки',
          onPressed: _phase == Phase.recall && g.picked.isNotEmpty
              ? () => setState(g.picked.clear)
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
                onPressed: () => setState(_reset),
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

/// Поле: квадратная сетка внутри высоты, которую дал каркас.
class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.lit,
    required this.won,
    required this.height,
    required this.onStart,
    required this.onTap,
  });

  final MemoryMatrixGame game;
  final Phase phase;
  final bool lit;
  final bool won;
  final double height;
  final VoidCallback onStart;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (phase == Phase.ready) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Запомни ${game.target.length} клеток',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            FilledButton(onPressed: onStart, child: const Text('Показать')),
          ],
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 Сторона берётся от МЕНЬШЕГО из высоты каркаса и ширины. На этом
        // ошибалась веб-версия: считала от окна, и нижний ряд уезжал за экран.
        final side = (height < c.maxWidth ? height : c.maxWidth) - 16;
        final n = game.params.gridSize;
        final cell = side / n;
        return Center(
          child: SizedBox(
            width: side,
            height: side,
            child: Column(
              children: [
                for (var row = 0; row < n; row++)
                  SizedBox(
                    height: cell,
                    child: Row(
                      children: [
                        for (var col = 0; col < n; col++)
                          _Cell(
                            index: row * n + col,
                            size: cell,
                            game: game,
                            phase: phase,
                            lit: lit,
                            won: won,
                            scheme: scheme,
                            onTap: onTap,
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.index,
    required this.size,
    required this.game,
    required this.phase,
    required this.lit,
    required this.won,
    required this.scheme,
    required this.onTap,
  });

  final int index;
  final double size;
  final MemoryMatrixGame game;
  final Phase phase;
  final bool lit;
  final bool won;
  final ColorScheme scheme;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final target = game.target.contains(index);
    final decoy = game.decoys.contains(index);
    final picked = game.picked.contains(index);

    Color fill = scheme.surfaceContainerHighest;
    if (phase == Phase.flash && lit) {
      if (target) fill = scheme.primary;
      if (decoy) fill = scheme.tertiaryContainer;   // помеха гаснет вместе со всеми
    } else if (phase == Phase.done) {
      if (target && picked) fill = scheme.primary;
      if (target && !picked) fill = scheme.primaryContainer;   // пропущенная
      if (!target && picked) fill = scheme.errorContainer;     // лишняя
    } else if (picked) {
      fill = scheme.secondary;
    }

    return SizedBox(
      width: size,
      height: size,
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: Material(
          color: fill,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            key: Key('клетка$index'),
            borderRadius: BorderRadius.circular(8),
            onTap: phase == Phase.recall ? () => onTap(index) : null,
            child: const SizedBox.expand(),
          ),
        ),
      ),
    );
  }
}
