import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'layout.dart';
import 'levels.dart';
import 'rules.dart';

/// САМУРАЙ на общем каркасе — вторая игра раздела в переезде на Flutter.
///
/// Правила — `rules.dart`, сверенный с живым TS (400 ходов плюс целевые случаи на
/// перекрытиях). Доски — данными (`levels.dart`, 72 выгруженные доски). Уровень лежит
/// под тем же ключом, что у веб-версии: `psygames_sudoku_samurai_level_<профиль>`, то
/// есть прогресс один на обе половины.
///
/// 🔴 ГЛАВНОЕ ОТЛИЧИЕ ОТ СУДОКУ — ДВА МАСШТАБА. Поле 21×21 на телефон целиком не влезает
/// играбельно: клетка выходит 16 точек. Карта показывает всю фигуру, рабочий масштаб
/// даёт клетку ≥48 точек и листается. Арифметика вынесена в `layout.dart`, чтобы проба
/// мерила её вызовом.
class SamuraiScreen extends StatefulWidget {
  const SamuraiScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<SamuraiScreen> createState() => _SamuraiScreenState();
}

class _SamuraiScreenState extends State<SamuraiScreen> {
  late LevelLadder _ladder;
  SamuraiLevels? _levels;
  SamuraiBoard? _board;

  List<List<int>> _grid = const [];
  List<List<bool>> _given = const [];
  final List<({int r, int c, int was})> _history = [];

  ({int r, int c})? _selected;
  int _errors = 0;
  int _hintsUsed = 0;
  bool _won = false;
  bool _lost = false;
  String? _failure;
  SamuraiZoom _zoom = SamuraiZoom.map;

  final _hCtrl = ScrollController();
  final _vCtrl = ScrollController();

  SamuraiLevelParams get _params => samuraiLevelParams(_ladder.level);

  @override
  void initState() {
    super.initState();
    // Ключ веб-версии — `psygames_sudoku_samurai_level_<профиль>`, отсюда имя игры.
    _ladder = LevelLadder(
      gameId: 'sudoku_samurai',
      store: SharedLevelStore(widget.state),
      maxLevel: samuraiMaxLevel,
    );
    _boot();
  }

  @override
  void dispose() {
    _hCtrl.dispose();
    _vCtrl.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final levels = await SamuraiLevels.load();
    if (!mounted) return;
    setState(() => _levels = levels);
    _deal();
  }

  void _deal() {
    final levels = _levels;
    if (levels == null) return;
    final board = levels.boardFor(_ladder.level, seed: DateTime.now().millisecondsSinceEpoch);
    setState(() {
      _board = board;
      _failure = board == null ? 'Досок этой ступени нет в данных' : null;
      _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
      _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
      _history.clear();
      _selected = null;
      _errors = 0;
      _hintsUsed = 0;
      _won = false;
      _lost = false;
    });
  }

  /// Тычок в клетку. На карте он ещё и ПЕРЕВОДИТ в рабочий масштаб: карта нужна, чтобы
  /// выбрать место, а ходить с клетки в 16 точек нельзя.
  void _select(int r, int c) {
    if (_won || _lost || !isSamuraiCell(r, c)) return;
    setState(() {
      _selected = (r: r, c: c);
      if (_zoom == SamuraiZoom.map) {
        _zoom = SamuraiZoom.work;
        WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToSelected());
      }
    });
  }

  void _scrollToSelected() {
    final sel = _selected;
    if (sel == null || !mounted) return;
    final cell = cellSizeFor(MediaQuery.of(context).size.width, SamuraiZoom.work);
    if (_hCtrl.hasClients) {
      _hCtrl.jumpTo((cell * sel.c - 120).clamp(0, _hCtrl.position.maxScrollExtent));
    }
    if (_vCtrl.hasClients) {
      _vCtrl.jumpTo((cell * sel.r - 120).clamp(0, _vCtrl.position.maxScrollExtent));
    }
  }

  /// Поставить цифру. Ошибка — расхождение с решением: доска выгружена с проверкой
  /// единственности, поэтому «не по решению» и есть ошибка. Прощается ровно столько,
  /// сколько обещает ступень (`maxErrors`), и это ось трудности самурая.
  void _place(int value) {
    final board = _board;
    final sel = _selected;
    if (board == null || sel == null || _won || _lost) return;
    if (_given[sel.r][sel.c]) return;

    setState(() {
      _history.add((r: sel.r, c: sel.c, was: _grid[sel.r][sel.c]));
      _grid[sel.r][sel.c] = value;
      if (value != 0 && board.solution[sel.r][sel.c] != value) {
        _errors += 1;
        if (_errors >= _params.maxErrors) _lost = true;
        return;
      }
      _checkWin();
    });
  }

  void _erase() => _place(0);

  void _undo() {
    if (_history.isEmpty || _won || _lost) return;
    setState(() {
      final last = _history.removeLast();
      _grid[last.r][last.c] = last.was;
    });
  }

  void _hint() {
    final board = _board;
    final sel = _selected;
    if (board == null || sel == null || _won || _lost) return;
    if (_hintsUsed >= _params.hintMax) return;
    setState(() {
      _history.add((r: sel.r, c: sel.c, was: _grid[sel.r][sel.c]));
      _grid[sel.r][sel.c] = board.solution[sel.r][sel.c];
      _hintsUsed += 1;
      _checkWin();
    });
  }

  void _checkWin() {
    final board = _board;
    if (board == null) return;
    if (!isSolved(_grid, board.solution)) return;
    _won = true;
    unawaited(_ladder.win());
  }

  int get _left {
    var k = 0;
    for (final cell in samuraiCells) {
      if (_grid[cell[0]][cell[1]] == 0) k++;
    }
    return k;
  }

  @override
  Widget build(BuildContext context) {
    final levels = _levels;
    final board = _board;

    return GameShell(
      title: 'Самурай',
      hud: [
        HudItem(label: 'Ступень', value: '${_ladder.level}', icon: Icons.trending_up),
        HudItem(label: 'Ошибки', value: '$_errors/${_params.maxErrors}', icon: Icons.close),
        if (board != null) HudItem(label: 'Осталось', value: '$_left', icon: Icons.grid_on),
      ],
      field: (context, height) {
        if (levels == null) return const Center(child: CircularProgressIndicator());
        if (board == null) return Center(child: Text(_failure ?? 'Доска не собралась'));
        return _Field(
          board: board,
          grid: _grid,
          given: _given,
          selected: _selected,
          zoom: _zoom,
          height: height,
          hCtrl: _hCtrl,
          vCtrl: _vCtrl,
          onTap: _select,
        );
      },
      auxRow: AuxBar(children: [
        AuxAction(
          icon: _zoom == SamuraiZoom.map ? Icons.zoom_in : Icons.map_outlined,
          label: _zoom == SamuraiZoom.map ? 'Крупнее' : 'Вся фигура',
          onPressed: () => setState(() {
            _zoom = _zoom == SamuraiZoom.map ? SamuraiZoom.work : SamuraiZoom.map;
            if (_zoom == SamuraiZoom.work) {
              WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToSelected());
            }
          }),
        ),
        AuxAction(
          icon: Icons.undo,
          label: 'Отменить',
          onPressed: _history.isEmpty || _won || _lost ? null : _undo,
        ),
        AuxAction(icon: Icons.refresh, label: 'Заново', onPressed: _deal),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: 'Подсказка',
          tint: const Color(0xFFB45309),
          onPressed: (_hintsUsed < _params.hintMax && _selected != null && !_won && !_lost)
              ? _hint
              : null,
        ),
      ]),
      toolbar: board == null
          ? null
          : _Toolbar(won: _won, lost: _lost, onDigit: _place, onErase: _erase, onNext: _deal),
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _deal),
      ],
    );
  }
}

/// Поле: на карте вся фигура целиком, в рабочем масштабе — листается в обе стороны.
class _Field extends StatelessWidget {
  const _Field({
    required this.board,
    required this.grid,
    required this.given,
    required this.selected,
    required this.zoom,
    required this.height,
    required this.hCtrl,
    required this.vCtrl,
    required this.onTap,
  });

  final SamuraiBoard board;
  final List<List<int>> grid;
  final List<List<bool>> given;
  final ({int r, int c})? selected;
  final SamuraiZoom zoom;
  final double height;
  final ScrollController hCtrl;
  final ScrollController vCtrl;
  final void Function(int r, int c) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 Размер считается от места, которое ДАЛ КАРКАС (высота плюс ширина), а не от
        // окна. Ровно на этом веб-версия рисовала карту поверх крышки с показателями.
        final cell = cellSizeFor(c.maxWidth, zoom, heightRoom: height);
        final side = cell * samuraiSize;

        final grid0 = SizedBox(
          width: side,
          height: side,
          child: Column(
            children: [
              for (var r = 0; r < samuraiSize; r++)
                SizedBox(
                  height: cell,
                  child: Row(
                    children: [
                      for (var col = 0; col < samuraiSize; col++)
                        if (!isSamuraiCell(r, col))
                          SizedBox(width: cell, height: cell)
                        else
                          _Cell(
                            size: cell,
                            row: r,
                            col: col,
                            value: grid[r][col],
                            given: given[r][col],
                            wrong: cellWrong(grid, board.solution, r, col).error,
                            selected: selected != null && selected!.r == r && selected!.c == col,
                            scheme: scheme,
                            onTap: onTap,
                          ),
                    ],
                  ),
                ),
            ],
          ),
        );

        // 🔴 КАРТА ТОЖЕ ЛИСТАЕТСЯ, КОГДА МЕСТА НЕ ХВАТИЛО. Клетка не опускается ниже
        // 12 точек (мельче карта бесполезна), поэтому в тесном поле 21 ряд по 12 точек
        // = 252 точки может не влезть в высоту каркаса — замер веб-версии давал поле
        // 179. Влезает — показываем целиком по центру; не влезает — листается, но
        // НЕ обрезается молча: нижние сетки иначе пропадают вместе с кнопками.
        if (zoom == SamuraiZoom.map) {
          if (side <= height) return Center(child: grid0);
          return SingleChildScrollView(
            controller: vCtrl,
            child: Center(child: grid0),
          );
        }
        return SingleChildScrollView(
          controller: vCtrl,
          child: SingleChildScrollView(
            controller: hCtrl,
            scrollDirection: Axis.horizontal,
            child: grid0,
          ),
        );
      },
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.size,
    required this.row,
    required this.col,
    required this.value,
    required this.given,
    required this.wrong,
    required this.selected,
    required this.scheme,
    required this.onTap,
  });

  final double size;
  final int row;
  final int col;
  final int value;
  final bool given;
  final bool wrong;
  final bool selected;
  final ColorScheme scheme;
  final void Function(int r, int c) onTap;

  /// Толстая черта на границе блока 3×3 ЛЮБОЙ из сеток клетки — иначе на перекрытии
  /// пропадает граница, и человек не видит, где кончается одна сетка и начинается другая.
  bool _thick(int r, int c, int dr, int dc) {
    for (final g in gridsOf(r, c)) {
      final rr = r - g[0], cc = c - g[1];
      if (dr != 0 && (dr < 0 ? rr % 3 == 0 : rr % 3 == 2)) return true;
      if (dc != 0 && (dc < 0 ? cc % 3 == 0 : cc % 3 == 2)) return true;
    }
    // Край доски: за ним клетки нет.
    return !isSamuraiCell(r + dr, c + dc);
  }

  BorderSide _side(bool thick) => BorderSide(
        color: thick ? scheme.onSurface : scheme.outlineVariant,
        width: thick ? 1.6 : 0.4,
      );

  @override
  Widget build(BuildContext context) {
    final bg = wrong
        ? scheme.errorContainer
        : selected
            ? scheme.primaryContainer
            : scheme.surface;
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        color: bg,
        child: InkWell(
          key: Key('клетка${row}_$col'),
          onTap: () => onTap(row, col),
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                top: _side(_thick(row, col, -1, 0)),
                left: _side(_thick(row, col, 0, -1)),
                bottom: _side(_thick(row, col, 1, 0)),
                right: _side(_thick(row, col, 0, 1)),
              ),
            ),
            child: Center(
              child: Text(
                value == 0 ? '' : '$value',
                style: TextStyle(
                  fontSize: size * 0.52,
                  fontWeight: given ? FontWeight.w800 : FontWeight.w500,
                  color: wrong
                      ? scheme.onErrorContainer
                      : given
                          ? scheme.onSurface
                          : scheme.primary,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Липкий низ: девять цифр и «Стереть», ряды делятся поровну.
class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.won,
    required this.lost,
    required this.onDigit,
    required this.onErase,
    required this.onNext,
  });

  final bool won;
  final bool lost;
  final void Function(int) onDigit;
  final VoidCallback onErase;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    if (won || lost) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('дальше'),
          onPressed: onNext,
          icon: Icon(won ? Icons.arrow_forward : Icons.refresh),
          label: Text(won ? 'Следующая ступень' : 'Ещё раз'),
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, c) {
        const keyWidth = 48.0, gap = 6.0;
        const keys = 10;                                      // девять цифр и «Стереть»
        final fit = ((c.maxWidth - 8 + gap) / (keyWidth + gap)).floor().clamp(1, keys);
        final rows = (keys / fit).ceil();
        final perRow = (keys / rows).ceil();
        final width = perRow * keyWidth + (perRow - 1) * gap;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Center(
            child: SizedBox(
              width: width,
              child: Wrap(
                spacing: gap,
                runSpacing: gap,
                alignment: WrapAlignment.center,
                children: [
                  for (var v = 1; v <= 9; v++)
                    SizedBox(
                      width: keyWidth,
                      height: keyWidth,
                      child: FilledButton(
                        key: Key('цифра$v'),
                        onPressed: () => onDigit(v),
                        style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                        child: Text('$v', style: const TextStyle(fontSize: 20)),
                      ),
                    ),
                  SizedBox(
                    width: keyWidth,
                    height: keyWidth,
                    child: OutlinedButton(
                      key: const Key('стереть'),
                      onPressed: onErase,
                      style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
                      child: const Icon(Icons.backspace_outlined, size: 18),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
