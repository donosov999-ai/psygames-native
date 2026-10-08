import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/module_strings.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';

/// Экран «Соедини точки» на общем каркасе — пилотная игра переезда на Flutter.
class DotsConnectScreen extends StatefulWidget {
  const DotsConnectScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<DotsConnectScreen> createState() => _DotsConnectScreenState();
}

class _DotsConnectScreenState extends State<DotsConnectScreen> {
  DotsLevelSet? _set;
  late LevelLadder _ladder;

  /// Уровень партии: из адреса (шаг зарядки по правилу «освоенный −20 %», вызов дня) важнее
  /// сохранённого — как в вебе (`num('level', lvl.level)`). Сторож параметров #273, задача 3e685a46.
  int get _playLevel => GamePreset.num('level', _ladder.level);
  DotsGame? _game;
  bool _won = false;

  /// Текст партии — из словаря модуля веба (`assets/l10n/dots-connect.json`): «Покрытие» есть
  /// только у этой игры, в общем словаре его нет.
  ModuleStrings? _strings;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'dots_connect', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    final raw = await rootBundle.loadString('assets/levels/dots_connect.json');
    await _ladder.load();
    final strings = await ModuleStrings.load('dots-connect');
    final set = DotsLevelSet.fromJsonString(raw);
    if (!mounted) return;
    setState(() {
      _strings = strings;
      _set = set;
      _game = DotsGame(set.byLevel(_playLevel));
    });
  }

  void _restart() => setState(() {
        _game = DotsGame(_set!.byLevel(_playLevel));
        _won = false;
      });

  Future<void> _next() async {
    await _ladder.win();
    _restart();
  }

  void _showSolution() {
    final g = _game!;
    for (final e in g.level.solution.entries) {
      g.drawPath(e.key, e.value);
    }
    setState(() => _won = true);
  }

  void _check() {
    if (_game!.isWon && !_won) setState(() => _won = true);
  }

  /// ⚠️ Название одной строкой: второй литерал — второе место переводить.
  /// Подписи каркаса — из общего с вебом словаря (`L.t`): зашитый текст знал бы один язык из двенадцати.
  String get _title => L.t('dotsConnect');

  /*
   * 🔴 РАЗБОР БЕРЁТ ГОТОВОЕ РЕШЕНИЕ, А НЕ ИЩЕТ СВОЁ.
   *
   * Уровень везёт `solution` — путь каждой пары, посчитанный генератором. Гонять
   * по нему поиск значило бы решать заново задачу, ответ на которую лежит рядом,
   * и рисковать тем, что поиск найдёт ДРУГОЙ путь — не тот, по которому уровень
   * задуман. Шаг разбора = одна пара: её путь появляется целиком.
   */
  Future<void> _openLesson() async {
    final lvl = _game?.level;
    if (lvl == null || lvl.solution.isEmpty) return;
    final order = lvl.pairs.map((p) => p.id).where(lvl.solution.containsKey).toList();
    final steps = [for (final id in order) LessonStep(payload: id)];
    if (steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _title,
        steps: steps,
        board: (context, side, shown) {
          // Доска строится с нуля и получает пути первых `shown` пар: так человек
          // видит ровно то, что уже разобрано, и ничего сверх.
          final g = DotsGame(lvl);
          for (var i = 0; i < shown && i < order.length; i++) {
            g.drawPath(order[i], lvl.solution[order[i]]!);
          }
          return DotsBoard(level: lvl, game: g, fieldHeight: side, onChanged: () {});
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final set = _set;
    final game = _game;
    final strings = _strings;
    if (set == null || game == null || strings == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final level = game.level;
    return GameShell(
      title: _title,
      // Разбор — из ЭТАЛОННОГО решения уровня: генератор посчитал его, когда
      // собирал уровень, и искать заново нечего.
      onLesson: level.solution.isEmpty ? null : _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '$_playLevel', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(
            label: strings.t('hudCoverage'),
            value: '${game.filledCells}/${level.playableCells}',
            icon: Icons.grid_4x4),
      ],
      field: (context, h) => DotsBoard(
        level: level,
        game: game,
        fieldHeight: h,
        onChanged: _check,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.undo,
          label: L.t('btn_undo'),
          onPressed: game.paths.isEmpty
              ? null
              : () => setState(() => game.clearPath(game.paths.keys.last)),
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _restart),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('puzzleShowSolution'),
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
                label: Text(L.t('nextLabel')),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
        PauseAction(label: L.t('puzzleShowSolution'), icon: Icons.lightbulb_outline, onPressed: _showSolution),
      ],
    );
  }
}
