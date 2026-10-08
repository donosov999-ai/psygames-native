import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_rules.dart';
import '../../shell/generator/contract.dart';
import '../../shell/generator/engine.dart';
import '../../shell/generator/ladder_pool.dart';
import '../../shell/generator/shadow.dart';
import '../../shell/generator/store.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import 'engine.dart';
import 'frame.dart';
import 'lesson.dart';
import 'ladder.dart';
import 'step_title.dart';
import 'zoom.dart';

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
    this.libraryPath,
    this.seed,
  });

  final SharedState state;

  /// Имя режима из `puzzleModes` — «Solo», «Towers» и так далее.
  final String mode;

  /// Где лежит библиотека движка — ТОЛЬКО для настольных сборок и проб.
  ///
  /// На телефоне пути нет и быть не может: на iOS движок влинкован в само
  /// приложение, на Android лежит в APK и открывается по имени. Поэтому здесь
  /// `null`, а выбор делает [TathamEngine.openPlatform].
  final String? libraryPath;

  /// Зерно раздачи — ТОЛЬКО для проб. Без него код «Угадай кода» случаен, и проба хода
  /// 1-2-3 на ступени 4 цвета × 3 места выигрывала партию в одном прогоне из 64 (плавающая
  /// guess_input_test, 08.10.2026). В игре — `null`, зерно от часов.
  final int? seed;

  @override
  State<PuzzlesScreen> createState() => _PuzzlesScreenState();

  /// Движок открытого экрана — ТОЛЬКО для проб: ход надёжно виден лишь по позиции в истории
  /// (`statePos`), а кадр движок отдаёт чуть разным и без ввода (замер 01.10.2026: два
  /// draw() подряд у «Куба», «Инерции», «Сети» не совпадают).
  @visibleForTesting
  static TathamEngine? debugEngine;
}

class _PuzzlesScreenState extends State<PuzzlesScreen> {
  /// ⚠️ Карточка режима приходит ИЗ АССЕТА, а первый кадр рисуется раньше. Поле
  /// было `late` — и экран падал LateInitializationError на первом же кадре.
  /// Пусто значит «ещё грузится», и это честное состояние, а не сбой.
  PuzzleMode? _modeOrNull;
  PuzzleMode get _mode => _modeOrNull!;
  late LevelLadder _ladder;
  TathamEngine? _engine;
  int _gameIndex = -1;

  /// Ступени ЭТОГО режима: своя лестница из `modes.json` либо меню движка.
  /// Заполняется в [_boot] после открытия игры — до этого числа ступеней не знает
  /// никто, потому что у 28 режимов оно живёт внутри движка (см. [resolveSteps]).
  List<PuzzleStep> _steps = const [];

  PuzzleFrame _frame = const PuzzleFrame([], []);
  List<List<int>> _palette = const [];
  ({int w, int h}) _size = (w: 0, h: 0);
  String _status = '';
  bool _won = false;
  String? _failure;

  /// Партия проиграна движком (статус −1: «Сапёр» взорвался, у «Угадай код» кончились
  /// попытки). До 30.09.2026 нативный экран этот исход не видел вовсе: партии не было
  /// ни в статистике, ни в лестнице, хотя веб зовёт `lvl.fail()` (puzzles.tsx).
  bool _lost = false;

  /// Нажато «Показать решение». Решённая решателем доска — не победа, а РАЗБОР (веб,
  /// puzzles.tsx: ступень не растёт и не падает). До 30.09.2026 нативный экран считал её
  /// победой и поднимал ступень — отчёты 8a1b20d6 и 67561a7f были про тот же исход в вебе.
  bool _solverUsed = false;

  /// Ступень, на которой розданы доска и партия: после победы лестница уже шагнула.
  int _dealLevel = 1;

  /*
   * 🔴 ТЕНЬ ГЕНЕРАТОРА НА ВСЕ 42 РЕЖИМА (звено 2 цепочки генератора, задача 543d853c).
   * Человек играет прежнюю лестницу, а генератор рядом пишет, какую ступень выбрал бы,
   * и учит рейтинг игрока на настоящих исходах — ровно так, как эталон «Судоку» (§10
   * шаг 2). Прописанные ключи уровня не трогаются: у генератора свои
   * (`psygames_puzzles_<движок>_adaptive_*`), проба `puzzles_generator_test.dart`.
   */
  List<Template> _genPool = const [];
  GeneratorShadow? _shadow;
  Template? _given;
  String _eventId = '';

  @override
  void initState() {
    super.initState();
    _boot();
  }

  /// ⚠️ Карточки режимов теперь ГРУЗЯТСЯ (ассет, собранный из веб-моста), а не
  /// лежат в коде — значит режим нельзя взять синхронно в initState. Раньше
  /// `puzzleModes[widget.mode]!` падал бы восклицательным знаком на незнакомом
  /// имени; теперь незнакомое имя — это честная надпись на экране, а не сбой.
  Future<void> _prepareMode() async {
    await PuzzleModes.load();
    final mode = PuzzleModes.all[widget.mode];
    if (mode == null) {
      if (mounted) setState(() => _failure = L.f('puzzleErrUnknownMode', {'mode': widget.mode}));
      return;
    }
    _modeOrNull = mode;
  }

  Future<void> _boot() async {
    await _prepareMode();
    if (_failure != null) return;
    try {
      final engine = TathamEngine.openPlatform(path: widget.libraryPath);
      final index = engine.indexOf(_mode.engineName);
      if (index < 0) {
        setState(() => _failure = L.f('puzzleErrNoGame', {'game': _mode.engineName}));
        return;
      }
      // ⚠️ ПОРЯДОК ВАЖЕН: ступени известны только после открытия игры, а потолок
      // лестницы обязан быть настоящим. Прежде лестница строилась ДО движка и у
      // 28 режимов получала выдуманный потолок 999 — уровень рос в пустоту.
      _steps = resolveSteps(_mode, engine, index);
      _genPool = ladderPool(gameId: _mode.levelKey, stepKeys: [for (final s in _steps) s.params]);
      _shadow = GeneratorShadow(GeneratorStore(widget.state, gameId: _mode.levelKey));
      final levelStore = SharedLevelStore(widget.state);
      await migrateLegacyLevel(_mode, levelStore);
      _ladder = LevelLadder(
        gameId: _mode.levelKey,
        store: levelStore,
        maxLevel: _steps.length,
        // Партию веб пишет типом `puzzles` с режимом рядом (puzzles.tsx) — так же и здесь,
        // иначе в статистике её нет нигде. Уровень — по-прежнему у каждого режима свой.
        sessionType: 'puzzles',
        sessionMode: _mode.engineName,
      );
      await _ladder.load();
      if (!mounted) return;
      PuzzlesScreen.debugEngine = engine;
      setState(() {
        _engine = engine;
        _gameIndex = index;
        _canSolve = engine.canSolve(index);
      });
      _deal();
    } catch (e) {
      // ⚠️ Библиотеки может не быть (сборка под платформу — отдельная задача).
      // Тогда экран честно говорит об этом, а не показывает вечную загрузку.
      if (mounted) setState(() => _failure = L.f('puzzleErrEngineLoad', {'error': '$e'}));
    }
  }

  /// Умеет ли движок решать ЭТУ игру — флаг берётся у автора, а не из нашего списка.
  bool _canSolve = false;

  /// Шаги разбора ЭТОЙ раздачи. Пусто — разбора нет, и кнопки тоже.
  List<LessonStep> _lessonSteps = const [];

  /*
   * 🔴 РАЗБОР БЕРЁТСЯ У РЕШАТЕЛЯ ДВИЖКА И НИЧЕГО НЕ ЗНАЕТ ПРО ИГРУ.
   *
   * Шаги строит общий генератор (`TathamLesson`): он просит движок решить, снимает
   * разность кадров и возвращает доску обратно. Здесь остаётся только нарисовать
   * доску с раскрытыми шагами — это единственное, что знает про эту игру.
   *
   * ⚠️ Партия после разбора в уровень не засчитывается (`LessonUsed.mark`): решение
   * было показано, и мерить по нему человека нечестно.
   */
  Future<void> _openLesson() async {
    final engine = _engine;
    if (engine == null) return;
    final steps = _lessonSteps;
    if (steps.isEmpty) return;
    LessonUsed.mark();
    final base = engine.draw();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _mode.title,
        steps: steps,
        onNewBoard: _deal,
        board: (context, side, shown) {
          // Доска игрока плюс то, что разбор уже раскрыл. Кадр собирается заново
          // из тех же строк движка — второго рисователя тут не заводим.
          final lines = <String>[
            ...base,
            for (var i = 0; i < shown && i < steps.length; i++)
              ...(steps[i].payload as List<String>),
          ];
          return CustomPaint(
            size: Size(side, side),
            painter: PuzzlePainter(
              frame: PuzzleFrame.parse(lines),
              palette: _palette,
              engineSize: _size,
              background: Theme.of(context).colorScheme.surface,
            ),
          );
        },
      ),
    ));
    if (mounted) _refresh();
  }

  void _deal() {
    final engine = _engine;
    if (engine == null) return;
    LessonUsed.reset();   // новая доска — партия снова зачётная
    final at = (_ladder.level - 1).clamp(0, _steps.length - 1);
    final step = _steps[at];
    _solverUsed = false;
    _lost = false;
    _dealLevel = _ladder.level;
    _given = at < _genPool.length ? _genPool[at] : null;
    _eventId = '${_mode.levelKey}-${DateTime.now().microsecondsSinceEpoch}';
    // Шаг зарядки — не личная лестница человека: рейтинг на нём не учим (как и уровень).
    if (_given != null && !GamePreset.isPreset) {
      _shadow?.recordDeal(level: _dealLevel, given: _given!, pool: _genPool, mode: Leniency.normal);
    }
    final ok = engine.start(_gameIndex, step.params, widget.seed ?? DateTime.now().millisecondsSinceEpoch % 100000);
    setState(() {
      _failure = ok ? null : L.f('puzzleErrBuild', {'params': step.params});
      _won = false;
      if (ok) {
        _palette = engine.colours;
        _size = engine.size;
        _zoom.reset();   // новая доска — другого размера: вид с начала
      }
    });
    _refresh();
    _prepareLesson();
  }

  /// Посчитать разбор для нынешней раздачи.
  ///
  /// ⚠️ Генератор просит движок решить и возвращает доску обратно отменой — то
  /// есть после этого вызова доска обязана остаться прежней. Это сторожит проба
  /// `lesson_from_solver_test.dart`; без неё «Разбор» однажды стал бы «Сдаться».
  Future<void> _prepareLesson() async {
    final engine = _engine;
    if (engine == null || _gameIndex < 0) return;
    final steps = _canSolve
        ? await TathamLesson(engine, canSolve: true, gameName: _mode.engineName).steps()
        : const <LessonStep>[];
    if (mounted) setState(() => _lessonSteps = steps);
  }

  /// Снять кадр у движка. Дёргается после КАЖДОГО действия: промежуточные кадры нам
  /// не нужны, нужен последний.
  void _refresh() {
    final engine = _engine;
    if (engine == null) return;
    final frame = PuzzleFrame.parse(engine.draw());
    final status = engine.status;
    final justWon = status == 1 && !_won;
    final justLost = status == -1 && !_won && !_lost;
    setState(() {
      _frame = frame;
      _status = engine.statusText;
      if (justWon) _won = true;
      if (justLost) _lost = true;
    });
    if (justWon) _finish(won: true);
    if (justLost) _finish(won: false);
  }

  /// Конец партии: одна запись на исход — с тем, что в вебе (`puzzles.tsx`): тип
  /// `puzzles`, режим, трудность `<режим>-<ступень>`, решатель в подробностях.
  void _finish({required bool won}) {
    // Разбор («Показать решение» или плеер разбора) — третье состояние: партия пишется,
    // ступень не двигается ни вверх, ни вниз. Флаг разбора читается ДО win/fail: лестница
    // его сбрасывает.
    if (_solverUsed) LessonUsed.mark();
    final assisted = LessonUsed.inRound;
    final details = <String, Object?>{
      'level': _dealLevel,
      'mode': _mode.engineName,
      'solver_used': _solverUsed,
    };
    final difficulty = '${_mode.engineName}-$_dealLevel';
    if (won) {
      unawaited(_ladder.win(difficulty: difficulty, details: details));
    } else {
      unawaited(_ladder.fail(difficulty: difficulty, details: details));
    }
    final given = _given;
    if (given != null && !GamePreset.isPreset) {
      _shadow?.recordOutcome(
        given: given,
        outcome: assisted ? Outcome.assisted : (won ? Outcome.passed : Outcome.failed),
        eventId: _eventId,
      );
    }
  }

  /*
   * 🔴 ВВОД — ЖЕСТОМ ЦЕЛИКОМ: НАЖАЛ, ВЕДЁТ, ОТПУСТИЛ. Как мышь у автора.
   *
   * 📍 ПОВОД, 01.10.2026, релиз 2.56.1 на эмуляторе: «Колышки» не делали ни одного хода —
   * ни протяжкой, ни двумя касаниями. Здесь стоял `onTapDown` → `engine.tap`, то есть
   * «нажал и отпустил в одной точке». У Тэтхэма ход «Колышек», «Указателей», «Раскраски
   * карты» и «Распутай» — ТОЛЬКО протяжка (веб мерил: 0 тычков из 297/360/663), а у
   * «Мостов», «Клоцек», «Рельсов» и «Прямоугольников» протяжка — основной ход. Веб
   * отдаёт движку весь жест (LEFT_BUTTON → LEFT_DRAG → LEFT_RELEASE), и до 24.09 эти игры
   * на телефоне открывались в вебе; с перехватом всех 42 нативным экраном они встали.
   * Касание при этом — тот же жест без движения: нажатие и отпускание в одной точке,
   * ровно то, что раньше делал `engine.tap`.
   *
   * Второе действие (правая кнопка у автора) — переключателем под полем, как в вебе:
   * пока он включён, тот же жест уходит правой кнопкой. Мышь на настольной сборке
   * даёт правую кнопку сама.
   */
  int? _pointer;
  int _button = 0;
  ({int x, int y})? _last;

  /// Включено второе действие — жест уходит правой кнопкой.
  bool _second = false;

  /*
   * 🔴 ДВА ПАЛЬЦА — МАСШТАБ, ОДИН — ХОД (задача a504c68b, решение Дениса 08.10.2026).
   *
   * Касание пальцем уходит движку не сразу: нажатие придержано до первого сдвига дальше
   * [_holdSlop], до отпускания или до [_holdTime]. Если за это время лёг второй палец —
   * нажатие выбрасывается, и жест целиком становится щипком: движок не видит ничего, и
   * случайного хода под первым пальцем нет. Ход, который уже начался, второй палец не
   * прерывает — щипок посреди протяжки отменил бы её на полпути.
   * Мышь (настольная сборка) идёт как раньше, сразу: щипка у неё нет.
   */
  static const _holdTime = Duration(milliseconds: 120);
  static const _holdSlop = 3.0;
  final BoardZoom _zoom = BoardZoom();
  final Map<int, Offset> _touches = {};
  bool _pinching = false;
  ({int pointer, Offset at, Size box})? _held;
  GameTimer? _holdTimer;
  Size _boardBox = Size.zero;

  @override
  void dispose() {
    _holdTimer?.cancel();
    super.dispose();
  }

  void _down(PointerDownEvent e, Size box) {
    if (e.kind == PointerDeviceKind.mouse) return _press(e.pointer, e.localPosition, box, mouseButtons: e.buttons);
    _touches[e.pointer] = e.localPosition;
    if (_touches.length == 2 && _pointer == null) {
      _holdTimer?.cancel();
      _held = null;
      _pinching = true;
      final ps = _touches.values.toList();
      _zoom.pinchStart(ps[0], ps[1]);
      return;
    }
    if (_touches.length != 1 || _pinching) return;
    _held = (pointer: e.pointer, at: e.localPosition, box: box);
    _holdTimer?.cancel();
    _holdTimer = gameTimeout(_holdTime, _flushHeld);
  }

  /// Придержанное нажатие уходит движку — палец остался один.
  void _flushHeld() {
    final h = _held;
    if (h == null) return;
    _held = null;
    _holdTimer?.cancel();
    _press(h.pointer, h.at, h.box);
  }

  void _moved(PointerMoveEvent e, Size box) {
    if (_touches.containsKey(e.pointer)) _touches[e.pointer] = e.localPosition;
    if (_pinching) {
      if (_touches.length == 2) {
        final ps = _touches.values.toList();
        setState(() => _zoom.pinchUpdate(ps[0], ps[1], box));
      }
      return;
    }
    final h = _held;
    if (h != null && h.pointer == e.pointer) {
      if ((e.localPosition - h.at).distance < _holdSlop) return;
      _flushHeld();
    }
    _move(e.pointer, e.localPosition, box);
  }

  void _up(int pointer, Offset? at, Size box) {
    final wasTouch = _touches.remove(pointer) != null;
    if (_pinching) {
      if (_touches.isEmpty) _pinching = false;
      return;
    }
    if (wasTouch && _held?.pointer == pointer) {
      if (at == null) {
        // Жест отобран до того, как стал ходом: движку нечего отпускать.
        _held = null;
        _holdTimer?.cancel();
        return;
      }
      _flushHeld();
    }
    _release(at, pointer, box);
  }

  /// «Крупнее»: вдвое вокруг середины доски; увеличенная — обратно к целой доске.
  void _toggleZoom() {
    setState(() {
      if (_zoom.zoomed) {
        _zoom.reset();
      } else {
        _zoom.zoomAt(_boardBox.center(Offset.zero), 2, _boardBox);
      }
    });
  }

  /// Точка касания в коробке → точка холста движка, через масштаб вида.
  ({int x, int y}) _at(Offset local, Size box) => toEngine(_zoom.toBoard(local), box, _size);

  void _press(int pointer, Offset at, Size widgetSize, {int mouseButtons = 0}) {
    final engine = _engine;
    if (engine == null || _won || _pointer != null) return;
    _pointer = pointer;
    final right = _second || (mouseButtons & kSecondaryMouseButton) != 0;
    _button = right ? 3 : 0;
    final p = _at(at, widgetSize);
    _last = p;
    engine.pointer(p.x, p.y, _button);
    _refresh();
  }

  void _move(int pointer, Offset at, Size widgetSize) {
    final engine = _engine;
    if (engine == null || pointer != _pointer) return;
    final p = _at(at, widgetSize);
    // Кадр снимаем, только когда точка ДВИЖКА сменилась: событий касания десятки в
    // секунду, а движку нужен лишь новый пиксель его холста.
    if (p == _last) return;
    _last = p;
    engine.pointer(p.x, p.y, _button + 1);
    _refresh();
  }

  void _release(Offset? at, int pointer, Size widgetSize) {
    final engine = _engine;
    if (engine == null || pointer != _pointer) return;
    _pointer = null;
    final p = at == null ? _last : _at(at, widgetSize);
    if (p == null) return;
    engine.pointer(p.x, p.y, _button + 2);
    _refresh();
  }

  void _digit(int v) {
    final engine = _engine;
    if (engine == null || _won) return;
    engine.key('0'.codeUnitAt(0) + v);
    _refresh();
  }

  /// Стрелка курсора: 0 вверх · 1 вниз · 2 влево · 3 вправо.
  void _arrow(int side) {
    final engine = _engine;
    if (engine == null || _won) return;
    engine.cursor(side);
    _refresh();
  }

  /// Диагональ «Инерции»: '7' ↖ · '9' ↗ · '1' ↙ · '3' ↘ (цифровой блок, как у автора).
  void _diagonal(String digit) {
    final engine = _engine;
    if (engine == null || _won) return;
    engine.diagonal(digit);
    _refresh();
  }

  /// «Взять» под курсором — CURSOR_SELECT, второй выбор — CURSOR_SELECT2.
  void _pick({bool second = false}) {
    final engine = _engine;
    if (engine == null || _won) return;
    engine.select(second: second);
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
    _solverUsed = true;
    engine.solve();
    _refresh();
  }

  /// Клетка ступени на экране мельче [smallCellPt]: ширина доски на число столбцов.
  bool _smallCells(PuzzleStep step) {
    final cols = puzzleColumns(_mode.engineName, step.params);
    if (cols == null || cols <= 0) return true;
    return _boardBox.width > 0 && _boardBox.width / cols < smallCellPt;
  }

  @override
  Widget build(BuildContext context) {
    if (_failure != null) {
      return Scaffold(body: Center(child: Text(_failure!)));
    }
    if (_modeOrNull == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final step = _steps[(_ladder.level - 1).clamp(0, _steps.length - 1)];

    return GameShell(
      title: _mode.title,
      /*
       * 🔴 КНОПКА ЕСТЬ ТОЛЬКО ТАМ, ГДЕ РАЗБОР ДЕЙСТВИТЕЛЬНО ПОЛУЧИЛСЯ.
       *
       * Сначала условие стояло по флагу `game.can_solve` — и проба показала, что
       * флаг врёт в нашу сторону: у «Сапёра» он поднят (решатель нужен движку для
       * РАЗДАЧИ), а `psy_solve` с позиции игрока решения не даёт. Кнопка была бы
       * живой и не делала ничего.
       * Поэтому спрашиваем не флаг, а результат: шаги считаются один раз на раздачу.
       */
      onLesson: _lessonSteps.isEmpty ? null : _openLesson,
      // Правило игры — из словаря по ключу карточки режима. Нет ключа — нет и
      // кнопки: пустое окно справки хуже её отсутствия.
      onRules: _modeOrNull?.descKey == null
          ? null
          : () => showGameRules(context, title: _mode.title, ruleKey: _mode.descKey!),
      hud: [
        HudItem(label: L.t('puzzleHudLevel'), value: '${_ladder.level}/${_steps.length}', icon: Icons.trending_up),
        HudItem(label: L.t('puzzleHudBoard'), value: stepTitle(step), icon: Icons.grid_on),
      ],
      field: (context, height) {
        if (_failure != null) return Center(child: Text(_failure!));
        if (_engine == null || _frame.ops.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }
        return LayoutBuilder(
          builder: (context, c) {
            /*
             * 🔴 КОРОБКА ПО ФОРМЕ ДОСКИ, А НЕ КВАДРАТ (решение Дениса 25.09.2026).
             *
             * Здесь стояло `side = min(высота, ширина)` и `Size(side, side)`. Для
             * квадратных сеток — а их у Тэтхэма большинство — это ровно то, что
             * нужно, и после этой правки для них НИЧЕГО не меняется: у квадратного
             * холста обе стороны дают один и тот же множитель.
             *
             * 📍 ЗАМЕР 25.09.2026 на телефоне 390×844, «Снос групп» после
             * переворота лестницы (холст движка 190×350): коробка выходила
             * 382×382, доска в ней рисовалась 207×382 — по высоте впритык, а
             * 183 точки ширины из 390 оставались пустыми. Множитель брался как
             * `min(382/190, 382/350)`, то есть по ВЫСОТЕ КВАДРАТА, хотя высоты на
             * экране было больше, чем ширины.
             *
             * `PuzzlePainter` и `toEngine` и без того вписывают холст с
             * сохранением пропорций и центруют — поэтому квадратная коробка не
             * искажала доску, а просто отнимала у неё место. Теперь коробка
             * СОВПАДАЕТ с вписанным холстом, и пустых полей нет ни с одной
             * стороны.
             */
            final boxW = c.maxWidth - 8;
            final boxH = height - 8;
            final ew = _size.w, eh = _size.h;
            final Size size;
            if (boxW <= 0 || boxH <= 0) {
              size = Size.zero;
            } else if (ew <= 0 || eh <= 0) {
              // Холст ещё неизвестен — прежнее поведение, квадрат по меньшей стороне.
              final side = boxW < boxH ? boxW : boxH;
              size = Size(side, side);
            } else {
              final k = (boxW / ew) < (boxH / eh) ? boxW / ew : boxH / eh;
              size = Size(ew * k, eh * k);
            }
            if (size != _boardBox) {
              _boardBox = size;
              // Кнопка «Крупнее» под полем строится раньше коробки — перестроить с размером.
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) setState(() {});
              });
            }
            return Center(
              child: Listener(
                key: const Key('board'),
                behavior: HitTestBehavior.opaque,
                onPointerDown: (e) => _down(e, size),
                onPointerMove: (e) => _moved(e, size),
                onPointerUp: (e) => _up(e.pointer, e.localPosition, size),
                // Жест отобрали (системный жест) — отпускаем там, где был последний кадр,
                // чтобы движок не остался с «нажатой» кнопкой.
                onPointerCancel: (e) => _up(e.pointer, null, size),
                // Увеличенная доска режется по коробке: соседние кнопки она не накрывает.
                child: ClipRect(
                  child: SizedBox.fromSize(
                    size: size,
                    child: Transform(
                      key: const Key('board-zoom'),
                      transform: Matrix4.translationValues(_zoom.offset.dx, _zoom.offset.dy, 0)
                        ..scaleByDouble(_zoom.scale, _zoom.scale, 1.0, 1.0),
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
                  ),
                ),
              ),
            );
          },
        );
      },
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: L.t('btn_undo'), onPressed: _won ? null : _undo),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _deal),
        // «Крупнее» — где клетка мельче пальца (или доска уже увеличена). Щипок работает везде.
        if (_zoom.zoomed || _smallCells(step))
          AuxAction(
            key: const Key('puzzle-zoom'),
            icon: _zoom.zoomed ? Icons.zoom_out_map : Icons.zoom_in,
            label: L.t('sdkZoomCloser'),
            active: _zoom.zoomed,
            onPressed: _toggleZoom,
          ),
        // Второе действие — у 30 режимов из 42 (флажок, крестик, карандаш…). Подпись —
        // что кнопка делает В ЭТОЙ игре, ключ из карточки режима (как в вебе).
        if (_mode.secondKey != null)
          AuxAction(
            key: const Key('puzzle-second-action'),
            icon: Icons.swap_horiz,
            label: L.t(_mode.secondKey!),
            active: _second,
            onPressed: _won ? null : () => setState(() => _second = !_second),
          ),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('puzzleShowSolution'),
          tint: const Color(0xFFB45309),
          onPressed: _won ? null : _solve,
        ),
      ]),
      toolbar: _Toolbar(
        mode: _mode,
        params: step.params,
        won: _won,
        status: _status,
        onDigit: _digit,
        onArrow: _arrow,
        onDiagonal: _diagonal,
        onPick: _pick,
        onNext: () {
          _deal();
        },
      ),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _deal),
      ],
    );
  }
}

/// Сколько клавиш цифр у ступени: размер поля читается из её параметров («6dh» → 6,
/// «5x5de» → 5, «3x3db» → 9 клеток у Solo), у «Угадай код» — число цветов.
///
/// 🔴 ДВА ДЕФЕКТА, ИСПРАВЛЕННЫХ 30.09.2026 (задача f5034811, замер по исходнику):
/// · ряд клавиш считался по ПЕРВОЙ ступени лестницы на всех уровнях — у головоломок,
///   где поле растёт (Keen, Towers, Unequal, Filling), на верхних ступенях цифр не
///   хватало бы. Теперь параметры приходят от текущей ступени;
/// · у «Угадай код» параметры не «сторона поля», а `c6p4g10Bm`, и общий разбор
///   отдавал девять клавиш на шестицветный код — три лишние, мёртвые. Теперь цветов
///   столько, сколько у ступени (`c<N>`), как и в веб-версии (`names.ts`).
int puzzleKeyCount(PuzzleMode mode, String params) {
  final p = params;
  if (mode.engineName == 'Guess') {
    final c = RegExp(r'c(\d+)').firstMatch(p);
    return c == null ? 6 : int.parse(c.group(1)!).clamp(2, 10);
  }
  final m = RegExp(r'^(\d+)x(\d+)').firstMatch(p);
  if (mode.engineName == 'Solo' && m != null) {
    return int.parse(m.group(1)!) * int.parse(m.group(2)!);
  }
  if (mode.digitLabels.isNotEmpty) return mode.digitLabels.length;
  if (m != null) return int.parse(m.group(1)!);
  // ⚠️ БЕЗ «!» НА КОНЦЕ. Параметры ступени приходят и из меню движка, где первым
  // символом бывает буква. Восклицательный знак здесь уронил бы ряд клавиш прямо в
  // руках у игрока; девять — привычный ряд судоку и честное «не смог разобрать».
  final first = RegExp(r'^(\d+)').firstMatch(p);
  return first == null ? 9 : int.parse(first.group(1)!);
}

/// Липкий низ: ряд клавиш режима (у «Нежити» они подписаны чудовищами) и победа.
class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.mode,
    required this.params,
    required this.won,
    required this.status,
    required this.onDigit,
    required this.onArrow,
    required this.onDiagonal,
    required this.onPick,
    required this.onNext,
  });

  final PuzzleMode mode;

  /// Параметры ТЕКУЩЕЙ ступени — по ним считается ряд клавиш.
  final String params;
  final bool won;
  final String status;
  final void Function(int) onDigit;
  final void Function(int side) onArrow;
  final void Function(String digit) onDiagonal;
  final void Function({bool second}) onPick;
  final VoidCallback onNext;

  int get _keys => puzzleKeyCount(mode, params);

  /*
   * 🔴 СТРЕЛКИ И «ВЗЯТЬ» — НАД РЯДОМ КЛАВИШ, КАК В ВЕБЕ (puzzles.tsx: крестовина и команды выбора).
   * Замер 01.10.2026: в modes.json признаки лежали (arrows 16 режимов, eightWays 1, pick 12,
   * pickSecond 6), а нативный экран их не читал — «Куб» и «Инерция», где автор принимает
   * ТОЛЬКО стрелки, не играли вовсе; у «Распутай», «Колышек», «Карты» не было «Взять».
   */
  @override
  Widget build(BuildContext context) {
    final main = _main(context);
    if (won || (!mode.arrows && !mode.pick)) return main;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _CursorPad(mode: mode, onArrow: onArrow, onDiagonal: onDiagonal, onPick: onPick),
        main,
      ],
    );
  }

  Widget _main(BuildContext context) {
    if (won) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('next'),
          onPressed: onNext,
          icon: const Icon(Icons.arrow_forward),
          label: Text(L.t('puzzleNextLevel')),
        ),
      );
    }
    if (!mode.digits) {
      // Singles: ввод только тычками, ряд клавиш был бы обманом.
      // Там, где касание не делает ничего, — подсказка «тяни» (веб, `ТОЛЬКО_ПРОТЯЖКА`):
      // без неё доска выглядит сломанной — жмёшь, и ничего.
      final idle = mode.dragOnly ? L.t('puzzleDragHint') : L.t('puzzleTapHint');
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        child: Text(status.isEmpty ? idle : status,
            textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
      );
    }
    final labels = mode.digitLabels;
    return LayoutBuilder(
      builder: (context, c) {
        const gap = 6.0;
        final keys = _keys;
        final wide = labels.isNotEmpty;
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
                          labels.isNotEmpty && v <= labels.length ? labels[v - 1] : '$v',
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

/// Крестовина курсора и команды выбора под полем головоломки.
class _CursorPad extends StatelessWidget {
  const _CursorPad({
    required this.mode,
    required this.onArrow,
    required this.onDiagonal,
    required this.onPick,
  });

  final PuzzleMode mode;
  final void Function(int side) onArrow;
  final void Function(String digit) onDiagonal;
  final void Function({bool second}) onPick;

  static const _size = 44.0;

  Widget _btn(String key, IconData icon, VoidCallback onTap) => SizedBox(
        width: _size,
        height: _size,
        child: IconButton.filledTonal(
          key: Key(key),
          padding: EdgeInsets.zero,
          onPressed: onTap,
          icon: Icon(icon),
        ),
      );

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(width: 6, height: 6);
    final up = _btn('cursor-up', Icons.arrow_upward, () => onArrow(0));
    final down = _btn('cursor-down', Icons.arrow_downward, () => onArrow(1));
    final left = _btn('cursor-left', Icons.arrow_back, () => onArrow(2));
    final right = _btn('cursor-right', Icons.arrow_forward, () => onArrow(3));
    Widget? cross;
    if (mode.arrows && mode.eightWays) {
      // Восемь направлений сеткой 3×3: диагонали — по своим углам, середина пустая.
      Widget row(List<Widget> c) => Row(mainAxisSize: MainAxisSize.min, children: c);
      cross = Column(mainAxisSize: MainAxisSize.min, children: [
        row([_btn('cursor-up-left', Icons.north_west, () => onDiagonal('7')), gap, up, gap,
            _btn('cursor-up-right', Icons.north_east, () => onDiagonal('9'))]),
        gap,
        row([left, gap, const SizedBox(width: _size, height: _size), gap, right]),
        gap,
        row([_btn('cursor-down-left', Icons.south_west, () => onDiagonal('1')), gap, down, gap,
            _btn('cursor-down-right', Icons.south_east, () => onDiagonal('3'))]),
      ]);
    } else if (mode.arrows) {
      cross = Row(mainAxisSize: MainAxisSize.min, children: [left, gap, up, gap, down, gap, right]);
    }
    final secondLabel = mode.secondPickKey ?? mode.secondKey ?? 'puzzleSecondAction';
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 10,
        runSpacing: 6,
        children: [
          ?cross,
          if (mode.pick)
            FilledButton.tonal(
              key: const Key('cursor-select'),
              onPressed: () => onPick(),
              child: Text(L.t('puzzleSelect')),
            ),
          if (mode.pickSecond)
            OutlinedButton(
              key: const Key('cursor-select-second'),
              onPressed: () => onPick(second: true),
              child: Text(L.t(secondLabel)),
            ),
        ],
      ),
    );
  }
}
