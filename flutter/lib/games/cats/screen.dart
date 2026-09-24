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
/// ⚠️ ЛЕСТНИЦА ЗДЕСЬ ВРЕМЕННАЯ, И ЭТО НАПИСАНО ЧЕСТНО. Ось одна — размер поля, и она
/// упирается в 10×10: дальше расти нечем. Настоящая ось (насколько рваные области,
/// сколько кошек ставится вынужденно) МЕРЯЕТСЯ в звене 3, задача a7987915. До тех пор
/// уровни выше тринадцатого отличаются только раскладкой, и делать вид, что это
/// лестница, нельзя.
library;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'generator.dart';
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

  /// Что игрок поставил в каждой клетке.
  final Map<CatCell, CatMark> _marks = {};

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

  /// Сторона поля по номеру уровня. Смотри предупреждение в шапке файла: это
  /// заглушка до звена 3, а не измеренная лестница.
  int _sideFor(int level) => 6 + ((level - 1) ~/ 3).clamp(0, 4);

  /// Ключ счётчика попыток — тот же приём, что в судоку: номер попытки входит в
  /// зерно, поэтому после проигрыша приходит ДРУГАЯ доска, а не та же самая.
  String get _tryKey => '${SharedState.prefix}cats_try_${widget.state.activeProfile}';

  int get _attempt => int.tryParse(widget.state.get(_tryKey) ?? '') ?? 0;

  void _deal() {
    final level = _ladder.level;
    final n = _sideFor(level);
    final puzzle = generateCats(n, 'cats|L$level|A$_attempt');
    setState(() {
      _board = puzzle?.board;
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

  /// Тычок по клетке: пусто → ✕ → кошка → пусто.
  void _tap(int r, int c) {
    final board = _board;
    if (board == null || _won || _lost) return;
    final cell = r * board.n + c;
    final was = _marks[cell] ?? CatMark.empty;
    final next = switch (was) {
      CatMark.empty => CatMark.cross,
      CatMark.cross => CatMark.cat,
      CatMark.cat => CatMark.empty,
    };

    setState(() {
      _history.add((cell: cell, was: was));
      if (next == CatMark.empty) {
        _marks.remove(cell);
      } else {
        _marks[cell] = next;
      }

      // Кошка не на своём месте — ошибка. Доска с единственным решением позволяет
      // сказать это прямо: «не в разгадке» и значит «неверно».
      if (next == CatMark.cat && !board.solutionCells.contains(cell)) {
        _errors += 1;
        if (_errors >= lives) {
          _lost = true;
          _bumpAttempt();
          _ladder.fail(errors: _errors);
        }
        return;
      }
      _checkWin();
    });
  }

  /// Следующая партия этого уровня — с другой доской.
  void _bumpAttempt() => widget.state.set(_tryKey, '${_attempt + 1}');

  void _undo() {
    if (_history.isEmpty || _won || _lost) return;
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

  void _checkWin() {
    final board = _board;
    if (board == null) return;
    if (!catsSolved(board, _cats)) return;
    _won = true;
    _ladder.win(errors: _errors);
  }

  @override
  Widget build(BuildContext context) {
    final board = _board;
    final n = board?.n ?? 0;
    return GameShell(
      title: L.t('catsTitle'),
      onRules: () => _showRules(context),
      hud: [
        HudItem(label: L.t('level'), value: '${_board == null ? 1 : _ladder.level}', icon: Icons.trending_up),
        HudItem(
          label: L.t('catsFound'),
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
        return _Board(
          board: board,
          marks: _marks,
          height: height,
          onTap: _tap,
        );
      },
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.undo,
          label: L.t('btn_undo'),
          count: _history.isEmpty ? null : _history.length,
          onPressed: _history.isEmpty || _won || _lost ? null : _undo,
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
class _Board extends StatelessWidget {
  const _Board({
    required this.board,
    required this.marks,
    required this.height,
    required this.onTap,
  });

  final CatsBoard board;
  final Map<CatCell, CatMark> marks;
  final double height;
  final void Function(int r, int c) onTap;

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
  });

  final double size;
  final int row;
  final int col;
  final Color color;
  final CatMark mark;
  final ColorScheme scheme;
  final void Function(int r, int c) onTap;

  @override
  Widget build(BuildContext context) {
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
            child: Center(
              child: switch (mark) {
                CatMark.empty => const SizedBox.shrink(),
                CatMark.cross => Icon(Icons.close,
                    key: Key('cross_${row}_$col'),
                    size: size * 0.45,
                    color: scheme.onSurface.withValues(alpha: 0.55)),
                CatMark.cat => Text('🐱',
                    key: Key('cat_${row}_$col'), style: TextStyle(fontSize: size * 0.55)),
              },
            ),
          ),
        ),
      ),
    );
  }
}
