import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/game_clock.dart';
import '../../shell/aux_action.dart';
import '../../shell/l10n.dart';
import 'keypad.dart';
import 'marks.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'generator/contract.dart';
import 'generator/engine.dart';
import 'generator/pool.dart';
import 'generator/shadow.dart';
import 'generator/store.dart';
import 'junior.dart';
import 'levels.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import 'lesson.dart';
import 'mode_board.dart';
import 'modes.dart';
import 'symbols.dart';
import 'variant_decor.dart';

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
  const SudokuScreen({super.key, required this.state, this.mode, this.junior = false});

  final SharedState state;

  /// Режим доски: `null` — обычная лестница на 92 ступени, иначе «Небоскрёбы» или
  /// «Неравенства» со своей мини-лестницей на 8 ступеней и своим счётчиком.
  /// В вебе это тот же экран с адресом `/games/sudoku?mode=towers`.
  final SideMode? mode;

  /// «Судоку для малышей»: доски 4×4 (`junior.dart`), своя мини-лестница и свой счётчик;
  /// обычная лестница на 92 ступени, пилот генератора и бой с боссом не трогаются.
  /// Значки по умолчанию — звери (пока игрок сам не выбрал другие).
  final bool junior;

  @override
  State<SudokuScreen> createState() => _SudokuScreenState();
}

/// Одна подпись на обе ветки раздачи: и лестницу, и режим. Второй такой же литерал
/// в коде — это лишняя строка в долге подписей и лишний ключ при переводе.
const _noBoards = 'Досок этого уровня нет в данных';

class _SudokuScreenState extends State<SudokuScreen> {
  static const errorLimit = 3;   // «3 ошибки. Сыграй заново» — правило веб-версии

  late LevelLadder _ladder;
  SudokuLevels? _levels;
  SudokuBoard? _board;

  /// Половина режима: доски, счётчик ступени и текущая доска.
  SideModes? _sideModes;
  SideProgress? _side;
  SideBoard? _sideBoard;

  /// Решение текущей доски — что бы её ни выдало, лестница или режим.
  List<List<int>>? get _solution => _sideBoard?.solution ?? _board?.solution;

  /// Сторона доски: у небоскрёбов 6, у остальных 9 (у первых ступеней лестницы тоже 6).
  int get _n => _sideBoard?.n ?? _board?.n ?? 9;

  /// ТЕНЕВОЙ ШАГ ГЕНЕРАТОРА (§10.2): он записывает, что выбрал бы, и учит рейтинг на
  /// исходах настоящих партий. Человеку при этом выдаётся ПРЕЖНЯЯ доска прописанной
  /// лестницы — путь генератора включается отдельным флагом и здесь ничего не решает.
  GeneratorShadow? _shadow;
  List<Template> _pool = const [];
  Template? _givenTemplate;
  late String _dealId;

  /// 🔴 ПИЛОТ ГЕНЕРАТОРА (§10 шаг 3) — ОТДЕЛЬНЫЙ ПУТЬ ЗА ФЛАГОМ, включается в меню паузы.
  /// Включён: доску выбирает рейтинг, номер уровня — счётчик побед пилота. Выключен:
  /// лестница на 92 ступени ровно как была — ни один её ключ пилот не пишет.
  GeneratorStore? _genStore;
  bool _pilot = false;
  Map<String, List<int>> _levelsOfTemplate = const {};
  Template? _pilotTemplate;

  /// Ступень лестницы, чья доска выдана под выбранный шаблон: от неё — подсказки и очки.
  int _pilotLevel = 1;
  int _pilotSeed = 0;
  int _pilotWins = 0;

  /// Сколько раз подряд нажато «ещё раз эту же»: номер попытки входит в зерно, поэтому
  /// доска другая, а трудность — та же (решение Дениса 23.09.2026).
  int _attempt = 0;
  Template? _repeatable;
  String _pilotEventId = '';

  List<List<int>> _grid = const [];
  List<List<bool>> _given = const [];
  /// 🔴 ШАГ ИСТОРИИ — ТРЁХ ВИДОВ, А НЕ ОДНОГО. Пока история знала только цифры,
  /// «Отменить» молча не возвращала ни пометку, ни цвет: человек ставит девять
  /// кандидатов, жмёт отмену — и ничего не происходит. Кнопка, которая работает
  /// через раз, хуже отсутствующей, потому что в неё верят.
  final List<_Step> _history = [];

  /// Карандашные пометки и раскраска — бухгалтерия игрока, по клетке на каждую.
  List<List<int>> _marks = const [];
  List<List<int>> _colors = const [];

  /// Карандаш и цвет — ВЗАИМОИСКЛЮЧАЮЩИЕ режимы, как в вебе: в цвете цифры не
  /// вводятся (касание клетки красит), в карандаше касание по-прежнему выбирает.
  bool _pencil = false;
  int? _paint;

  ({int r, int c})? _selected;
  int _errors = 0;
  int _hintsUsed = 0;

  /// 🔴 ЗНАЧКИ ВМЕСТО ЦИФР (задача f1e1ff9c): предпочтение игрока и набор значков
  /// выданной доски. Внутри игра живёт цифрами — значок меняет только то, что видно.
  SkinChoice _choice = const SkinChoice(SudokuSkin.digits);
  SudokuSymbols _symbols = SudokuSymbols.digits(9);
  int _dealSeed = 1;

  String get _skinKey => '${SharedState.prefix}sudoku_skin_${widget.state.activeProfile}';

  /// Значки для доски лестницы или пилота; у режимов («Небоскрёбы», «Неравенства»)
  /// цифры — высоты и неравенства без чисел не читаются.
  void _applySymbols(SudokuBoard? board, int seed) {
    _dealSeed = seed;
    _symbols = board == null || widget.mode != null
        ? SudokuSymbols.digits(board?.n ?? 9)
        : symbolsFor(
            skin: _choice.skin,
            style: _choice.style,
            variant: board.variant,
            solution: board.solution,
            language: widget.state.language,
            seed: seed,
          );
  }

  /// Что реально видно на доске — для отчёта партии (буквы на термометрах не ставятся,
  /// поэтому выбор игрока и показанное могут расходиться).
  String? get _skinShown => _symbols.images != null
      ? (_symbols.isDigits ? 'drawn:${_choice.style}' : SudokuSkin.animals.name)
      : _symbols.isDigits
          ? null
          : SudokuSkin.letters.name;

  /// Купленные в магазине наборы — общая память с вебом (frontend/src/services/cosmetics.ts).
  List<String> get _unlocked {
    final raw = widget.state.get('${SharedState.prefix}cosmetics_unlocked_${widget.state.activeProfile}');
    if (raw == null || raw.isEmpty) return const [];
    try {
      return (jsonDecode(raw) as List).cast<String>();
    } catch (_) {
      return const [];
    }
  }

  /// Название набора — литералами: ключ, собранный из переменной, в словарь сборки не
  /// попадает, и экран показал бы сам ключ.
  static String _styleName(String st) => switch (st) {
        'rainbow' => L.t('cosName_digits_rainbow'),
        'pastel' => L.t('cosName_digits_pastel'),
        'neon' => L.t('cosName_digits_neon'),
        'elegant' => L.t('cosName_digits_elegant'),
        _ => L.t('digitsCandy'),
      };

  /// «Стиль цифр»: обычные, буквы (только где положены), пять рисованных наборов веба.
  Future<void> _pickSkin() async {
    final board = _board;
    final profile = widget.state.activeProfile, unlocked = _unlocked;
    final picked = await showModalBottomSheet<SkinChoice>(
      context: context,
      showDragHandle: true,
      // Лист растёт по содержимому: по умолчанию он режется на 9/16 экрана, и последние
      // наборы уходили за край — выбор, который надо искать прокруткой (замер пробой 30.09).
      isScrollControlled: true,
      builder: (ctx) {
        Widget option(Key key, SkinChoice c, Widget leading, String title, {bool enabled = true}) {
          final on = c.name == _choice.name;
          return ListTile(
            key: key,
            leading: leading,
            title: Text(title),
            enabled: enabled,
            trailing: on ? const Icon(Icons.check) : (enabled ? null : const Icon(Icons.lock_outline)),
            onTap: enabled ? () => Navigator.of(ctx).pop(c) : null,
          );
        }

        return SafeArea(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                option(const Key('skin-digits'), const SkinChoice(SudokuSkin.digits),
                    const Icon(Icons.pin_outlined), L.t('digitsPlain')),
                if (board != null && skinApplies(board.variant))
                  option(const Key('skin-letters'), const SkinChoice(SudokuSkin.letters),
                      const Icon(Icons.abc), L.t('sudokuSkinLetters')),
                if (board != null && skinApplies(board.variant))
                  option(const Key('skin-animals'), const SkinChoice(SudokuSkin.animals),
                      Image.asset(animalImage(0), width: 32, height: 32), L.t('sudokuSkinAnimals')),
                for (final st in digitStyles)
                  option(
                    Key('skin-drawn-$st'),
                    SkinChoice(SudokuSkin.drawn, st),
                    Image.asset(digitImage(st, 5), width: 32, height: 32),
                    _styleName(st),
                    enabled: styleOwned(st, profile, unlocked),
                  ),
              ],
            ),
          ),
        );
      },
    );
    if (picked == null || !mounted) return;
    widget.state.set(_skinKey, picked.name);
    setState(() {
      _choice = picked;
      _applySymbols(_board, _dealSeed);
    });
  }

  /// Переделки — как у веба: в клетке стояла цифра, и её сменили или стёрли.
  /// Веб пишет это число в каждую победу (`backtrack_count`) — «решал неуверенно».
  int _backtracks = 0;

  /// Когда раздана доска — от этого считается время партии в отчёте.
  /// Начало партии по ИГРОВЫМ часам (мс): пауза и разбор поверх игры время партии не
  /// съедают (гейт game_clock_discipline_test, #74).
  int _startedAt = gameNow();

  int get _elapsed => (gameNow() - _startedAt) ~/ 1000;
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
    await WordokuWords.load();
    // Лестница нужна и в режиме: потолок подсказок берётся по номеру ступени — ровно
    // так же, как в веб-половине (там в режиме `level` держит номер ступени).
    final modes = widget.mode == null ? null : await SideModes.load();
    if (!mounted) return;
    setState(() {
      _levels = levels;
      final savedSkin = widget.state.get(_skinKey);
      _choice = widget.junior && savedSkin == null
          ? const SkinChoice(SudokuSkin.animals)
          : SkinChoice.parse(savedSkin);
      _pool = buildPool(levels);
      final store = GeneratorStore(widget.state);
      _genStore = store;
      _shadow = GeneratorShadow(store);
      _levelsOfTemplate = levelsByTemplate(levels);
      // Флаг действует только на лестницу: у «Небоскрёбов» и «Неравенств» своя.
      _pilot = widget.mode == null && !widget.junior && store.enabled;
      if (_pilot) _pilotWins = store.load().adaptiveWins;
      _sideModes = modes;
      if (widget.mode != null) _side = SideProgress(widget.state, widget.mode!);
      if (widget.junior) _junior = JuniorProgress(widget.state);
    });
    _deal();
  }

  /// Ступень малышей; `null` — обычная игра.
  JuniorProgress? _junior;

  /// Раздача малышей: доска 4×4 своей ступени, значки — как у лестницы.
  void _dealJunior() {
    final junior = _junior;
    if (junior == null) return;
    final seed = DateTime.now().millisecondsSinceEpoch; // wall-clock: зерно раздачи
    final board = juniorBoard(junior.step, seed);
    setState(() {
      _board = board;
      _applySymbols(board, seed);
      _failure = null;
      _grid = [for (final row in board.puzzle) [...row]];
      _given = [for (final row in board.puzzle) [for (final v in row) v != 0]];
      _history.clear();
      _resetNotes(board.n);
      _selected = null;
      _errors = 0;
      _startedAt = gameNow();
      _hintsUsed = 0;
      _backtracks = 0;
      _won = false;
      _lost = false;
    });
  }

  /// Победа малышей: отчёт с режимом и ступенью, следующая ступень — свой счётчик.
  void _juniorWin() {
    final junior = _junior;
    if (junior == null) return;
    final step = junior.step;
    unawaited(SessionReport.send(
      gameType: 'sudoku',
      score: _score(step),
      timeSeconds: _elapsed,
      mode: 'junior-$step',
      errors: _errors,
      details: {
        'errors': _errors,
        'completed': true,
        'hint_uses': _hintsUsed,
        'backtrack_count': _backtracks,
        'level': step,
        'variant': 'junior',
        if (_skinShown != null) 'skin': _skinShown,
      },
    ));
    junior.win();
  }

  void _deal() {
    if (widget.junior) {
      _dealJunior();
      return;
    }
    final mode = widget.mode;
    if (mode != null) {
      final modes = _sideModes, side = _side;
      if (modes == null || side == null) return;
      final board = modes.boardFor(mode, side.step, seed: DateTime.now().millisecondsSinceEpoch); // wall-clock: зерно раздачи
      setState(() {
        _sideBoard = board;
        _failure = board == null ? _noBoards : null;
        _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
        _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
        _history.clear();
        _resetNotes(board?.n ?? 0);
        _selected = null;
        _errors = 0;
        _startedAt = gameNow();
        _hintsUsed = 0;
        _backtracks = 0;
        _won = false;
        _lost = false;
      });
      return;   // теневой шаг генератора живёт на лестнице, а не в режимах
    }
    if (_pilot) {
      _dealPilot();
      return;
    }
    final levels = _levels;
    if (levels == null) return;
    final seed = DateTime.now().millisecondsSinceEpoch; // wall-clock: зерно раздачи
    final board = levels.boardFor(_ladder.level, seed: seed);
    setState(() {
      _board = board;
      _applySymbols(board, seed);
      _failure = board == null ? _noBoards : null;
      _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
      _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
      _history.clear();
      _resetNotes(board?.n ?? 0);
      _selected = null;
      _errors = 0;
      _startedAt = gameNow();
      _hintsUsed = 0;
      _backtracks = 0;
      _won = false;
      _lost = false;
    });
    _recordDeal(board);
  }

  /// Записать теневой выбор: какой шаблон выдала лестница и что предложил бы генератор.
  void _recordDeal(SudokuBoard? board) {
    final shadow = _shadow;
    if (shadow == null || board == null) return;
    _dealId = 'lv${_ladder.level}-${DateTime.now().millisecondsSinceEpoch}'; // wall-clock: id партии
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
    // 🔴 После первого включения пилота его рейтинг и счёт побед — только его партии.
    // Иначе выключил пилот, прошёл три ступени лестницы — и номер пилота вырос на три
    // (§4.3: «иначе победам припишется чужой счёт»). Журнал выбора тень ведёт дальше.
    if (_genStore?.pilotStarted ?? false) return;
    shadow.recordOutcome(
      given: given,
      outcome: outcome,
      eventId: _dealId,
      errors: _errors,
      hints: _hintsUsed,
    );
  }

  /// Раздача пилота: шаблон выбирает рейтинг, доску даёт ступень той же трудности.
  ///
  /// `repeat` — кнопка «ещё раз эту же»: ТОТ ЖЕ шаблон, а не выбор по его рейтингу
  /// (почему — `lastTemplate` в engine.dart), и доска по возможности не та же самая.
  /// ⚠️ ЗАВИСАТЬ НЕЛЬЗЯ (§8.5): нет шаблона или доски — берётся доска текущей ступени
  /// лестницы, проверенная; перебор досок ограничен восемью попытками.
  void _dealPilot({bool repeat = false}) {
    final levels = _levels, store = _genStore;
    if (levels == null || store == null) return;
    final s = store.load();
    var t = repeat ? lastTemplate(s, _pool) : null;
    t ??= pickNext(s, _pool, Leniency.normal);
    _attempt = repeat ? _attempt + 1 : 0;
    final seed = DateTime.now().millisecondsSinceEpoch + _attempt; // wall-clock: зерно раздачи
    final dealt = t == null
        ? null
        : boardForTemplate(levels, _levelsOfTemplate, t, seed, avoid: repeat ? _board : null);
    var board = dealt?.board;
    var source = dealt?.level ?? _ladder.level;
    if (board == null) {
      source = _ladder.level;
      board = levels.boardFor(source, seed: seed);
      t = templateForLevel(levels, source);
    }
    setState(() {
      _board = board;
      _applySymbols(board, seed);
      _pilotTemplate = t;
      _pilotLevel = source;
      _pilotSeed = seed;
      _pilotWins = s.adaptiveWins;
      _repeatable = null;
      // Микросекунды, а не зерно: две раздачи в одну миллисекунду дали бы один id,
      // и второй исход движок отбросил бы как повтор (идемпотентность по eventId).
      _pilotEventId = 'gen-${DateTime.now().microsecondsSinceEpoch}'; // wall-clock: id партии
      _failure = board == null ? _noBoards : null;
      _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
      _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
      _history.clear();
      _resetNotes(board?.n ?? 0);
      _selected = null;
      _errors = 0;
      _startedAt = gameNow();
      _hintsUsed = 0;
      _backtracks = 0;
      _won = false;
      _lost = false;
    });
  }

  /// Исход партии пилота: в рейтинг и счётчик побед пилота, в статистику — с пометкой
  /// пути. ⚠️ Лестницу НЕ трогает: адаптивная партия не открывает прописанную ступень
  /// (§8.1, приёмка §9.8), и восстановление уровня не должно принять её за ступень —
  /// поэтому режим `adaptive`, а не `level-N`, и в подробностях нет `level`.
  void _pilotFinish(Outcome outcome) {
    final store = _genStore, t = _pilotTemplate;
    if (store == null || t == null) return;
    final next = applyOutcome(
      store.load(),
      OutcomeEvent(
        eventId: _pilotEventId,
        task: TaskId(
          gameId: 'sudoku',
          templateId: t.id,
          difficultyBand: t.band,
          generatorVersion: generatorAlgorithmVersion,
          seed: '$_pilotSeed',
        ),
        outcome: outcome,
        errors: _errors,
        hints: _hintsUsed,
        seconds: _elapsed,
        at: DateTime.now(), // wall-clock: отметка события — от неё считается перерыв в игре
      ),
      template: t,
    );
    store.save(next);
    _pilotWins = next.adaptiveWins;
    _repeatable = outcome == Outcome.failed ? lastTemplate(next, _pool) : null;
    final won = outcome != Outcome.failed;
    unawaited(SessionReport.send(
      gameType: 'sudoku',
      score: won ? _score(_pilotLevel) : 0,
      timeSeconds: _elapsed,
      difficulty: _difficultyFor(_pilotLevel),
      mode: 'adaptive',
      errors: _errors,
      details: {
        'errors': _errors,
        'completed': won,
        if (!won) 'failed_out': true,
        'hint_uses': _hintsUsed,
        'backtrack_count': _backtracks,
        'progression_kind': 'adaptive',
        // Снимок состояния после партии (§8.7): где жить рейтингу — на телефоне или ещё
        // на сервере — открытый вопрос проекта (§5, п.2), но с этими полями сервер уже
        // держит всё, чтобы восстановить счёт пилота после переустановки: event_id —
        // защита от двойного применения, рейтинг и неуверенность — канонический снимок.
        'event_id': _pilotEventId,
        'skill_rating': (next.skillRating * 10).round() / 10,
        'rating_uncertainty': (next.ratingUncertainty * 10).round() / 10,
        'adaptive_wins': next.adaptiveWins,
        'template_id': t.id,
        'difficulty_band': t.band,
        'generator_version': generatorAlgorithmVersion,
        'seed': _pilotSeed,
        'source_level': _pilotLevel,
        'variant': _board?.variant ?? 'none',
        'repeat': _attempt > 0,
        if (_skinShown != null) 'skin': _skinShown,
      },
    ));
  }

  /// Включить или выключить пилот. Первое включение — старт от трудности ТЕКУЩЕЙ
  /// ступени, номер с нуля (решение Дениса 23.09.2026, В3); повторное — продолжение.
  void _togglePilot() {
    final store = _genStore, levels = _levels;
    if (store == null || levels == null || widget.mode != null) return;
    final on = !_pilot;
    if (on && !store.pilotStarted) {
      store.save(startFromLadder(levels, _ladder.level));
      store.markPilotStarted();
    }
    store.setEnabled(on);
    setState(() => _pilot = on);
    _deal();
  }

  void _select(int r, int c) {
    if (_won || _lost) return;
    final paint = _paint;
    if (paint != null) {
      _paintCell(r, c, paint);
      return;
    }
    setState(() => _selected = (r: r, c: c));
  }

  /// Пустые пометки и раскраска под доску стороны [n].
  ///
  /// ⚠️ РАЗМЕР БЕРЁТСЯ У ДОСКИ, А НЕ У ДЕВЯТКИ: на лестнице есть 6×6, и матрица 9×9
  /// под ними молча ловила бы обращение за край при раскраске правого столбца.
  void _resetNotes(int n) {
    _marks = n == 0 ? const [] : emptyPencilMarks(n);
    _colors = n == 0 ? const [] : emptyCellColors(n);
    _pencil = false;
    _paint = null;
  }

  /// Покрасить клетку. Повтор того же цвета снимает метку.
  void _paintCell(int r, int c, int color) {
    if (r >= _colors.length || c >= _colors[r].length) return;
    setState(() {
      final was = _colors[r][c];
      _history.add(_Step(_StepKind.color, r, c, was));
      _colors[r][c] = toggleCellColor(was, color);
    });
  }

  /// Нажатие клавиши: в карандаше — пометка, иначе цифра. Решает общий разбор,
  /// тот же, что у веб-половины: три игры раздела обязаны вести себя одинаково.
  void _onKey(int value) {
    final sel = _selected;
    final route = routeDigitPress(
      pencil: _pencil,
      hasSelection: sel != null,
      given: sel != null && _given[sel.r][sel.c],
      blocked: _won || _lost,
    );
    switch (route) {
      case PencilRoute.ignore:
        return;
      case PencilRoute.pencil:
        _mark(sel!.r, sel.c, value);
      case PencilRoute.digit:
        _place(value);
    }
  }

  /// Пометка карандашом. Ластик (0) чистит клетку целиком — одно движение вместо девяти.
  void _mark(int r, int c, int digit) {
    if (r >= _marks.length || c >= _marks[r].length) return;
    setState(() {
      final was = _marks[r][c];
      _history.add(_Step(_StepKind.mark, r, c, was));
      _marks[r][c] = pencilInput(was, digit);
    });
  }

  /// Поставить цифру. Ошибкой считается расхождение с решением — так же, как в вебе:
  /// доска там уже проверена на единственность, поэтому «не по решению» и есть ошибка.
  void _place(int value) {
    final solution = _solution;
    final sel = _selected;
    if (solution == null || sel == null || _won || _lost) return;
    if (_given[sel.r][sel.c]) return;   // подсказку задания не трогаем

    setState(() {
      final was = _grid[sel.r][sel.c];
      if (was != 0 && was != value) _backtracks += 1;
      _history.add(_Step(_StepKind.digit, sel.r, sel.c, was));
      _grid[sel.r][sel.c] = value;
      if (value != 0 && solution[sel.r][sel.c] != value) {
        _errors += 1;
        if (_errors >= errorLimit) {
          _lost = true;
          if (_pilot) {
            _pilotFinish(Outcome.failed);
          } else {
            _recordOutcome(Outcome.failed);
            _reportLoss();
          }
        }
        return;
      }
      _checkWin();
    });
  }

  void _erase() => _onKey(0);

  void _undo() {
    if (_history.isEmpty || _won || _lost) return;
    setState(() {
      final last = _history.removeLast();
      switch (last.kind) {
        case _StepKind.digit:
          _grid[last.r][last.c] = last.was;
        case _StepKind.mark:
          _marks[last.r][last.c] = last.was;
        case _StepKind.color:
          _colors[last.r][last.c] = last.was;
      }
    });
  }

  /// Подсказка: открывает выбранную клетку по решению. Число подсказок на уровень
  /// задаёт лестница (`hintMax`), как в вебе.
  void _hint() {
    final solution = _solution;
    final sel = _selected;
    if (solution == null || sel == null || _won || _lost) return;
    if (_hintsUsed >= _hintMax) return;
    setState(() {
      // ⚠️ ПОДСКАЗКА В ИСТОРИЮ НЕ ПИШЕТСЯ — так в веб-половине (handleHint,
      // app/games/sudoku.tsx:1433: истории не касается вовсе), и это осмысленно:
      // отменить подсказку значит вернуть клетку, не вернув потраченную подсказку.
      // 🔴 Моя первая редакция шаг писала, и писала НЕВЕРНО — клала в «было» саму
      // разгадку, поэтому отмена ставила ту же цифру заново и выглядела сломанной.
      _grid[sel.r][sel.c] = solution[sel.r][sel.c];
      _hintsUsed += 1;
      _checkWin();
    });
  }

  /// Карандаш и цвет ВЫКЛЮЧАЮТ ДРУГ ДРУГА. Иначе в цвете нажатие цифры уходило бы
  /// в пометки, а касание клетки красило — два разных ответа на одно действие.
  void _togglePencil() => setState(() {
        _pencil = !_pencil;
        if (_pencil) _paint = null;
      });

  /// Включение цвета выбирает первый цвет палитры: режим без выбранного цвета —
  /// это режим, в котором касание клетки ничего не делает.
  void _togglePaint() => setState(() {
        _paint = _paint == null ? 0 : null;
        if (_paint != null) _pencil = false;
      });

  /// Потолок подсказок берётся по номеру ступени — как в веб-половине.
  int get _hintMax {
    final levels = _levels;
    if (levels == null) return 0;
    final level = widget.mode != null ? (_side?.step ?? 1) : (_pilot ? _pilotLevel : _ladder.level);
    return levels.config(level).hintMax;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ОТЧЁТ ПАРТИИ — задача 24cecc5c.
  //
  // 🔴 ПАРТИЯ, КОТОРАЯ НЕ ДОШЛА ДО ОТЧЁТА, ДЛЯ СТАТИСТИКИ И ЗАРЯДКИ НЕ СУЩЕСТВУЕТ.
  // Первая редакция экрана отправляла отчёт только через лестницу — и только на
  // победе в обычных уровнях. Проигрыш и победа в «Небоскрёбах»/«Неравенствах» не
  // доходили никуда: в статистике их нет, шаг зарядки на них не засчитывался.
  //
  // Форма отчёта — ТА ЖЕ, что пишет веб (app/games/sudoku.tsx, saveSession на победе
  // и на проигрыше): game_type 'sudoku', режим `level-N[-вариант]` или `towers-N`,
  // очки по той же формуле. Разойдутся — партия ляжет в статистику под другим именем.
  // ─────────────────────────────────────────────────────────────────────────

  /// Имя режима партии в отчёте: `level-12` или `level-12-thermo`, как в вебе.
  String _levelMode(int level) {
    final v = _board?.variant ?? 'none';
    return v == 'none' ? 'level-$level' : 'level-$level-$v';
  }

  /// Полоса трудности — та же разбивка, что у веба.
  String _difficultyFor(int level) => level <= 4 ? 'easy' : level <= 9 ? 'medium' : 'hard';

  /// Очки — формула веба: база растёт со ступенью, ошибки, время и подсказки её режут.
  int _score(int level) =>
      math.max(0, (1500 + level * 150 - _errors * 50 - _elapsed * 2 - _hintsUsed * 50).round());

  /// ⚠️ ПРОИГРЫШ ИДЁТ МИМО ЛЕСТНИЦЫ, И ЭТО НАМЕРЕННО. `LevelLadder.fail` после трёх
  /// провалов подряд опускает уровень, а веб-судоку уровень за проигрыши НЕ опускает
  /// (замер: в app/games/sudoku.tsx и sudoku-roads.ts нет ни счёта провалов, ни
  /// понижения). Пошли проигрыш через лестницу — нативная половина начала бы ронять
  /// человеку уровень, которого веб не трогал.
  void _reportLoss() {
    final mode = widget.mode;
    final level = mode == null ? _ladder.level : (_side?.step ?? 1);
    unawaited(SessionReport.send(
      gameType: 'sudoku',
      score: 0,
      timeSeconds: _elapsed,
      difficulty: mode == null ? _difficultyFor(level) : null,
      mode: mode == null ? _levelMode(level) : '${sideModeName(mode)}-$level',
      errors: _errors,
      details: {
        'errors': _errors,
        'completed': false,
        'failed_out': true,
        'level': level,
        'variant': mode == null ? (_board?.variant ?? 'none') : sideModeName(mode),
        if (mode == null) 'road': 'normal',
        if (_skinShown != null) 'skin': _skinShown,
      },
    ));
  }

  /// Победа в режиме — своя мини-лестница, но отчёт обязан уйти так же, как у уровней.
  void _reportModeWin(int step) {
    final mode = widget.mode!;
    unawaited(SessionReport.send(
      gameType: 'sudoku',
      score: _score(step),
      timeSeconds: _elapsed,
      mode: '${sideModeName(mode)}-$step',
      errors: _errors,
      details: {
        'errors': _errors,
        'completed': true,
        'hint_uses': _hintsUsed,
        'backtrack_count': _backtracks,
        'level': step,
        'variant': sideModeName(mode),
      },
    ));
  }

  void _checkWin() {
    final solution = _solution;
    if (solution == null) return;
    for (var r = 0; r < _n; r++) {
      for (var c = 0; c < _n; c++) {
        if (_grid[r][c] != solution[r][c]) return;
      }
    }
    _won = true;
    if (widget.mode != null) {
      _reportModeWin(_side?.step ?? 1);   // шаг — ДО прибавки, как в вебе
      _side?.win();   // ступень режима — свой счётчик, лестница на 92 ступени не трогается
      return;
    }
    if (widget.junior) {
      _juniorWin();
      return;
    }
    // Подсказками доигранная партия рейтинг не повышает — это правило движка, не экрана.
    if (_pilot) {
      _pilotFinish(_hintsUsed > 0 ? Outcome.assisted : Outcome.passed);
      return;
    }
    _recordOutcome(_hintsUsed > 0 ? Outcome.assisted : Outcome.passed);
    final level = _ladder.level;
    // Трудность и подробности — как у веба (app/games/sudoku.tsx, saveSession победы).
    // До 30.09 лестница умела слать только номер: трудностью уходило «54», а не «hard»,
    // и без дороги — история сравнила бы уровень 12 лёгкой и тяжёлой дорог между собой.
    unawaited(_ladder.win(
      score: _score(level),
      timeSeconds: _elapsed,
      errors: _errors,
      mode: _levelMode(level),
      difficulty: _difficultyFor(level),
      details: {
        'errors': _errors,
        'completed': true,
        'hint_uses': _hintsUsed,
        'backtrack_count': _backtracks,
        'level': level,
        'variant': _board?.variant ?? 'none',
        'road': 'normal',
        if (_skinShown != null) 'skin': _skinShown,
      },
    ));
  }

  /// 🔴 РАЗБОР СУДОКУ: ПОЧЕМУ ЭТА ЦИФРА, А НЕ «ВОТ ОТВЕТ».
  ///
  /// Шаги считает `sudokuLessonSteps`; экран отвечает за два: собрать текст приёма
  /// из своего словаря (у приёмов подстановки — ключом их не передать) и нарисовать
  /// доску СВОИМ же виджетом, чтобы разбор выглядел как партия.
  ///
  /// ⚠️ Разбор идёт от НЫНЕШНЕЙ доски, а не от начальной: человек жмёт кнопку,
  /// когда застрял, и объяснять ему первые десять ходов, которые он уже сделал,
  /// значит потерять его на первом же шаге.
  String _teachText(String key, Map<String, String> args) {
    var out = switch (key) {
      'teachSudokuNaked' => L.t('teachSudokuNaked'),
      'teachSudokuHiddenRow' => L.t('teachSudokuHiddenRow'),
      'teachSudokuHiddenCol' => L.t('teachSudokuHiddenCol'),
      'teachSudokuHiddenBox' => L.t('teachSudokuHiddenBox'),
      _ => L.t('teachSudokuPlain'),
    };
    for (final e in args.entries) {
      // Цифра в тексте разбора — тем же значком, что на доске: «цифре Л», а не «цифре 5»,
      // которой человек на доске не видит.
      final v = e.key == 'd' ? _symbols.glyph(int.tryParse(e.value) ?? 0) : e.value;
      out = out.replaceAll('{${e.key}}', v.isEmpty ? e.value : v);
    }
    return out;
  }

  /// Заголовок один на экран и на разбор: вторая строка стала бы вторым долгом
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => widget.mode == null ? 'Судоку' : L.t('teachTitle');

  List<LessonStep> _lessonSteps() {
    final solution = _solution;
    if (solution == null || _grid.isEmpty) return const [];
    final board = _board;
    final side = _sideBoard;
    return sudokuLessonSteps(
      say: _teachText,
      grid: _grid,
      solution: solution,
      n: _n,
      br: side?.br ?? board?.br ?? 3,
      bc: side?.bc ?? board?.bc ?? 3,
    );
  }

  Future<void> _openLesson() async {
    final steps = _lessonSteps();
    if (steps.isEmpty) return;
    LessonUsed.mark();
    final board = _board;
    final side = _sideBoard;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: _title,
        steps: steps,
        board: (context, sideLen, shown) {
          final i = shown.clamp(0, steps.length - 1);
          final m = steps[i].payload as SudokuMove;
          final marks = [for (var r = 0; r < _n; r += 1) List<int>.filled(_n, 0)];
          final colors = [for (var r = 0; r < _n; r += 1) List<int>.filled(_n, 0)];
          if (widget.mode != null && side != null) {
            return ModeBoard(
              board: side,
              mode: widget.mode!,
              grid: m.grid,
              given: _given,
              marks: marks,
              colors: colors,
              selected: (r: m.r, c: m.c),
              height: sideLen,
              onTap: (_, _) {},
            );
          }
          return SudokuBoardView(
            board: board!,
            grid: m.grid,
            given: _given,
            marks: marks,
            colors: colors,
            selected: (r: m.r, c: m.c),
            height: sideLen,
            onTap: (_, _) {},
            symbols: _symbols,
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final levels = _levels;
    final board = _board;
    final cfg = levels?.config(_ladder.level);
    // Правило доски: у режима — его имя, у лестницы — имя варианта ступени, у пилота —
    // вариант выданной доски (ступень лестницы здесь ни при чём).
    final variant = _pilot ? _board?.variant : cfg?.variant;
    final ruleLabel = widget.mode != null
        ? variantTitle(sideModeName(widget.mode!))
        : (variant != null && variant != 'none' ? variantTitle(variant) : null);

    return GameShell(
      title: _title,
      onLesson: _lessonSteps().isEmpty ? null : _openLesson,
      hud: [
        // ⚠️ Подпись одна и та же на оба случая: новая строка в коде — это новый долг
        // храповика подписей, а «Уровень» уже переведён на двенадцать языков.
        HudItem(
          label: 'Уровень',
          // У пилота номер — счётчик побед: только растёт, конца нет (решение 18.09).
          value: widget.junior
              ? '${_junior?.step ?? 1}/$juniorSteps'
              : widget.mode != null
                  ? '${_side?.step ?? 1}/$sideSteps'
                  : _pilot ? '${_pilotWins + 1}' : '${_ladder.level}',
          icon: _pilot ? Icons.auto_awesome : Icons.trending_up,
        ),
        HudItem(label: 'Ошибки', value: '$_errors/$errorLimit', icon: Icons.close),
        if (ruleLabel != null) HudItem(label: 'Правило', value: ruleLabel, icon: Icons.rule),
      ],
      field: (context, height) {
        final ready = widget.mode == null ? levels != null : _sideModes != null;
        if (!ready) return const Center(child: CircularProgressIndicator());
        final side = _sideBoard;
        if (widget.mode == null ? board == null : side == null) {
          return Center(child: Text(_failure ?? 'Доска не собралась'));
        }
        if (widget.mode != null) {
          return ModeBoard(
            board: side!,
            mode: widget.mode!,
            grid: _grid,
            given: _given,
            marks: _marks,
            colors: _colors,
            selected: _selected,
            height: height,
            onTap: _select,
          );
        }
        return SudokuBoardView(
          board: board!,
          grid: _grid,
          given: _given,
          marks: _marks,
          colors: _colors,
          selected: _selected,
          height: height,
          onTap: _select,
          symbols: _symbols,
        );
      },
      // 🔴 ЧЕТЫРЕ ЗНАЧКА, КАК В ВЕБЕ, А НЕ ТРИ. Первая редакция нативного экрана
      // увезла к людям только отмену, «заново» и подсказку — без карандаша и цвета
      // (кадр Дениса 24.09: «где интерфейс прежний, с которым мы так долго возились»,
      // «кнопки для заметок, закраски и прочего»). Порядок и смысл — веб-половины
      // (app/games/sudoku.tsx:2311): отмена с глубиной, подсказка с остатком,
      // карандаш и цвет — залитыми, когда включены.
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.undo,
          label: 'Отменить',
          count: _history.isEmpty ? null : _history.length,
          onPressed: _history.isEmpty || _won || _lost ? null : _undo,
        ),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: 'Подсказка',
          tint: const Color(0xFFB45309),
          count: _hintMax > 0 ? (_hintMax - _hintsUsed).clamp(0, _hintMax) : null,
          onPressed: (_hintsUsed < _hintMax && _selected != null && !_won && !_lost)
              ? _hint
              : null,
        ),
        AuxAction(
          key: const Key('pencil'),
          icon: _pencil ? Icons.edit : Icons.edit_outlined,
          label: L.t('sudokuPencilMode'),
          active: _pencil,
          onPressed: (_won || _lost) ? null : _togglePencil,
        ),
        AuxAction(
          key: const Key('paint'),
          icon: _paint != null ? Icons.palette : Icons.palette_outlined,
          label: L.t('sudokuColorMode'),
          active: _paint != null,
          onPressed: (_won || _lost) ? null : _togglePaint,
        ),
        AuxAction(icon: Icons.refresh, label: 'Заново', onPressed: _deal),
      ]),
      toolbar: (board == null && _sideBoard == null)
          ? null
          : _Toolbar(
              n: _n,
              won: _won,
              lost: _lost,
              onDigit: _onKey,
              onErase: _erase,
              onNext: _deal,
              onRepeat: (_pilot && _lost && _repeatable != null)
                  ? () => _dealPilot(repeat: true)
                  : null,
              paint: _paint,
              onPaint: (i) => setState(() => _paint = i),
              label: _symbols.glyph,
              icon: _symbols.images == null
                  ? null
                  : (v) => Image.asset(_symbols.image(v)!, width: 30, height: 30, semanticLabel: '$v'),
              wonNote: _won && _symbols.word != null
                  ? L.t('sudokuHiddenWord').replaceAll('{w}', _symbols.word!)
                  : null,
            ),
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _deal),
        if (widget.mode == null && !widget.junior && _genStore != null)
          PauseAction(
            label: _pilot ? L.t('sudokuPilotOff') : L.t('sudokuPilotOn'),
            icon: _pilot ? Icons.trending_up : Icons.auto_awesome,
            onPressed: _togglePilot,
          ),
        // «Стиль цифр»: буквы внутри — только на правилах без числового смысла
        // (symbols.dart); рисованные цифры — везде, это всё ещё цифры.
        if (widget.mode == null && board != null)
          PauseAction(label: L.t('digitStyle'), icon: Icons.style_outlined, onPressed: _pickSkin),
      ],
    );
  }
}

/// Что именно вернёт отмена: цифру, пометку или цвет.
enum _StepKind { digit, mark, color }

/// Один шаг истории. Хранит ТО, ЧТО БЫЛО, а не то, что стало: отмена ставит обратно.
class _Step {
  const _Step(this.kind, this.r, this.c, this.was);

  final _StepKind kind;
  final int r;
  final int c;
  final int was;
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
class SudokuBoardView extends StatelessWidget {
  const SudokuBoardView({
    super.key,
    required this.board,
    required this.grid,
    required this.given,
    required this.marks,
    required this.colors,
    required this.selected,
    required this.height,
    required this.onTap,
    this.symbols,
  });

  final SudokuBoard board;
  final List<List<int>> grid;
  final List<List<bool>> given;
  final List<List<int>> marks;
  final List<List<int>> colors;
  final ({int r, int c})? selected;
  final double height;
  final void Function(int r, int c) onTap;

  /// Значки вместо цифр (`symbols.dart`); `null` — цифры.
  final SudokuSymbols? symbols;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, c) {
        // 🔴 Сторона — от МЕНЬШЕГО из высоты каркаса и ширины. Ровно этого не делала
        // веб-версия: считала от окна, и доска вылезала под ряд цифр.
        final avail = (height < c.maxWidth ? height : c.maxWidth) - 16;
        final n = board.n;
        final g = board.geometry;
        final sw = g.sandwich;
        // Суммы сэндвича — полосой над доской и слева, как в вебе (`clueCols` 0,6 клетки).
        final cell = avail / (n + (sw != null ? 0.6 : 0));
        final side = cell * n;
        final gutter = avail - side;
        final cages = g.cages;
        int? cageSumAt(int r, int col) {
          if (cages == null) return null;
          final id = cages.cageOf[r][col];
          if (id < 0 || id >= cages.anchor.length || cages.anchor[id] != r * n + col) return null;
          return cages.sum[id];
        }

        Widget clue(String key, int v, double w, double h) => SizedBox(
              width: w,
              height: h,
              child: Center(
                child: Text(
                  v < 0 ? '' : '$v', // −1 — сумма спрятана прореживанием
                  key: Key(key),
                  style: TextStyle(fontSize: cell * 0.34, fontWeight: FontWeight.w600, color: scheme.onSurfaceVariant),
                ),
              ),
            );

        Widget boardGrid = SizedBox(
          width: side,
          height: side,
          child: Stack(children: [
            Column(
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
                            mask: r < marks.length && col < marks[r].length ? marks[r][col] : 0,
                            paint: r < colors.length && col < colors[r].length
                                ? colors[r][col]
                                : noSudokuColor,
                            selected: selected != null && selected!.r == r && selected!.c == col,
                            scheme: scheme,
                            onTap: onTap,
                            glyph: symbols?.glyph,
                            image: symbols?.image,
                            decor: cellDecorFor(g, r, col),
                            cageSum: cageSumAt(r, col),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
            // Диагонали и доп. зоны «гипера» — цельными линиями поверх доски, как в вебе.
            if (board.variant == 'diagonal' || board.variant == 'killerdiag' || board.variant == 'hyper')
              Positioned.fill(
                child: IgnorePointer(
                  child: CustomPaint(
                    key: Key(board.variant == 'hyper' ? 'hyper-layer' : 'diagonal-layer'),
                    painter: BoardLinesPainter(
                      diagonals: board.variant != 'hyper',
                      hyper: board.variant == 'hyper',
                      n: n,
                      ink: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            // Точки Кропки — поверх клеток: они на грани, рисунок клетки срезал бы половину.
            if (g.kropki != null)
              Positioned.fill(
                child: IgnorePointer(
                  child: CustomPaint(
                    key: const Key('kropki-layer'),
                    painter: KropkiPainter(dots: kropkiDots(g.kropki!, n, cell), cell: cell),
                  ),
                ),
              ),
          ]),
        );
        if (sw != null) {
          boardGrid = Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(mainAxisSize: MainAxisSize.min, children: [
                SizedBox(width: gutter),
                for (var col = 0; col < n; col++) clue('sandwich-col-$col', sw.cols[col], cell, gutter),
              ]),
              Row(mainAxisSize: MainAxisSize.min, children: [
                Column(children: [
                  for (var r = 0; r < n; r++) clue('sandwich-row-$r', sw.rows[r], gutter, cell),
                ]),
                boardGrid,
              ]),
            ],
          );
        }
        return Center(child: boardGrid);
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
    required this.mask,
    required this.paint,
    required this.selected,
    required this.scheme,
    required this.onTap,
    this.glyph,
    this.image,
    this.decor,
    this.cageSum,
  });

  final double size;
  final int row;
  final int col;
  final SudokuBoard board;

  /// Рисунок варианта под цифрой (`variant_decor.dart`); `null` — рисовать нечего.
  final CellDecor? decor;

  /// Сумма группы — у её угловой клетки; `null` — не угол.
  final int? cageSum;

  /// Значок цифры; `null` — сама цифра.
  final String Function(int)? glyph;

  /// Картинка цифры (рисованный набор); `null` — без картинок.
  final String? Function(int)? image;
  final int value;
  final bool given;

  /// Маска карандашных пометок клетки и её цвет (-1 — без цвета).
  final int mask;
  final int paint;
  final bool selected;
  final ColorScheme scheme;
  final void Function(int r, int c) onTap;

  /// Толстая черта там, где кончается блок — а у кривых блоков там, где кончается регион.
  BorderSide _side(bool thick) => BorderSide(
        color: thick ? scheme.onSurface : scheme.outlineVariant,
        width: thick ? 2 : 0.5,
      );

  /// Картинка рисованной цифры — по правилу веба: только если клетка не выбрана, не
  /// покрашена и под ней ничего не нарисовано (decorFreeVariants). Иначе текст:
  /// контраст важнее единообразия начертания.
  Widget? _picture() {
    final src = value == 0 ? null : image?.call(value);
    if (src == null || selected || paint >= 0 || !decorFreeVariants.contains(board.variant)) return null;
    return Image.asset(src, width: size * 0.72, height: size * 0.72, semanticLabel: '$value');
  }

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
        // ⚠️ ВЫБОР ВИДЕН ПОВЕРХ КРАСКИ. Если крашеная клетка перестаёт показывать,
        // что она выбрана, человек в режиме цифр теряет, куда сейчас пишет.
        color: selected
            ? scheme.primaryContainer
            : (paint >= 0 && paint < sudokuColorCount
                ? cellColors[paint].withValues(alpha: 0.35)
                : (cageTint(scheme.surface, decor?.cageId ?? -1) ?? scheme.surface)),
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
            // Цифра ГАСИТ пометки, но не стирает их: убрал цифру — кандидаты
            // снова на месте (visiblePencilDigits, разбор в marks.dart).
            child: Stack(fit: StackFit.expand, children: [
              if (decor != null)
                CustomPaint(
                  key: Key('decor_${row}_$col'),
                  painter: CellDecorPainter(decor: decor!, surface: scheme.surface, row: row, col: col),
                ),
              Center(
              child: value == 0 && mask != 0
                  ? PencilMarksLayer(
                      key: Key('marks_${row}_$col'),
                      mask: mask,
                      value: value,
                      cell: size,
                      color: scheme.onSurfaceVariant,
                      glyph: glyph,
                    )
                  : _picture() ?? Text(
                      value == 0 ? '' : (glyph?.call(value) ?? '$value'),
                      style: TextStyle(
                        fontSize: size * 0.52,
                        fontWeight: given ? FontWeight.w800 : FontWeight.w500,
                        color: given ? scheme.onSurface : scheme.primary,
                      ),
                    ),
              ),
              if (cageSum != null)
                Positioned(
                  left: 3,
                  top: 1,
                  child: Text(
                    '$cageSum',
                    key: Key('cage-sum-${row}_$col'),
                    style: TextStyle(
                      fontSize: size * 0.27 < 8 ? 8 : size * 0.27,
                      fontWeight: FontWeight.w700,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
            ]),
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
    this.onRepeat,
    required this.paint,
    required this.onPaint,
    this.label,
    this.icon,
    this.wonNote,
  });

  final int n;
  final bool won;
  final bool lost;
  final void Function(int) onDigit;
  final VoidCallback onErase;
  final VoidCallback onNext;

  /// «Ещё раз эту же» — только у пилота и только после проигрыша: та же трудность,
  /// другая доска. `null` — кнопки нет (лестница, режимы, победа).
  final VoidCallback? onRepeat;

  /// Выбранный цвет: не `null` — вместо клавиш стоит палитра.
  final int? paint;
  final void Function(int) onPaint;

  /// Надписи клавиш — значками доски.
  final String Function(int)? label;

  /// Картинка клавиши (рисованные наборы); `null` — надпись.
  final Widget Function(int)? icon;

  /// Строка над кнопкой после победы — спрятанное слово Wordoku.
  final String? wonNote;

  @override
  Widget build(BuildContext context) {
    if (won || lost) {
      final next = FilledButton.icon(
        key: const Key('next'),
        onPressed: onNext,
        icon: Icon(won ? Icons.arrow_forward : Icons.refresh),
        label: Text(won ? 'Следующий уровень' : 'Ещё раз'),
      );
      final repeat = onRepeat;
      final note = wonNote;
      final Widget body = (lost && repeat != null)
            ? Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  next,
                  OutlinedButton.icon(
                    key: const Key('repeat'),
                    onPressed: repeat,
                    icon: const Icon(Icons.replay),
                    label: Text(L.t('sudokuRepeatSame')),
                  ),
                ],
              )
            : next;
      return Padding(
        padding: const EdgeInsets.all(12),
        child: note == null
            ? body
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    note,
                    key: const Key('hidden-word'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  body,
                ],
              ),
      );
    }
    return SudokuKeys(
        n: n, onDigit: onDigit, onErase: onErase, paint: paint, onPaint: onPaint, label: label, icon: icon);
  }
}
