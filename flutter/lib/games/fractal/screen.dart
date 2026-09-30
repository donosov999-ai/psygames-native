import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../sudoku/lesson.dart';
import 'levels.dart';
import 'rules.dart';

/// ФРАКТАЛЬНАЯ СУДОКУ на общем каркасе — третья игра раздела в переезде.
///
/// 🔴 ЭКРАН УСТРОЕН ДВУМЯ ВИДАМИ, А НЕ ОДНИМ ПОЛЕМ. Десять сеток 9×9 разом на телефоне
/// нечитаемы: клетка вышла бы меньше трёх миллиметров. Поэтому:
///   · КАРТА — корень крупно (его тоже решают руками) и девять плиток дочерних;
///   · СЕТКА — одна дочерняя во весь экран с обычным вводом цифр.
/// Возврат на карту происходит САМ, как только дочерняя дошла до порога: это момент,
/// ради которого всё затевалось, и прятать его нельзя.
///
/// 🔴 ПОДЪЁМ НА КАРТУ ОБЪЯВЛЕН ЯВНО — отзыв af047c78 «как выйти на уровень обратно».
/// В веб-версии подъём существовал, но единственной дверью была стрелка «назад»
/// каркаса, а она у всех остальных игр значит «выйти из игры» — её не трогают, боясь
/// потерять партию. Здесь «На карту» стоит в ряду служебных и показан ТОЛЬКО внутри
/// дочерней, а плитки карты нажимаются.
///
/// Правила — `rules.dart`, сверенный с живым TS лентой из 38 ходов. Партии — данными
/// (`levels.dart`, 90 штук). Уровень — общий ключ с веб-версией
/// `psygames_sudoku_fractal_level_<профиль>`.
class FractalScreen extends StatefulWidget {
  const FractalScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<FractalScreen> createState() => _FractalScreenState();
}

class _FractalScreenState extends State<FractalScreen> {
  late LevelLadder _ladder;
  FractalLevels? _levels;
  FractalPuzzle? _puzzle;
  FractalPlayState? _play;

  final List<FractalMove> _history = [];

  /// `null` — карта, иначе номер открытой дочерней.
  int? _openChild;
  ({int? child, int r, int c})? _selected;
  bool _won = false;
  String? _failure;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(
      gameId: 'sudoku_fractal',
      store: SharedLevelStore(widget.state),
      maxLevel: fractalMaxLevel,
    );
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final levels = await FractalLevels.load();
    if (!mounted) return;
    setState(() => _levels = levels);
    _deal();
  }

  void _deal() {
    final levels = _levels;
    if (levels == null) return;
    final puzzle = levels.gameFor(_ladder.level, seed: DateTime.now().millisecondsSinceEpoch);
    setState(() {
      _puzzle = puzzle;
      _failure = puzzle == null ? 'Партий этой ступени нет в данных' : null;
      _play = puzzle == null ? null : startPlayState(puzzle);
      _history.clear();
      _openChild = null;
      _selected = null;
      _won = false;
    });
  }

  int get _unlocked => _play?.children.where((c) => c.done).length ?? 0;

  /// Сколько верных клеток набрано в дочерней — то же число, что решает порог.
  int _progress(int i) {
    final f = _puzzle!, p = _play!;
    return solvedCount(p.children[i].grid, f.children[i].solution, givenOf(f.children[i].puzzle));
  }

  void _openTile(int i) => setState(() {
        _openChild = i;
        _selected = null;
      });

  /// Подъём на карту — та самая дверь, которой не находили.
  void _toMap() => setState(() {
        _openChild = null;
        _selected = null;
      });

  void _select(int? child, int r, int c) {
    if (_won) return;
    final f = _puzzle!;
    if (child == null && !rootEditable(f.rootPuzzle, r, c)) return;
    if (child != null && f.children[child].puzzle[r][c] != 0) return;
    setState(() => _selected = (child: child, r: r, c: c));
  }

  void _place(int n) {
    final f = _puzzle, p = _play, sel = _selected;
    if (f == null || p == null || sel == null || _won) return;
    final res = playDigit(p, f, (child: sel.child, r: sel.r, c: sel.c), n);
    if (res == null) return;

    setState(() {
      _play = res.next;
      _history.add(res.move);
      // Дочерняя дошла до порога — сама возвращаем на карту: цифра ушла наверх, и это
      // надо показать, а не оставить человека смотреть на уже открытую сетку.
      if (res.move.unlocked && _openChild == sel.child) {
        _openChild = null;
        _selected = null;
      }
      if (rootSolved(res.next.rootGrid, f.rootSolution)) {
        _won = true;
        unawaited(_ladder.win());
      }
    });
  }

  void _erase() => _place(0);

  void _undo() {
    final f = _puzzle, p = _play;
    if (f == null || p == null || _history.isEmpty || _won) return;
    setState(() => _play = revertMove(p, f, _history.removeLast()));
  }

  /// 🔴 РАЗБОР ФРАКТАЛА — ПО ТОЙ СЕТКЕ, ГДЕ ЧЕЛОВЕК СЕЙЧАС.
  ///
  /// На карте это корневая сетка, внутри плитки — её дочерняя. Разбирать не ту,
  /// в которую человек смотрит, значит объяснять чужую доску: у фрактала девять
  /// сеток, и «шаг 1» без привязки к месту ничего не говорит.
  String _teach(String key, Map<String, String> args) {
    var out = switch (key) {
      'teachSudokuNaked' => L.t('teachSudokuNaked'),
      'teachSudokuHiddenRow' => L.t('teachSudokuHiddenRow'),
      'teachSudokuHiddenCol' => L.t('teachSudokuHiddenCol'),
      'teachSudokuHiddenBox' => L.t('teachSudokuHiddenBox'),
      _ => L.t('teachSudokuPlain'),
    };
    for (final e in args.entries) {
      out = out.replaceAll('{${e.key}}', e.value);
    }
    return out;
  }

  /// Заголовок один на экран и на разбор: вторая строка — второй долг подписей.
  String get _title => 'Фрактал';

  List<LessonStep> _lessonSteps() {
    final f = _puzzle, p = _play;
    if (f == null || p == null) return const [];
    final open = _openChild;
    final grid = open == null ? p.rootGrid : p.children[open].grid;
    final solution = open == null ? f.rootSolution : f.children[open].solution;
    return sudokuLessonSteps(say: _teach, grid: grid, solution: solution, n: 9, br: 3, bc: 3);
  }

  Future<void> _openLesson() async {
    final steps = _lessonSteps();
    final f = _puzzle, p = _play;
    if (steps.isEmpty || f == null || p == null) return;
    final open = _openChild;
    // ⚠️ `given` здесь — сама загадка, а не маска: так её ждёт виджет сетки.
    final given = open == null ? f.rootPuzzle : f.children[open].puzzle;
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _title,
        steps: steps,
        board: (context, side, shown) {
          final m = steps[shown.clamp(0, steps.length - 1)].payload as SudokuMove;
          return FractalGridView(
            size: side,
            values: m.grid,
            given: given,
            keyPrefix: 'lesson',
            selected: (child: open, r: m.r, c: m.c),
            onTap: (_, _) {},
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final levels = _levels;
    final f = _puzzle;
    final p = _play;
    final open = _openChild;

    return GameShell(
      title: _title,
      onLesson: _lessonSteps().isEmpty ? null : _openLesson,
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.trending_up),
        HudItem(label: 'Открыто', value: '$_unlocked/9', icon: Icons.lock_open),
        if (open != null)
          HudItem(
            label: 'Сетка ${open + 1}',
            value: '${_progress(open)}/${f!.children[open].unlockCells}',
            icon: Icons.grid_view,
          ),
      ],
      field: (context, height) {
        if (levels == null) return const Center(child: CircularProgressIndicator());
        if (f == null || p == null) return Center(child: Text(_failure ?? 'Партия не собралась'));
        if (open == null) {
          return _MapView(
            puzzle: f,
            play: p,
            height: height,
            selected: _selected,
            progress: _progress,
            onRootTap: (r, c) => _select(null, r, c),
            onTile: _openTile,
          );
        }
        return _ChildView(
          puzzle: f,
          play: p,
          child: open,
          height: height,
          selected: _selected,
          onTap: (r, c) => _select(open, r, c),
        );
      },
      auxRow: AuxBar(children: [
        // 🔴 Показан ТОЛЬКО внутри дочерней: на карте подниматься некуда, и лишний
        // значок там сбивает — ровно та путаница, из-за которой выход не находили.
        if (open != null)
          AuxAction(icon: Icons.map_outlined, label: 'На карту', onPressed: _toMap),
        AuxAction(
          icon: Icons.undo,
          label: 'Отменить',
          onPressed: _history.isEmpty || _won ? null : _undo,
        ),
        AuxAction(icon: Icons.refresh, label: 'Заново', onPressed: _deal),
      ]),
      toolbar: f == null
          ? null
          : _Toolbar(won: _won, onDigit: _place, onErase: _erase, onNext: _deal),
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _deal),
      ],
    );
  }
}

/// КАРТА: корень крупно плюс девять плиток дочерних.
class _MapView extends StatelessWidget {
  const _MapView({
    required this.puzzle,
    required this.play,
    required this.height,
    required this.selected,
    required this.progress,
    required this.onRootTap,
    required this.onTile,
  });

  final FractalPuzzle puzzle;
  final FractalPlayState play;
  final double height;
  final ({int? child, int r, int c})? selected;
  final int Function(int) progress;
  final void Function(int r, int c) onRootTap;
  final void Function(int) onTile;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 Место делится ЧИСЛОМ: плиткам — своя полоса, остальное корню. Ровно этого
        // не делала веб-версия (замер: поле прокручивалось на +222 px и +410 px).
        const tileRow = 64.0, gap = 8.0;
        final forRoot = height - tileRow - gap;
        final side = (forRoot < c.maxWidth ? forRoot : c.maxWidth) - 8;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: side < 0 ? 0 : side,
              child: Center(
                child: FractalGridView(
                  size: side < 0 ? 0 : side,
                  values: play.rootGrid,
                  given: puzzle.rootPuzzle,
                  keyPrefix: 'root_',
                  selected: selected?.child == null ? selected : null,
                  dimmed: (r, cc) => !rootEditable(puzzle.rootPuzzle, r, cc) &&
                      puzzle.rootPuzzle[r][cc] == 0,
                  onTap: onRootTap,
                ),
              ),
            ),
            const SizedBox(height: gap),
            SizedBox(
              height: tileRow,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < 9; i++)
                    Expanded(
                      child: _Tile(
                        index: i,
                        done: play.children[i].done,
                        solved: progress(i),
                        need: puzzle.children[i].unlockCells,
                        onTap: () => onTile(i),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Плитка дочерней сетки: сколько набрано из порога и открыта ли она.
class _Tile extends StatelessWidget {
  const _Tile({
    required this.index,
    required this.done,
    required this.solved,
    required this.need,
    required this.onTap,
  });

  final int index;
  final bool done;
  final int solved;
  final int need;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: done ? scheme.primaryContainer : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          key: Key('tile$index'),
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          // ⚠️ СОДЕРЖИМОЕ ПЛИТКИ СЖИМАЕТСЯ, А ПОЛОСА ДЕРЖИТ ВЫСОТУ. Замер на 360×640:
          // три строки с крупным шрифтом системы переполняли плитку на 6 точек, и
          // каркас краснел. Растить полосу нельзя — она отнимает место у корня,
          // поэтому сжимается содержимое.
          child: Padding(
            padding: const EdgeInsets.all(3),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(done ? Icons.lock_open : Icons.grid_on, size: 16,
                      color: done ? scheme.primary : scheme.onSurfaceVariant),
                  const SizedBox(height: 2),
                  Text('${index + 1}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                  Text('$solved/$need', style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// СЕТКА: одна дочерняя во весь экран.
class _ChildView extends StatelessWidget {
  const _ChildView({
    required this.puzzle,
    required this.play,
    required this.child,
    required this.height,
    required this.selected,
    required this.onTap,
  });

  final FractalPuzzle puzzle;
  final FractalPlayState play;
  final int child;
  final double height;
  final ({int? child, int r, int c})? selected;
  final void Function(int r, int c) onTap;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final side = (height < c.maxWidth ? height : c.maxWidth) - 8;
        return Center(
          child: FractalGridView(
            size: side < 0 ? 0 : side,
            values: play.children[child].grid,
            given: puzzle.children[child].puzzle,
            keyPrefix: 'cell_',
            selected: selected?.child == child ? selected : null,
            portal: (r, cc) => isPortalCell(puzzle.portals, child, r, cc),
            onTap: onTap,
          ),
        );
      },
    );
  }
}

/// Сетка 9×9 — общая отрисовка корня и дочерней.
class FractalGridView extends StatelessWidget {
  const FractalGridView({
    super.key,
    required this.size,
    required this.values,
    required this.given,
    required this.keyPrefix,
    required this.selected,
    required this.onTap,
    this.portal,
    this.dimmed,
  });

  final double size;
  final List<List<int>> values;
  final List<List<int>> given;
  final String keyPrefix;
  final ({int? child, int r, int c})? selected;
  final void Function(int r, int c) onTap;
  final bool Function(int r, int c)? portal;
  final bool Function(int r, int c)? dimmed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final cell = size / 9;
    return SizedBox(
      width: size,
      height: size,
      child: Column(
        children: [
          for (var r = 0; r < 9; r++)
            SizedBox(
              height: cell,
              child: Row(
                children: [
                  for (var c = 0; c < 9; c++)
                    _Cell(
                      size: cell,
                      row: r,
                      col: c,
                      keyName: '$keyPrefix${r}_$c',
                      value: values[r][c],
                      given: given[r][c] != 0,
                      // Кормящая клетка корня: её приносят снизу, руками не трогают.
                      waiting: dimmed?.call(r, c) ?? false,
                      portal: portal?.call(r, c) ?? false,
                      selected: selected != null && selected!.r == r && selected!.c == c,
                      scheme: scheme,
                      onTap: onTap,
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.size,
    required this.row,
    required this.col,
    required this.keyName,
    required this.value,
    required this.given,
    required this.waiting,
    required this.portal,
    required this.selected,
    required this.scheme,
    required this.onTap,
  });

  final double size;
  final int row;
  final int col;
  final String keyName;
  final int value;
  final bool given;
  final bool waiting;
  final bool portal;
  final bool selected;
  final ColorScheme scheme;
  final void Function(int r, int c) onTap;

  @override
  Widget build(BuildContext context) {
    final bg = selected
        ? scheme.primaryContainer
        : waiting
            ? scheme.surfaceContainerHighest
            : scheme.surface;
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        color: bg,
        child: InkWell(
          key: Key(keyName),
          onTap: () => onTap(row, col),
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: row % 3 == 0 ? scheme.onSurface : scheme.outlineVariant,
                  width: row % 3 == 0 ? 1.6 : 0.4,
                ),
                left: BorderSide(
                  color: col % 3 == 0 ? scheme.onSurface : scheme.outlineVariant,
                  width: col % 3 == 0 ? 1.6 : 0.4,
                ),
                bottom: BorderSide(
                  color: row == 8 ? scheme.onSurface : scheme.outlineVariant,
                  width: row == 8 ? 1.6 : 0.4,
                ),
                right: BorderSide(
                  color: col == 8 ? scheme.onSurface : scheme.outlineVariant,
                  width: col == 8 ? 1.6 : 0.4,
                ),
              ),
            ),
            child: Stack(
              children: [
                // Кольцо портала: клетка видна из двух пазлов сразу.
                if (portal)
                  Positioned.fill(
                    child: Padding(
                      padding: EdgeInsets.all(size * 0.08),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: scheme.tertiary, width: 1.4),
                        ),
                      ),
                    ),
                  ),
                Center(
                  child: Text(
                    value == 0 ? '' : '$value',
                    style: TextStyle(
                      fontSize: size * 0.52,
                      fontWeight: given ? FontWeight.w800 : FontWeight.w500,
                      color: given ? scheme.onSurface : scheme.primary,
                    ),
                  ),
                ),
              ],
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
    required this.onDigit,
    required this.onErase,
    required this.onNext,
  });

  final bool won;
  final void Function(int) onDigit;
  final VoidCallback onErase;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    if (won) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('next'),
          onPressed: onNext,
          icon: const Icon(Icons.arrow_forward),
          label: const Text('Следующий уровень'),
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, c) {
        const keyWidth = 48.0, gap = 6.0, keys = 10;
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
                        key: Key('digit$v'),
                        onPressed: () => onDigit(v),
                        style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                        child: Text('$v', style: const TextStyle(fontSize: 20)),
                      ),
                    ),
                  SizedBox(
                    width: keyWidth,
                    height: keyWidth,
                    child: OutlinedButton(
                      key: const Key('erase'),
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
