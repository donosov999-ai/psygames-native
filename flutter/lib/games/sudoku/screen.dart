import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/l10n.dart';
import 'marks.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'generator/contract.dart';
import 'generator/engine.dart';
import 'generator/pool.dart';
import 'generator/shadow.dart';
import 'generator/store.dart';
import 'levels.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import 'lesson.dart';
import 'mode_board.dart';
import 'modes.dart';

/// СУДОКУ на общем каркасе — первый экран раздела в переезде на Flutter.
///
/// 🔴 ПОЧЕМУ ЭТОТ ЭКРАН ПЕРВЫЙ. Замер по отзывам за 45 дней: у судоку ПЯТЬ жалоб на
/// вёрстку — больше, чем у любого другого экрана приложения. Все пять про одно: доска
/// и ряд цифр считались от окна, а не от места, которое реально осталось под них.
/// Здесь поле получает высоту ЧИСЛОМ от каркаса, а ряд цифр делится на равные ряды.
///
/// Правила хода — перенос `sudoku-core.ts` (`rules.dart`), сверенный с живым TS на 640
/// случаях. Доски — данными: банк классики и выгруженные вариантные доски (`levels.dart`).
/// Уровень лежит в общей памяти под тем же ключом, что у веб-версии
/// (`psygames_sudoku_level_<профиль>`), поэтому прогресс один на обе половины.
class SudokuScreen extends StatefulWidget {
  const SudokuScreen({super.key, required this.state, this.mode});

  final SharedState state;

  /// Режим доски: `null` — обычная лестница на 92 ступени, иначе «Небоскрёбы» или
  /// «Неравенства» со своей мини-лестницей на 8 ступеней и своим счётчиком.
  /// В вебе это тот же экран с адресом `/games/sudoku?mode=towers`.
  final SideMode? mode;

  @override
  State<SudokuScreen> createState() => _SudokuScreenState();
}

/// Одна подпись на обе ветки раздачи: и лестницу, и режим. Второй такой же литерал
/// в коде — это лишняя строка в долге подписей и лишний ключ при переводе.
const _noBoards = 'Досок этого уровня нет в данных';

class _SudokuScreenState extends State<SudokuScreen> {
  static const errorLimit = 3;   // «3 ошибки. Сыграй заново» — правило веб-версии

  late LevelLadder _ladder;
  SudokuLevels? _levels;
  SudokuBoard? _board;

  /// Половина режима: доски, счётчик ступени и текущая доска.
  SideModes? _sideModes;
  SideProgress? _side;
  SideBoard? _sideBoard;

  /// Решение текущей доски — что бы её ни выдало, лестница или режим.
  List<List<int>>? get _solution => _sideBoard?.solution ?? _board?.solution;

  /// Сторона доски: у небоскрёбов 6, у остальных 9 (у первых ступеней лестницы тоже 6).
  int get _n => _sideBoard?.n ?? _board?.n ?? 9;

  /// ТЕНЕВОЙ ШАГ ГЕНЕРАТОРА (§10.2): он записывает, что выбрал бы, и учит рейтинг на
  /// исходах настоящих партий. Человеку при этом выдаётся ПРЕЖНЯЯ доска прописанной
  /// лестницы — путь генератора включается отдельным флагом и здесь ничего не решает.
  GeneratorShadow? _shadow;
  List<Template> _pool = const [];
  Template? _givenTemplate;
  late String _dealId;

  List<List<int>> _grid = const [];
  List<List<bool>> _given = const [];
  /// 🔴 ШАГ ИСТОРИИ — ТРЁХ ВИДОВ, А НЕ ОДНОГО. Пока история знала только цифры,
  /// «Отменить» молча не возвращала ни пометку, ни цвет: человек ставит девять
  /// кандидатов, жмёт отмену — и ничего не происходит. Кнопка, которая работает
  /// через раз, хуже отсутствующей, потому что в неё верят.
  final List<_Step> _history = [];

  /// Карандашные пометки и раскраска — бухгалтерия игрока, по клетке на каждую.
  List<List<int>> _marks = const [];
  List<List<int>> _colors = const [];

  /// Карандаш и цвет — ВЗАИМОИСКЛЮЧАЮЩИЕ режимы, как в вебе: в цвете цифры не
  /// вводятся (касание клетки красит), в карандаше касание по-прежнему выбирает.
  bool _pencil = false;
  int? _paint;

  ({int r, int c})? _selected;
  int _errors = 0;
  int _hintsUsed = 0;
  bool _won = false;
  bool _lost = false;
  String? _failure;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'sudoku', store: SharedLevelStore(widget.state), maxLevel: 92);
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final levels = await SudokuLevels.load();
    // Лестница нужна и в режиме: потолок подсказок берётся по номеру ступени — ровно
    // так же, как в веб-половине (там в режиме `level` держит номер ступени).
    final modes = widget.mode == null ? null : await SideModes.load();
    if (!mounted) return;
    setState(() {
      _levels = levels;
      _pool = buildPool(levels);
      _shadow = GeneratorShadow(GeneratorStore(widget.state));
      _sideModes = modes;
      if (widget.mode != null) _side = SideProgress(widget.state, widget.mode!);
    });
    _deal();
  }

  void _deal() {
    final mode = widget.mode;
    if (mode != null) {
      final modes = _sideModes, side = _side;
      if (modes == null || side == null) return;
      final board = modes.boardFor(mode, side.step, seed: DateTime.now().millisecondsSinceEpoch);
      setState(() {
        _sideBoard = board;
        _failure = board == null ? _noBoards : null;
        _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
        _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
        _history.clear();
        _resetNotes(board?.n ?? 0);
        _selected = null;
        _errors = 0;
        _hintsUsed = 0;
        _won = false;
        _lost = false;
      });
      return;   // теневой шаг генератора живёт на лестнице, а не в режимах
    }
    final levels = _levels;
    if (levels == null) return;
    final board = levels.boardFor(_ladder.level, seed: DateTime.now().millisecondsSinceEpoch);
    setState(() {
      _board = board;
      _failure = board == null ? _noBoards : null;
      _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
      _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
      _history.clear();
      _resetNotes(board?.n ?? 0);
      _selected = null;
      _errors = 0;
      _hintsUsed = 0;
      _won = false;
      _lost = false;
    });
    _recordDeal(board);
  }

  /// Записать теневой выбор: какой шаблон выдала лестница и что предложил бы генератор.
  void _recordDeal(SudokuBoard? board) {
    final shadow = _shadow;
    if (shadow == null || board == null) return;
    _dealId = 'lv${_ladder.level}-${DateTime.now().millisecondsSinceEpoch}';
    _givenTemplate = templateForBoard(
      variant: board.variant,
      fromBank: board.rating != null,
      bankRating: board.rating ?? 0,
      tier: board.tier,
    );
    shadow.recordDeal(
      level: _ladder.level,
      given: _givenTemplate!,
      pool: _pool,
      // Прописанная дорога «Обычная» — у теневого шага та же поблажка по умолчанию.
      mode: Leniency.normal,
    );
  }

  /// Исход настоящей партии — в рейтинг генератора, по шаблону ВЫДАННОЙ доски.
  void _recordOutcome(Outcome outcome) {
    final shadow = _shadow, given = _givenTemplate;
    if (shadow == null || given == null) return;
    shadow.recordOutcome(
      given: given,
      outcome: outcome,
      eventId: _dealId,
      errors: _errors,
      hints: _hintsUsed,
    );
  }

  void _select(int r, int c) {
    if (_won || _lost) return;
    final paint = _paint;
    if (paint != null) {
      _paintCell(r, c, paint);
      return;
    }
    setState(() => _selected = (r: r, c: c));
  }

  /// Пустые пометки и раскраска под доску стороны [n].
  ///
  /// ⚠️ РАЗМЕР БЕРЁТСЯ У ДОСКИ, А НЕ У ДЕВЯТКИ: на лестнице есть 6×6, и матрица 9×9
  /// под ними молча ловила бы обращение за край при раскраске правого столбца.
  void _resetNotes(int n) {
    _marks = n == 0 ? const [] : emptyPencilMarks(n);
    _colors = n == 0 ? const [] : emptyCellColors(n);
    _pencil = false;
    _paint = null;
  }

  /// Покрасить клетку. Повтор того же цвета снимает метку.
  void _paintCell(int r, int c, int color) {
    if (r >= _colors.length || c >= _colors[r].length) return;
    setState(() {
      final was = _colors[r][c];
      _history.add(_Step(_StepKind.color, r, c, was));
      _colors[r][c] = toggleCellColor(was, color);
    });
  }

  /// Нажатие клавиши: в карандаше — пометка, иначе цифра. Решает общий разбор,
  /// тот же, что у веб-половины: три игры раздела обязаны вести себя одинаково.
  void _onKey(int value) {
    final sel = _selected;
    final route = routeDigitPress(
      pencil: _pencil,
      hasSelection: sel != null,
      given: sel != null && _given[sel.r][sel.c],
      blocked: _won || _lost,
    );
    switch (route) {
      case PencilRoute.ignore:
        return;
      case PencilRoute.pencil:
        _mark(sel!.r, sel.c, value);
      case PencilRoute.digit:
        _place(value);
    }
  }

  /// Пометка карандашом. Ластик (0) чистит клетку целиком — одно движение вместо девяти.
  void _mark(int r, int c, int digit) {
    if (r >= _marks.length || c >= _marks[r].length) return;
    setState(() {
      final was = _marks[r][c];
      _history.add(_Step(_StepKind.mark, r, c, was));
      _marks[r][c] = pencilInput(was, digit);
    });
  }

  /// Поставить цифру. Ошибкой считается расхождение с решением — так же, как в вебе:
  /// доска там уже проверена на единственность, поэтому «не по решению» и есть ошибка.
  void _place(int value) {
    final solution = _solution;
    final sel = _selected;
    if (solution == null || sel == null || _won || _lost) return;
    if (_given[sel.r][sel.c]) return;   // подсказку задания не трогаем

    setState(() {
      _history.add(_Step(_StepKind.digit, sel.r, sel.c, _grid[sel.r][sel.c]));
      _grid[sel.r][sel.c] = value;
      if (value != 0 && solution[sel.r][sel.c] != value) {
        _errors += 1;
        if (_errors >= errorLimit) {
          _lost = true;
          _recordOutcome(Outcome.failed);
        }
        return;
      }
      _checkWin();
    });
  }

  void _erase() => _onKey(0);

  void _undo() {
    if (_history.isEmpty || _won || _lost) return;
    setState(() {
      final last = _history.removeLast();
      switch (last.kind) {
        case _StepKind.digit:
          _grid[last.r][last.c] = last.was;
        case _StepKind.mark:
          _marks[last.r][last.c] = last.was;
        case _StepKind.color:
          _colors[last.r][last.c] = last.was;
      }
    });
  }

  /// Подсказка: открывает выбранную клетку по решению. Число подсказок на уровень
  /// задаёт лестница (`hintMax`), как в вебе.
  void _hint() {
    final solution = _solution;
    final sel = _selected;
    if (solution == null || sel == null || _won || _lost) return;
    if (_hintsUsed >= _hintMax) return;
    setState(() {
      // ⚠️ ПОДСКАЗКА В ИСТОРИЮ НЕ ПИШЕТСЯ — так в веб-половине (handleHint,
      // app/games/sudoku.tsx:1433: истории не касается вовсе), и это осмысленно:
      // отменить подсказку значит вернуть клетку, не вернув потраченную подсказку.
      // 🔴 Моя первая редакция шаг писала, и писала НЕВЕРНО — клала в «было» саму
      // разгадку, поэтому отмена ставила ту же цифру заново и выглядела сломанной.
      _grid[sel.r][sel.c] = solution[sel.r][sel.c];
      _hintsUsed += 1;
      _checkWin();
    });
  }

  /// Карандаш и цвет ВЫКЛЮЧАЮТ ДРУГ ДРУГА. Иначе в цвете нажатие цифры уходило бы
  /// в пометки, а касание клетки красило — два разных ответа на одно действие.
  void _togglePencil() => setState(() {
        _pencil = !_pencil;
        if (_pencil) _paint = null;
      });

  /// Включение цвета выбирает первый цвет палитры: режим без выбранного цвета —
  /// это режим, в котором касание клетки ничего не делает.
  void _togglePaint() => setState(() {
        _paint = _paint == null ? 0 : null;
        if (_paint != null) _pencil = false;
      });

  /// Потолок подсказок берётся по номеру ступени — как в веб-половине.
  int get _hintMax {
    final levels = _levels;
    if (levels == null) return 0;
    return levels.config(widget.mode == null ? _ladder.level : (_side?.step ?? 1)).hintMax;
  }

  void _checkWin() {
    final solution = _solution;
    if (solution == null) return;
    for (var r = 0; r < _n; r++) {
      for (var c = 0; c < _n; c++) {
        if (_grid[r][c] != solution[r][c]) return;
      }
    }
    _won = true;
    if (widget.mode != null) {
      _side?.win();   // ступень режима — свой счётчик, лестница на 92 ступени не трогается
      return;
    }
    // Подсказками доигранная партия рейтинг не повышает — это правило движка, не экрана.
    _recordOutcome(_hintsUsed > 0 ? Outcome.assisted : Outcome.passed);
    unawaited(_ladder.win());
  }

  /// 🔴 РАЗБОР СУДОКУ: ПОЧЕМУ ЭТА ЦИФРА, А НЕ «ВОТ ОТВЕТ».
  ///
  /// Шаги считает `sudokuLessonSteps`; экран отвечает за два: собрать текст приёма
  /// из своего словаря (у приёмов подстановки — ключом их не передать) и нарисовать
  /// доску СВОИМ же виджетом, чтобы разбор выглядел как партия.
  ///
  /// ⚠️ Разбор идёт от НЫНЕШНЕЙ доски, а не от начальной: человек жмёт кнопку,
  /// когда застрял, и объяснять ему первые десять ходов, которые он уже сделал,
  /// значит потерять его на первом же шаге.
  String _teachText(String key, Map<String, String> args) {
    var out = switch (key) {
      'teachSudokuNaked' => L.t('teachSudokuNaked'),
      'teachSudokuHiddenRow' => L.t('teachSudokuHiddenRow'),
      'teachSudokuHiddenCol' => L.t('teachSudokuHiddenCol'),
      _ => L.t('teachSudokuPlain'),
    };
    for (final e in args.entries) {
      out = out.replaceAll('{${e.key}}', e.value);
    }
    return out;
  }

  /// Заголовок один на экран и на разбор: вторая строка стала бы вторым долгом
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => widget.mode == null ? 'Судоку' : L.t('teachTitle');

  List<LessonStep> _lessonSteps() {
    final solution = _solution;
    if (solution == null || _grid.isEmpty) return const [];
    final board = _board;
    final side = _sideBoard;
    return sudokuLessonSteps(
      say: _teachText,
      grid: _grid,
      solution: solution,
      n: _n,
      br: side?.br ?? board?.br ?? 3,
      bc: side?.bc ?? board?.bc ?? 3,
    );
  }

  Future<void> _openLesson() async {
    final steps = _lessonSteps();
    if (steps.isEmpty) return;
    LessonUsed.mark();
    final board = _board;
    final side = _sideBoard;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _title,
        steps: steps,
        board: (context, sideLen, shown) {
          final i = shown.clamp(0, steps.length - 1);
          final m = steps[i].payload as SudokuMove;
          final marks = [for (var r = 0; r < _n; r += 1) List<int>.filled(_n, 0)];
          final colors = [for (var r = 0; r < _n; r += 1) List<int>.filled(_n, 0)];
          if (widget.mode != null && side != null) {
            return ModeBoard(
              board: side,
              mode: widget.mode!,
              grid: m.grid,
              given: _given,
              marks: marks,
              colors: colors,
              selected: (r: m.r, c: m.c),
              height: sideLen,
              onTap: (_, _) {},
            );
          }
          return SudokuBoardView(
            board: board!,
            grid: m.grid,
            given: _given,
            marks: marks,
            colors: colors,
            selected: (r: m.r, c: m.c),
            height: sideLen,
            onTap: (_, _) {},
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final levels = _levels;
    final board = _board;
    final cfg = levels?.config(_ladder.level);
    // Правило доски: у режима — его имя, у лестницы — имя варианта ступени.
    final ruleLabel = widget.mode != null
        ? variantTitle(sideModeName(widget.mode!))
        : (cfg != null && cfg.variant != 'none' ? variantTitle(cfg.variant) : null);

    return GameShell(
      title: _title,
      onLesson: _lessonSteps().isEmpty ? null : _openLesson,
      hud: [
        // ⚠️ Подпись одна и та же на оба случая: новая строка в коде — это новый долг
        // храповика подписей, а «Уровень» уже переведён на двенадцать языков.
        HudItem(
          label: 'Уровень',
          value: widget.mode == null ? '${_ladder.level}' : '${_side?.step ?? 1}/$sideSteps',
          icon: Icons.trending_up,
        ),
        HudItem(label: 'Ошибки', value: '$_errors/$errorLimit', icon: Icons.close),
        if (ruleLabel != null) HudItem(label: 'Правило', value: ruleLabel, icon: Icons.rule),
      ],
      field: (context, height) {
        final ready = widget.mode == null ? levels != null : _sideModes != null;
        if (!ready) return const Center(child: CircularProgressIndicator());
        final side = _sideBoard;
        if (widget.mode == null ? board == null : side == null) {
          return Center(child: Text(_failure ?? 'Доска не собралась'));
        }
        if (widget.mode != null) {
          return ModeBoard(
            board: side!,
            mode: widget.mode!,
            grid: _grid,
            given: _given,
            marks: _marks,
            colors: _colors,
            selected: _selected,
            height: height,
            onTap: _select,
          );
        }
        return SudokuBoardView(
          board: board!,
          grid: _grid,
          given: _given,
          marks: _marks,
          colors: _colors,
          selected: _selected,
          height: height,
          onTap: _select,
        );
      },
      // 🔴 ЧЕТЫРЕ ЗНАЧКА, КАК В ВЕБЕ, А НЕ ТРИ. Первая редакция нативного экрана
      // увезла к людям только отмену, «заново» и подсказку — без карандаша и цвета
      // (кадр Дениса 24.09: «где интерфейс прежний, с которым мы так долго возились»,
      // «кнопки для заметок, закраски и прочего»). Порядок и смысл — веб-половины
      // (app/games/sudoku.tsx:2311): отмена с глубиной, подсказка с остатком,
      // карандаш и цвет — залитыми, когда включены.
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.undo,
          label: 'Отменить',
          count: _history.isEmpty ? null : _history.length,
          onPressed: _history.isEmpty || _won || _lost ? null : _undo,
        ),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: 'Подсказка',
          tint: const Color(0xFFB45309),
          count: _hintMax > 0 ? (_hintMax - _hintsUsed).clamp(0, _hintMax) : null,
          onPressed: (_hintsUsed < _hintMax && _selected != null && !_won && !_lost)
              ? _hint
              : null,
        ),
        AuxAction(
          key: const Key('pencil'),
          icon: _pencil ? Icons.edit : Icons.edit_outlined,
          label: L.t('sudokuPencilMode'),
          active: _pencil,
          onPressed: (_won || _lost) ? null : _togglePencil,
        ),
        AuxAction(
          key: const Key('paint'),
          icon: _paint != null ? Icons.palette : Icons.palette_outlined,
          label: L.t('sudokuColorMode'),
          active: _paint != null,
          onPressed: (_won || _lost) ? null : _togglePaint,
        ),
        AuxAction(icon: Icons.refresh, label: 'Заново', onPressed: _deal),
      ]),
      toolbar: (board == null && _sideBoard == null)
          ? null
          : _Toolbar(
              n: _n,
              won: _won,
              lost: _lost,
              onDigit: _onKey,
              onErase: _erase,
              onNext: _deal,
              paint: _paint,
              onPaint: (i) => setState(() => _paint = i),
            ),
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _deal),
      ],
    );
  }
}

/// Что именно вернёт отмена: цифру, пометку или цвет.
enum _StepKind { digit, mark, color }

/// Один шаг истории. Хранит ТО, ЧТО БЫЛО, а не то, что стало: отмена ставит обратно.
class _Step {
  const _Step(this.kind, this.r, this.c, this.was);

  final _StepKind kind;
  final int r;
  final int c;
  final int was;
}

/// Имя правила для полосы счётчиков: короткое, чтобы не рвало строку.
String variantTitle(String variant) => switch (variant) {
      'diagonal' => 'диагонали',
      'antiknight' => 'ход коня',
      'hyper' => 'доп. зоны',
      'nonconsec' => 'не подряд',
      'jigsaw' => 'кривые блоки',
      'antiking' => 'ход короля',
      'evenodd' => 'чёт-нечет',
      'kropki' => 'точки Кропки',
      'sandwich' => 'сэндвич',
      'thermo' => 'термометры',
      'arrow' => 'стрелки',
      'thermocage' => 'термометр и суммы',
      'killer' => 'клетки-суммы',
      'unequal' => 'неравенства',
      'towers' => 'небоскрёбы',
      'thermoknight' => 'термо и конь',
      'sandparity' => 'сэндвич и чётность',
      'killerdiag' => 'суммы и диагонали',
      _ => 'классика',
    };

/// Доска: квадрат внутри высоты, которую дал каркас.
class SudokuBoardView extends StatelessWidget {
  const SudokuBoardView({
    super.key,
    required this.board,
    required this.grid,
    required this.given,
    required this.marks,
    required this.colors,
    required this.selected,
    required this.height,
    required this.onTap,
  });

  final SudokuBoard board;
  final List<List<int>> grid;
  final List<List<bool>> given;
  final List<List<int>> marks;
  final List<List<int>> colors;
  final ({int r, int c})? selected;
  final double height;
  final void Function(int r, int c) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 Сторона — от МЕНЬШЕГО из высоты каркаса и ширины. Ровно этого не делала
        // веб-версия: считала от окна, и доска вылезала под ряд цифр.
        final side = (height < c.maxWidth ? height : c.maxWidth) - 16;
        final n = board.n;
        final cell = side / n;
        return Center(
          child: SizedBox(
            width: side,
            height: side,
            child: Column(
              children: [
                for (var r = 0; r < n; r++)
                  SizedBox(
                    height: cell,
                    child: Row(
                      children: [
                        for (var col = 0; col < n; col++)
                          _Cell(
                            size: cell,
                            row: r,
                            col: col,
                            board: board,
                            value: grid[r][col],
                            given: given[r][col],
                            mask: r < marks.length && col < marks[r].length ? marks[r][col] : 0,
                            paint: r < colors.length && col < colors[r].length
                                ? colors[r][col]
                                : noSudokuColor,
                            selected: selected != null && selected!.r == r && selected!.c == col,
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
    required this.size,
    required this.row,
    required this.col,
    required this.board,
    required this.value,
    required this.given,
    required this.mask,
    required this.paint,
    required this.selected,
    required this.scheme,
    required this.onTap,
  });

  final double size;
  final int row;
  final int col;
  final SudokuBoard board;
  final int value;
  final bool given;

  /// Маска карандашных пометок клетки и её цвет (-1 — без цвета).
  final int mask;
  final int paint;
  final bool selected;
  final ColorScheme scheme;
  final void Function(int r, int c) onTap;

  /// Толстая черта там, где кончается блок — а у кривых блоков там, где кончается регион.
  BorderSide _side(bool thick) => BorderSide(
        color: thick ? scheme.onSurface : scheme.outlineVariant,
        width: thick ? 2 : 0.5,
      );

  bool _regionEdge(int r1, int c1, int r2, int c2) {
    final regions = board.geometry.regions;
    if (regions == null) return false;
    if (r2 < 0 || c2 < 0 || r2 >= board.n || c2 >= board.n) return true;
    return regions[r1][c1] != regions[r2][c2];
  }

  @override
  Widget build(BuildContext context) {
    final regions = board.geometry.regions;
    final bool thickTop = regions != null
        ? _regionEdge(row, col, row - 1, col)
        : row % board.br == 0;
    final bool thickLeft = regions != null
        ? _regionEdge(row, col, row, col - 1)
        : col % board.bc == 0;
    final bool thickBottom = regions != null
        ? _regionEdge(row, col, row + 1, col)
        : row == board.n - 1 || (row + 1) % board.br == 0;
    final bool thickRight = regions != null
        ? _regionEdge(row, col, row, col + 1)
        : col == board.n - 1 || (col + 1) % board.bc == 0;

    return SizedBox(
      width: size,
      height: size,
      child: Material(
        // ⚠️ ВЫБОР ВИДЕН ПОВЕРХ КРАСКИ. Если крашеная клетка перестаёт показывать,
        // что она выбрана, человек в режиме цифр теряет, куда сейчас пишет.
        color: selected
            ? scheme.primaryContainer
            : (paint >= 0 && paint < sudokuColorCount
                ? cellColors[paint].withValues(alpha: 0.35)
                : scheme.surface),
        child: InkWell(
          key: Key('cell_${row}_$col'),
          onTap: () => onTap(row, col),
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                top: _side(thickTop),
                left: _side(thickLeft),
                bottom: _side(thickBottom),
                right: _side(thickRight),
              ),
            ),
            // Цифра ГАСИТ пометки, но не стирает их: убрал цифру — кандидаты
            // снова на месте (visiblePencilDigits, разбор в marks.dart).
            child: Center(
              child: value == 0 && mask != 0
                  ? PencilMarksLayer(
                      key: Key('marks_${row}_$col'),
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
                        color: given ? scheme.onSurface : scheme.primary,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Липкий низ: клавиши цифр и «Стереть». Ряды делятся ПОРОВНУ — та же правка, что
/// сделана в веб-версии 23.09 (отзывы Дениса «почему цифры не в два ряда»).
class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.n,
    required this.won,
    required this.lost,
    required this.onDigit,
    required this.onErase,
    required this.onNext,
    required this.paint,
    required this.onPaint,
  });

  final int n;
  final bool won;
  final bool lost;
  final void Function(int) onDigit;
  final VoidCallback onErase;
  final VoidCallback onNext;

  /// Выбранный цвет: не `null` — вместо клавиш стоит палитра.
  final int? paint;
  final void Function(int) onPaint;

  @override
  Widget build(BuildContext context) {
    if (won || lost) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('next'),
          onPressed: onNext,
          icon: Icon(won ? Icons.arrow_forward : Icons.refresh),
          label: Text(won ? 'Следующий уровень' : 'Ещё раз'),
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, c) {
        const keyWidth = 48.0, gap = 6.0;
        final keys = n + 1;                                   // цифры и «Стереть»
        final fit = ((c.maxWidth - 8 + gap) / (keyWidth + gap)).floor().clamp(1, keys);
        final rows = (keys / fit).ceil();
        final perRow = (keys / rows).ceil();
        final width = perRow * keyWidth + (perRow - 1) * gap;

        // 🔴 ПАЛИТРА ВСТАЁТ НА МЕСТО КЛАВИАТУРЫ И ТОЙ ЖЕ ВЫСОТЫ — правило веб-версии
        // (`слотКлавиатуры`). Иначе при переключении режима доска прыгает вверх-вниз,
        // и человек теряет клетку, которую только что смотрел.
        final slot = rows * keyWidth + (rows - 1) * gap;
        if (paint != null) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: slot, maxWidth: width),
                child: Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  alignment: WrapAlignment.center,
                  children: [
                    for (var i = 0; i < sudokuColorCount; i++)
                      SizedBox(
                        width: 40,
                        height: 40,
                        child: Material(
                          color: cellColors[i].withValues(alpha: 0.55),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                            side: BorderSide(
                              color: paint == i
                                  ? Theme.of(context).colorScheme.onSurface
                                  : Theme.of(context).colorScheme.outlineVariant,
                              width: paint == i ? 2 : 1,
                            ),
                          ),
                          child: InkWell(
                            key: Key('swatch$i'),
                            onTap: () => onPaint(i),
                            child: paint == i
                                ? Icon(Icons.check,
                                    size: 16, color: Theme.of(context).colorScheme.onSurface)
                                : null,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          );
        }
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
                  for (var v = 1; v <= n; v++)
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
