import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/preset_cap.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/board_solver.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'puzzle.dart';
import 'model.dart';
import '../../shell/l10n.dart';

/// ЭКРАН «ХАНОЙСКОЙ БАШНИ».
///
/// 📍 ДВЕ ЖАЛОБЫ, КОТОРЫЕ ЭТОТ ЭКРАН ОБЯЗАН ЗАКРЫТЬ (отчёт 14.09.2026):
/// «перетаскивание хуёвенько работает… лагает» и «в конце на следующий уровень
/// когда переходишь — вообще непонятно: ни очки не показываются, ни что ты
/// молодец, ни уровень два». Первое лечит поле (диск тащится своим слоем),
/// второе — итог партии: ходы против минимума, звёзды и номер следующего уровня
/// прямо на кнопке.
///
/// ⚠️ ПРОВАЛА ПО ЧИСЛУ ОШИБОК ПОКА НЕТ: решение Дениса 23.09 ведётся задачей
/// f911ecd2 у координатора («уровни не понижать, механизм другой»). Ошибки
/// СЧИТАЮТСЯ и показываются — но уровень от них не зависит.
class HanoiScreen extends StatefulWidget {
  const HanoiScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<HanoiScreen> createState() => _HanoiScreenState();
}

class _HanoiScreenState extends State<HanoiScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
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

  /*
   * 🔴 ПОМОЩЬ ЗАСТРЯВШЕМУ (задачи 4366818b и d7e75e2d, отзывы 45039889 и 166ae4aa,
   * 27.10.2026, fr: «j'arrive pas», «aide moi»). Новичок прошёл L1 за 6,5 мин, на
   * L2 застрял: ввод работал, ошибок 0, разбор в шапке он не нашёл. Помощь теперь
   * приходит сама — после [_idleHelp] без хода или после [_errorsForHelp] ошибок
   * подряд — строкой над полем: «Подсказка» (один ход решения) или «Разбор».
   *
   * ⚠️ ПОДСКАЗКА — ПОМОЩЬ, А НЕ УЧЕБНАЯ ПАРТИЯ (правило «Судоку» 20.10.2026):
   * уровень после неё засчитывается. Полный разбор, как и раньше, ставит
   * `LessonUsed.mark` — там решение показано целиком.
   */
  static const Duration _idleHelp = Duration(seconds: 45);
  static const int _errorsForHelp = 3;
  GameTimer? _idle;
  bool _help = false;
  int _errorStreak = 0;

  /// Ход-подсказка: стержни подсвечиваются, пока человек не сходит.
  HanoiMove? _hint;

  void _armIdle() {
    _idle?.cancel();
    if (_won || _help) return;
    // Часы партии, а не настенные: пауза и разбор поверх игры простой не копят
    // (храповик game_clock_discipline_test).
    _idle = gameTimeout(_idleHelp, () {
      if (mounted && !_won) setState(() => _help = true);
    });
  }

  /// Один ход того же решения, что у разбора (`HanoiPuzzle` + `BoardSolver`).
  /// Предел положений меньше, чем у разбора: подсказка зовётся на нажатии и не
  /// должна подвешивать экран на крупных башнях. Не нашлось — открываем разбор.
  void _showHint() {
    final board = _board;
    if (board == null || _won) return;
    final route = BoardSolver.solve(const HanoiPuzzle(), board, maxStates: 20000);
    if (route.isEmpty) {
      _openLesson();
      return;
    }
    setState(() {
      _sel = null;
      _hint = route.first;
    });
  }

  late LevelLadder _ladder;
  HanoiState? _board;
  int? _sel;
  int _moves = 0;
  int _errors = 0;
  bool _won = false;
  // Undo keeps this attempt's claimed result; only a new deal resets it.
  Future<bool>? _resultFuture;
  bool _nextPending = false;
  int _generation = 0;
  int _playedLevel = 1;
  final List<HanoiState> _history = [];

  @override
  void dispose() {
    // Открытый таймер после ухода с экрана валит весь прогон проб молча.
    _cancelNext();
    _idle?.cancel();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'hanoi', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() => _start());
  }

  /// Сколько дисков раздать.
  ///
  /// 🔴 ШАГ ЗАРЯДКИ ИГРАЕТ СВОЮ ДОСКУ, А НЕ ЛИЧНЫЙ УРОВЕНЬ (перенос
  /// `frontend/app/games/hanoi.tsx:198`). Плейлист задаёт число дисков
  /// параметром `discs`, и оно проходит через предел `capPresetByLevel`: новичку
  /// с освоенным уровнем 1 шаг «пять дисков» дал бы 31 ход вместо семи.
  ///
  /// ⚠️ Стержней при пресете ВСЕГДА три — так в вебе. Четвёртый и пятый это
  /// награда лестницы, а не настройка шага.
  int? _presetDiscs() {
    if (!GamePreset.isPreset) return null;
    final want = GamePreset.num('discs', 0);
    if (want <= 0) return null;
    return capPresetByLevel(
      want: want,
      atLevel: levelParams(_playedLevel).discs,
      atTop: _playedLevel >= 15,
    );
  }

  void _start({int? level}) {
    _generation += 1;
    _resultFuture = null;
    _nextPending = false;
    _playedLevel = level ?? _ladder.level;
    final preset = _presetDiscs();
    _board = preset != null ? HanoiState.ofDiscs(preset, 3) : HanoiState.start(_playedLevel);
    _sel = null;
    _moves = 0;
    _errors = 0;
    _won = false;
    _history.clear();
    _help = false;
    _errorStreak = 0;
    _hint = null;
    _armIdle();
  }

  void _restart() {
    _cancelNext();
    setState(() => _start(level: _playedLevel));
  }

  Future<void> _next() async {
    if (!_won || _nextPending) return;
    setState(() => _nextPending = true);
    _cancelNext();
    final generation = _generation;
    try {
      await (_resultFuture ??= _ladder.win());
      if (!mounted || generation != _generation || !_won) return;
      setState(_start);
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _nextPending = false);
      }
    }
  }

  void _tapPeg(int i) {
    if (_won) return;
    setState(() {
      final board = _board!;
      if (_sel == null) {
        if (board.pegs[i].isEmpty) return;   // с пустого брать нечего
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

  /// Ход. Незаконный ход — ОШИБКА, и она считается отдельно от ходов: это и есть
  /// та величина, по которой Денис решил считать провал (задача f911ecd2).
  void _move(int from, int to) {
    if (_won) return;
    final board = _board!;
    final after = board.move(from, to);
    if (after == null) {
      _haptics.miss();
      _errors += 1;
      _errorStreak += 1;
      if (_errorStreak >= _errorsForHelp) _help = true;
      return;
    }
    _errorStreak = 0;
    _hint = null;
    after.solved ? _haptics.win() : _haptics.hit();
    _history.add(board.copy());
    _moves += 1;
    _board = after;
    if (after.solved) {
      _won = true;
      _idle?.cancel();
      _scheduleNext();
    } else {
      _armIdle();
    }
  }

  void _undo() {
    _cancelNext();
    if (_history.isEmpty) return;
    setState(() {
      _generation += 1;
      _nextPending = false;
      _board = _history.removeLast();
      _moves = _moves > 0 ? _moves - 1 : 0;
      _sel = null;
      _won = false;
      _hint = null;
      _armIdle();
    });
  }

  /*
   * 🔴 РАЗБОР БЕРЁТСЯ У ОБЩЕГО РЕШАТЕЛЯ, А НЕ ПИШЕТСЯ ЗДЕСЬ.
   *
   * Вся связь игры с разбором — `HanoiPuzzle`: снимок положения, законные ходы,
   * «применить», «решено». Эти четыре вещи у `HanoiState` уже были, потому что
   * нужны самой игре. Ни строки про правила ханоя в разборе нет.
   *
   * ⚠️ Партия после разбора в уровень не засчитывается (`LessonUsed.mark`):
   * решение показали, и мерить по нему человека нечестно.
   */
  /// ⚠️ Название одной строкой на весь экран: второй литерал был бы вторым местом,
  /// где его надо переводить, и первым, где забудут.
  static String get _title => L.t('hanoi');

  /// Высота строк цели и правила над доской.
  static const double _goalLineH = 46;

  /// Высота полосы помощи, когда она показана.
  static const double _helpLineH = 92;

  Future<void> _openLesson() async {
    final from = _board;
    if (from == null) return;
    final steps = await BoardLesson(const HanoiPuzzle(), from).steps();
    if (!mounted || steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _title,
        steps: steps,
        board: (context, side, shown) {
          // Доска после `shown` ходов разбора. Рисует её сама игра — каркас про
          // стержни и диски не знает.
          final at = shown == 0
              ? from
              : (steps[(shown - 1).clamp(0, steps.length - 1)].payload
                  as ({HanoiMove move, HanoiState after})).after;
          return HanoiBoard(
            state: at,
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
    final board = _board;
    if (board == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    // 🔴 ЧИСЛА БЕРУТСЯ С ДОСКИ, А НЕ ИЗ ЛЕСТНИЦЫ. Раньше здесь стоял
    // `levelParams(_ladder.level)` — вторая копия раздачи рядом с настоящей.
    // Пока пресета не было, копии совпадали; с шагом зарядки доска приходит
    // мимо лестницы, и шапка показывала бы ЧУЖИЕ диски и чужой минимум ходов
    // при верной доске на экране.
    final min = frameStewart(board.discs, board.pegs.length);
    final stars = hanoiStars(_moves, min);

    return GameShell(
      // Правило уровня объявляет каркас — в спокойный момент, не поверх партии (задача e371fd3a).
      levelRule: LevelRuleSpot(gameId: 'hanoi', level: _playedLevel, state: widget.state, calm: _moves == 0 || _won),
      title: _title,
      // Разбор по шагам — общим решателем каркаса. Своего учителя игра не пишет:
      // договор `HanoiPuzzle` отдаёт снимок, ходы и «решено», остальное общее.
      onLesson: _board == null ? null : _openLesson,
      hud: [
        // Счётчик уровня при шаге зарядки не показывается: шаг лестницу не
        // двигает, и число рядом с партией читалось бы как обещание засчитать.
        if (!GamePreset.isPreset)
          HudItem(label: L.t('level'), value: '$_playedLevel', icon: Icons.flag_outlined),
        // Ходы ПРОТИВ МИНИМУМА: без этого числа человек не знает, хорошо ли
        // играет, и «молодец» в конце берётся ниоткуда.
        HudItem(label: L.t('hud_moves'), value: '$_moves/$min', icon: Icons.swap_horiz),
        HudItem(label: L.t('discsCount'), value: '${board.discs}', icon: Icons.layers_outlined),
        HudItem(label: L.t('errors'), value: '$_errors', icon: Icons.error_outline),
      ],
      // Цель — строкой над доской, а не только в правилах за «?» (отзыв af75de31,
      // 14.10.2026: «what i had to do»). Ключ тот же, что у карточки игры.
      field: (context, h) {
        final helpH = _help && !_won ? _helpLineH : 0.0;
        final text = Theme.of(context).textTheme;
        return Column(
          children: [
            SizedBox(
              height: _goalLineH,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    L.t('hanoiDesc'),
                    key: const ValueKey('hanoi-goal'),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  // Правило — рядом с целью, а не только в справке (задача d7e75e2d:
                  // «правило перемещения дисков не понимают»).
                  Text(
                    L.t('hanoiRuleBig'),
                    key: const ValueKey('hanoi-rule'),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            if (helpH > 0)
              SizedBox(
                key: const ValueKey('hanoi-help'),
                height: helpH,
                // Фраза сверху, кнопки под ней: французская строка в один ряд с двумя
                // кнопками обрезалась на телефоне (снимок 28.10, fr, 1080×2400).
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        L.t('hanoiStuck'),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodySmall,
                      ),
                      const SizedBox(height: 4),
                      // Длинные подписи (fr, de) ужимают ряд, а не выталкивают за край.
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            FilledButton.tonalIcon(
                              key: const ValueKey('hanoi-hint'),
                              onPressed: _showHint,
                              icon: const Icon(Icons.lightbulb_outline, size: 18),
                              label: Text(L.t('btn_hint')),
                            ),
                            const SizedBox(width: 8),
                            TextButton(
                              key: const ValueKey('hanoi-help-lesson'),
                              onPressed: _openLesson,
                              child: Text(L.t('teachButton')),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            HanoiBoard(
              state: board,
              fieldHeight: h - _goalLineH - helpH,
              selected: _sel,
              hint: _hint,
              onTapPeg: _tapPeg,
              onDrop: (from, to) => setState(() {
                _sel = null;
                _move(from, to);
              }),
            ),
          ],
        );
      },
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: L.t('btn_undo'), onPressed: _history.isEmpty ? null : _undo),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _restart),
      ]),
      toolbar: _won
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 📍 «Непонятно, что ты молодец»: говорим числом — сколько
                  // ходов против минимума, сколько звёзд и какой уровень дальше.
                  Text(
                    _moves == min
                        ? L.f('hanoiWonMin', {'m': '$_moves', 's': '$stars'})
                        : L.f('hanoiWon', {'m': '$_moves', 'min': '$min', 's': '$stars'}),
                    key: const ValueKey('hanoi-result'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: _nextPending ? null : _next,
                    icon: const Icon(Icons.arrow_forward),
                    label: Text(L.f('nextLevelBtn', {'n': '${_ladder.level + (_resultFuture == null ? 1 : 0)}'})),
                  ),
                ],
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
        if (_history.isNotEmpty) PauseAction(label: L.t('btn_undo'), icon: Icons.undo, onPressed: _undo),
      ],
    );
  }
}
