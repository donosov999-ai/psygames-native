import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/shared_state.dart';
import 'tree.dart';

/// «БЕЗДНА» — фрактальная судоку с деревом до трёх слоёв, на общем каркасе.
///
/// 🔴 ЭТО МАРАФОН, А НЕ ПАРТИЯ НА ДЕСЯТЬ МИНУТ. Поэтому главное здесь не доска, а две
/// вещи: ПРОДОЛЖЕНИЕ (партия живёт неделями и обязана пережить выход) и ПОДЪЁМ НАВЕРХ
/// (провалился вниз — вернись). Обе сделаны явно.
///
/// Снимок партии пишется в ТОТ ЖЕ ключ и в том же виде, что у веб-версии
/// (`psygames_resume_sudoku_fractal_deep_<профиль>`, конверт `{v, savedAt, state}`),
/// поэтому начатое в вебе продолжается здесь и наоборот.
///
/// ⚠️ ЧЕГО НЕТ: приправы листьев (термометры и суммы) — в вебе это переключатель,
/// выключенный по умолчанию; и карандашных пометок. Снимок их поля сохраняет как есть,
/// чтобы не затереть то, что записала веб-версия.
class DeepScreen extends StatefulWidget {
  const DeepScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<DeepScreen> createState() => _DeepScreenState();
}

/// Пресеты веб-версии: глубина, сколько клеток кормится снизу, доля для порога.
const _presets = <String, ({int depth, int? feedCount, double unlockShare, String title})>{
  'scout': (depth: 2, feedCount: 9, unlockShare: 0.24, title: 'Разведка'),
  'trek': (depth: 3, feedCount: 12, unlockShare: 0.24, title: 'Поход'),
  'abyss': (depth: 3, feedCount: null, unlockShare: 0.24, title: 'Бездна'),
};

class _DeepScreenState extends State<DeepScreen> {
  static const resumeVersion = 1;
  static const gameId = 'sudoku_fractal_deep';

  DeepBank? _bank;
  final Map<String, DeepNode> _cache = {};

  String _preset = 'scout';
  int _band = 0;
  String _seed = '';
  String _path = '';
  final DeepPlayed _grids = {};
  final List<({String path, int r, int c, int prev})> _past = [];
  final List<({String path, int r, int c, int prev})> _future = [];
  Map<String, Object?> _otherFields = {};   // поля снимка, которых мы не трогаем

  ({int r, int c})? _selected;
  bool _won = false;
  String? _failure;

  DeepCfg get _cfg {
    final p = _presets[_preset]!;
    return DeepCfg(
      depth: p.depth,
      rating: deepBands[_band.clamp(0, deepBands.length - 1)],
      feedCount: p.feedCount,
      unlockShare: p.unlockShare,
    );
  }

  String get _resumeKey =>
      '${SharedState.prefix}resume_${gameId}_${widget.state.activeProfile}';

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final bank = await DeepBank.load();
    if (!mounted) return;
    setState(() => _bank = bank);
    if (!_restore()) _newGame();
  }

  /// Поднять незаконченную партию — ту же, что писала веб-версия.
  bool _restore() {
    try {
      final raw = widget.state.get(_resumeKey);
      if (raw == null) return false;
      final env = jsonDecode(raw) as Map<String, Object?>;
      if ((env['v'] as num?)?.toInt() != resumeVersion) return false;
      final s = (env['state'] as Map).cast<String, Object?>();
      final preset = s['preset'] as String?;
      if (preset == null || !_presets.containsKey(preset)) return false;

      setState(() {
        _preset = preset;
        _band = (s['band'] as num?)?.toInt() ?? 0;
        _seed = s['seed'] as String? ?? '';
        _path = s['path'] as String? ?? '';
        _grids.clear();
        final grids = (s['grids'] as Map?)?.cast<String, Object?>() ?? {};
        for (final e in grids.entries) {
          _grids[e.key] = [
            for (final row in (e.value as List)) [for (final v in row as List) (v as num).toInt()],
          ];
        }
        _past.clear();
        _future.clear();
        final hist = (s['history'] as Map?)?.cast<String, Object?>();
        for (final m in (hist?['past'] as List? ?? [])) {
          final mm = (m as Map).cast<String, Object?>();
          _past.add((
            path: mm['path'] as String,
            r: (mm['r'] as num).toInt(),
            c: (mm['c'] as num).toInt(),
            prev: (mm['prev'] as num).toInt(),
          ));
        }
        // Поля, которых мы не умеем (пометки, приправа), переносим как есть.
        _otherFields = {
          for (final e in s.entries)
            if (!const {'preset', 'band', 'seed', 'path', 'grids', 'history'}.contains(e.key))
              e.key: e.value,
        };
        _cache.clear();
        _won = false;
      });
      return _seed.isNotEmpty;
    } catch (_) {
      return false;   // снимок битый — начинаем заново, а не падаем
    }
  }

  void _save() {
    final state = <String, Object?>{
      ..._otherFields,
      'preset': _preset,
      'band': _band,
      'rating': _cfg.rating,
      'seed': _seed,
      'path': _path,
      'grids': _grids,
      // ⚠️ Лента ходов пишется в том же виде, что у веб-версии (`MoveStackData`),
      // иначе после возврата в веб отмена потеряла бы историю.
      'history': {
        'past': [for (final m in _past) {'path': m.path, 'r': m.r, 'c': m.c, 'prev': m.prev}],
        'future': [for (final m in _future) {'path': m.path, 'r': m.r, 'c': m.c, 'prev': m.prev}],
      },
    };
    widget.state.set(_resumeKey, jsonEncode({
      'v': resumeVersion,
      'savedAt': DateTime.now().millisecondsSinceEpoch,
      'state': state,
    }));
  }

  void _newGame() {
    final rnd = Random();
    setState(() {
      _seed = 'бездна-${DateTime.now().millisecondsSinceEpoch}-${rnd.nextInt(9999)}';
      _path = '';
      _grids.clear();
      _past.clear();
      _future.clear();
      _cache.clear();
      _selected = null;
      _won = false;
      _failure = null;
    });
    _save();
  }

  DeepNode _nodeAt(String path) => _cache.putIfAbsent(
        path,
        () => materializeChain(_bank!, _seed, path, _cfg).last,
      );

  List<List<int>> _gridFor(String path) =>
      _grids.putIfAbsent(path, () => [for (var r = 0; r < deepN; r++) List<int>.filled(deepN, 0)]);

  bool _isFeed(DeepNode node, int r, int c) => node.feedCells.any((f) => f[0] == r && f[1] == c);

  void _tap(int r, int c) {
    if (_won) return;
    final node = _nodeAt(_path);
    // Тычок в кормимую клетку — это ВХОД ВНИЗ, а не выбор: там живёт целая судоку.
    if (_isFeed(node, r, c)) {
      setState(() {
        _path = childPath(_path, r, c);
        _selected = null;
      });
      _save();
      return;
    }
    if (node.puzzle[r][c] != 0) return;   // подсказку задания не трогают
    setState(() => _selected = (r: r, c: c));
  }

  /// Подъём на слой выше — та самая дверь, без которой марафон превращается в ловушку.
  void _up() {
    final p = parentOf(_path);
    if (p == null) return;
    setState(() {
      _path = p.parent;
      _selected = null;
    });
    _save();
  }

  void _place(int v) {
    final sel = _selected;
    if (sel == null || _won) return;
    final node = _nodeAt(_path);
    if (node.puzzle[sel.r][sel.c] != 0 || _isFeed(node, sel.r, sel.c)) return;
    final grid = _gridFor(_path);
    final prev = grid[sel.r][sel.c];
    if (prev == v) return;
    setState(() {
      grid[sel.r][sel.c] = v;
      _past.add((path: _path, r: sel.r, c: sel.c, prev: prev));
      _future.clear();
      _won = deepRootComplete(_nodeAt, _grids);
    });
    _save();
  }

  void _erase() => _place(0);

  void _undo() {
    if (_past.isEmpty || _won) return;
    setState(() {
      final m = _past.removeLast();
      _gridFor(m.path)[m.r][m.c] = m.prev;
      _future.add(m);
      _won = deepRootComplete(_nodeAt, _grids);
    });
    _save();
  }

  @override
  Widget build(BuildContext context) {
    final bank = _bank;
    final ready = bank != null && _seed.isNotEmpty;
    final node = ready ? _nodeAt(_path) : null;
    final progress = ready ? deepNodeProgress(_nodeAt, _grids, _path) : 0;

    return GameShell(
      title: 'Бездна',
      hud: [
        HudItem(
          label: 'Глубина',
          value: '${depthOf(_path) + 1}/${_cfg.depth}',
          icon: Icons.layers,
        ),
        if (node != null)
          HudItem(label: 'Узел', value: '$progress/${node.unlockCells}', icon: Icons.grid_on),
        HudItem(label: 'Ступень', value: '${_band + 1}/${deepBands.length}', icon: Icons.trending_up),
      ],
      field: (context, height) {
        if (_failure != null) return Center(child: Text(_failure!));
        if (!ready || node == null) return const Center(child: CircularProgressIndicator());
        return LayoutBuilder(
          builder: (context, c) {
            final side = (height < c.maxWidth ? height : c.maxWidth) - 8;
            final cell = (side < 0 ? 0.0 : side) / deepN;
            return Center(
              child: SizedBox(
                width: side < 0 ? 0 : side,
                height: side < 0 ? 0 : side,
                child: Column(
                  children: [
                    for (var r = 0; r < deepN; r++)
                      SizedBox(
                        height: cell,
                        child: Row(
                          children: [
                            for (var col = 0; col < deepN; col++)
                              _Cell(
                                size: cell,
                                row: r,
                                col: col,
                                value: deepValueAt(_nodeAt, _grids, _path, r, col),
                                given: node.puzzle[r][col] != 0,
                                feed: _isFeed(node, r, col),
                                selected: _selected?.r == r && _selected?.c == col,
                                onTap: _tap,
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
      },
      auxRow: AuxBar(children: [
        // 🔴 Показан только там, где есть куда подниматься: на корне подъём бессмыслен.
        if (_path.isNotEmpty)
          AuxAction(icon: Icons.arrow_upward, label: 'Наверх', onPressed: _up),
        AuxAction(
          icon: Icons.undo,
          label: 'Отменить',
          onPressed: _past.isEmpty || _won ? null : _undo,
        ),
        AuxAction(icon: Icons.refresh, label: 'Новая партия', onPressed: _newGame),
      ]),
      toolbar: _Toolbar(won: _won, onDigit: _place, onErase: _erase, onNext: _newGame),
      pauseActions: [
        PauseAction(label: 'Новая партия', icon: Icons.refresh, onPressed: _newGame),
      ],
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
    required this.feed,
    required this.selected,
    required this.onTap,
  });

  final double size;
  final int row;
  final int col;
  final int value;
  final bool given;
  final bool feed;
  final bool selected;
  final void Function(int r, int c) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        color: selected
            ? scheme.primaryContainer
            : feed
                ? scheme.tertiaryContainer.withValues(alpha: 0.45)
                : scheme.surface,
        child: InkWell(
          key: Key('cell_${row}_$col'),
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
                  color: row == deepN - 1 ? scheme.onSurface : scheme.outlineVariant,
                  width: row == deepN - 1 ? 1.6 : 0.4,
                ),
                right: BorderSide(
                  color: col == deepN - 1 ? scheme.onSurface : scheme.outlineVariant,
                  width: col == deepN - 1 ? 1.6 : 0.4,
                ),
              ),
            ),
            child: Stack(
              children: [
                // Кормимая клетка помечена точкой: под ней целая судоку, и цифру туда
                // приносят снизу, а не ставят рукой.
                if (feed && value == 0)
                  Center(
                    child: Icon(Icons.arrow_downward, size: size * 0.4, color: scheme.tertiary),
                  ),
                Center(
                  child: Text(
                    value == 0 ? '' : '$value',
                    style: TextStyle(
                      fontSize: size * 0.52,
                      fontWeight: given ? FontWeight.w800 : FontWeight.w500,
                      color: given
                          ? scheme.onSurface
                          : feed
                              ? scheme.tertiary
                              : scheme.primary,
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
          label: const Text('Новая партия'),
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
