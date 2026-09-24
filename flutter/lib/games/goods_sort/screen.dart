import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_preset.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';

/// «СОРТИРОВКА ТОВАРОВ» на общем каркасе — первый экран раздела на Flutter.
///
/// 🔴 ПОЧЕМУ ЭТОТ ЭКРАН ПЕРВЫЙ. По отзывам за 45 дней у него ЧЕТЫРЕ жалобы на
/// вёрстку — больше, чем у любого другого экрана раздела: «полки мелкие,
/// непонятные», «тулбары занимают половину экрана». Причина в вебе была одна и
/// та же: доска считалась от окна, а не от места, которое осталось после шапки,
/// счётчиков и ряда кнопок. Здесь высоту поля даёт каркас числом.
///
/// ⚠️ РЕШАТЕЛЬ И ГЕНЕРАТОР НЕ ПЕРЕНОСИЛИСЬ. Уровни розданы нынешним TS-генератором
/// (с доказательством решаемости там, где оно есть) и лежат в
/// `assets/levels/goods_sort.json`. Поэтому нет «Подсказки»: она в вебе считается
/// поиском по доске. Появится, когда решатель поедет отдельно.
class GoodsSortScreen extends StatefulWidget {
  const GoodsSortScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<GoodsSortScreen> createState() => _GoodsSortScreenState();
}

/// Снимок партии для отмены: ход необратим по частям — каскад троек, закрытие
/// полок и приход из очереди случаются разом.
class _Snapshot {
  _Snapshot(this.board, this.obstacles, this.covered, this.frozenRow, this.moves, this.score);
  final GoodsBoard board;
  final List<Obstacle?> obstacles;
  final Set<String> covered;
  final int? frozenRow;
  final int moves;
  final int score;
}

class _GoodsSortScreenState extends State<GoodsSortScreen> {
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

  GoodsLevelSet? _set;
  late LevelLadder _ladder;

  GoodsLevel? _level;
  GoodsBoard? _board;
  List<Obstacle?> _obstacles = [];
  Set<String> _covered = {};
  int? _frozenRow;
  int? _frozenType;

  GoodsPick? _sel;
  int _moves = 0;
  int _score = 0;
  bool _won = false;
  bool _lost = false;
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
    _ladder = LevelLadder(gameId: 'goods_sort', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    final raw = await rootBundle.loadString('assets/levels/goods_sort.json');
    await _ladder.load();
    /*
     * 🔴 РАЗДАЧА БЕРЁТСЯ ПО ШИРИНЕ ЭКРАНА, А НЕ ОДНА НА ВСЕХ. На телефоне сетка
     * узкая (3 колонки, больше рядов — «вниз экран тянется, вбок нет»), и от неё
     * зависит не только рисунок: другая маска → другое число ниш → другая доска
     * и другая цель. Первая выгрузка ушла широкой, и телефон получил бы уровни,
     * которых в игре нет. Порог тот же, что в вебе: 560.
     */
    if (!mounted) return;
    final set = GoodsLevelSet.fromJsonString(raw, width: MediaQuery.of(context).size.width);
    setState(() {
      _set = set;
      _start(set.byLevel(_ladder.level));
    });
  }

  void _start(GoodsLevel level) {
    _level = level;
    _board = level.freshBoard();
    _obstacles = [...level.obstacles];
    _covered = {...level.covered};
    _frozenRow = level.frozenRow;
    _frozenType = level.frozenType;
    _sel = null;
    _moves = 0;
    _score = 0;
    _won = false;
    _lost = false;
    _history.clear();
  }

  void _restart() {
    _cancelNext();
    setState(() => _start(_level!));
  }

  Future<void> _next() async {
    await _ladder.win();
    setState(() => _start(_set!.byLevel(_ladder.level)));
  }

  /// Можно ли трогать нишу. ОДНА проверка и на «взять отсюда», и на «положить сюда»:
  /// поставь запрет на одну сторону — препятствие станет полупрозрачным.
  bool _usable(int i) {
    if (i < _obstacles.length && _obstacles[i] != null) return false;
    if (_frozenRow != null && _level!.rowOfNiche(i) == _frozenRow) return false;
    return true;
  }

  /// Ляжет ли взятое в нишу.
  ///
  /// ⚠️ ПРОВЕРЯЕТСЯ ТИП ВЗЯТОГО ТОВАРА, А НЕ ВЕРХНЕГО В НИШЕ. В вебе здесь
  /// расхождение: `canPlaceInto` смотрит на верхний товар (`src[src.length-1]`), а
  /// `moveItem` переносит тот, по которому ткнули. На строгой укладке (с L30) это
  /// пускает товар в нишу, куда он по правилу не ложится. Перенесено честно.
  bool _canDrop(GoodsPick pick, int to) {
    if (pick.cell == to) return false;
    if (!_usable(pick.cell) || !_usable(to)) return false;
    return _board!.canPlace(to, pick.type, _level!.strict);
  }

  void _pick(GoodsPick p) {
    if (_won || _lost) return;
    if (!_usable(p.cell)) return;
    setState(() {
      if (_sel != null && _sel!.cell == p.cell && _sel!.index == p.index) {
        _sel = null;   // повторный тык по тому же товару — отмена выбора
      } else if (_sel != null && _sel!.cell != p.cell && _canDrop(_sel!, p.cell)) {
        final from = _sel!;
        _sel = null;
        _move(from, p.cell);
      } else {
        _sel = p;
      }
    });
  }

  void _tapNiche(int i) {
    if (_won || _lost) return;
    final sel = _sel;
    if (sel == null) return;
    setState(() {
      _sel = null;
      if (sel.cell != i) _move(sel, i);
    });
  }

  /// Ход: взятый товар уезжает в нишу, ядро разбирает тройки, препятствия стареют.
  void _move(GoodsPick pick, int to) {
    if (!_canDrop(pick, to)) return;
    final board = _board!;
    final level = _level!;
    _history.add(_Snapshot(
      board.copyWith(),
      [..._obstacles],
      {..._covered},
      _frozenRow,
      _moves,
      _score,
    ));

    final cells = board.cells.map((c) => [...c]).toList();
    final type = cells[pick.cell].removeAt(pick.index);
    cells[to].add(type);
    final report = CollapseReport();
    final after = collapseTriples(board.copyWith(cells: cells), report);

    _moves += 1;
    _score += scoreForClears(report.clearedTypes.length);

    /*
     * Накрытые товары: сперва ключи едут вместе с содержимым ниши (позиции
     * съезжают после изъятия), потом открывается всё, перед чем никого не
     * осталось. Обе функции ПЕРЕНЕСЕНЫ из живого TS и сверены эталонами —
     * самодельная версия этих двух правил тут уже стояла и путала их в одно.
     */
    _covered = revealUncovered(
      shiftCoveredAfterTake(_covered, pick.cell, pick.index),
      after.cells,
    ).toSet();

    // Препятствия: замок стареет на ход, запертая ниша открывается тройкой ПО
    // СОСЕДСТВУ (а не «сосед опустел»: со схлопыванием место тут же занимает
    // полка из очереди, и запертая не открылась бы никогда).
    final next = [..._obstacles];
    for (var i = 0; i < next.length; i += 1) {
      final o = next[i];
      if (o == null) continue;
      if (o.kind == 'locked') {
        final left = o.movesLeft - 1;
        next[i] = left <= 0 ? null : Obstacle('locked', movesLeft: left);
      } else if (o.kind == 'blocked' && report.clearedIds.isNotEmpty) {
        if (_neighbours(i).any(report.clearedIds.contains)) next[i] = null;
      }
    }
    _obstacles = next;

    if (_frozenType != null && report.clearedTypes.contains(_frozenType)) {
      _frozenRow = null;
      _frozenType = null;
    }

    _board = after;

    if (levelWon(after.cells, level.goal, queueLength: after.queue.length, back: after.back)) {
      _won = true;
      _scheduleNext();
    } else if (movesExhausted(_moves, level.moveLimit, after.cells, level.goal)) {
      _lost = true;
    }
  }

  /// Соседи ниши по сетке — через места, а не через плотный список: доска с дырами.
  List<int> _neighbours(int i) {
    final level = _level!;
    final places = <int>[];
    var seen = -1;
    var place = -1;
    for (var p = 0; p < level.mask.length; p += 1) {
      if (!level.mask[p]) continue;
      seen += 1;
      places.add(p);
      if (seen == i) place = p;
    }
    if (place < 0) return const [];
    final r = place ~/ level.cols;
    final c = place % level.cols;
    final out = <int>[];
    for (final d in const [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      final nr = r + d[0];
      final nc = c + d[1];
      if (nr < 0 || nc < 0 || nr >= level.rows || nc >= level.cols) continue;
      final np = nr * level.cols + nc;
      final idx = places.indexOf(np);
      if (idx >= 0) {
        // Номер ниши: с устойчивыми номерами — их, иначе место в списке.
        final ids = _board!.ids;
        out.add(ids != null && idx < ids.length ? ids[idx] : idx);
      }
    }
    return out;
  }

  void _undo() {
    _cancelNext();
    if (_history.isEmpty) return;
    final s = _history.removeLast();
    setState(() {
      _board = s.board;
      _obstacles = s.obstacles;
      _covered = s.covered;
      _frozenRow = s.frozenRow;
      _moves = s.moves;
      _score = s.score;
      _sel = null;
      _won = false;
      _lost = false;
    });
  }

  String _goalText(GoodsLevel level) {
    switch (level.goal.kind) {
      case 'pick':
        return 'Убрать названные';
      case 'free':
        return 'Освободить ниши';
      case 'moves':
        return 'Уложиться в ходы';
      default:
        return 'Убрать всё';
    }
  }

  /// 🔴 РАЗБОР ТОВАРОВ: ПРАВИЛО ПЛЮС ОДИН ХОД НА ЭТОЙ ЖЕ ДОСКЕ.
  ///
  /// Полного пути здесь не показать честно: перебор у товаров стоит секунды
  /// (замер веб-решателя: бюджет 20 000 узлов — 470 мс, 120 000 — 1,8 с), и
  /// гонять его на телефоне ради ролика нельзя. Зато ход, СОБИРАЮЩИЙ тройку,
  /// ищется одним проходом по парам ниш — и именно он показывает правило в деле.
  ///
  /// ⚠️ Законность хода проверяет `canPlace` самой игры, со строгостью УРОВНЯ:
  /// на строгих уровнях товар кладётся только к своему виду, и разбор, забывший
  /// про это, показал бы ход, который у человека не сработает.
  /// Заголовок один на экран и на разбор: вторая строка — второй долг подписей.
  String get _title => 'Сортировка товаров';

  GoodsBoard? _lessonMove() {
    final board = _board;
    final level = _level;
    if (board == null || level == null) return null;
    GoodsBoard? any;
    for (var from = 0; from < board.cells.length; from += 1) {
      if (board.isEmptyAt(from)) continue;
      final type = board.cells[from].last;
      for (var to = 0; to < board.cells.length; to += 1) {
        if (to == from || !board.canPlace(to, type, level.strict)) continue;
        final after = moveTop(board, from, to, level.strict);
        if (after == null) continue;
        // Ход, после которого товаров на поле стало меньше, и есть собранная тройка.
        final was = board.cells.fold<int>(0, (n, c) => n + c.length);
        final now = after.cells.fold<int>(0, (n, c) => n + c.length);
        if (now < was) return after;
        any ??= after;
      }
    }
    return any;
  }

  Future<void> _openLesson() async {
    final level = _level;
    final board = _board;
    if (level == null || board == null) return;
    final after = _lessonMove();
    final steps = <LessonStep>[
      LessonStep(text: L.t('teachGoodsTriple'), payload: board),
      if (after != null) LessonStep(text: L.t('teachGoodsFree'), payload: after),
      LessonStep(text: L.t('teachGoodsCap'), payload: after ?? board),
    ];
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _title,
        steps: steps,
        board: (context, side, shown) => GoodsField(
          level: level,
          board: steps[shown.clamp(0, steps.length - 1)].payload! as GoodsBoard,
          fieldHeight: side,
          shelf: shelfForProfile(widget.state.activeProfile),
          obstacles: _obstacles,
          covered: _covered,
          frozenRow: _frozenRow,
          selection: null,
          canDrop: (_, _) => false,
          onPickItem: (_) {},
          onTapNiche: (_) {},
          onDrop: (_, _) {},
        ),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final level = _level;
    final board = _board;
    if (level == null || board == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final progress = goalProgress(board.cells, level.goal);
    return GameShell(
      title: _title,
      onLesson: _board == null ? null : _openLesson,
      hud: [
        // Счётчик уровня при шаге зарядки скрыт: шаг лестницу не двигает
        // (правило каркаса), и число рядом с партией читалось бы как обещание
        // её засчитать. Так же сделано в вебе — `goods-sort.tsx:2994` и родня.
        if (!GamePreset.isPreset)
          HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(
          label: 'Ходы',
          value: level.moveLimit > 0 ? '$_moves/${level.moveLimit}' : '$_moves',
          icon: Icons.swap_horiz,
        ),
        if (progress != null)
          HudItem(label: 'Цель', value: '${progress.done}/${progress.total}', icon: Icons.task_alt),
        HudItem(label: 'Очки', value: '$_score', icon: Icons.star_outline),
      ],
      field: (context, h) => GoodsField(
        level: level,
        board: board,
        fieldHeight: h,
        // Шкаф берёт стиль у ПРОФИЛЯ, как в вебе. Зашитая берёза показывала бы
        // `nzt48` берёзу вместо ореха — и веб с приложением разошлись бы молча.
        shelf: shelfForProfile(widget.state.activeProfile),
        obstacles: _obstacles,
        covered: _covered,
        frozenRow: _frozenRow,
        selection: _sel,
        canDrop: _canDrop,
        onPickItem: _pick,
        onTapNiche: _tapNiche,
        onDrop: (pick, to) => setState(() {
          _sel = null;
          _move(pick, to);
        }),
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: 'Отменить', onPressed: _history.isEmpty ? null : _undo),
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: _restart),
        AuxAction(icon: Icons.task_alt, label: _goalText(level), onPressed: null),
      ]),
      toolbar: _won
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: Text('Уровень взят · ${starsForMoves(_moves, level.reference)}★ — дальше'),
              ),
            )
          : _lost
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton.icon(
                    onPressed: _restart,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Ходы кончились — ещё раз'),
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
