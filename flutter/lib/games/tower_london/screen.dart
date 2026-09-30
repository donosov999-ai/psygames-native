import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/game_preset.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/preset_cap.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/board_solver.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import 'puzzle.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';

/// ЭКРАН «ЛОНДОНСКОЙ БАШНИ».
///
/// 🔴 ПАРТИЯ — ПЯТЬ ЗАДАЧ, А НЕ ОДНА, и засчитывается она ЦЕЛИКОМ: лишних ходов
/// (сверх минимума, по всем пяти) должно быть не больше пяти. Так это устроено в
/// вебе, и это не формальность: одна задача решается и наугад, пять подряд —
/// уже нет.
///
/// ⚠️ ГЕНЕРАТОР ЗАДАЧ НЕ ПЕРЕНОСИЛСЯ: задачи выгружены живым TS вместе с
/// минимумом ходов и лежат в `assets/levels/tower_london.json`.
class TowerLondonScreen extends StatefulWidget {
  const TowerLondonScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<TowerLondonScreen> createState() => _TowerLondonScreenState();
}

class _TowerLondonScreenState extends State<TowerLondonScreen> {
  /// 🔴 ПАРТИЯ ПРОДОЛЖАЕТСЯ САМА (Денис 24.09.2026: «во всех играх переход в
  /// конце сломан» — то есть его нет ни в одной). Итог видно 1,8 с — тут он
  /// длиннее, чем у уровневых игр: человеку показывают сумму лишних ходов за
  /// пять задач, а не одну звезду.
  Timer? _autoNext;

  void _scheduleNext() {
    _autoNext?.cancel();
    _autoNext = Timer(const Duration(milliseconds: 1800), () {
      if (mounted && _done) setState(_startGame);
    });
  }

  void _cancelNext() {
    _autoNext?.cancel();
    _autoNext = null;
  }

  @override
  void dispose() {
    // Открытый таймер после ухода с экрана валит весь прогон проб молча.
    _cancelNext();
    super.dispose();
  }

  late LevelLadder _ladder;
  TolLevelSet? _set;
  TolLevel? _level;

  TolPuzzle? _puzzle;
  TolState? _state;
  int? _sel;
  int _round = 1;
  int _moves = 0;
  int _extra = 0;
  int _errors = 0;
  bool _done = false;
  bool _passed = false;
  final List<TolState> _history = [];

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'tower_london', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    final raw = await rootBundle.loadString('assets/levels/tower_london.json');
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _set = TolLevelSet.fromJsonString(raw);
      _startGame();
    });
  }

  /// Сколько задач в партии. Шаг зарядки задаёт своё число (`trials`), обычный
  /// заход берёт число набора.
  int get _rounds {
    final set = _set!;
    if (!GamePreset.isPreset) return set.rounds;
    final want = GamePreset.num('trials', 0);
    return want > 0 ? want : set.rounds;
  }

  /// 🔴 ШАГ ЗАРЯДКИ ИГРАЕТ СВОЮ СЛОЖНОСТЬ (перенос `tower-london.tsx:175`):
  /// лёгкий — план в 3 хода, средний 5, трудный 7, шаров всегда три. Длина
  /// плана проходит через тот же предел, что и диски ханоя: шаг не даёт
  /// прыгнуть выше освоенного больше чем на ступень.
  TolLevel _pickLevel() {
    final set = _set!;
    if (!GamePreset.isPreset) return set.byLevel(_ladder.level);
    final diff = GamePreset.str('diff', 'medium');
    final want = diff == 'easy' ? 3 : (diff == 'hard' ? 7 : 5);
    final capped = capPresetByLevel(
      want: want,
      atLevel: set.byLevel(_ladder.level).targetMoves,
      atTop: _ladder.level >= set.levels.length,
    );
    return set.byTarget(capped, 3);
  }

  void _startGame() {
    _level = _pickLevel();
    _round = 1;
    _extra = 0;
    _errors = 0;
    _done = false;
    _passed = false;
    _startRound();
  }

  void _startRound() {
    final level = _level!;
    // Задача берётся по номеру раунда, а не случайно: партия воспроизводима, и
    // «та же доска ещё раз» после перезапуска действительно та же.
    _puzzle = level.puzzles[(_round - 1) % level.puzzles.length];
    _state = _puzzle!.start.copy();
    _sel = null;
    _moves = 0;
    _history.clear();
  }

  void _restart() {
    _cancelNext();
    setState(_startGame);
  }

  Future<void> _finish() async {
    final rounds = _rounds;
    _passed = tolPassed(_extra, rounds);
    _done = true;
    _scheduleNext();
    // Провал опускает уровень только на третий подряд — так работает общая
    // лестница; один промах ничего не стоит.
    if (_passed) {
      await _ladder.win();
    } else {
      await _ladder.fail();
    }
    if (mounted) setState(() {});
  }

  void _tapPeg(int i) {
    if (_done) return;
    setState(() {
      final st = _state!;
      if (_sel == null) {
        if (st.pegs[i].isEmpty) return;
        _sel = i;
        return;
      }
      if (_sel == i) {
        _sel = null;
        return;
      }
      final from = _sel!;
      _sel = null;
      _move(from, i);
    });
  }

  void _move(int from, int to) {
    final st = _state!;
    final after = st.move(from, to);
    if (after == null) {
      // Ход запрещён вместимостью стержня — это ошибка, и она идёт в счёт.
      _errors += 1;
      return;
    }
    _history.add(st.copy());
    _moves += 1;
    _state = after;
    if (after.key == _puzzle!.goal.key) {
      final extra = _moves - _puzzle!.minMoves;
      _extra += extra > 0 ? extra : 0;
      if (_round >= _rounds) {
        _finish();
      } else {
        _round += 1;
        _startRound();
      }
    }
  }

  void _undo() {
    _cancelNext();
    if (_history.isEmpty) return;
    setState(() {
      _state = _history.removeLast();
      _moves = _moves > 0 ? _moves - 1 : 0;
      _sel = null;
    });
  }

  /*
   * 🔴 РАЗБОР БЕРЁТСЯ У ОБЩЕГО ПОИСКА, А НЕ ПИШЕТСЯ ЗДЕСЬ.
   *
   * Вся связь игры с разбором — `TolPuzzleAdapter`: снимок, ходы, «применить»,
   * «решено». Эти четыре вещи у `TolState` уже были — они нужны самой игре.
   *
   * ⚠️ ЦЕЛЬ У БАШЕН СВОЯ У КАЖДОЙ ЗАДАЧИ, а не встроена в правила, как у ханоя.
   * Поэтому она передаётся адаптеру параметром: иначе разбор решал бы не ту
   * задачу, что показана человеку.
   */
  /// ⚠️ Название одной строкой на весь экран: второй литерал был бы вторым местом,
  /// где его переводить, и первым, где забудут.
  static const _title = 'Башня Лондона';

  Future<void> _openLesson() async {
    final from = _state;
    final puzzle = _puzzle;
    if (from == null || puzzle == null) return;
    final game = TolPuzzleAdapter(puzzle.goal.key);
    final steps = await BoardLesson(game, from).steps();
    if (!mounted || steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _title,
        steps: steps,
        board: (context, side, shown) {
          final at = shown == 0
              ? from
              : (steps[(shown - 1).clamp(0, steps.length - 1)].payload
                  as ({TolMove move, TolState after})).after;
          return TolBoard(
            state: at,
            goal: puzzle.goal,
            fieldHeight: side,
            selected: null,
            onTapPeg: (_) {},
            onDrop: (_, _) {},
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final level = _level;
    final st = _state;
    final puzzle = _puzzle;
    if (level == null || st == null || puzzle == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final rounds = _rounds;

    return GameShell(
      title: _title,
      // Разбор — общим решателем каркаса: игра отдала снимок, ходы и цель,
      // своего учителя не писала.
      onLesson: (_state == null || _puzzle == null) ? null : _openLesson,
      hud: [
        // Счётчик уровня при шаге зарядки скрыт: шаг лестницу не двигает.
        if (!GamePreset.isPreset)
          HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: 'Задача', value: '$_round/$rounds', icon: Icons.repeat),
        // Ходы ПРОТИВ МИНИМУМА: игра именно про план, и без минимума человек не
        // знает, хорошо ли он спланировал.
        HudItem(label: 'Ходы', value: '$_moves/${puzzle.minMoves}', icon: Icons.swap_horiz),
        HudItem(label: 'Лишние', value: '$_extra', icon: Icons.trending_up),
        // Ошибка здесь — попытка положить шар на ПОЛНЫЙ стержень. Она не
        // отнимает ход, но показывается: молчащий отказ читается как поломка.
        HudItem(label: 'Ошибки', value: '$_errors', icon: Icons.error_outline),
      ],
      field: (context, h) => TolBoard(
        state: st,
        goal: puzzle.goal,
        fieldHeight: h,
        selected: _sel,
        onTapPeg: _tapPeg,
        onDrop: (from, to) => setState(() {
          _sel = null;
          _move(from, to);
        }),
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: 'Отменить', onPressed: _history.isEmpty ? null : _undo),
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: _restart),
      ]),
      toolbar: _done
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    // ⚠️ При шаге зарядки уровень НЕ обещаем: лестница не
                    // двигается, и «дальше уровень N» был бы прямой неправдой.
                    _passed
                        ? (GamePreset.isPreset
                            // Новая строка идёт ЧЕРЕЗ СЛОВАРЬ, а не литералом:
                            // храповик `ui_text_debt_does_not_grow` требует, чтобы
                            // зашитого русского в файле не прибавлялось, и он прав —
                            // в приложении двенадцать языков.
                            ? L.f('tolWonPreset', {'e': '$_extra', 'r': '$rounds'})
                            : 'Партия взята: лишних ходов $_extra из $rounds · дальше уровень ${_ladder.level}')
                        : 'Лишних ходов $_extra при пороге $rounds — партия не взята',
                    key: const ValueKey('tol-result'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: _restart,
                    icon: Icon(_passed ? Icons.arrow_forward : Icons.refresh),
                    label: Text(_passed ? 'Дальше' : 'Ещё раз'),
                  ),
                ],
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
