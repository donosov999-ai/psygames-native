import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';

/// ЭКРАН «ТОРТОВ» И «ПИЦЦЫ»: одна игра, две шкурки и две лестницы.
///
/// ⚠️ РЕШАТЕЛЬ И ГЕНЕРАТОР НЕ ПЕРЕНОСИЛИСЬ. Уровни лежали ДАННЫМИ и раньше —
/// 120 доказанных раскладов в `core/levels.json`; файл скопирован как есть в
/// `assets/levels/cake_sort.json`. Поэтому нет подсказки: она в вебе считается
/// поиском решения на лету.
class CakeSortScreen extends StatefulWidget {
  const CakeSortScreen({
    super.key,
    required this.state,
    required this.gameId,
    required this.title,
    required this.skin,
  });

  final SharedState state;

  /// Ключ лестницы — ТОТ ЖЕ, что в вебе: пройденное в тортах пиццу не открывает.
  final String gameId;
  final String title;
  final CakeSkin skin;

  @override
  State<CakeSortScreen> createState() => _CakeSortScreenState();
}

class _Snapshot {
  const _Snapshot(this.board, this.moves);
  final CakeBoard board;
  final int moves;
}

class _CakeSortScreenState extends State<CakeSortScreen> {
  /// 🔴 СЛЕДУЮЩИЙ УРОВЕНЬ ЕДЕТ САМ (Денис 24.09.2026: «не переходит на
  /// следующий уровень сам»).
  ///
  /// Итог со звёздами показывается 1,4 секунды — столько, чтобы человек увидел
  /// оценку, — и партия продолжается. Кнопка остаётся для тех, кто не ждёт.
  ///
  /// ⚠️ Таймер гасится при уходе с экрана, отмене хода и «начать заново»:
  /// открытый таймер после размонтирования валит весь прогон проб молча.
  Timer? _autoNext;

  void _scheduleNext() {
    _autoNext?.cancel();
    _autoNext = Timer(const Duration(milliseconds: 1400), () {
      if (mounted && _won) _next();
    });
  }

  void _cancelNext() {
    _autoNext?.cancel();
    _autoNext = null;
  }

  CakeLevelSet? _set;
  late LevelLadder _ladder;

  CakeLevel? _level;
  CakeBoard? _board;

  /// Раскрытая тарелка: в ней выбирают КУСОК (на столе сектор 15 точек — не
  /// попасть). Так это устроено в вебе.
  int? _zoom;

  /// Кусок в руке: откуда и какого вида.
  int? _sel;
  int? _selType;
  int _moves = 0;
  bool _won = false;
  final List<_Snapshot> _history = [];

  @override
  void dispose() {
    // Открытый таймер после ухода с экрана валит весь прогон проб молча.
    _cancelNext();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: widget.gameId, store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    final raw = await rootBundle.loadString('assets/levels/cake_sort.json');
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _set = CakeLevelSet.fromJsonString(raw);
      _start(_set!.byLevel(_ladder.level));
    });
  }

  void _start(CakeLevel level) {
    _level = level;
    _board = level.freshBoard();
    _zoom = null;
    _sel = null;
    _selType = null;
    _moves = 0;
    _won = false;
    _history.clear();
  }

  void _restart() {
    _cancelNext();
    setState(() => _start(_level!));
  }

  Future<void> _next() async {
    await _ladder.win();
    if (!mounted) return;
    setState(() => _start(_set!.byLevel(_ladder.level)));
  }

  /// Ляжет ли кусок этого вида на тарелку. ОДИН предикат на тап, на
  /// перетаскивание и на подсветку: разведи их — и подсветка начнёт обещать ход,
  /// которого нет.
  bool _canDrop(int type, int to) => _board!.canPlace(to, type);

  /// Тап по тарелке. Рука пуста — тарелка РАСКРЫВАЕТСЯ; кусок в руке — тарелка
  /// становится целью хода. Повторный тап по своей же тарелке роняет руку.
  void _tapPlate(int plate) {
    if (_won) return;
    setState(() {
      final board = _board!;
      if (_sel != null && _selType != null) {
        if (_sel == plate) {
          _sel = null;
          _selType = null;
          return;
        }
        _move(_sel!, _selType!, plate);
        return;
      }
      if (board.plates[plate].isEmpty) return;   // с пустой брать нечего
      _zoom = plate;
    });
  }

  /// Взять кусок из раскрытой тарелки: круг закрывается, кусок уходит в руку.
  ///
  /// ⚠️ БЕРЁТСЯ ВИД, А НЕ МЕСТО: правило хода — `moveType`, кусок может лежать и
  /// в середине круга. Возьми «верхний» — и половина ходов игры станет
  /// недоступной.
  void _pickSlice(int type) {
    setState(() {
      _sel = _zoom;
      _selType = type;
      _zoom = null;
    });
  }

  /// Ход ВЫБРАННЫМ куском, а не обязательно верхним: игрок ткнул в конкретный.
  void _move(int from, int type, int to) {
    final board = _board!;
    final after = moveType(board, from, type, to);
    _sel = null;
    _selType = null;
    if (after == null) return;
    _history.add(_Snapshot(board.copy(), _moves));
    _moves += 1;
    _board = after;
    if (after.isCleared) {
      _won = true;
      _scheduleNext();
    }
  }

  void _undo() {
    _cancelNext();
    if (_history.isEmpty) return;
    final s = _history.removeLast();
    setState(() {
      _board = s.board;
      _moves = s.moves;
      _sel = null;
      _selType = null;
      _won = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final level = _level;
    final board = _board;
    if (level == null || board == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    // Эталон ходов: точный минимум, если он посчитан при сборке уровня, иначе
    // длина известного пути, иначе измеренная формула (см. `referenceFor`).
    final stars = starsFor(_moves, level.circles, level.min, level.path);
    final left = board.plates.fold<int>(0, (n, p) => n + p.length) +
        board.queue.fold<int>(0, (n, p) => n + p.length);
    final stuck = !_won && !board.hasAnyMove;

    return GameShell(
      title: widget.title,
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Ходы', value: '$_moves', icon: Icons.swap_horiz),
        HudItem(label: 'Кусков', value: '$left', icon: Icons.pie_chart_outline),
        HudItem(label: 'Очередь', value: '${board.queue.length}', icon: Icons.inbox_outlined),
      ],
      field: (context, h) => Stack(
        children: [
          CakeTable(
            board: board,
            fieldHeight: h,
            skin: widget.skin,
            selected: _sel,
            selectedType: _selType,
            canDrop: _canDrop,
            onTapPlate: _tapPlate,
            onDrop: (pick, to) => setState(() => _move(pick.from, pick.type, to)),
          ),
          if (_zoom != null)
            Positioned.fill(
              child: LayoutBuilder(
                builder: (context, c) => CakeZoom(
                  plate: board.plates[_zoom!],
                  skin: widget.skin,
                  dishIndex: _zoom!,
                  size: zoomSize(c.maxWidth, c.maxHeight),
                  onPick: _pickSlice,
                  onClose: () => setState(() => _zoom = null),
                ),
              ),
            ),
        ],
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: 'Отменить', onPressed: _history.isEmpty ? null : _undo),
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: _restart),
      ]),
      toolbar: _won
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: Text('Уровень взят · $stars★ — дальше'),
              ),
            )
          // ТУПИК — ЭТО ПРОВАЛ УРОВНЯ, А НЕ НЕУДОБСТВО: из расклада без ходов
          // выйти можно только отменой или заново, и об этом надо сказать вслух.
          : stuck
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton.icon(
                    onPressed: _history.isEmpty ? _restart : _undo,
                    icon: Icon(_history.isEmpty ? Icons.refresh : Icons.undo),
                    label: Text(_history.isEmpty ? 'Ходов нет — начать заново' : 'Ходов нет — отменить ход'),
                  ),
                )
              : null,
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _restart),
        if (_history.isNotEmpty) PauseAction(label: 'Отменить ход', icon: Icons.undo, onPressed: _undo),
      ],
    );
  }
}
