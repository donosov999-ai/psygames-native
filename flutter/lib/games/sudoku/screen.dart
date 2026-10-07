import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/game_clock.dart';
import '../../shell/aux_action.dart';
import '../../shell/boss_round.dart';
import '../../shell/l10n.dart';
import 'keypad.dart';
import 'leave_guard.dart';
import 'marks.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_state.dart';
import 'generator/contract.dart';
import 'generator/engine.dart';
import 'generator/pool.dart';
import 'generator/shadow.dart';
import 'generator/store.dart';
import 'junior.dart';
import 'levels.dart';
import '../../shell/lesson_player.dart';
import '../../shell/resume_store.dart';
import 'lesson.dart';
import 'attempt.dart';
import 'mode_board.dart';
import 'reject_why.dart';
import 'rule_help.dart';
import 'modes.dart';
import 'resume.dart';
import 'roads.dart';
import 'rules.dart';
import 'symbols.dart';
import 'variant_decor.dart';
import '../samurai/screen.dart';

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
/// 🔴 БОЙ С БОССОМ — КАК В ВЕБЕ (задача 217f50de). В `app/games/sudoku.tsx` после каждого
/// третьего засчитанного уровня открывался бой, тип — из мешка `SUDOKU_BOSS_BAG`: три
/// задания перетасованы, по одному на веху, опустел — мешок заново. При переносе на
/// Flutter слой пропал молча (замер 30.09: босса не было ни в одном из 24 нативных экранов,
/// где он был в вебе). Мешок живёт на уровне модуля — как массив модуля в вебе.
/// Сверка состава с вебом — `test/sudoku_boss_test.dart` (читает список из исходника веба).
const sudokuBossTypes = [BossType.finderror, BossType.lightning, BossType.completeline];
final List<BossType> _sudokuBossBag = [];

/// Следующий тип босса из мешка.
BossType nextSudokuBoss(math.Random rnd) {
  if (_sudokuBossBag.isEmpty) _sudokuBossBag.addAll(List.of(sudokuBossTypes)..shuffle(rnd));
  return _sudokuBossBag.removeLast();
}

/// Только для проб: заправить мешок (тянется С КОНЦА) — бой нужного типа без зерна экрана.
@visibleForTesting
void fillSudokuBossBag(List<BossType> bag) => _sudokuBossBag
  ..clear()
  ..addAll(bag);

/// Мегабосс — каждые столько уровней ВМЕСТО обычного боя (15 кратно 3), как
/// `MEGA_BOSS_EVERY` веба: приглашение в «Самурая» с меткой вехи.
const sudokuMegaBossEvery = 15;

/// Цвет боя — первый цвет градиента судоку в вебе (`GRADIENT[0]`).
const sudokuBossColor = Color(0xFF7F7FD5);

class SudokuScreen extends StatefulWidget {
  const SudokuScreen({super.key, required this.state, this.mode, this.junior = false});

  final SharedState state;

  /// Режим доски: `null` — обычная лестница, иначе «Небоскрёбы» или
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
String get _noBoards => L.t('sdkNoBoards');

class _SudokuScreenState extends State<SudokuScreen> {
  /// Сколько ошибок до провала. На лестнице — поле ступени (`lives` выгрузки лестницы =
  /// `levelConfig.lives` веба: цена ошибки убывает к верху, задача 1fa57de3); пилот
  /// генератора и режимы — три, как было.
  int get errorLimit {
    if (widget.mode != null || _pilot) return 3;
    final lives = _levels?.config(_ladder.level).lives ?? 3;
    return _onRoad ? sudokuRoadLives(lives, _road) : lives;
  }

  /// Дорога лестницы («полегче / обычная / пожёстче», roads.dart). Выбирается в паузе
  /// между партиями, помнится в общей памяти под ключом веба.
  SudokuRoad _road = defaultSudokuRoad;

  /// Дорога действует только на лестнице: у режимов, малышей и пилота своих дорог нет.
  bool get _onRoad => widget.mode == null && !widget.junior && !_pilot;

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
  /// основная лестница ровно как была — ни один её ключ пилот не пишет.
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

  /// Почему последняя цифра не подошла — ключ словаря (`reject_why.dart`); живёт до следующей
  /// верной цифры или новой раздачи, как строка веба (`rejectWhy`).
  String? _whyKey;
  int _hintsUsed = 0;
  bool _answersRevealed = false;
  late final _revealed = SudokuRevealedBoards(widget.state);
  String get _answerId => sudokuAnswerId(
      _sideBoard?.puzzle ?? _board!.puzzle, _solution!);
  bool get _assisted => _answersRevealed || _hintsUsed > 0;
  String? _avoidAnswerId;
  bool _rejectIndependent(String id) => id == _avoidAnswerId || _revealed.contains(id);
  void _newIndependentBoard() {
    if (_solution != null) _avoidAnswerId = _answerId;
    _deal();
  }

  void _beginAttempt() {
    _answersRevealed = _solution != null && _revealed.contains(_answerId);
  }

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

  /// Итог боя с боссом этой партии: `null` — боя не было.
  bool? _boss;
  bool _lost = false;
  String? _failure;

  @override
  void initState() {
    super.initState();
    _road = sudokuRoadOf(widget.state.get(sudokuRoadKey(widget.state.activeProfile))) ?? defaultSudokuRoad;
    _ladder = _ladderUpTo(SudokuLevels.fallbackLast);
    _boot();
  }

  /// 🔴 ПОТОЛОК ЛЕСТНИЦЫ — ИЗ ДАННЫХ, А НЕ ЧИСЛОМ В КОДЕ (01.10.2026, задача 5b0b7ca2).
  /// Здесь стояло `maxLevel: 92`: ступени 93–96 «немецкого шёпота» выгрузились, а победа
  /// на 92-й оставляла человека на 92-й навсегда — новые ступени были бы недостижимы.
  /// Поймала проба нажатиями `sudoku_whisper_screen_test.dart`, а не пробы данных.
  ///
  /// Хранилище — дороги (`SudokuRoadStore`): лестница читает уровень ВЫБРАННОЙ дороги с
  /// переносом пройденного вниз и пишет только её счётчик. На обычной дороге ключ прежний.
  LevelLadder _ladderUpTo(int last) =>
      LevelLadder(gameId: 'sudoku', store: SudokuRoadStore(widget.state, _road), maxLevel: last);

  Future<void> _boot() async {
    final levels = await SudokuLevels.load();
    _ladder = _ladderUpTo(levels.lastLevel);
    await _ladder.load();
    await WordokuWords.load();
    // Лестница нужна и в режиме: потолок подсказок берётся по номеру ступени — ровно
    // так же, как в веб-половине (там в режиме `level` держит номер ступени).
    final modes = widget.mode == null ? null : await SideModes.load();
    final kids = widget.junior ? await KidsBoards.load() : null;
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
      if (kids != null) {
        _kids = kids;
        _junior = JuniorProgress(widget.state, kids.steps.length);
      }
    });
    if (_onRoad && await _resumeLadder()) return;
    _deal();
  }

  @override
  void dispose() {
    _persist();   // уход с экрана — с живым временем, а не с тем, что было на прошлом ходу
    super.dispose();
  }

  /// 🔴 НЕЗАКОНЧЕННАЯ ПАРТИЯ ЛЕСТНИЦЫ — формат веба (resume.dart; сверка 138f7818, п.3).
  late final ResumeStore _resume = ResumeStore(widget.state, sudokuGameId, sudokuResumeVersion);

  /// Записать (или стереть, если партия кончилась). Только лестница: режимы, пилот и малыши —
  /// своими путями. Без ожидания — экран не ждёт диска между касаниями.
  void _persist() {
    final board = _board;
    if (!_onRoad || board == null || _grid.isEmpty) return;
    if (_won || _lost) {
      unawaited(_resume.clear());
      return;
    }
    unawaited(_resume.save(sudokuSnapshot(
      level: board.level,
      road: _road.name,
      variant: board.variant,
      n: board.n,
      br: board.br,
      bc: board.bc,
      puzzle: board.puzzle,
      solution: board.solution,
      grid: _grid,
      given: _given,
      colors: _colors,
      marks: _marks,
      geometry: board.geometryJson,
      errors: _errors,
      hintUses: _hintsUsed,
      answersRevealed: _answersRevealed,
      hintMax: _hintMax,
      backtracks: _backtracks,
      elapsed: _elapsed,
      moves: [
        for (final h in _history)
          (
            kind: switch (h.kind) { _StepKind.digit => 'digit', _StepKind.mark => 'pencil', _StepKind.color => 'color' },
            r: h.r,
            c: h.c,
            from: h.was,
            to: h.to,
          ),
      ],
    )));
  }

  /// Поднять партию лестницы. Чужая ступень или дорога не поднимаются — тогда раздаётся своя
  /// доска, и снимок она перезапишет. Банк узнаём по ступени: полоса — дорогой, как при раздаче.
  Future<bool> _resumeLadder() async {
    final levels = _levels;
    final saved = await _resume.load();
    if (levels == null || saved == null || !mounted) return false;
    final r = sudokuFromSnapshot(saved);
    if (r == null || r.level != _ladder.level || r.road != _road.name) return false;
    final cfg = levels.config(r.level);
    final board = SudokuBoard(
      level: r.level,
      n: r.n,
      br: r.br,
      bc: r.bc,
      variant: r.variant,
      puzzle: r.puzzle,
      solution: r.solution,
      geometry: BoardGeometry.fromJson(r.geometry),
      geometryJson: r.geometry,
      rating: cfg.fromBank ? levels.bankRating(r.level, shift: sudokuRoadShift(_road)) : null,
    );
    setState(() {
      _board = board;
      _applySymbols(board, r.level);
      _failure = null;
      _grid = r.grid;
      _given = r.given;
      _history
        ..clear()
        ..addAll([
          for (final m in r.moves)
            _Step(
              switch (m.kind) { 'pencil' => _StepKind.mark, 'color' => _StepKind.color, _ => _StepKind.digit },
              m.r,
              m.c,
              m.from,
              m.to,
            ),
        ]);
      _marks = r.marks;
      _colors = r.colors;
      _pencil = false;
      _paint = null;
      _selected = null;
      _errors = r.errors;
      _whyKey = null;
      _hintsUsed = r.hintUses;
      _answersRevealed = r.answersRevealed || r.hintUses > 0 || _revealed.contains(_answerId);
      _backtracks = r.backtracks;
      // Время — с НАКОПЛЕННОГО: часы между сессиями ушли вперёд, а партия всё это время стояла.
      _startedAt = gameNow() - r.elapsed * 1000;
      _won = false;
      _boss = null;
      _lost = false;
    });
    if (_answersRevealed) await _revealed.mark(_answerId);
    _recordDeal(board);
    return true;
  }

  /// Ступень малышей; `null` — обычная игра.
  JuniorProgress? _junior;

  /// Доски малышей из выгрузки; `null` — обычная игра.
  KidsBoards? _kids;

  /// Раздача малышей: доска 4×4 своей ступени, значки — как у лестницы.
  void _dealJunior() {
    final junior = _junior, kids = _kids;
    if (junior == null || kids == null) return;
    final seed = DateTime.now().millisecondsSinceEpoch; // wall-clock: зерно раздачи
    final board = sudokuDistinctBoard<SudokuBoard>(
      draw: (i) => kids.board(junior.step, seed + i),
      identity: (b) => sudokuAnswerId(b.puzzle, b.solution),
      reject: _rejectIndependent,
    );
    if (board == null) {
      setState(() { _board = null; _grid = const []; _failure = _noBoards; });
      return;
    }
    setState(() {
      _board = board;
      _beginAttempt();
      _applySymbols(board, seed);
      _failure = null;
      _grid = [for (final row in board.puzzle) [...row]];
      _given = [for (final row in board.puzzle) [for (final v in row) v != 0]];
      _history.clear();
      _resetNotes(board.n);
      _selected = null;
      _errors = 0;
      _whyKey = null;
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
      final seed = DateTime.now().millisecondsSinceEpoch; // wall-clock: зерно независимой раздачи
      final board = sudokuDistinctBoard<SideBoard>(
        draw: (i) => modes.boardFor(mode, side.step, seed: seed + i),
        identity: (b) => sudokuAnswerId(b.puzzle, b.solution),
        reject: _rejectIndependent,
      );
      setState(() {
        _sideBoard = board;
        _beginAttempt();
        _failure = board == null ? _noBoards : null;
        _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
        _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
        _history.clear();
        _resetNotes(board?.n ?? 0);
        _selected = null;
        _errors = 0;
        _whyKey = null;
        _startedAt = gameNow();
        _hintsUsed = 0;
        _backtracks = 0;
        _won = false;
      _boss = null;
        _boss = null;
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
    final board = sudokuDistinctBoard<SudokuBoard>(
      draw: (i) => levels.boardFor(_ladder.level, seed: seed + i, road: _road),
      identity: (b) => sudokuAnswerId(b.puzzle, b.solution),
      reject: _rejectIndependent,
    );
    setState(() {
      _board = board;
      _beginAttempt();
      _applySymbols(board, seed);
      _failure = board == null ? _noBoards : null;
      _grid = board == null ? const [] : [for (final row in board.puzzle) [...row]];
      _given = board == null ? const [] : [for (final row in board.puzzle) [for (final v in row) v != 0]];
      _history.clear();
      _resetNotes(board?.n ?? 0);
      _selected = null;
      _errors = 0;
      _whyKey = null;
      _startedAt = gameNow();
      _hintsUsed = 0;
      _backtracks = 0;
      _won = false;
      _boss = null;
      _lost = false;
    });
    _recordDeal(board);
    _persist();   // новая доска сразу ложится своим снимком, как в вебе
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
    if (board != null && _rejectIndependent(sudokuAnswerId(board.puzzle, board.solution))) {
      final level = source;
      board = sudokuDistinctBoard<SudokuBoard>(
        draw: (i) => levels.boardFor(level, seed: seed + i),
        identity: (b) => sudokuAnswerId(b.puzzle, b.solution),
        reject: _rejectIndependent,
      );
    }
    setState(() {
      _board = board;
      _beginAttempt();
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
      _whyKey = null;
      _startedAt = gameNow();
      _hintsUsed = 0;
      _backtracks = 0;
      _won = false;
      _boss = null;
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
  /// Сменить дорогу между партиями: запомнить выбор, взять уровень новой дороги (с
  /// переносом пройденного вниз) и раздать её доску. Как `switchRoad` веб-экрана.
  Future<void> _switchRoad(SudokuRoad next) async {
    final levels = _levels;
    if (next == _road || levels == null) return;
    widget.state.set(sudokuRoadKey(widget.state.activeProfile), next.name);
    _road = next;
    _ladder = _ladderUpTo(levels.lastLevel);
    await _ladder.load();
    if (!mounted) return;
    _deal();
  }

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
      _colors[r][c] = toggleCellColor(was, color);
      _history.add(_Step(_StepKind.color, r, c, was, _colors[r][c]));
    });
    _persist();
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
      _marks[r][c] = pencilInput(was, digit);
      _history.add(_Step(_StepKind.mark, r, c, was, _marks[r][c]));
    });
    _persist();
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
      _history.add(_Step(_StepKind.digit, sel.r, sel.c, was, value));
      _grid[sel.r][sel.c] = value;
      if (value != 0 && solution[sel.r][sel.c] == value) _whyKey = null;
      if (value != 0 && solution[sel.r][sel.c] != value) {
        _whyKey = _rejectWhy(sel.r, sel.c, value);
        _errors += 1;
        if (_errors >= errorLimit) {
          _lost = true;
          if (_assisted) {
            _reportEducational(completed: false);
          } else if (_pilot) {
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
    _persist();
  }

  void _erase() => _onKey(0);

  /// Правило доски на экране: у режима — сам режим («Свободно» правила не добавляет), у лестницы,
  /// пилота и малышей — вариант выданной доски.
  String get _ruleNow {
    final mode = widget.mode;
    if (mode == SideMode.killer) return 'killer';
    if (mode == SideMode.free) return 'none';
    if (mode != null) return sideModeName(mode);
    return _board?.variant ?? 'none';
  }

  /// Есть ли у правила доски своя справка (текст правила в словаре).
  bool get _hasRuleHelp => _ruleNow != 'none' && sudokuRuleTextKey(_ruleNow) != null;

  /// Карточка «новое правило» — пока человек её не закрыл и пока партия идёт. Если правило
  /// умещается в своё имя в полосе («🐱 рядом с 🐭» у «Мяу — друзья»), карточка его бы только
  /// повторила — её нет, правило остаётся в паузе.
  bool get _ruleBanner =>
      _hasRuleHelp &&
      !_won &&
      !_lost &&
      L.t(sudokuRuleTextKey(_ruleNow)!) != _ruleTitle() &&
      !sudokuRuleSeen(widget.state, _ruleNow);

  String _ruleTitle() => _ruleNow == 'killer' ? L.t('sudokuModeKiller') : variantTitle(_ruleNow);

  /// «Видел правило» — тот же флаг, что ставит веб (`psygames_sudoku_rulehint_<правило>`).
  void _ackRule() {
    widget.state.set(sudokuRuleSeenKey(_ruleNow), '1');
    if (mounted) setState(() {});
  }

  Future<void> _openRuleHelp() async {
    final rule = _ruleNow;
    _ackRule();
    await showSudokuRuleHelp(context, rule: rule, title: _ruleTitle(), n: _n);
  }

  /// Причина отказа на той доске, что в игре: режим (небоскрёбы, неравенства) или лестница.
  String? _rejectWhy(int r, int c, int v) {
    final side = _sideBoard, mode = widget.mode;
    if (side != null && mode != null) {
      return rejectionKey(_grid, r, c, v,
          n: side.n, br: side.br, bc: side.bc, variant: sideModeName(mode), geometry: side.geometry);
    }
    final b = _board;
    if (b == null) return null;
    return rejectionKey(_grid, r, c, v, n: b.n, br: b.br, bc: b.bc, variant: b.variant, geometry: b.geometry);
  }

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
    _persist();
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
      _answersRevealed = true;
      unawaited(_revealed.mark(_answerId));
      _checkWin();
    });
    _persist();
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
    final hints = levels.config(level).hintMax;
    return _onRoad ? sudokuRoadHintMax(hints, _road) : hints;
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
    // Малыши — свой отчёт той же формы, что победа: иначе проигрыш на доске 4×4 ушёл бы
    // в статистику уровнем обычной лестницы, на котором человек вовсе не играл.
    final junior = _junior;
    if (widget.junior && junior != null) {
      unawaited(SessionReport.send(
        gameType: 'sudoku',
        score: 0,
        timeSeconds: _elapsed,
        mode: 'junior-${junior.step}',
        errors: _errors,
        details: {
          'errors': _errors,
          'completed': false,
          'failed_out': true,
          'level': junior.step,
          'variant': 'junior',
          if (_skinShown != null) 'skin': _skinShown,
        },
      ));
      return;
    }
    final mode = widget.mode;
    final level = mode == null ? _ladder.level : (_side?.step ?? 1);
    unawaited(SessionReport.send(
      gameType: 'sudoku',
      score: 0,
      timeSeconds: _elapsed,
      difficulty: mode == null ? _difficultyFor(level) : _modeDifficulty(mode, level),
      mode: mode == null ? _levelMode(level) : _modeKey(mode, level),
      errors: _errors,
      details: {
        'errors': _errors,
        'completed': false,
        'failed_out': true,
        'level': level,
        'variant': mode == null ? (_board?.variant ?? 'none') : sideModeName(mode),
        if (mode == null) 'road': _onRoad ? _road.name : defaultSudokuRoad.name,
        if (mode == null) 'lives': errorLimit,
        if (_skinShown != null) 'skin': _skinShown,
      },
    ));
  }

  /// Имя партии в отчёте — как у веба: режимы-лестницы `<режим>-<ступень>`, «Свободно» —
  /// `9x9` с трудностью отдельно (app/games/sudoku.tsx, saveSession). «Киллер» в вебе писался
  /// `killer-<сложность>` — наследие трёх кнопок; у лестницы осмысленна ступень.
  String _modeKey(SideMode mode, int step) {
    if (mode == SideMode.free) {
      final n = freePreset(step).size;
      return '${n}x$n';
    }
    return '${sideModeName(mode)}-$step';
  }

  String? _modeDifficulty(SideMode mode, int step) =>
      mode == SideMode.free ? freePreset(step).difficulty : null;

  /// Победа в режиме — своя мини-лестница, но отчёт обязан уйти так же, как у уровней.
  void _reportModeWin(int step) {
    final mode = widget.mode!;
    unawaited(SessionReport.send(
      gameType: 'sudoku',
      score: _score(step),
      timeSeconds: _elapsed,
      difficulty: _modeDifficulty(mode, step),
      mode: _modeKey(mode, step),
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
    if (_won || _lost) return;
    final solution = _solution;
    if (solution == null) return;
    for (var r = 0; r < _n; r++) {
      for (var c = 0; c < _n; c++) {
        if (_grid[r][c] != solution[r][c]) return;
      }
    }
    _won = true;
    if (_assisted) {
      _reportEducational(completed: true);
      return;
    }
    if (widget.mode != null) {
      _reportModeWin(_side?.step ?? 1);   // шаг — ДО прибавки, как в вебе
      _side?.win();   // ступень режима — свой счётчик, основная лестница не трогается
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
    unawaited(_winWithBoss(() => _ladder.win(
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
        'road': _onRoad ? _road.name : defaultSudokuRoad.name,
        'lives': errorLimit,
        if (_skinShown != null) 'skin': _skinShown,
      },
    )));
  }

  /// One gate before every progression branch. Reports remain visible as
  /// practice, but cannot earn a level, adaptive rating or independent score.
  void _reportEducational({required bool completed}) {
    final level = widget.junior ? (_junior?.step ?? 1)
        : widget.mode != null ? (_side?.step ?? 1)
        : _pilot ? _pilotLevel : _ladder.level;
    unawaited(SessionReport.send(
      gameType: 'sudoku', score: 0, timeSeconds: _elapsed, errors: _errors,
      mode: widget.junior ? 'junior-$level'
          : widget.mode != null ? _modeKey(widget.mode!, level)
          : _pilot ? 'adaptive' : _levelMode(level),
      details: {
        'lesson': true, 'answers_revealed': true, 'independent': false,
        'completed': false, 'practice_completed': completed,
        'hint_uses': _hintsUsed, 'errors': _errors,
        'variant': widget.mode != null ? sideModeName(widget.mode!) : _board?.variant,
      },
    ));
  }

  /// Победа и веха — порядок веба: на каждом 15-м уровне приглашение в «Самурая»
  /// (мегабосс), на остальных кратных трём — бой из мешка. Уровень берётся у лестницы ДО
  /// победы, «засчитано ли» — из её ответа (не пресет зарядки, не партия с разбором):
  /// экран этих признаков сам не придумывает — как `BossRound.winThenBoss`.
  Future<void> _winWithBoss(Future<bool> Function() win) async {
    final played = _ladder.level;
    final counted = await win();
    if (!counted || !mounted) return;
    if (played % sudokuMegaBossEvery == 0) {
      await _offerMegaBoss(played);
      return;
    }
    if (!BossRound.due(played)) return;
    final boss = await BossRound.afterWin(context,
        counted: counted, playedLevel: played, type: nextSudokuBoss(_bossRnd), color: sudokuBossColor);
    if (mounted && boss != null) setState(() => _boss = boss);
  }

  final _bossRnd = math.Random();

  /// Мегабосс — приглашение, а не принуждение (как в вебе): партия на час, человек вправе
  /// пойти позже; уровень уже засчитан, «Позже» ничего не отнимает.
  Future<void> _offerMegaBoss(int level) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        key: const Key('megaboss-offer'),
        title: Text('⚔️ ${L.t('megaBossTitle')}'),
        content: Text(L.t('megaBossOffer')),
        actions: [
          TextButton(
            key: const Key('megaboss-later'),
            onPressed: () => Navigator.of(c).pop(false),
            child: Text(L.t('updLater')),
          ),
          FilledButton(
            key: const Key('megaboss-go'),
            onPressed: () => Navigator.of(c).pop(true),
            child: Text(L.t('megaBossGo')),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => SamuraiScreen(state: widget.state, megabossFrom: level),
    ));
  }

  /// 🔴 РАЗБОР СУДОКУ: ПОЧЕМУ ЭТА ЦИФРА, А НЕ «ВОТ ОТВЕТ».
  ///
  /// Шаги считает `sudokuLessonSteps`; экран отвечает за два: собрать текст приёма
  /// из своего словаря (у приёмов подстановки — ключом их не передать) и нарисовать
  /// доску СВОИМ же виджетом, чтобы разбор выглядел как партия.
  ///
  /// Разбор использует отдельный пример той же ступени, а не ответы партии.
  String _teachText(String key, Map<String, String> args, SudokuSymbols symbols) {
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
      final v = e.key == 'd' ? symbols.glyph(int.tryParse(e.value) ?? 0) : e.value;
      out = out.replaceAll('{${e.key}}', v.isEmpty ? e.value : v);
    }
    return out;
  }

  /// Заголовок один на экран и на разбор — имя режима.
  ///
  /// 🔴 С 24.09 (коммит b658621d4) у режимов здесь стояло `L.t('teachTitle')`: над
  /// «Небоскрёбами» и «Неравенствами» было написано «Разбор по шагам». Теперь — имя режима
  /// теми же ключами, что у карточек развилки (задача 55b97845).
  String get _title => switch (widget.mode) {
        null => L.t('sudoku'),
        SideMode.towers => L.t('sudokuTowersTitle'),
        SideMode.unequal => L.t('sudokuUnequalTitle'),
        SideMode.killer => L.t('sudokuModeKiller'),
        SideMode.free => L.t('sudokuModeFree'),
      };

  /// «Киллер» и «Свободно» — классическая доска (у киллера — с суммами): её рисует обычная
  /// доска лестницы, у которой суммы и тонировка групп уже есть (`variant_decor.dart`).
  SudokuBoard _asLadderBoard(SideBoard side) => SudokuBoard(
        level: side.step,
        n: side.n,
        br: side.br,
        bc: side.bc,
        variant: widget.mode == SideMode.killer ? 'killer' : 'none',
        puzzle: side.puzzle,
        solution: side.solution,
        geometry: side.geometry,
        tier: side.tier,
      );

  /// Пресет «Свободно» словами: «9×9 · Medium».
  String _freeLabel(int step) {
    final p = freePreset(step);
    return '${p.size}×${p.size} · ${L.t(p.difficulty)}';
  }

  void _chooseFree(int step) {
    _side?.choose(step);
    _deal();
  }

  Future<void> _openLesson() async {
    if (_solution == null || _grid.isEmpty) return;
    final activeId = _answerId;
    final seed = DateTime.now().microsecondsSinceEpoch; // wall-clock: зерно учебной раздачи
    // Select from the SAME step/road/template source. Never alter digits or
    // geometry to fake another puzzle: variant constraints may depend on them.
    final side = widget.mode == null ? null : sudokuDistinctBoard<SideBoard>(
      draw: (i) => _sideModes?.boardFor(widget.mode!, _side!.step, seed: seed + i),
      identity: (b) => sudokuAnswerId(b.puzzle, b.solution),
      reject: (id) => id == activeId,
    );
    final board = widget.mode != null ? null : sudokuDistinctBoard<SudokuBoard>(
      draw: (i) => widget.junior
          ? _kids?.board(_junior!.step, seed + i)
          : _levels?.boardFor(_pilot ? _pilotLevel : _ladder.level,
              seed: seed + i, road: _pilot ? defaultSudokuRoad : _road),
      identity: (b) => sudokuAnswerId(b.puzzle, b.solution),
      reject: (id) => id == activeId,
    );
    if (board == null && side == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(L.t('sudokuLessonUnavailable'))));
      return;
    }
    final puzzle = side?.puzzle ?? board!.puzzle;
    final solution = side?.solution ?? board!.solution;
    final n = side?.n ?? board!.n;
    final br = side?.br ?? board!.br;
    final bc = side?.bc ?? board!.bc;
    final geometry = side?.geometry ?? board!.geometry;
    final variant = widget.mode == SideMode.killer ? 'killer'
        : widget.mode == SideMode.free ? 'none'
        : side != null ? sideModeName(widget.mode!) : board!.variant;
    final symbols = board == null ? SudokuSymbols.digits(n) : symbolsFor(
      skin: _choice.skin, style: _choice.style, variant: board.variant,
      solution: solution, language: widget.state.language, seed: seed,
    );
    final steps = sudokuLessonSteps(
      say: (key, args) => _teachText(key, args, symbols),
      grid: puzzle, solution: solution, n: n, br: br, bc: bc,
      candidates: (g, r, c) => [for (var d = 1; d <= n; d++)
        if (isValid(g, r, c, d, n, br, bc, variant: variant, geometry: geometry)) d],
    );
    if (steps.isEmpty) return;
    // Persist BEFORE displaying the first answer. This board must never be
    // redealt as an independent attempt, even after exit/restart/profile change.
    await _revealed.mark(sudokuAnswerId(puzzle, solution));
    if (!mounted) return;
    final given = [for (final row in puzzle) [for (final v in row) v != 0]];
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: '$_title · ${L.t('sudokuPracticeExample')}',
        steps: steps,
        onNewBoard: _newIndependentBoard,
        newBoardLabel: L.t('sudokuTryIndependently'),
        board: (context, sideLen, shown) {
          final i = shown.clamp(0, steps.length - 1);
          final m = steps[i].payload as SudokuMove;
          final marks = [for (var r = 0; r < n; r += 1) List<int>.filled(n, 0)];
          final colors = [for (var r = 0; r < n; r += 1) List<int>.filled(n, 0)];
          if (widget.mode != null && side != null) {
            return ModeBoard(
              board: side,
              mode: widget.mode!,
              grid: m.grid,
              given: given,
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
            given: given,
            marks: marks,
            colors: colors,
            selected: (r: m.r, c: m.c),
            height: sideLen,
            onTap: (_, _) {},
            symbols: symbols,
          );
        },
      ),
    ));
  }

  /// В партии есть что терять: ход, пометка, цвет, ошибка или подсказка — и она не кончилась.
  /// Тогда выход, «Заново», смена дороги, пилота и пресета спрашивают (leave_guard.dart; веб —
  /// `liveGame && touched`, sudoku.tsx; сверка 138f7818 п.2).
  bool get _live => (_history.isNotEmpty || _errors > 0 || _hintsUsed > 0) && !_won && !_lost;

  @override
  Widget build(BuildContext context) {
    final levels = _levels;
    final board = _board;
    final cfg = levels?.config(_ladder.level);
    // Правило доски: у режима — его имя, у лестницы — имя варианта ступени, у пилота и
    // малышей — вариант выданной доски (ступень лестницы здесь ни при чём).
    final variant = (_pilot || widget.junior) ? _board?.variant : cfg?.variant;
    final ruleLabel = widget.mode != null
        ? variantTitle(sideModeName(widget.mode!))
        : (variant != null && variant != 'none' ? variantTitle(variant) : null);

    return LeaveGuard(live: _live, saved: _onRoad, child: GameShell(
      title: _title,
      onLesson: _solution == null || _grid.isEmpty ? null : _openLesson,
      hud: [
        // ⚠️ Подпись одна и та же на оба случая: новая строка в коде — это новый долг
        // храповика подписей, а «Уровень» уже переведён на двенадцать языков.
        HudItem(
          label: L.t('level'),
          // У пилота номер — счётчик побед: только растёт, конца нет (решение 18.09).
          value: widget.junior
              ? '${_junior?.step ?? 1}/${_junior?.steps ?? 1}'
              : widget.mode == SideMode.free
                  ? _freeLabel(_side?.step ?? 1)
                  : widget.mode != null
                      ? '${_side?.step ?? 1}/${sideStepsOf(widget.mode!)}'
                      : _pilot ? '${_pilotWins + 1}' : '${_ladder.level}',
          icon: _pilot ? Icons.auto_awesome : Icons.trending_up,
        ),
        HudItem(label: L.t('errors'), value: '$_errors/$errorLimit', icon: Icons.close),
        if (ruleLabel != null) HudItem(label: L.t('simonRule'), value: ruleLabel, icon: Icons.rule),
      ],
      field: (context, fieldHeight) {
        final ready = widget.mode == null ? levels != null : _sideModes != null;
        if (!ready) return const Center(child: CircularProgressIndicator());
        final side = _sideBoard;
        if (widget.mode == null ? board == null : side == null) {
          return Center(child: Text(_failure ?? L.t('sdkBoardFailed')));
        }
        // Карточка «новое правило» забирает свою полосу у поля — доска не уезжает под неё.
        final banner = _ruleBanner;
        final height = banner ? fieldHeight - SudokuRuleBanner.height : fieldHeight;
        Widget withBanner(Widget boardView) => !banner
            ? boardView
            : Column(children: [
                SudokuRuleBanner(rule: _ruleNow, onMore: _openRuleHelp, onClose: _ackRule),
                Expanded(child: boardView),
              ]);
        if (widget.mode == SideMode.killer || widget.mode == SideMode.free) {
          return withBanner(SudokuBoardView(
            board: _asLadderBoard(side!),
            grid: _grid,
            given: _given,
            marks: _marks,
            colors: _colors,
            selected: _selected,
            height: height,
            onTap: _select,
          ));
        }
        if (widget.mode != null) {
          return withBanner(ModeBoard(
            board: side!,
            mode: widget.mode!,
            grid: _grid,
            given: _given,
            marks: _marks,
            colors: _colors,
            selected: _selected,
            height: height,
            onTap: _select,
          ));
        }
        return withBanner(SudokuBoardView(
          board: board!,
          grid: _grid,
          given: _given,
          marks: _marks,
          colors: _colors,
          selected: _selected,
          height: height,
          onTap: _select,
          symbols: _symbols,
        ));
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
          label: L.t('btn_undo'),
          count: _history.isEmpty ? null : _history.length,
          onPressed: _history.isEmpty || _won || _lost ? null : _undo,
        ),
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('btn_hint'),
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
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => restartGuarded(context, live: _live, deal: _deal)),
      ]),
      toolbar: (board == null && _sideBoard == null)
          ? null
          : _Toolbar(
              why: _whyKey == null ? null : L.t(_whyKey!),
              n: _n,
              won: _won,
              lost: _lost,
              onDigit: _onKey,
              onErase: _erase,
              onNext: _newIndependentBoard,
              nextLabel: _assisted ? L.t('sudokuTryIndependently') : null,
              onRepeat: (_pilot && _lost && _repeatable != null)
                  ? () => _dealPilot(repeat: true)
                  : null,
              paint: _paint,
              onPaint: (i) => setState(() => _paint = i),
              label: _symbols.glyph,
              icon: _symbols.images == null
                  ? null
                  : (v) {
                      // Значение без картинки (мышь «Мяу», пока её рисуют) — клавиша берёт глиф.
                      final src = _symbols.image(v);
                      return src == null ? null : Image.asset(src, width: 30, height: 30, semanticLabel: '$v');
                    },
              wonNote: _won && _assisted ? L.t('sudokuPracticeOnly') : _won && _symbols.word != null
                  ? L.t('sudokuHiddenWord').replaceAll('{w}', _symbols.word!)
                  : null,
              boss: _won ? _boss : null,
              // Провал — словами и с числом ступени, как в вебе: «Ошибок: 2 из 2…».
              lostNote: _lost ? L.t('outOfLivesHint').replaceAll('{n}', '$errorLimit') : null,
            ),
      pauseActions: [
        PauseAction(label: L.t('sdkStartOver'), icon: Icons.refresh, onPressed: () => restartGuarded(context, live: _live, deal: _deal)),
        // Правило доски — окно со схемой, как бейдж варианта у веба (b5df5096 п.5).
        if (_hasRuleHelp)
          PauseAction(label: '${L.t('simonRule')}: ${_ruleTitle()}', icon: Icons.rule, onPressed: _openRuleHelp),
        if (widget.mode == null && !widget.junior && _genStore != null)
          PauseAction(
            label: _pilot ? L.t('sudokuPilotOff') : L.t('sudokuPilotOn'),
            icon: _pilot ? Icons.trending_up : Icons.auto_awesome,
            onPressed: () => restartGuarded(context, live: _live, deal: _togglePilot),
          ),
        // Дорога сложности — между партиями, как переключатель веб-экрана: рядом с каждой
        // её уровень, видный ДО выбора (перенос пройденного вниз без этих чисел не понять).
        if (_onRoad && _levels != null)
          for (final r in SudokuRoad.values)
            PauseAction(
              label: '${L.t(sudokuRoadNameKey(r))} · ${L.t('label_level_short')}'
                  '${effectiveRoadLevel(widget.state, widget.state.activeProfile, r)}',
              icon: r == _road ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              onPressed: () => restartGuarded(context, live: _live, deal: () => _switchRoad(r)),
            ),
        // «Стиль цифр»: буквы внутри — только на правилах без числового смысла
        // (symbols.dart); рисованные цифры — везде, это всё ещё цифры.
        if (widget.mode == null && board != null)
          PauseAction(label: L.t('digitStyle'), icon: Icons.style_outlined, onPressed: _pickSkin),
        // «Свободно»: размер и сложность — выбор человека, как кнопки веб-экрана.
        if (widget.mode == SideMode.free)
          for (var step = 1; step <= sideStepsOf(SideMode.free); step++)
            PauseAction(
              label: _freeLabel(step),
              icon: step == (_side?.step ?? 1) ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              onPressed: () => restartGuarded(context, live: _live, deal: () => _chooseFree(step)),
            ),
      ],
    ));
  }
}

/// Что именно вернёт отмена: цифру, пометку или цвет.
enum _StepKind { digit, mark, color }

/// Один шаг истории. Хранит ТО, ЧТО БЫЛО, а не то, что стало: отмена ставит обратно.
class _Step {
  const _Step(this.kind, this.r, this.c, this.was, this.to);

  final _StepKind kind;
  final int r;
  final int c;
  final int was;

  /// Что стало — нужно снимку партии (лента веба хранит from и to).
  final int to;
}

/// Имя правила для полосы счётчиков: короткое, чтобы не рвало строку.
String variantTitle(String variant) => switch (variant) {
      'diagonal' => L.t('sdkRule_diagonal'),
      'antiknight' => L.t('sdkRule_antiknight'),
      'hyper' => L.t('sdkRule_hyper'),
      'nonconsec' => L.t('sdkRule_nonconsec'),
      'jigsaw' => L.t('sdkRule_jigsaw'),
      'antiking' => L.t('sdkRule_antiking'),
      'evenodd' => L.t('sdkRule_evenodd'),
      'kropki' => L.t('sdkRule_kropki'),
      'sandwich' => L.t('sdkRule_sandwich'),
      'thermo' => L.t('sdkRule_thermo'),
      'arrow' => L.t('sdkRule_arrow'),
      'thermocage' => L.t('sdkRule_thermocage'),
      'killer' => L.t('sdkRule_killer'),
      'unequal' => L.t('sdkRule_unequal'),
      'towers' => L.t('sdkRule_towers'),
      'thermoknight' => L.t('sdkRule_thermoknight'),
      'sandparity' => L.t('sdkRule_sandparity'),
      'killerdiag' => L.t('sdkRule_killerdiag'),
      'whisper' => L.t('sdkRule_whisper'),
      'renban' => L.t('sdkRule_renban'),
      'regionsum' => L.t('sdkRule_regionsum'),
      'palindrome' => L.t('sdkRule_palindrome'),
      'between' => L.t('sdkRule_between'),
      'lockout' => L.t('sdkRule_lockout'),
      'xv' => L.t('sdkRule_xv'),
      'argyle' => L.t('sdkRule_argyle'),
      'littlekiller' => L.t('sdkRule_littlekiller'),
      'xsums' => L.t('sdkRule_xsums'),
      'friends' => L.t('sdkRule_friends'),
      _ => L.t('sdkRule_none'),
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
        // Суммы сэндвича и X-суммы — одной формы ({rows, cols}) и одной вёрсткой: полосой над доской и
        // слева, как в вебе (`clueCols` 0,6 клетки). Ключ — с именем правила.
        final sw = g.sandwich ?? g.xsums;
        final swKey = g.sandwich != null ? 'sandwich' : 'xsums';
        final lk = g.littleKiller;
        // Малый киллер — кольцом сверху, слева и справа (стрелки смотрят только вниз): поле 0,75 клетки,
        // по ширине два поля. 0,6 не хватило: «24» со стрелкой вылезали на 9 px (проба 320 px).
        final cell = avail / (n + (sw != null ? 0.6 : 0) + (lk != null ? 1.5 : 0));
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
            // Диагонали, узор аргайла и доп. зоны «гипера» — цельными линиями поверх доски, как в вебе.
            if (const ['diagonal', 'killerdiag', 'hyper', 'argyle'].contains(board.variant))
              Positioned.fill(
                child: IgnorePointer(
                  child: CustomPaint(
                    key: Key(switch (board.variant) { 'hyper' => 'hyper-layer', 'argyle' => 'argyle-layer', _ => 'diagonal-layer' }),
                    painter: BoardLinesPainter(
                      diagonals: board.variant == 'diagonal' || board.variant == 'killerdiag',
                      hyper: board.variant == 'hyper',
                      argyle: board.variant == 'argyle',
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
            // XV — буквы на гранях, так же поверх клеток.
            if (g.xv != null)
              Positioned.fill(
                child: IgnorePointer(
                  child: CustomPaint(
                    key: const Key('xv-layer'),
                    painter: XvPainter(
                      marks: xvMarks(g.xv!, n, cell),
                      cell: cell,
                      surface: scheme.surface,
                      ink: scheme.onSurface,
                    ),
                  ),
                ),
              ),
          ]),
        );
        if (lk != null) {
          // Гнездо поля → подсказка; стрелка — значком, а не символом шрифта.
          final ring = cell * 0.75;
          final bySlot = {for (final k in lk) '${k.slot.side}${k.slot.i}': k};
          Widget lkClue(String side, int i, double w, double h) {
            final k = bySlot['$side$i'];
            return SizedBox(
              width: w,
              height: h,
              child: k == null
                  ? null
                  : Padding(
                      key: Key('lk-$side-$i'),
                      padding: const EdgeInsets.all(1),
                      // Двузначная сумма со стрелкой обязана влезть в узкое поле при любой ширине экрана.
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('${k.sum}',
                                style: TextStyle(fontSize: cell * 0.3, fontWeight: FontWeight.w700, color: scheme.onSurface)),
                            Icon(k.dc == 1 ? Icons.south_east : Icons.south_west, size: cell * 0.22, color: scheme.onSurfaceVariant),
                          ],
                        ),
                      ),
                    ),
            );
          }

          boardGrid = Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(mainAxisSize: MainAxisSize.min, children: [
                lkClue('top', -1, ring, ring),
                for (var col = 0; col < n; col++) lkClue('top', col, cell, ring),
                lkClue('top', n, ring, ring),
              ]),
              Row(mainAxisSize: MainAxisSize.min, children: [
                Column(children: [for (var r = 0; r < n; r++) lkClue('left', r, ring, cell)]),
                boardGrid,
                Column(children: [for (var r = 0; r < n; r++) lkClue('right', r, ring, cell)]),
              ]),
            ],
          );
        }
        if (sw != null) {
          boardGrid = Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(mainAxisSize: MainAxisSize.min, children: [
                SizedBox(width: gutter),
                for (var col = 0; col < n; col++) clue('$swKey-col-$col', sw.cols[col], cell, gutter),
              ]),
              Row(mainAxisSize: MainAxisSize.min, children: [
                Column(children: [
                  for (var r = 0; r < n; r++) clue('$swKey-row-$r', sw.rows[r], gutter, cell),
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
    this.why,
    required this.n,
    required this.won,
    required this.lost,
    required this.onDigit,
    required this.onErase,
    required this.onNext,
    this.nextLabel,
    this.onRepeat,
    required this.paint,
    required this.onPaint,
    this.label,
    this.icon,
    this.wonNote,
    this.boss,
    this.lostNote,
  });

  final int n;
  final bool won;
  final bool lost;
  final void Function(int) onDigit;
  final VoidCallback onErase;
  final VoidCallback onNext;
  final String? nextLabel;

  /// «Ещё раз эту же» — только у пилота и только после проигрыша: та же трудность,
  /// другая доска. `null` — кнопки нет (лестница, режимы, победа).
  final VoidCallback? onRepeat;

  /// Выбранный цвет: не `null` — вместо клавиш стоит палитра.
  final int? paint;
  final void Function(int) onPaint;

  /// Надписи клавиш — значками доски.
  final String Function(int)? label;

  /// Картинка клавиши (рисованные наборы); `null` — надпись.
  final Widget? Function(int)? icon;

  /// Строка над кнопкой после победы — спрятанное слово Wordoku.
  final String? wonNote;

  /// Итог боя с боссом (`null` — боя не было): строка «Босс повержен / устоял» в итоге.
  final bool? boss;

  /// Строка над кнопкой после провала — сколько ошибок позволяла ступень.
  final String? lostNote;

  /// Почему последняя цифра не подошла (строка над клавишами); null — строки нет.
  final String? why;

  @override
  Widget build(BuildContext context) {
    if (won || lost) {
      final next = FilledButton.icon(
        key: const Key('next'),
        onPressed: onNext,
        icon: Icon(won ? Icons.arrow_forward : Icons.refresh),
        label: Text(nextLabel ?? (won ? L.t('sdkNextLevel') : L.t('retry'))),
      );
      final repeat = onRepeat;
      final note = won ? wonNote : lostNote;
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
        child: note == null && boss == null
            ? body
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (note != null) ...[
                    Text(
                      note,
                      key: Key(won ? 'hidden-word' : 'lost-note'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (boss != null) ...[BossOutcomeLine(boss), const SizedBox(height: 8)],
                  body,
                ],
              ),
      );
    }
    final keys = SudokuKeys(
        n: n, onDigit: onDigit, onErase: onErase, paint: paint, onPaint: onPaint, label: label, icon: icon);
    final w = why;
    if (w == null) return keys;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 2),
        child: Text(
          w,
          key: const Key('sudoku-why'),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.error),
        ),
      ),
      keys,
    ]);
  }
}
