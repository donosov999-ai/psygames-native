/// ЭКРАН «КОШЕК» (Queens / Star Battle с одной фигурой).
///
/// Решение Дениса 24.09.2026: игра кладётся карточкой в развилку «Судоку». Поведение
/// снято с кадра, который он показал: тычок гоняет клетку по кругу «пусто → ✕ → кошка»,
/// сверху счётчик найденных и жизни, снизу отмена и подсказка.
///
/// 🔴 ✕ — ЭТО НЕ ХОД, А ПОМЕТКА. Тот же смысл, что карандаш в судоку: человек
/// отмечает «сюда нельзя» и ничем не рискует. Ошибкой считается только КОШКА не на
/// своём месте — как в судоку ошибкой считается цифра не по решению.
///
/// 🔴 ЛЕСТНИЦА — ПО МЕРЕ ТРУДНОСТИ, А НЕ ПО РАЗМЕРУ ПОЛЯ (звено 3, задача a7987915).
/// Прежняя заглушка растила сторону 6 → 10; замер 01.10.2026 показал, что размер
/// трудности не даёт. Теперь уровень — окно меры ([gradeCats]: нужный приём и цена), карта
/// отбирается под окно ([dealCatsLevel]); таблица и замер — в шапке `ladder.dart`.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'grade.dart';
import 'ladder.dart';
import 'lesson.dart';
import 'rules.dart';

class CatsScreen extends StatefulWidget {
  const CatsScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<CatsScreen> createState() => _CatsScreenState();
}

class _CatsScreenState extends State<CatsScreen> {
  static const lives = 3;
  static const hintsPerLevel = 3;

  late LevelLadder _ladder;
  CatsBoard? _board;

  /// Мера выданной карты — уходит в отчёт партии.
  CatsGrade? _grade;

  /// Что игрок поставил в каждой клетке.
  final Map<CatCell, CatMark> _marks = {};
  late final AppHaptics _haptics = AppHaptics(widget.state);

  /// Лента ходов: отмена возвращает клетку в прежнее состояние.
  final List<({CatCell cell, CatMark was})> _history = [];

  int _errors = 0;
  int _hintsUsed = 0;
  bool _won = false;
  bool _lost = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    _ladder = LevelLadder(gameId: 'cats', store: SharedLevelStore(widget.state));
    await _ladder.load();
    if (!mounted) return;
    _deal();
  }

  /// Ключ счётчика попыток — тот же приём, что в судоку: номер попытки входит в
  /// зерно, поэтому после проигрыша приходит ДРУГАЯ доска, а не та же самая.
  String get _tryKey => '${SharedState.prefix}cats_try_${widget.state.activeProfile}';

  int get _attempt => int.tryParse(widget.state.get(_tryKey) ?? '') ?? 0;

  void _deal() {
    final level = _ladder.level;
    final deal = dealCatsLevel(level, 'cats|L$level|A$_attempt');
    setState(() {
      _board = deal?.puzzle.board;
      _grade = deal?.grade;
      _marks.clear();
      _history.clear();
      _errors = 0;
      _hintsUsed = 0;
      _won = false;
      _lost = false;
    });
  }

  Set<CatCell> get _cats =>
      {for (final e in _marks.entries) if (e.value == CatMark.cat) e.key};

  /// Вскрытая клетка (кошка или промах) — правда о ней уже показана, тычки её не меняют.
  bool _revealed(CatCell cell) {
    final m = _marks[cell];
    return m == CatMark.cat || m == CatMark.miss;
  }

  /// Короткий тычок — пометка ✕: пусто ↔ ✕. Это заметка игрока, жизни не стоит.
  ///
  /// ⚠️ До 02.10.2026 тычок гонял клетку по кругу пусто → ✕ → кошка, и кошка вставала
  /// в любую клетку — неверная оставалась на доске со снятой жизнью, и так, пока не
  /// расставишь всех (замечание Дениса). Кошка теперь только вскрывается: [_reveal].
  void _tap(int r, int c) {
    final board = _board;
    if (board == null || _won || _lost) return;
    final cell = r * board.n + c;
    if (_revealed(cell)) return;
    final was = _marks[cell] ?? CatMark.empty;
    setState(() {
      _history.add((cell: cell, was: was));
      if (was == CatMark.cross) {
        _marks.remove(cell);
      } else {
        _marks[cell] = CatMark.cross;
      }
    });
  }

  /// Долгое нажатие — вскрыть кошку. В разгадке — кошка встаёт насовсем; нет — промах:
  /// красный ✕ и минус жизнь. Доска с единственным решением позволяет сказать это
  /// прямо: «не в разгадке» и значит «неверно». Вибрация — через общий тумблер.
  void _reveal(int r, int c) {
    final board = _board;
    if (board == null || _won || _lost) return;
    final cell = r * board.n + c;
    if (_revealed(cell)) return;
    final hit = board.solutionCells.contains(cell);
    unawaited(hit ? _haptics.medium() : _haptics.heavy());
    setState(() {
      _marks[cell] = hit ? CatMark.cat : CatMark.miss;
      if (hit) {
        _checkWin();
        return;
      }
      _errors += 1;
      if (_errors >= lives) {
        _lost = true;
        _bumpAttempt();
        _ladder.fail(errors: _errors, details: _report(board));
      }
    });
  }

  /// Следующая партия этого уровня — с другой доской.
  void _bumpAttempt() => widget.state.set(_tryKey, '${_attempt + 1}');

  /// Сколько пометок можно отменить: вскрытые клетки из истории не считаются.
  int get _undoable => _history.where((h) => !_revealed(h.cell)).length;

  /// Отмена снимает последнюю пометку ✕. Вскрытое не отменяется: пометка на клетке,
  /// которую потом вскрыли, из истории просто выпадает.
  void _undo() {
    if (_won || _lost) return;
    while (_history.isNotEmpty && _revealed(_history.last.cell)) {
      _history.removeLast();
    }
    if (_history.isEmpty) return;
    setState(() {
      final last = _history.removeLast();
      if (last.was == CatMark.empty) {
        _marks.remove(last.cell);
      } else {
        _marks[last.cell] = last.was;
      }
    });
  }

  /// Подсказка ставит одну кошку из разгадки. В историю не пишется — как в судоку:
  /// отменить подсказку значит вернуть клетку, не вернув потраченную подсказку.
  void _hint() {
    final board = _board;
    if (board == null || _won || _lost || _hintsUsed >= hintsPerLevel) return;
    final left = board.solutionCells.difference(_cats);
    if (left.isEmpty) return;
    setState(() {
      _marks[left.first] = CatMark.cat;
      _hintsUsed += 1;
      _checkWin();
    });
  }

  /// Отчёт партии: поле и мера выданной карты — по ним калибруется лестница (сколько
  /// побед и провалов на каждом окне меры).
  Map<String, Object?> _report(CatsBoard board) {
    final g = _grade;
    return {
      'n': board.n,
      if (g != null) ...{'tier': g.tier, 'cost': g.cost, 'steps': g.steps},
      'hints_used': _hintsUsed,
    };
  }

  void _checkWin() {
    final board = _board;
    if (board == null) return;
    if (!catsSolved(board, _cats)) return;
    _won = true;
    _ladder.win(errors: _errors, details: _report(board));
  }

  @override
  Widget build(BuildContext context) {
    final board = _board;
    final n = board?.n ?? 0;
    return GameShell(
      title: L.t('catsTitle'),
      onRules: () => _showRules(context),
      onLesson: board == null ? null : _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '${_board == null ? 1 : _ladder.level}', icon: Icons.trending_up),
        HudItem(
          label: L.t('label_found'),
          value: '${_cats.length}/$n',
          icon: Icons.pets,
        ),
        HudItem(
          label: L.t('label_lives'),
          value: '${(lives - _errors).clamp(0, lives)}',
          icon: Icons.favorite,
        ),
      ],
      field: (context, height) {
        if (board == null) return const Center(child: CircularProgressIndicator());
        return CatsBoardView(
          board: board,
          marks: _marks,
          height: height,
          onTap: _tap,
          onLongPress: _reveal,
        );
      },
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.undo,
          label: L.t('btn_undo'),
          count: _undoable == 0 ? null : _undoable,
          onPressed: _undoable == 0 || _won || _lost ? null : _undo,
        ),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('btn_hint'),
          tint: const Color(0xFFB45309),
          count: (hintsPerLevel - _hintsUsed).clamp(0, hintsPerLevel),
          onPressed: (_hintsUsed < hintsPerLevel && !_won && !_lost) ? _hint : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _deal),
      ]),
      toolbar: (_won || _lost)
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const Key('next'),
                onPressed: _deal,
                icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
                label: Text(_won ? L.t('nextLabel') : L.t('retry')),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _deal),
      ],
    );
  }

  /// Разбор: та же доска, кошки открываются по одной, каждый шаг назван приёмом.
  ///
  /// ⚠️ ПАРТИЯ С РАЗБОРОМ В УРОВЕНЬ НЕ ЗАСЧИТЫВАЕТСЯ — отметку ставит плеер каркаса
  /// (`LessonUsed.mark()`), снимает новая раздача. Правило общее для всех игр.
  Future<void> _openLesson() async {
    final board = _board;
    if (board == null) return;
    final moves = catsLessonMoves(board);
    if (moves.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('catsTitle'),
        steps: catsLessonSteps(board),
        board: (context, side, shown) => CatsBoardView(
          board: board,
          marks: catsLessonMarks(board, moves, shown),
          height: side,
          onTap: (_, _) {},
        ),
        onNewBoard: _deal,
      ),
    ));
  }

  void _showRules(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        key: const Key('rules'),
        title: Text(L.t('catsTitle')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('• ${L.t('catsRuleColor')}'),
            const SizedBox(height: 8),
            Text('• ${L.t('catsRuleLine')}'),
            const SizedBox(height: 8),
            Text('• ${L.t('catsRuleTouch')}'),
            const SizedBox(height: 12),
            Text(L.t('catsHowPress'), key: const Key('cats-how-press')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(L.t('start'))),
        ],
      ),
    );
  }
}

/// Девять цветов областей. Те же значения, что у закраски судоку: одна палитра на
/// раздел — второй набор разъехался бы с первым при следующей правке темы.
const _regionColors = <Color>[
  Color(0xFF8B5CF6), Color(0xFF0EA5E9), Color(0xFF22C55E), Color(0xFFF59E0B), Color(0xFFEC4899),
  Color(0xFFEF4444), Color(0xFF14B8A6), Color(0xFF6366F1), Color(0xFF84CC16),
  Color(0xFF94A3B8),
];

/// Доска: квадрат внутри высоты, которую дал каркас.
///
/// 🔴 СТОРОНА — ОТ МЕНЬШЕГО ИЗ ВЫСОТЫ ПОЛЯ И ШИРИНЫ. Ровно этого не делала веб-версия
/// судоку, и ровно про это пять жалоб на вёрстку.
///
/// Публичная, потому что ту же доску показывает разбор: вторая копия разъехалась бы
/// с первой на первой же правке вида.
class CatsBoardView extends StatelessWidget {
  const CatsBoardView({
    super.key,
    required this.board,
    required this.marks,
    required this.height,
    required this.onTap,
    this.onLongPress,
  });

  final CatsBoard board;
  final Map<CatCell, CatMark> marks;
  final double height;

  /// Короткий тычок — пометка ✕.
  final void Function(int r, int c) onTap;

  /// Долгое нажатие — вскрыть кошку; `null` — поле только показывает (разбор).
  final void Function(int r, int c)? onLongPress;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, c) {
        final side = ((height < c.maxWidth ? height : c.maxWidth) - 16).clamp(0.0, 640.0);
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
                            color: _regionColors[board.regionAt(r, col) % _regionColors.length],
                            mark: marks[r * n + col] ?? CatMark.empty,
                            scheme: scheme,
                            onTap: onTap,
                            onLongPress: onLongPress,
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
    required this.color,
    required this.mark,
    required this.scheme,
    required this.onTap,
    this.onLongPress,
  });

  final double size;
  final int row;
  final int col;
  final Color color;
  final CatMark mark;
  final ColorScheme scheme;
  final void Function(int r, int c) onTap;
  final void Function(int r, int c)? onLongPress;

  @override
  Widget build(BuildContext context) {
    final press = onLongPress;
    return SizedBox(
      width: size,
      height: size,
      child: Padding(
        padding: const EdgeInsets.all(1),
        child: Material(
          color: color.withValues(alpha: 0.75),
          borderRadius: BorderRadius.circular(4),
          child: InkWell(
            key: Key('cell_${row}_$col'),
            onTap: () => onTap(row, col),
            onLongPress: press == null ? null : () => press(row, col),
            child: Center(
              child: switch (mark) {
                CatMark.empty => const SizedBox.shrink(),
                CatMark.cross => Icon(Icons.close,
                    key: Key('cross_${row}_$col'),
                    size: size * 0.45,
                    color: scheme.onSurface.withValues(alpha: 0.55)),
                CatMark.cat => Text('🐱',
                    key: Key('cat_${row}_$col'), style: TextStyle(fontSize: size * 0.55)),
                // Промах вскрытия: кошки здесь нет — красный ✕, видный издалека.
                CatMark.miss => Icon(Icons.close,
                    key: Key('miss_${row}_$col'), size: size * 0.6, color: const Color(0xFFDC2626)),
              },
            ),
          ),
        ),
      ),
    );
  }
}
