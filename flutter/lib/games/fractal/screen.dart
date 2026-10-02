import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/hybrid_app.dart' show HybridApp;
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/resume_store.dart';
import '../sudoku/keypad.dart';
import '../sudoku/lesson.dart';
import '../sudoku/marks.dart';
import '../sudoku/leave_guard.dart';
import 'resume.dart';
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
///
/// 🔴 КАРАНДАШ И ЦВЕТ — КАК В КЛАССИКЕ (отзыв Дениса 4b95bced, 18.09: «почему тут не
/// как в судоку классический интерфейс?»; решение 30.09 — «Делать»). Веб-фрактал их
/// имел (`tool: digit | pencil | paint`, пометки у корня и у каждой дочерней), а первый
/// перенос увёз только цифры. Органы теперь общие с классикой: `marks.dart` (пометки,
/// девять цветов) и `keypad.dart` (клавиши и палитра на их месте). Свой вид фрактала —
/// карта, плитки, порталы — не трогается.
/// Счёт победы — константы веба (`TIME_CAP`, `WIN_FLOOR` в sudoku-fractal.tsx).
const fractalTimeCap = 1800;
const fractalWinFloor = 300;

class FractalScreen extends StatefulWidget {
  const FractalScreen({super.key, required this.state, this.onOpen});

  final SharedState state;

  /// Открыть другой экран по адресу. По умолчанию — хост гибрида ([HybridApp.open]); пробы
  /// подставляют своё, чтобы проверить, КУДА ведёт дверь.
  final void Function(String route)? onOpen;

  @override
  State<FractalScreen> createState() => _FractalScreenState();
}

class _FractalScreenState extends State<FractalScreen> {
  late LevelLadder _ladder;
  FractalLevels? _levels;
  FractalPuzzle? _puzzle;
  FractalPlayState? _play;

  /// История трёх видов шагов, как в классике: цифра, пометка, цвет. Пока история
  /// знала только цифры, отмена молча пропускала пометку — кнопка, которая работает
  /// через раз, хуже отсутствующей.
  final List<_Step> _history = [];

  /// Пометки и раскраска — своя раскладка у корня и у каждой дочерней, как в вебе
  /// (`marks.root` / `marks.children[i]`). Индекс 0 — корень, 1…9 — дочерние.
  List<List<List<int>>> _marks = const [];
  List<List<List<int>>> _colors = const [];

  /// Карандаш и цвет выключают друг друга — правило классики.
  bool _pencil = false;
  int? _paint;

  /// 🔴 ОШИБКИ — ТОЛЬКО ДОКАЗУЕМЫЕ, как у веба (sudoku-fractal.tsx, placeDigit; сверка
  /// 138f7818, строка 25, «высокая»). Дочерняя сетка порознь неоднозначна НАРОЧНО (порталы):
  /// цифра, не равная хранимому решению, но не нарушающая ни одного правила, — законный ход.
  /// Поэтому: в дочерней — повтор в строке/столбце/блоке (`conflictsInChild`), в корне — цифра
  /// не по решению (корень единственен). Ошибки — в полосе, снимке, отчёте и счёте.
  int _errors = 0;

  /// Строка под клавишами после хода: что за красная цифра — или что клетка ещё не определена.
  /// Держится до следующего действия (у веба — на таймере; без таймера нет мельтешения).
  _MoveHint _hint = _MoveHint.none;
  late final AppHaptics _haptics = AppHaptics(widget.state);

  /// `null` — карта, иначе номер открытой дочерней.
  int? _openChild;
  ({int? child, int r, int c})? _selected;
  bool _won = false;

  /// Начало партии по часам игры — время в отчёте, как у веба.
  int _startedAt = gameNow();
  int get _elapsed => (gameNow() - _startedAt) ~/ 1000;
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
    final saved = await _resume.load();
    if (!mounted) return;
    setState(() => _levels = levels);
    final resumed = saved == null ? null : fractalFromSnapshot(saved);
    if (resumed != null && resumed.level == _ladder.level) {
      _apply(resumed);
      return;
    }
    _deal();
  }

  @override
  void dispose() {
    _persist();   // уход с экрана — с живым временем, а не с тем, что было на прошлом ходу
    super.dispose();
  }

  /// 🔴 НЕЗАКОНЧЕННАЯ ПАРТИЯ — формат веба (resume.dart; сверка 138f7818, п.3). Фрактал идёт
  /// часами, а натив раздавал заново после любого ухода.
  late final ResumeStore _resume = ResumeStore(widget.state, fractalGameId, fractalResumeVersion);

  /// Записать (или стереть, если партия выиграна). Без ожидания — экран не ждёт диска.
  void _persist() {
    final f = _puzzle, p = _play;
    if (f == null || p == null) return;
    if (_won) {
      unawaited(_resume.clear());
      return;
    }
    unawaited(_resume.save(fractalSnapshot(
      level: _ladder.level,
      puzzle: f,
      play: p,
      marks: _marks,
      colors: _colors,
      errors: _errors,
      elapsed: _elapsed,
      moves: [for (final h in _history) if (h.kind == _StepKind.digit) h.move!],
    )));
  }

  /// Поднять партию: доска, пометки, цвет и лента цифр — те же; время — с накопленного.
  void _apply(FractalResumed r) => setState(() {
        _puzzle = r.puzzle;
        _failure = null;
        _play = r.play;
        _history
          ..clear()
          ..addAll([for (final m in r.moves) _Step.digit(m)]);
        _marks = r.marks;
        _colors = r.colors;
        _errors = r.errors;
        _hint = _MoveHint.none;
        _pencil = false;
        _paint = null;
        _openChild = null;
        _selected = null;
        _won = false;
        _startedAt = gameNow() - r.elapsed * 1000;
      });

  void _deal() {
    final levels = _levels;
    if (levels == null) return;
    final puzzle = levels.gameFor(_ladder.level, seed: DateTime.now().millisecondsSinceEpoch);
    setState(() {
      _puzzle = puzzle;
      _failure = puzzle == null ? L.t('sdkNoBoards') : null;
      _play = puzzle == null ? null : startPlayState(puzzle);
      _history.clear();
      _marks = [for (var i = 0; i < 10; i++) emptyPencilMarks(9)];
      _colors = [for (var i = 0; i < 10; i++) emptyCellColors(9)];
      _errors = 0;
      _hint = _MoveHint.none;
      _pencil = false;
      _paint = null;
      _openChild = null;
      _selected = null;
      _won = false;
      _startedAt = gameNow();
    });
    _persist();   // новая доска сразу ложится своим снимком, как в вебе
  }

  /// Раскладка пометок/цвета: 0 — корень, 1…9 — дочерние.
  static int _gridOf(int? child) => child == null ? 0 : child + 1;

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
    // В цвете касание КРАСИТ, а не выбирает — как в классике; красить можно и
    // заданную клетку: цвет — бухгалтерия игрока, а не ход.
    final paint = _paint;
    if (paint != null) {
      _paintCell(child, r, c, paint);
      return;
    }
    final f = _puzzle!;
    if (child == null && !rootEditable(f.rootPuzzle, r, c)) return;
    if (child != null && f.children[child].puzzle[r][c] != 0) return;
    setState(() {
      _selected = (child: child, r: r, c: c);
      _hint = _MoveHint.none;
    });
  }

  void _place(int n) {
    final f = _puzzle, p = _play, sel = _selected;
    if (f == null || p == null || sel == null || _won) return;
    final res = playDigit(p, f, (child: sel.child, r: sel.r, c: sel.c), n);
    if (res == null) return;
    final child = sel.child;
    var hint = _MoveHint.none;
    if (n != 0) {
      final right = (child == null ? f.rootSolution : f.children[child].solution)[sel.r][sel.c] == n;
      final provable = child == null ? !right : conflictsInChild(p.children[child].grid, sel.r, sel.c, n);
      if (provable) {
        _errors++;
        hint = _MoveHint.red;
        unawaited(_haptics.medium());
      } else if (!right) {
        hint = _MoveHint.undecided;   // не ошибка: задача здесь ещё не определена — говорим прямо
      }
    }

    setState(() {
      _hint = hint;
      _play = res.next;
      _history.add(_Step.digit(res.move));
      // Дочерняя дошла до порога — сама возвращаем на карту: цифра ушла наверх, и это
      // надо показать, а не оставить человека смотреть на уже открытую сетку.
      if (res.move.unlocked && _openChild == sel.child) {
        _openChild = null;
        _selected = null;
      }
      if (rootSolved(res.next.rootGrid, f.rootSolution)) {
        _won = true;
        // 🔴 ОТЧЁТ — КАК У ВЕБА (sudoku-fractal.tsx, saveSession; сверка 138f7818): счёт
        // 4000 − ошибки·60 − время, не ниже пола.
        final level = _ladder.level;
        unawaited(_ladder.win(
          score: max(fractalWinFloor, (4000 - _errors * 60 - min(_elapsed, fractalTimeCap)).round()),
          timeSeconds: _elapsed,
          errors: _errors,
          mode: 'fractal',
          difficulty: 'lvl$level',
          details: {'level': level, 'of': 9},
        ));
      }
    });
    _persist();
  }

  /// Ластик: в карандаше чистит пометки клетки целиком, иначе стирает цифру.
  void _erase() => _onKey(0);

  /// Нажатие клавиши: в карандаше — пометка, иначе цифра. Решает общий разбор
  /// (`routeDigitPress`), тот же, что у классики.
  void _onKey(int value) {
    final sel = _selected;
    final route = routeDigitPress(
      pencil: _pencil,
      hasSelection: sel != null,
      given: false,   // заданные клетки фрактала не выбираются вовсе (_select)
      blocked: _won,
    );
    switch (route) {
      case PencilRoute.ignore:
        return;
      case PencilRoute.pencil:
        _mark(sel!.child, sel.r, sel.c, value);
      case PencilRoute.digit:
        _place(value);
    }
  }

  void _mark(int? child, int r, int c, int digit) {
    final g = _gridOf(child);
    setState(() {
      final was = _marks[g][r][c];
      _history.add(_Step.note(_StepKind.mark, g, r, c, was));
      _marks[g][r][c] = pencilInput(was, digit);
    });
    _persist();
  }

  void _paintCell(int? child, int r, int c, int color) {
    final g = _gridOf(child);
    setState(() {
      final was = _colors[g][r][c];
      _history.add(_Step.note(_StepKind.color, g, r, c, was));
      _colors[g][r][c] = toggleCellColor(was, color);
    });
    _persist();
  }

  void _undo() {
    final f = _puzzle, p = _play;
    if (f == null || p == null || _history.isEmpty || _won) return;
    setState(() {
      final last = _history.removeLast();
      switch (last.kind) {
        case _StepKind.digit:
          _play = revertMove(p, f, last.move!);
        case _StepKind.mark:
          _marks[last.grid][last.r][last.c] = last.was;
        case _StepKind.color:
          _colors[last.grid][last.r][last.c] = last.was;
      }
    });
    _persist();
  }

  void _togglePencil() => setState(() {
        _pencil = !_pencil;
        if (_pencil) _paint = null;
      });

  void _togglePaint() => setState(() {
        _paint = _paint == null ? 0 : null;
        if (_paint != null) _pencil = false;
      });

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
  String get _title => L.t('fractalTitle');

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

  void _openDeep() => (widget.onOpen ?? HybridApp.open)?.call('/games/sudoku-fractal-deep');

  /// В партии есть что терять: ход, пометка или цвет — и она не кончилась. Тогда выход и «Заново»
  /// спрашивают (leave_guard.dart; сверка 138f7818 п.2).
  bool get _live => _history.isNotEmpty && !_won;

  @override
  Widget build(BuildContext context) {
    final levels = _levels;
    final f = _puzzle;
    final p = _play;
    final open = _openChild;

    return LeaveGuard(live: _live, saved: true, child: GameShell(
      title: _title,
      onLesson: _lessonSteps().isEmpty ? null : _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.trending_up),
        HudItem(label: L.t('fractalOpened'), value: '$_unlocked/9', icon: Icons.lock_open),
        HudItem(label: L.t('errors'), value: '$_errors', icon: Icons.close),
        if (open != null)
          HudItem(
            label: '${L.t('fractalChildN')} ${open + 1}',
            value: '${_progress(open)}/${f!.children[open].unlockCells}',
            icon: Icons.grid_view,
          ),
      ],
      field: (context, height) {
        if (levels == null) return const Center(child: CircularProgressIndicator());
        if (f == null || p == null) return Center(child: Text(_failure ?? L.t('sdkGameFailed')));
        if (open == null) {
          return _MapView(
            puzzle: f,
            play: p,
            marks: _marks[0],
            colors: _colors[0],
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
          marks: _marks[open + 1],
          colors: _colors[open + 1],
          height: height,
          selected: _selected,
          onTap: (r, c) => _select(open, r, c),
        );
      },
      auxRow: AuxBar(children: [
        // 🔴 Показан ТОЛЬКО внутри дочерней: на карте подниматься некуда, и лишний
        // значок там сбивает — ровно та путаница, из-за которой выход не находили.
        if (open != null)
          AuxAction(icon: Icons.map_outlined, label: L.t('sdkToMap'), onPressed: _toMap),
        AuxAction(
          icon: Icons.undo,
          label: L.t('btn_undo'),
          count: _history.isEmpty ? null : _history.length,
          onPressed: _history.isEmpty || _won ? null : _undo,
        ),
        AuxAction(
          key: const Key('pencil'),
          icon: _pencil ? Icons.edit : Icons.edit_outlined,
          label: L.t('sudokuPencilMode'),
          active: _pencil,
          onPressed: _won ? null : _togglePencil,
        ),
        AuxAction(
          key: const Key('paint'),
          icon: _paint != null ? Icons.palette : Icons.palette_outlined,
          label: L.t('sudokuColorMode'),
          active: _paint != null,
          onPressed: _won ? null : _togglePaint,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => restartGuarded(context, live: _live, deal: _deal)),
      ]),
      toolbar: f == null
          ? null
          : _Toolbar(
              hint: switch (_hint) {
                _MoveHint.red => L.t('fractalRedDigit'),
                _MoveHint.undecided => L.t('fractalUndecided'),
                _MoveHint.none => null,
              },
              won: _won,
              onDigit: _onKey,
              onErase: _erase,
              onNext: _deal,
              paint: _paint,
              onPaint: (i) => setState(() => _paint = i),
            ),
      pauseActions: [
        PauseAction(label: L.t('sdkStartOver'), icon: Icons.refresh, onPressed: () => restartGuarded(context, live: _live, deal: _deal)),
        // 🔴 ДВЕРЬ В «БЕЗДНУ» (сверка 138f7818). В вебе она стоит на экране настройки фрактала
        // (sudoku-fractal.tsx: fractal-deep-link) — экрана настройки у натива нет, и марафонский
        // режим стал недостижим: карточки в развилке у него нет, дверь была одна.
        PauseAction(label: L.t('deepTitle'), icon: Icons.layers, onPressed: _openDeep),
      ],
    ));
  }
}

/// КАРТА: корень крупно плюс девять плиток дочерних.
class _MapView extends StatelessWidget {
  const _MapView({
    required this.puzzle,
    required this.play,
    required this.marks,
    required this.colors,
    required this.height,
    required this.selected,
    required this.progress,
    required this.onRootTap,
    required this.onTile,
  });

  final FractalPuzzle puzzle;
  final FractalPlayState play;
  final List<List<int>> marks;
  final List<List<int>> colors;
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
                  marks: marks,
                  colors: colors,
                  keyPrefix: 'root_',
                  selected: selected?.child == null ? selected : null,
                  dimmed: (r, cc) => !rootEditable(puzzle.rootPuzzle, r, cc) &&
                      puzzle.rootPuzzle[r][cc] == 0,
                  // Корень единственен: рукой поставлена не та цифра — ошибка (как у веба).
                  wrong: (r, cc) => rootEditable(puzzle.rootPuzzle, r, cc) &&
                      play.rootGrid[r][cc] != puzzle.rootSolution[r][cc],
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
    required this.marks,
    required this.colors,
    required this.height,
    required this.selected,
    required this.onTap,
  });

  final FractalPuzzle puzzle;
  final FractalPlayState play;
  final int child;
  final List<List<int>> marks;
  final List<List<int>> colors;
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
            marks: marks,
            colors: colors,
            keyPrefix: 'cell_',
            selected: selected?.child == child ? selected : null,
            portal: (r, cc) => isPortalCell(puzzle.portals, child, r, cc),
            // Дочерняя порознь неоднозначна: красим только повтор в строке/столбце/блоке.
            wrong: (r, cc) => conflictsInChild(play.children[child].grid, r, cc, play.children[child].grid[r][cc]),
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
    this.wrong,
    this.marks,
    this.colors,
  });

  final double size;
  final List<List<int>> values;
  final List<List<int>> given;

  /// Пометки и раскраска этой сетки; `null` — без них (доска разбора).
  final List<List<int>>? marks;
  final List<List<int>>? colors;
  final String keyPrefix;
  final ({int? child, int r, int c})? selected;
  final void Function(int r, int c) onTap;
  final bool Function(int r, int c)? portal;
  final bool Function(int r, int c)? dimmed;

  /// Цифра клетки — доказуемая ошибка (красим то же, за что считается ошибка).
  final bool Function(int r, int c)? wrong;

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
                      mask: marks?[r][c] ?? 0,
                      paint: colors?[r][c] ?? noSudokuColor,
                      given: given[r][c] != 0,
                      // Кормящая клетка корня: её приносят снизу, руками не трогают.
                      waiting: dimmed?.call(r, c) ?? false,
                      portal: portal?.call(r, c) ?? false,
                      wrong: values[r][c] != 0 && (wrong?.call(r, c) ?? false),
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
    required this.mask,
    required this.paint,
    required this.given,
    required this.waiting,
    required this.portal,
    required this.wrong,
    required this.selected,
    required this.scheme,
    required this.onTap,
  });

  final double size;
  final int row;
  final int col;
  final String keyName;
  final int value;
  final int mask;
  final int paint;
  final bool given;
  final bool waiting;
  final bool portal;

  /// Цифра — доказуемая ошибка: рисуется красным.
  final bool wrong;
  final bool selected;
  final ColorScheme scheme;
  final void Function(int r, int c) onTap;

  @override
  Widget build(BuildContext context) {
    // Выбор виден поверх краски — как в классике: иначе в крашеной клетке человек
    // теряет, куда сейчас пишет.
    final bg = selected
        ? scheme.primaryContainer
        : paint >= 0 && paint < sudokuColorCount
            ? cellColors[paint].withValues(alpha: 0.35)
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
                  // Цифра гасит пометки, но не стирает их — как в классике.
                  child: value == 0 && mask != 0
                      ? PencilMarksLayer(
                          key: Key('marks_$keyName'),
                          mask: mask,
                          value: value,
                          cell: size,
                          color: scheme.onSurfaceVariant,
                        )
                      : Text(
                          value == 0 ? '' : '$value',
                          style: TextStyle(
                            fontSize: size * 0.52,
                            fontWeight: given ? FontWeight.w800 : FontWeight.w500,
                            color: wrong ? scheme.error : given ? scheme.onSurface : scheme.primary,
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

/// Липкий низ: общие клавиши раздела (`keypad.dart`) — цифры, «Стереть», палитра.
/// Строка под клавишами после хода.
enum _MoveHint { none, red, undecided }

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.hint,
    required this.won,
    required this.onDigit,
    required this.onErase,
    required this.onNext,
    required this.paint,
    required this.onPaint,
  });

  /// Строка над клавишами (`fractalRedDigit` / `fractalUndecided`) или null.
  final String? hint;
  final bool won;
  final void Function(int) onDigit;
  final VoidCallback onErase;
  final VoidCallback onNext;
  final int? paint;
  final void Function(int) onPaint;

  @override
  Widget build(BuildContext context) {
    if (won) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('next'),
          onPressed: onNext,
          icon: const Icon(Icons.arrow_forward),
          label: Text(L.t('sdkNextLevel')),
        ),
      );
    }
    final keys = SudokuKeys(n: 9, onDigit: onDigit, onErase: onErase, paint: paint, onPaint: onPaint);
    final h = hint;
    if (h == null) return keys;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 2),
        child: Text(
          h,
          key: const Key('fractal-move-hint'),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.error),
        ),
      ),
      keys,
    ]);
  }
}

/// Что вернёт отмена: цифру (ход фрактала целиком), пометку или цвет.
enum _StepKind { digit, mark, color }

/// Один шаг истории. Хранит ТО, ЧТО БЫЛО: отмена ставит обратно.
class _Step {
  const _Step.digit(FractalMove this.move)
      : kind = _StepKind.digit,
        grid = 0,
        r = 0,
        c = 0,
        was = 0;
  const _Step.note(this.kind, this.grid, this.r, this.c, this.was) : move = null;

  final _StepKind kind;
  final FractalMove? move;
  final int grid;
  final int r;
  final int c;
  final int was;
}
