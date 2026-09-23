import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
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
  const SudokuScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<SudokuScreen> createState() => _SudokuScreenState();
}

class _SudokuScreenState extends State<SudokuScreen> {
  static const errorLimit = 3;   // «3 ошибки. Сыграй заново» — правило веб-версии

  late LevelLadder _ladder;
  SudokuLevels? _levels;
  SudokuBoard? _board;

  /// ТЕНЕВОЙ ШАГ ГЕНЕРАТОРА (§10.2): он записывает, что выбрал бы, и учит рейтинг на
  /// исходах настоящих партий. Человеку при этом выдаётся ПРЕЖНЯЯ доска прописанной
  /// лестницы — путь генератора включается отдельным флагом и здесь ничего не решает.
  GeneratorShadow? _shadow;
  List<Template> _pool = const [];
  Template? _givenTemplate;
  late String _dealId;

  List<List<int>> _grid = const [];
  List<List<bool>> _given = const [];
  final List<({int r, int c, int was})> _history = [];

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
    if (!mounted) return;
    setState(() {
      _levels = levels;
      _pool = buildPool(levels);
      _shadow = GeneratorShadow(GeneratorStore(widget.state));
    });
    _deal();
  }

  void _deal() {
    final levels = _levels;
    if (levels == null) return;
    final board = levels.boardFor(_ladder.level, seed: DateTime.now().millisecondsSinceEpoch);
    setState(() {
      _board = board;
      _failure = board == null ? 'Досок этого уровня нет в данных' : null;
      _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
      _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
      _history.clear();
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
    _dealId = 'ур${_ladder.level}-${DateTime.now().millisecondsSinceEpoch}';
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
    setState(() => _selected = (r: r, c: c));
  }

  /// Поставить цифру. Ошибкой считается расхождение с решением — так же, как в вебе:
  /// доска там уже проверена на единственность, поэтому «не по решению» и есть ошибка.
  void _place(int value) {
    final board = _board;
    final sel = _selected;
    if (board == null || sel == null || _won || _lost) return;
    if (_given[sel.r][sel.c]) return;   // подсказку задания не трогаем

    setState(() {
      _history.add((r: sel.r, c: sel.c, was: _grid[sel.r][sel.c]));
      _grid[sel.r][sel.c] = value;
      if (value != 0 && board.solution[sel.r][sel.c] != value) {
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

  void _erase() => _place(0);

  void _undo() {
    if (_history.isEmpty || _won || _lost) return;
    setState(() {
      final last = _history.removeLast();
      _grid[last.r][last.c] = last.was;
    });
  }

  /// Подсказка: открывает выбранную клетку по решению. Число подсказок на уровень
  /// задаёт лестница (`hintMax`), как в вебе.
  void _hint() {
    final board = _board;
    final sel = _selected;
    if (board == null || sel == null || _won || _lost) return;
    final cfg = _levels!.config(_ladder.level);
    if (_hintsUsed >= cfg.hintMax) return;
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
    for (var r = 0; r < board.n; r++) {
      for (var c = 0; c < board.n; c++) {
        if (_grid[r][c] != board.solution[r][c]) return;
      }
    }
    _won = true;
    // Подсказками доигранная партия рейтинг не повышает — это правило движка, не экрана.
    _recordOutcome(_hintsUsed > 0 ? Outcome.assisted : Outcome.passed);
    unawaited(_ladder.win());
  }

  void _nextLevel() {
    _deal();
  }

  @override
  Widget build(BuildContext context) {
    final levels = _levels;
    final board = _board;
    final cfg = levels?.config(_ladder.level);

    return GameShell(
      title: 'Судоку',
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.trending_up),
        HudItem(label: 'Ошибки', value: '$_errors/$errorLimit', icon: Icons.close),
        if (cfg != null && cfg.variant != 'none')
          HudItem(label: 'Правило', value: variantTitle(cfg.variant), icon: Icons.rule),
      ],
      field: (context, height) {
        if (levels == null) return const Center(child: CircularProgressIndicator());
        if (board == null) {
          return Center(child: Text(_failure ?? 'Доска не собралась'));
        }
        return _Board(
          board: board,
          grid: _grid,
          given: _given,
          selected: _selected,
          height: height,
          onTap: _select,
        );
      },
      auxRow: AuxBar(children: [
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
          onPressed: (cfg != null && _hintsUsed < cfg.hintMax && _selected != null && !_won && !_lost)
              ? _hint
              : null,
        ),
      ]),
      toolbar: board == null
          ? null
          : _Toolbar(
              n: board.n,
              won: _won,
              lost: _lost,
              onDigit: _place,
              onErase: _erase,
              onNext: _nextLevel,
            ),
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _deal),
      ],
    );
  }
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
class _Board extends StatelessWidget {
  const _Board({
    required this.board,
    required this.grid,
    required this.given,
    required this.selected,
    required this.height,
    required this.onTap,
  });

  final SudokuBoard board;
  final List<List<int>> grid;
  final List<List<bool>> given;
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
        color: selected ? scheme.primaryContainer : scheme.surface,
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
            child: Center(
              child: Text(
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
  });

  final int n;
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
