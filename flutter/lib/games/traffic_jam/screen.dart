import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shell/aux_action.dart';
import '../../shell/board_puzzle.dart';
import '../../shell/board_solver.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// ЭКРАН «ОСВОБОДИ ПУТЬ» — развилка «Пространство», движок MindLab (решение Дениса
/// 30.09.2026: «добавляем нативно, дорабатываем потом»). Веб-двойника нет: игра
/// заведена сразу на Flutter (`NATIVE_ONLY_GAMES`).
///
/// Машину тянут пальцем вдоль её оси; отпустил — встала на ближайшую клетку. Ход —
/// проезд одной машины на любое число клеток (так же считает банк досок).
///
/// 🔴 ПАРТИЯ ПИШЕТСЯ В МОМЕНТ РЕШЕНИЯ, а не по кнопке «дальше»: ушёл человек с экрана
/// сразу после победы — партия всё равно в статистике. Незаконченная доска партией
/// не считается (так записано в плане каталога: перезапуск — не победа и не провал).
class TrafficJamScreen extends StatefulWidget {
  const TrafficJamScreen({super.key, required this.state, this.levels});

  final SharedState state;

  /// Банк для проб; без него — из `assets/levels/traffic_jam.json`.
  final List<TjLevel>? levels;

  @override
  State<TrafficJamScreen> createState() => _TrafficJamScreenState();
}

/// Банк досок из ассета (60 ступеней, минимум ходов растёт от 2 до 27).
Future<List<TjLevel>> loadTrafficJamBank() async {
  final raw = await rootBundle.loadString('assets/levels/traffic_jam.json');
  final data = jsonDecode(raw) as Map<String, dynamic>;
  return [for (final l in data['levels'] as List) TjLevel.fromJson(l as Map<String, dynamic>)];
}

/// Договор доски для общего решателя разбора.
class TrafficJamPuzzle extends BoardPuzzle<TjBoard, TjMove> {
  const TrafficJamPuzzle();
  @override
  String keyOf(TjBoard state) => state.key;
  @override
  bool solved(TjBoard state) => state.solved;
  @override
  List<TjMove> movesFrom(TjBoard state) => state.moves();
  @override
  TjBoard? apply(TjBoard state, TjMove move) => state.apply(move);
}

class _TrafficJamScreenState extends State<TrafficJamScreen> {
  LevelLadder? _ladder;
  List<TjLevel> _bank = const [];
  TjLevel? _level;

  /// Номер ступени ЭТОЙ доски: после победы лестница уже шагнула вперёд, а на
  /// экране ещё решённая доска — шапка обязана говорить о ней.
  int _levelNo = 1;
  TjBoard? _board;
  final List<TjBoard> _history = [];
  int _moves = 0;
  bool _won = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final bank = widget.levels ?? await loadTrafficJamBank();
    // Потолок лестницы — длина банка: на несуществующую доску лестница не шагнёт.
    final ladder = LevelLadder(
      gameId: 'traffic_jam',
      store: SharedLevelStore(widget.state),
      maxLevel: bank.length,
    );
    await ladder.load();
    if (!mounted) return;
    setState(() {
      _bank = bank;
      _ladder = ladder;
      _deal();
    });
  }

  void _deal() {
    final level = _ladder!.level.clamp(1, _bank.length);
    _levelNo = level;
    _level = _bank[level - 1];
    _board = _level!.board;
    _history.clear();
    _moves = 0;
    _won = false;
  }

  Future<void> _move(int car, int to) async {
    final board = _board;
    if (board == null || _won) return;
    final next = board.apply(TjMove(car, to));
    if (next == null) return;
    setState(() {
      _history.add(board);
      _board = next;
      _moves += 1;
      _won = next.solved;
    });
    if (next.solved) await _report();
  }

  Future<void> _report() async {
    final level = _level!;
    final extra = math.max(0, _moves - level.minMoves);
    await _ladder!.win(
      errors: extra,
      // Счёт — доля минимума в сделанных ходах: 100 — решено кратчайшим путём.
      score: (100 * level.minMoves / math.max(_moves, 1)).round(),
      details: {
        'board_id': level.id,
        'moves': _moves,
        'min_moves': level.minMoves,
        'completed': true,
      },
    );
    if (mounted) setState(() {});
  }

  void _undo() {
    if (_history.isEmpty || _won) return;
    setState(() {
      _board = _history.removeLast();
      _moves += 1; // откат — тоже ход: иначе «минимум» обходился бы откатами
    });
  }

  void _restart() => setState(() {
        _board = _level!.board;
        _history.clear();
        _moves = 0;
        _won = false;
      });

  void _next() => setState(_deal);

  int get _stars {
    final min = _level!.minMoves;
    if (_moves <= min) return 3;
    if (_moves <= min + math.max(2, min ~/ 4)) return 2;
    return 1;
  }

  /*
   * РАЗБОР — общим решателем каркаса (поиск в ширину даёт КРАТЧАЙШЕЕ решение), и у
   * каждого шага названный приём: первым ходом — «найди, что держит выезд, и
   * распутывай цепочку с конца», дальше — «освободи клетку тому, кто держит».
   * Без имени приёма разбор был бы показом ответа.
   */
  Future<void> _openLesson() async {
    final from = _board;
    if (from == null) return;
    final raw = await BoardLesson(const TrafficJamPuzzle(), from, maxStates: 250000).steps();
    if (!mounted || raw.isEmpty) return;
    final steps = [
      for (var i = 0; i < raw.length; i += 1)
        LessonStep(
          payload: raw[i].payload,
          techniqueKey: i == 0 ? 'teachTrafficFirst' : 'teachTrafficNext',
          text: i == 0 ? L.t('teachTrafficFirst') : L.t('teachTrafficNext'),
        ),
    ];
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('trafficJam'),
        steps: steps,
        board: (context, side, shown) {
          if (shown == 0) return _TrafficBoard(board: from, side: side);
          final p = steps[(shown - 1).clamp(0, steps.length - 1)].payload as ({TjMove move, TjBoard after});
          return _TrafficBoard(board: p.after, side: side, highlight: p.move.car);
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final board = _board;
    final ladder = _ladder;
    if (board == null || ladder == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('trafficJam'),
      onLesson: _won ? null : _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '$_levelNo', icon: Icons.flag_outlined),
        // Ходы ПРОТИВ МИНИМУМА: без этого числа человек не знает, хорошо ли решил.
        HudItem(label: L.t('trafficJamMoves'), value: '$_moves/${_level!.minMoves}', icon: Icons.swap_horiz),
      ],
      field: (context, h) => LayoutBuilder(
        builder: (context, c) {
          final side = math.max(160.0, math.min(c.maxWidth - 32, h - 16));
          return Center(
            child: _TrafficBoard(
              key: const ValueKey('tj-board'),
              board: board,
              side: side,
              onMove: _won ? null : _move,
            ),
          );
        },
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: L.t('btn_undo'), onPressed: _history.isEmpty || _won ? null : _undo),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _restart),
      ]),
      toolbar: _won
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const ValueKey('tj-next'),
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: Text('${'★' * _stars} · ${L.t('nextLabel')}'),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
      ],
    );
  }
}

/// Цвета машин: красная — своя, остальные различимы между собой и с ней.
const _carColors = <Color>[
  Color(0xFF1E88E5), Color(0xFF43A047), Color(0xFFFB8C00), Color(0xFF8E24AA),
  Color(0xFF00897B), Color(0xFF6D4C41), Color(0xFF3949AB), Color(0xFFC0CA33),
  Color(0xFF546E7A), Color(0xFFD81B60), Color(0xFF00ACC1), Color(0xFF7CB342),
  Color(0xFFFFB300), Color(0xFF5E35B1),
];
const _red = Color(0xFFE53935);

/// Доска: клетки, выезд справа от третьего ряда и машины. Рисует игру и разбор.
class _TrafficBoard extends StatefulWidget {
  const _TrafficBoard({super.key, required this.board, required this.side, this.onMove, this.highlight});

  final TjBoard board;
  final double side;

  /// `null` — доска только показывается (разбор, партия уже решена).
  final Future<void> Function(int car, int to)? onMove;

  /// Машина, которой только что ходили (разбор).
  final int? highlight;

  @override
  State<_TrafficBoard> createState() => _TrafficBoardState();
}

class _TrafficBoardState extends State<_TrafficBoard> {
  int? _drag;
  double _offset = 0;
  (int, int)? _range;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Справа — полоса под знак выезда, поэтому клетка считается от стороны минус полоса.
    final exitLane = widget.side / 14;
    final cell = (widget.side - exitLane) / tjSize;
    final b = widget.board;
    return SizedBox(
      width: cell * tjSize + exitLane,
      height: cell * tjSize,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            top: 0,
            width: cell * tjSize,
            height: cell * tjSize,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(cell * 0.18),
                border: Border.all(color: scheme.outline, width: 2),
              ),
            ),
          ),
          for (var r = 0; r < tjSize; r++)
            for (var c = 0; c < tjSize; c++)
              Positioned(
                left: c * cell + cell * 0.08,
                top: r * cell + cell * 0.08,
                width: cell * 0.84,
                height: cell * 0.84,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: scheme.surface,
                    borderRadius: BorderRadius.circular(cell * 0.12),
                  ),
                ),
              ),
          // Выезд: разрыв рамки и стрелка справа от ряда красной машины.
          Positioned(
            left: cell * tjSize - 3,
            top: tjExitRow * cell + cell * 0.1,
            width: 6,
            height: cell * 0.8,
            child: ColoredBox(color: scheme.surfaceContainerHighest),
          ),
          Positioned(
            left: cell * tjSize,
            top: tjExitRow * cell,
            width: exitLane,
            height: cell,
            child: Icon(Icons.arrow_forward, color: _red, size: exitLane * 0.95),
          ),
          for (var i = 0; i < b.cars.length; i++) _car(i, cell),
        ],
      ),
    );
  }

  Widget _car(int i, double cell) {
    final car = widget.board.cars[i];
    final pos = widget.board.positions[i];
    final shift = _drag == i ? _offset : 0.0;
    final left = (car.horizontal ? pos * cell + shift : car.fixed * cell) + cell * 0.06;
    final top = (car.horizontal ? car.fixed * cell : pos * cell + shift) + cell * 0.06;
    final w = (car.horizontal ? car.length : 1) * cell - cell * 0.12;
    final h = (car.horizontal ? 1 : car.length) * cell - cell * 0.12;
    final color = i == 0 ? _red : _carColors[(i - 1) % _carColors.length];
    final lit = widget.highlight == i;
    final body = DecoratedBox(
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(cell * 0.22),
        border: Border.all(color: lit ? const Color(0xFFFFD54F) : Colors.black26, width: lit ? 4 : 1.5),
        boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 3, offset: Offset(0, 2))],
      ),
      child: i == 0 ? Center(child: Icon(Icons.directions_car, color: Colors.white, size: cell * 0.5)) : null,
    );
    final onMove = widget.onMove;
    return Positioned(
      left: left,
      top: top,
      width: w,
      height: h,
      child: Semantics(
        button: onMove != null,
        label: i == 0 ? L.t('trafficJam') : null,
        child: onMove == null
            ? body
            : GestureDetector(
                key: ValueKey('tj-car-$i'),
                behavior: HitTestBehavior.opaque,
                onHorizontalDragStart: car.horizontal ? (_) => _start(i) : null,
                onHorizontalDragUpdate: car.horizontal ? (d) => _update(d.delta.dx, cell) : null,
                onHorizontalDragEnd: car.horizontal ? (_) => _end(cell) : null,
                onVerticalDragStart: car.horizontal ? null : (_) => _start(i),
                onVerticalDragUpdate: car.horizontal ? null : (d) => _update(d.delta.dy, cell),
                onVerticalDragEnd: car.horizontal ? null : (_) => _end(cell),
                child: body,
              ),
      ),
    );
  }

  void _start(int i) => setState(() {
        _drag = i;
        _offset = 0;
        _range = widget.board.range(i);
      });

  void _update(double delta, double cell) {
    final i = _drag;
    final range = _range;
    if (i == null || range == null) return;
    final pos = widget.board.positions[i];
    setState(() {
      _offset = (_offset + delta).clamp((range.$1 - pos) * cell, (range.$2 - pos) * cell);
    });
  }

  void _end(double cell) {
    final i = _drag;
    final range = _range;
    setState(() {
      _drag = null;
      _range = null;
    });
    if (i == null || range == null) return;
    final pos = widget.board.positions[i];
    final to = (pos + (_offset / cell).round()).clamp(range.$1, range.$2);
    _offset = 0;
    if (to != pos) widget.onMove?.call(i, to);
  }
}
