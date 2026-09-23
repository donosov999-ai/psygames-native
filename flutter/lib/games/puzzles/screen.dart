import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'engine.dart';
import 'frame.dart';
import 'ladder.dart';

/// ГОЛОВОЛОМКИ ТЭТХЭМА на общем каркасе: один экран на все режимы.
///
/// 🔴 ДВИЖОК ЧУЖОЙ И ОСТАЁТСЯ ЧУЖИМ. Доску считает C-движок автора (`engine.dart`,
/// dart:ffi), рисунок приходит потоком примитивов и кладётся на холст (`frame.dart`),
/// ввод уходит обратно в движок. Экран не знает правил игры — и не должен: правил
/// сорок две штуки, и все они уже написаны.
///
/// Прогресс лежит под тем же ключом, что у веб-версии:
/// `psygames_puzzles_<режим строчными>_level_<профиль>`.
class PuzzlesScreen extends StatefulWidget {
  const PuzzlesScreen({
    super.key,
    required this.state,
    required this.mode,
    required this.libraryPath,
  });

  final SharedState state;

  /// Имя режима из `puzzleModes` — «Solo», «Towers» и так далее.
  final String mode;

  /// Где лежит библиотека движка. Снаружи нарочно: в пробах это сборка под хост,
  /// на телефоне — библиотека приложения.
  final String libraryPath;

  @override
  State<PuzzlesScreen> createState() => _PuzzlesScreenState();
}

class _PuzzlesScreenState extends State<PuzzlesScreen> {
  late final PuzzleMode _mode;
  late LevelLadder _ladder;
  TathamEngine? _engine;
  int _gameIndex = -1;

  PuzzleFrame _frame = const PuzzleFrame([], []);
  List<List<int>> _palette = const [];
  ({int w, int h}) _size = (w: 0, h: 0);
  String _status = '';
  bool _won = false;
  String? _failure;

  @override
  void initState() {
    super.initState();
    _mode = puzzleModes[widget.mode]!;
    _ladder = LevelLadder(
      gameId: _mode.levelKey,
      store: SharedLevelStore(widget.state),
      maxLevel: _mode.steps.length,
    );
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    try {
      final engine = TathamEngine.open(widget.libraryPath);
      final index = engine.indexOf(_mode.engineName);
      if (index < 0) {
        setState(() => _failure = 'движок не знает игру ${_mode.engineName}');
        return;
      }
      if (!mounted) return;
      setState(() {
        _engine = engine;
        _gameIndex = index;
      });
      _deal();
    } catch (e) {
      // ⚠️ Библиотеки может не быть (сборка под платформу — отдельная задача).
      // Тогда экран честно говорит об этом, а не показывает вечную загрузку.
      if (mounted) setState(() => _failure = 'движок не загрузился: $e');
    }
  }

  void _deal() {
    final engine = _engine;
    if (engine == null) return;
    final step = _mode.steps[(_ladder.level - 1).clamp(0, _mode.steps.length - 1)];
    final ok = engine.start(_gameIndex, step.params, DateTime.now().millisecondsSinceEpoch % 100000);
    setState(() {
      _failure = ok ? null : 'партия не собралась: ${step.params}';
      _won = false;
      if (ok) {
        _palette = engine.colours;
        _size = engine.size;
      }
    });
    _refresh();
  }

  /// Снять кадр у движка. Дёргается после КАЖДОГО действия: промежуточные кадры нам
  /// не нужны, нужен последний.
  void _refresh() {
    final engine = _engine;
    if (engine == null) return;
    final frame = PuzzleFrame.parse(engine.draw());
    final status = engine.status;
    setState(() {
      _frame = frame;
      _status = engine.statusText;
      if (status == 1 && !_won) {
        _won = true;
        unawaited(_ladder.win());
      }
    });
  }

  void _tap(Offset at, Size widgetSize) {
    final engine = _engine;
    if (engine == null || _won) return;
    final p = toEngine(at, widgetSize, _size);
    engine.tap(p.x, p.y);
    _refresh();
  }

  void _digit(int v) {
    final engine = _engine;
    if (engine == null || _won) return;
    engine.key('0'.codeUnitAt(0) + v);
    _refresh();
  }

  void _undo() {
    final engine = _engine;
    if (engine == null) return;
    engine.undo();
    _refresh();
  }

  void _solve() {
    final engine = _engine;
    if (engine == null || _won) return;
    engine.solve();
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final step = _mode.steps[(_ladder.level - 1).clamp(0, _mode.steps.length - 1)];

    return GameShell(
      title: _mode.title,
      hud: [
        HudItem(label: 'Ступень', value: '${_ladder.level}/${_mode.steps.length}', icon: Icons.trending_up),
        HudItem(label: 'Доска', value: step.title, icon: Icons.grid_on),
      ],
      field: (context, height) {
        if (_failure != null) return Center(child: Text(_failure!));
        if (_engine == null || _frame.ops.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }
        return LayoutBuilder(
          builder: (context, c) {
            // Поле берёт МЕНЬШЕЕ из высоты каркаса и ширины — доска движка
            // масштабируется целиком, поэтому мельче клетки не станут неожиданно.
            final side = (height < c.maxWidth ? height : c.maxWidth) - 8;
            final size = Size(side < 0 ? 0 : side, side < 0 ? 0 : side);
            return Center(
              child: GestureDetector(
                key: const Key('board'),
                behavior: HitTestBehavior.opaque,
                onTapDown: (d) => _tap(d.localPosition, size),
                child: CustomPaint(
                  size: size,
                  painter: PuzzlePainter(
                    frame: _frame,
                    palette: _palette,
                    engineSize: _size,
                    background: Theme.of(context).colorScheme.surface,
                  ),
                ),
              ),
            );
          },
        );
      },
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: 'Отменить', onPressed: _won ? null : _undo),
        AuxAction(icon: Icons.refresh, label: 'Заново', onPressed: _deal),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: 'Показать решение',
          tint: const Color(0xFFB45309),
          onPressed: _won ? null : _solve,
        ),
      ]),
      toolbar: _Toolbar(
        mode: _mode,
        won: _won,
        status: _status,
        onDigit: _digit,
        onNext: () {
          _deal();
        },
      ),
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _deal),
      ],
    );
  }
}

/// Липкий низ: ряд клавиш режима (у «Нежити» они подписаны чудовищами) и победа.
class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.mode,
    required this.won,
    required this.status,
    required this.onDigit,
    required this.onNext,
  });

  final PuzzleMode mode;
  final bool won;
  final String status;
  final void Function(int) onDigit;
  final VoidCallback onNext;

  /// Сколько клавиш у ступени: размер поля читается из параметров («6dh» → 6,
  /// «5x5de» → 5, «3x3db» → 9 клеток у Solo).
  int get _keys {
    final p = mode.steps.first.params;
    final m = RegExp(r'^(\d+)x(\d+)').firstMatch(p);
    if (mode.engineName == 'Solo' && m != null) {
      return int.parse(m.group(1)!) * int.parse(m.group(2)!);
    }
    if (mode.digitLabels != null) return mode.digitLabels!.length;
    if (m != null) return int.parse(m.group(1)!);
    return int.parse(RegExp(r'^(\d+)').firstMatch(p)!.group(1)!);
  }

  @override
  Widget build(BuildContext context) {
    if (won) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('next'),
          onPressed: onNext,
          icon: const Icon(Icons.arrow_forward),
          label: const Text('Следующая ступень'),
        ),
      );
    }
    if (!mode.digits) {
      // Singles: ввод только тычками, ряд клавиш был бы обманом.
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        child: Text(status.isEmpty ? 'Тычок отмечает клетку' : status,
            textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
      );
    }
    final labels = mode.digitLabels;
    return LayoutBuilder(
      builder: (context, c) {
        const gap = 6.0;
        final keys = _keys;
        final wide = labels != null;
        final keyWidth = wide ? 96.0 : 48.0;
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
                  for (var v = 1; v <= keys; v++)
                    SizedBox(
                      width: keyWidth,
                      height: 48,
                      child: FilledButton(
                        key: Key('digit$v'),
                        onPressed: () => onDigit(v),
                        style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                        child: Text(
                          labels != null && v <= labels.length ? labels[v - 1] : '$v',
                          style: TextStyle(fontSize: wide ? 13 : 20),
                        ),
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
