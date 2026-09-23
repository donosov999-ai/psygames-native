import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';

/// Экран «Одна линия» — второй экран пилота на том же каркасе.
///
/// Он собран, чтобы получить число «сколько стоит экран, когда каркас уже есть»:
/// шапка, счётчики, ряд значков, липкий низ и лестница уровней взяты готовыми,
/// свои здесь только доска и три действия.
class OneLineScreen extends StatefulWidget {
  const OneLineScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<OneLineScreen> createState() => _OneLineScreenState();
}

class _OneLineScreenState extends State<OneLineScreen> {
  OneLineLevelSet? _set;
  late LevelLadder _ladder;
  OneLineGame? _game;
  bool _won = false;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'one_line', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    final raw = await rootBundle.loadString('assets/levels/one_line.json');
    await _ladder.load();
    final set = OneLineLevelSet.fromJsonString(raw);
    setState(() {
      _set = set;
      _game = OneLineGame(set.byLevel(_ladder.level));
    });
  }

  void _restart() => setState(() {
        _game = OneLineGame(_set!.byLevel(_ladder.level));
        _won = false;
      });

  Future<void> _next() async {
    await _ladder.win();
    _restart();
  }

  void _showSolution() {
    final g = _game!;
    g.startAt(g.level.solutionVertexIds.first);
    for (final id in g.level.solutionEdgeIds) {
      g.walk(id);
    }
    setState(() => _won = true);
  }

  void _check() {
    if (_game!.isWon && !_won) setState(() => _won = true);
  }

  @override
  Widget build(BuildContext context) {
    final set = _set;
    final game = _game;
    if (set == null || game == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final level = game.level;
    return GameShell(
      title: 'Одна линия',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Достигнуто', value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(
            label: 'Пройдено',
            value: '${game.passesDone}/${level.totalPasses}',
            icon: Icons.timeline),
      ],
      field: (context, h) => OneLineBoard(
        level: level,
        game: game,
        fieldHeight: h,
        onChanged: _check,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.undo,
          label: 'Отменить',
          onPressed: game.trail.isEmpty ? null : () => setState(game.undo),
        ),
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: _restart),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: 'Показать решение',
          tint: const Color(0xFFB45309),
          onPressed: _won ? null : _showSolution,
        ),
      ]),
      toolbar: _won
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: const Text('Следующий уровень'),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _restart),
        PauseAction(
            label: 'Показать решение', icon: Icons.lightbulb_outline, onPressed: _showSolution),
      ],
    );
  }
}
