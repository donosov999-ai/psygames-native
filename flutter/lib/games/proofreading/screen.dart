/// «Корректура» — восемнадцатый, последний экран раздела «Конфликт внимания».
///
/// 🔴 ПОЛЕ ДОЛЖНО ВЛЕЗАТЬ ЦЕЛИКОМ. На верхних уровнях это 16×12 = 192 клетки, и
/// прокрутка тут не годится: корректурная проба меряет ОБХОД поля глазами, а
/// прокручиваемое поле превращает её в другую задачу — «успеть пролистать».
/// Поэтому размер клетки считается от высоты, которую дал каркас, и от ширины
/// экрана, а не задан числом.
///
/// ДВА ЗАДАНИЯ ПОД ОДНИМ game_type, как у веба: «буквы/цифры» (проба Бурдона) и ФИЛВОРДЫ
/// (задача caaa1596, на ядре «Слов» `games/fillwords/core`). Задача у них одна — сканирование
/// буквенного поля, разное только то, что считается целью; лестница, лимит и бухгалтерия
/// партии общие. ⚠️ В шаге зарядки (`wu=1`) филворды не запускаются — как у веба: у зарядки
/// свой сценарий и хронометраж (`fillwordsRound = !isPreset && …`).
///
/// 07.10.2026 — сверка с вебом по живому пути: письменность по языку и из адреса (`mode`) и
/// выбор её на настройке; шаг зарядки — размер из шага и без лимита времени; подсказка
/// (3 на партию); поля партии в `details`. До этого английский игрок видел кириллицу.
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_preset.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/hud_time.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/tap_latency.dart';
import '../fillwords/core/fillwords.dart';
import '../languages/lang_names.dart';
import 'fillwords_field.dart';
import 'fillwords_round.dart';
import 'model.dart';

enum ProofPhase { ready, playing, done }

/// Партия начинается сама: касания в нативный слой панель симулятора не доставляет.
///   flutter run --dart-define=AUTOSTART=true
const bool proofAutostart = bool.fromEnvironment('AUTOSTART');

/// Сколько держится вспышка ошибки, мс. Из веб-версии.
const int proofWrongFlashMs = 350;

/// Задания экрана — как у веба (`TaskMode`).
const String proofTaskLetters = 'letters';
const String proofTaskFillwords = 'fillwords';

/// «Показывать слова рядом с полем» — ключ веба (`СПИСОК_КЛЮЧ`). Это выбор ВИДА упражнения
/// (порождение против узнавания), а не тумблер удобства, поэтому он переживает выход.
const String proofWordListKey = 'psygames_fillwords_wordlist';

/// Подпись письменности на выборе — словом веба (`SCRIPTS[id].labelKey`, `scriptDigits`).
/// Ключи написаны целиком: составленный из кусков ключ сборщик словаря не находит.
String proofScriptLabel(String id) => switch (id) {
      'latin' => L.t('scriptLatin'),
      'cyrillic' => L.t('scriptCyrillic'),
      'greek' => L.t('scriptGreek'),
      'devanagari' => L.t('scriptDevanagari'),
      'hiragana' => L.t('scriptHiragana'),
      'hanzi' => L.t('scriptHanzi'),
      proofDigits => L.t('scriptDigits'),
      _ => id,
    };

class ProofreadingScreen extends StatefulWidget {
  const ProofreadingScreen({
    super.key,
    required this.state,
    this.script,
    this.digits = false,
    this.clock,
    this.rnd,
    this.fwSeed,
  });

  final SharedState state;

  /// Письменность поля. Не задана — из адреса (`mode`), а без него — по языку, как у веба.
  final String? script;

  /// Цифровое поле вместо письменности.
  final bool digits;
  final int Function()? clock;

  /// Розыгрыши партии. Не задан — настоящие; пробам нужен сид, иначе они плавают.
  final Random? rnd;

  /// Зерно поля филвордов. Не задано — случайное; пробам нужно своё.
  final int? fwSeed;

  @override
  State<ProofreadingScreen> createState() => _ProofreadingScreenState();
}

class _ProofreadingScreenState extends State<ProofreadingScreen> {
  late LevelLadder _ladder;
  ProofGame? _game;
  ProofPhase _phase = ProofPhase.ready;
  int? _wrongFlash;
  Timer? _tick;
  Timer? _flash;

  /// Письменность партии или [proofDigits]; выбирается на настройке.
  String _script = 'latin';

  /// Время сыгранной партии — замирает на итоге, а не растёт дальше в шапке.
  double _doneSec = 0;

  /// Задание: буквы или филворды.
  String _task = proofTaskLetters;

  /// Линия гнётся (змейка) или идёт прямо — ось сложности, а не украшение (веб: поиск путей
  /// без диагоналей меньше в 225 раз на слове из восьми букв).
  bool _diagonals = true;
  bool _showWords = false;
  int _fwSeed = 1;
  FillwordsPool? _pool;
  FillwordsStrings? _fwStrings;
  LangNames _langNames = LangNames.empty;

  /// Идущая партия филвордов; `null` — партия букв (или ещё не начата).
  FwRound? _fw;

  FillwordsPuzzle? _puzzle;
  String _puzzleKey = '';

  bool get _fwAvailable => isFillwordsLocale(L.locale);

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'proofreading', store: SharedLevelStore(widget.state), maxLevel: proofMaxLevel);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _flash?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    // Алфавиты — материал пробы, лежат ассетом: грузим до первой партии.
    await ProofScripts.load();
    await _ladder.load();
    // Подписи модуля филвордов — малый ассет; нужны уже настройке (имя задания, отказ).
    final strings = await loadFillwordsStrings(L.locale);
    if (!mounted) return;
    _fwStrings = strings;
    _showWords = widget.state.get(proofWordListKey) == '1';
    _fwSeed = widget.fwSeed ?? Random().nextInt(1000000000) + 1;
    _script = widget.digits
        ? proofDigits
        : (widget.script ??
            proofScriptFor(param: GamePreset.str('mode'), locale: L.locale, known: ProofScripts.current.byId.keys));
    // 🔴 Вид задания читается из адреса, а не только ставится кнопкой (веб `str('taskMode')`) —
    // там, где словарь есть. В шаге зарядки партия всё равно пойдёт буквами (см. шапку).
    if (GamePreset.str('taskMode', proofTaskLetters) == proofTaskFillwords && _fwAvailable) {
      _task = proofTaskFillwords;
      await _ensurePool();
      if (!mounted) return;
    }
    if (!_fwAvailable) {
      unawaited(LangNames.load().then((n) {
        if (mounted) setState(() => _langNames = n);
      }));
    }
    setState(_reset);
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (proofAutostart || GamePreset.autostart) _start();
  }

  /// Словарь языка — только когда нужны филворды: ~400 КБ разбора не на каждый вход.
  Future<void> _ensurePool() async {
    if (_pool != null || !_fwAvailable) return;
    final p = await loadWordPool(L.locale);
    if (!mounted) return;
    setState(() => _pool = p);
  }

  /// Поле филвордов этого уровня. Собирается заранее, на настройке: она показывает ЧИСЛО
  /// СЛОВ, а узнать его можно только собрав раскладку (веб, `fwPuzzle`).
  FillwordsPuzzle? get _fwPuzzle {
    final pool = _pool;
    if (pool == null) return null;
    final cfg = fillwordsLevel(_ladder.level);
    final key = '${_ladder.level}|$_fwSeed|$_diagonals|${pool.locale}';
    if (key != _puzzleKey) {
      _puzzle = generateFillwords(
        FillwordsRequest(
          rows: cfg.rows,
          cols: cfg.cols,
          locale: pool.locale,
          seed: _fwSeed,
          maxWordLen: cfg.maxWordLen,
          minWordLen: cfg.minWordLen,
          diagonals: _diagonals,
        ),
        pool,
      );
      _puzzleKey = key;
    }
    return _puzzle;
  }

  void _reset() {
    _tick?.cancel();
    _flash?.cancel();
    final preset = GamePreset.isPreset;
    _game = ProofGame(
      level: _ladder.level,
      script: _script == proofDigits ? 'latin' : _script,
      digits: _script == proofDigits,
      preset: preset,
      params: preset
          ? ProofLevel.preset(_ladder.level,
              wantRows: GamePreset.num('rows', 14), wantCols: GamePreset.num('cols', 12))
          : null,
      rnd: widget.rnd,
      nowMs: widget.clock,
    );
    _fw = null;
    _phase = ProofPhase.ready;
    _wrongFlash = null;
    _doneSec = 0;
  }

  /// Выбор письменности — только до начала партии.
  void _pickScript(String s) {
    if (_phase != ProofPhase.ready || s == _script) return;
    setState(() {
      _script = s;
      _reset();
    });
  }

  void _pickTask(String t) {
    if (_phase != ProofPhase.ready || t == _task) return;
    setState(() {
      _task = t;
      _reset();
    });
    if (t == proofTaskFillwords) unawaited(_ensurePool());
  }

  void _pickDiagonals(bool d) {
    if (_phase != ProofPhase.ready || d == _diagonals) return;
    setState(() => _diagonals = d);
  }

  void _pickShowWords(bool v) {
    setState(() => _showWords = v);
    unawaited(widget.state.set(proofWordListKey, v ? '1' : '0'));
  }

  void _start() {
    // Филворды — только в личной игре и только там, где собрано поле (веб, `startGame`).
    final puzzle = !GamePreset.isPreset && _task == proofTaskFillwords ? _fwPuzzle : null;
    if (puzzle != null) {
      final cfg = fillwordsLevel(_ladder.level);
      // Строгий порядок сдачи — только при показанном списке: требовать «следующее по
      // списку» у того, кто списка не видит, — угадайка, а не трудность.
      _fw = FwRound(
        level: _ladder.level,
        puzzle: puzzle,
        order: orderForGame(cfg.order, _showWords),
        hintsAllowed: cfg.hints,
        timeLimitSec: cfg.timeLimitSec,
        nowMs: widget.clock,
      )..begin();
    } else {
      _fw = null;
      _game!.begin();
    }
    setState(() {
      _phase = ProofPhase.playing;
      _wrongFlash = null;
    });
    // Часы партии тикают раз в секунду: на экране остаток времени (или прошедшее — у шага).
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _phase != ProofPhase.playing) return;
      final fw = _fw;
      if (fw != null ? fw.timeUp : _game!.timeUp) {
        if (fw != null) {
          fw.stopByTime();
        } else {
          _game!.stopByTime();
        }
        _finish();
        return;
      }
      setState(() {});
    });
  }

  void _tap(int index) {
    if (_phase != ProofPhase.playing) return;
    final g = _game!;
    final out = g.tap(index);
    if (out == ProofTap.ignored) return;
    setState(() {
      // Вспышка на ошибке — оформление, а не партия: гасится обычным таймером.
      _wrongFlash = out == ProofTap.wrong ? index : null;
    });
    if (out == ProofTap.wrong) {
      _flash?.cancel();
      _flash = Timer(const Duration(milliseconds: proofWrongFlashMs), () {
        if (!mounted) return;
        setState(() => _wrongFlash = null);
      });
    }
    if (g.finished) _finish();
  }

  /// Жест по полю филвордов: правило — в [FwRound], экран только перерисовывает и сдаёт.
  void _fwInput(FwOutcome Function(FwRound r) act) {
    final fw = _fw;
    if (fw == null || _phase != ProofPhase.playing) return;
    act(fw);
    setState(() {});
    if (fw.finished && fw.cleared) _finish();
  }

  void _hint() {
    if (_phase != ProofPhase.playing) return;
    final fw = _fw;
    final taken = fw != null ? fw.takeHintNow() : _game!.takeHint() != null;
    if (taken) setState(() {});
  }

  void _finish() {
    _tick?.cancel();
    _flash?.cancel();
    final fw = _fw;
    if (fw != null) {
      fw.finished = true;
      _doneSec = fw.finalSec;
      setState(() => _phase = ProofPhase.done);
      // Проход — поле разобрано ЦЕЛИКОМ: допуска «≥N %» у филвордов нет (веб `isCleared`).
      final details = fillwordsSessionDetails(fw, levelCondition: ProofLevel.of(fw.level).condition);
      final difficulty = '${fw.puzzle.rows}x${fw.puzzle.cols}';
      final mode = 'lvl${fw.level}';
      // Следующее поле — с новым зерном: повтор уровня той же раскладкой проверял бы память.
      _fwSeed = widget.fwSeed != null ? _fwSeed + 1 : Random().nextInt(1000000000) + 1;
      if (fw.cleared) {
        _ladder.win(
            score: fw.found,
            timeSeconds: _doneSec.round(),
            errors: fw.mistakes,
            difficulty: difficulty,
            mode: mode,
            details: details);
      } else {
        _ladder.fail(
            score: fw.found,
            timeSeconds: _doneSec.round(),
            errors: fw.mistakes,
            difficulty: difficulty,
            mode: mode,
            details: details);
      }
      return;
    }
    final g = _game!;
    _doneSec = g.finalSec;
    setState(() => _phase = ProofPhase.done);
    // Метки партии — как у веба: размер поля и уровень (у шага зарядки уровня нет).
    final difficulty = '${g.params.rows}x${g.params.cols}';
    final mode = g.preset ? null : 'lvl${g.level}';
    final details = proofSessionDetails(g);
    if (g.passed) {
      _ladder.win(
          score: g.found.length,
          timeSeconds: _doneSec.round(),
          errors: g.errors,
          difficulty: difficulty,
          mode: mode,
          details: details);
    } else {
      _ladder.fail(
          score: g.found.length,
          timeSeconds: _doneSec.round(),
          errors: g.errors,
          difficulty: difficulty,
          mode: mode,
          details: details);
    }
  }

  /// Примеры разбора: клетка С искомой буквой и клетка без неё.
  ///
  /// ⚠️ Буквы берутся из ЭТОЙ партии (`grid.targets` и её же алфавит), а не
  /// придуманные: на высоких уровнях целей две, и разбор с одной показывал бы
  /// задачу легче настоящей.
  List<DemoTrial> _demoTrials() {
    final g = _game;
    if (g == null) return const [];
    // 🔴 ДО НАЧАЛА ПАРТИИ ПОЛЯ ЕЩЁ НЕТ: `grid` заполняется в `begin()`, а разбор
    // нужен ИМЕННО ДО — объяснять правило после старта поздно, время уже идёт.
    // Поэтому, если поля нет, оно собирается тем же `buildGrid` и теми же
    // параметрами уровня: буквы будут настоящие, а не придуманные.
    final grid = g.grid.targets.isNotEmpty
        ? g.grid
        : buildGrid(
            rows: g.params.rows,
            cols: g.params.cols,
            alphabet: g.alphabet,
            rnd: Random(_ladder.level).nextDouble,
          );
    final targets = grid.targets;
    if (targets.isEmpty) return const [];
    final other = grid.letters.firstWhere(
      (l) => !targets.contains(l),
      orElse: () => '·',
    );
    final rule = '${L.t('proofreadingDesc')}: ${targets.join(', ')}';
    return [
      for (final t in targets)
        DemoTrial(text: t, answer: L.t('demoPress'), rule: rule),
      DemoTrial(text: other, answer: L.t('demoHold'), rule: rule),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final fw = _fw;
    // До начала часы не идут, на итоге — замирают: `elapsedSec` до `begin()` и после конца
    // считал бы от нуля эпохи или дальше.
    final elapsed = switch (_phase) {
      ProofPhase.ready => 0.0,
      ProofPhase.playing => fw?.elapsedSec ?? g.elapsedSec,
      ProofPhase.done => _doneSec,
    };
    // Разбор — про буквы: у филвордов он показал бы не то задание.
    final letters = _task == proofTaskLetters || GamePreset.isPreset;
    // На настройке шапка — про ВЫБРАННОЕ задание: иначе при филвордах она называла бы лимит и
    // цели букв, а строка уровня под ней — свои (замер кадром 07.10: «64» и «0/0» против «75 с»).
    final readyFw = _phase == ProofPhase.ready && !letters;
    final limit = fw?.timeLimitSec ?? (readyFw ? fillwordsLevel(_ladder.level).timeLimitSec : g.params.timeLimitSec);
    final left = (limit - elapsed).clamp(0, limit.toDouble());
    return GameShell(
      title: L.t('proofreading'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        // Шаг зарядки идёт без лимита — в шапке прошедшее время, как у веба.
        limit > 0
            ? HudItem(label: L.t('timeLeftLabel'), value: '${left.round()}', icon: Icons.timer_outlined)
            : HudItem(label: L.t('time'), value: hudTime(elapsed, L.t('secShort')), icon: Icons.timer_outlined),
        // У филвордов главный счётчик — СЛОВА (отчёт Дениса 23.08: «непонятно, сколько слов ждёт»).
        fw != null
            ? HudItem(label: L.t('label_words'), value: '${fw.found}/${fw.total}', icon: Icons.check)
            : readyFw
                ? HudItem(label: L.t('label_words'), value: '0/${_fwPuzzle?.words.length ?? 0}', icon: Icons.check)
                : HudItem(label: L.t('label_found'), value: '${g.found.length}/${g.grid.total}', icon: Icons.check),
        HudItem(label: L.t('hud_errors'), value: '${fw?.mistakes ?? g.errors}', icon: Icons.close),
      ],
      onLesson: !letters || _demoTrials().isEmpty
          ? null
          : () => openDemoLesson(context, title: L.t('proofreading'), trials: _demoTrials()),
      field: (context, h) => _phase == ProofPhase.playing && fw != null
          ? FwField(
              round: fw,
              showWords: _showWords,
              taskLine: _fwStrings?.task ?? '',
              height: h,
              onTouch: (c) => _fwInput((r) => r.touch(c)),
              onDrag: (c) => _fwInput((r) => r.drag(c)),
              onRelease: () => _fwInput((r) => r.release()),
            )
          : _Field(
              game: g,
              fw: fw,
              phase: _phase,
              wrongFlash: _wrongFlash,
              height: h,
              script: _script,
              setup: _SetupChoice(
                task: _task,
                fwAvailable: _fwAvailable,
                fwStrings: _fwStrings,
                fwPuzzle: _task == proofTaskFillwords ? _fwPuzzle : null,
                fwLevel: fillwordsLevel(_ladder.level),
                diagonals: _diagonals,
                showWords: _showWords,
                langNames: _langNames,
                onTask: _pickTask,
                onDiagonals: _pickDiagonals,
                onShowWords: _pickShowWords,
              ),
              onScript: _pickScript,
              onStart: _start,
              onAgain: () => setState(_reset),
              onTap: _tap,
            ),
      // Подсказка — служебное действие, значком под полем (у веба — в шапке, `GameAuxBar`).
      auxRow: _phase == ProofPhase.playing
          ? AuxBar(children: [
              fw != null
                  ? AuxAction(
                      key: const Key('proof-hint'),
                      icon: Icons.lightbulb_outline,
                      label: L.t('btn_hint'),
                      tint: const Color(0xFFB45309),
                      count: fw.hintsLeft,
                      onPressed: fw.hintsLeft > 0 && !fw.finished ? _hint : null,
                    )
                  : AuxAction(
                      key: const Key('proof-hint'),
                      icon: Icons.lightbulb_outline,
                      label: L.t('btn_hint'),
                      tint: const Color(0xFFB45309),
                      count: ProofGame.maxHints - g.hints,
                      onPressed: g.hints < ProofGame.maxHints && g.found.length < g.grid.total ? _hint : null,
                    ),
            ])
          : null,
    );
  }
}

/// Выбор задания и его настроек на экране настройки — одним пакетом, чтобы поле не тащило
/// десяток параметров по одному.
class _SetupChoice {
  const _SetupChoice({
    required this.task,
    required this.fwAvailable,
    required this.fwStrings,
    required this.fwPuzzle,
    required this.fwLevel,
    required this.diagonals,
    required this.showWords,
    required this.langNames,
    required this.onTask,
    required this.onDiagonals,
    required this.onShowWords,
  });

  final String task;
  final bool fwAvailable;
  final FillwordsStrings? fwStrings;

  /// Собранное поле филвордов — для строки уровня (число слов); `null` — словарь ещё грузится.
  final FillwordsPuzzle? fwPuzzle;
  final FillwordsLevelCfg fwLevel;
  final bool diagonals;
  final bool showWords;
  final LangNames langNames;
  final ValueChanged<String> onTask;
  final ValueChanged<bool> onDiagonals;
  final ValueChanged<bool> onShowWords;

  bool get fillwords => task == proofTaskFillwords;
}

class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.fw,
    required this.phase,
    required this.wrongFlash,
    required this.height,
    required this.script,
    required this.setup,
    required this.onScript,
    required this.onStart,
    required this.onAgain,
    required this.onTap,
  });

  final ProofGame game;

  /// Сыгранная партия филвордов — для итога; у букв `null`.
  final FwRound? fw;
  final ProofPhase phase;
  final int? wrongFlash;

  /// Высота поля приходит числом от каркаса — доска не считается от окна.
  final double height;
  final String script;
  final _SetupChoice setup;
  final ValueChanged<String> onScript;
  final VoidCallback onStart;
  final VoidCallback onAgain;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case ProofPhase.ready:
        return _ready(context);
      case ProofPhase.done:
        final f = fw;
        return _Centered(
          height: height,
          children: [
            Text(
              game.preset
                  ? L.t('done')
                  : ((f != null ? f.cleared : game.passed)
                      ? L.t('levelDone').replaceAll('{n}', '${f?.level ?? game.level}')
                      : L.t('sameLevelRetry')),
              key: const Key('proof-verdict'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            if (f != null)
              Text('${L.t('label_words')}: ${f.found}/${f.total} · ${L.t('hud_errors')}: ${f.mistakes}',
                  key: const Key('proof-fw-result'))
            else ...[
              Text('${L.t('label_found')}: ${game.found.length}/${game.grid.total} · '
                  '${L.t('hud_errors')}: ${game.errors}'),
              // Доля пропусков — мера раздела, показывается числом.
              Text('${L.t('hud_missed')}: ${game.omissionPct}%', key: const Key('proof-omission')),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: onAgain, child: Text(L.t('start'))),
          ],
        );
      case ProofPhase.playing:
        final g = game;
        // Две цели — над полем: их надо держать в голове всю партию.
        final targets = g.grid.targets.join('  ');
        return SizedBox(
          height: height,
          child: LayoutBuilder(
            builder: (context, box) {
              const headerH = 44.0;
              // 🔴 Клетка считается от МЕНЬШЕГО из двух: по ширине и по высоте.
              // Возьми только ширину — на верхних уровнях поле уедет за нижний
              // край, а прокрутка превратила бы пробу в «успеть пролистать».
              final byWidth = (box.maxWidth - 8) / g.params.cols;
              final byHeight = (box.maxHeight - headerH - 8) / g.params.rows;
              final cell = min(byWidth, byHeight).floorToDouble();
              return Column(
                children: [
                  SizedBox(
                    height: headerH,
                    child: Center(
                      child: Text(
                        '${L.t('find')}: $targets',
                        key: const Key('proof-targets'),
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: cell * g.params.cols,
                    height: cell * g.params.rows,
                    child: GridView.builder(
                      physics: const NeverScrollableScrollPhysics(),
                      padding: EdgeInsets.zero,
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: g.params.cols),
                      itemCount: g.grid.letters.length,
                      itemBuilder: (context, i) => _Cell(
                        letter: g.grid.letters[i],
                        index: i,
                        found: g.found.contains(i),
                        wrong: wrongFlash == i,
                        hinted: g.hintCell == i && !g.found.contains(i),
                        size: cell,
                        onTap: () => onTap(i),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        );
    }
  }

  Widget _ready(BuildContext context) {
    final p = game.params;
    final text = Theme.of(context).textTheme;
    final s = setup;
    final fws = s.fwStrings;
    // В шаге зарядки партия всегда буквами — и настройка показывает буквы.
    final fillwords = s.fillwords && !game.preset;
    Widget chips<T>(List<(T, String, String)> options, T value, ValueChanged<T> onPick) => Wrap(
          alignment: WrapAlignment.center,
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final (v, label, key) in options)
              ChoiceChip(key: Key(key), label: Text(label), selected: v == value, onSelected: (_) => onPick(v)),
          ],
        );
    final cfg = s.fwLevel;
    return SizedBox(
      height: height,
      child: Column(
        children: [
          Expanded(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('${L.t('level')} ${game.level}', style: text.titleLarge),
                    const SizedBox(height: 8),
                    Text(fillwords && fws != null ? fws.rules : L.t('proofreadingDesc'),
                        key: const Key('proof-rules'), textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    // Задание: искать знак (корректура) или слово (филворды).
                    if (fws != null && !game.preset) ...[
                      if (s.fwAvailable) ...[
                        Text(L.t('mode'), style: text.labelLarge),
                        const SizedBox(height: 6),
                        chips<String>([
                          (proofTaskLetters, L.t('proofreading'), 'proof-task-letters'),
                          (proofTaskFillwords, fws.modeName, 'proof-task-fillwords'),
                        ], s.task, s.onTask),
                      ] else
                        // 🔴 Честный отказ вместо пустого экрана: словаря на этом языке нет —
                        // пишем прямо, где режим уже работает.
                        Text(
                          interpolate(fws.noDictionary,
                              {'langs': fillwordsLocales.map(s.langNames.name).join(', ')}),
                          key: const Key('proof-fw-nodict'),
                          style: text.bodySmall,
                          textAlign: TextAlign.center,
                        ),
                      const SizedBox(height: 12),
                    ],
                    if (fillwords) ...[
                      // Как ведётся линия — виден только у филвордов: у букв линии нет вовсе.
                      Text(L.t('fwLineLabel'), style: text.labelLarge),
                      const SizedBox(height: 6),
                      chips<bool>([
                        (true, L.t('fwDiagonals'), 'proof-fw-diag'),
                        (false, L.t('fwStraight'), 'proof-fw-straight'),
                      ], s.diagonals, s.onDiagonals),
                      const SizedBox(height: 8),
                      // Список слов — ДРУГОЙ вид упражнения (узнавание вместо порождения),
                      // просьба Дениса 06.09.2026.
                      CheckboxListTile(
                        key: const Key('proof-fw-words'),
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        dense: true,
                        value: s.showWords,
                        onChanged: (v) => s.onShowWords(v ?? false),
                        title: Text(L.t('fwShowWords'), style: text.labelLarge),
                        subtitle: Text(L.t('fwShowWordsHint')),
                      ),
                    ] else ...[
                      // Письменность — выпадающим списком, как у веба (задача 6552ffb5: семь
                      // плашек вставали в четыре ряда).
                      Text(L.t('scriptLabel'), style: text.labelLarge),
                      DropdownButton<String>(
                        key: const Key('proof-script'),
                        value: script,
                        items: [
                          for (final id in [...ProofScripts.current.byId.keys, proofDigits])
                            DropdownMenuItem(value: id, key: Key('proof-script-$id'), child: Text(proofScriptLabel(id))),
                        ],
                        onChanged: (v) {
                          if (v != null) onScript(v);
                        },
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      fillwords
                          ? (s.fwPuzzle == null || fws == null
                              ? ''
                              : interpolate(fws.levelLine, {
                                  'rows': s.fwPuzzle!.rows,
                                  'cols': s.fwPuzzle!.cols,
                                  'words': s.fwPuzzle!.words.length,
                                  'sec': cfg.timeLimitSec,
                                }))
                          // У шага зарядки лимита нет — строка без него, а не «лимит 0 с».
                          : (p.timeLimitSec > 0
                              ? L.t('proofLvlParams')
                                  .replaceAll('{r}', '${p.rows}')
                                  .replaceAll('{c}', '${p.cols}')
                                  .replaceAll('{w}', '${p.timeLimitSec}')
                              : '${p.rows}×${p.cols}'),
                      key: const Key('proof-params'),
                      style: text.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                    if (!game.preset) ...[
                      const SizedBox(height: 6),
                      Text(
                          fillwords && fws != null
                              ? fws.pass
                              : L.t('proofPass').replaceAll('{p}', '${(p.minFoundPct * 100).round()}'),
                          style: text.bodySmall,
                          textAlign: TextAlign.center),
                    ],
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
            // Филворды ждут словаря: «Начать» раньше него дало бы буквы вместо слов.
            child: FilledButton(
                onPressed: fillwords && s.fwPuzzle == null ? null : onStart, child: Text(L.t('start'))),
          ),
        ],
      ),
    );
  }
}

/// Цвет подсказанной клетки — веба (`#fbbf24`): тот же, что у плиток задания в шапке.
const Color proofHintColor = Color(0xFFFBBF24);

class _Cell extends StatelessWidget {
  const _Cell({
    required this.letter,
    required this.index,
    required this.found,
    required this.wrong,
    required this.hinted,
    required this.size,
    required this.onTap,
  });

  final String letter;
  final int index;
  final bool found;
  final bool wrong;
  final bool hinted;
  final double size;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TapLatency(
        where: 'Flutter/Proofreading',
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            key: Key('proof-cell-$index'),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: found
                  ? const Color(0x3322C55E)
                  : (hinted ? proofHintColor : (wrong ? const Color(0x33EF4444) : Colors.transparent)),
              border: Border.all(width: 0.5, color: Theme.of(context).dividerColor),
            ),
            child: FittedBox(
              child: Padding(
                padding: const EdgeInsets.all(2),
                child: Text(
                  letter,
                  style: TextStyle(
                    fontWeight: found ? FontWeight.w900 : FontWeight.w500,
                    color: found ? const Color(0xFF22C55E) : (hinted ? Colors.black : null),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _Centered extends StatelessWidget {
  const _Centered({required this.height, required this.children});
  final double height;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: children),
          ),
        ),
      );
}
