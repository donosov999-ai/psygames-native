import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shell/game_preset.dart';
import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/preset_cap.dart';
import '../../shell/resume_store.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'duel.dart';
import 'model.dart';

/// «Парные картинки» на общем каркасе.
///
/// Партия уровня: карты показываются лицом вверх на время показа, закрываются, и
/// человек открывает их группами — пары, с L10 тройки, с L13 четвёрки. С L22 после
/// каждой ошибки закрытые карты меняются местами, пара за парой, и пара подсвечена
/// до обмена. Секундомер идёт только в самой партии: показ и обмены навязаны игрой.
///
/// СВОБОДНАЯ ПАРТИЯ (веб: режим `single`) — пары, число пар 6/8/10/12 и фото-показ
/// 0,5/1,5/3 с выбирает человек; лестница не двигается. Ею же играется шаг зарядки — как
/// в вебе. НЕЗАКОНЧЕННАЯ ПАРТИЯ пишется снимком в форме веб-сессии ([pairsSnapshot]) и
/// поднимается при входе: свернул приложение посреди расклада — расклад на месте.
///
/// ДУЭЛЬ (задача cd9685ec, механика MindLab Punchline) — пары по очереди с ботом, у которого
/// память на N последних карт ([PairsBotLevel]). Лестницу не двигает и снимком не пишется:
/// ход бота — часть партии, поднять его из снимка честно нельзя.
enum Phase { ready, preview, play, won, revealed }

/// Режим экрана: лестница уровней, свободная партия, дуэль с ботом или «Малыши» — движок
/// MindLab «Пары» ступенями 4 → 8 → 12 пар с оценкой против идеальной памяти ([pairsKidsSteps]).
enum PairsMode { levels, free, duel, kids }

/// Отложенная запись партии — как в вебе и у «Дворца памяти»: подряд идущие касания дают
/// ОДНУ запись, и пишется последнее состояние.
const pairsResumeDebounce = Duration(milliseconds: 400);

class PicturePairsScreen extends StatefulWidget {
  const PicturePairsScreen({super.key, required this.state, this.rnd, this.theme});

  final SharedState state;

  /// Только для проб: предсказуемая колода и броски обменов.
  final Random? rnd;

  /// Только для проб: набор картинок готовым, без чтения ассетов. Чтение через
  /// rootBundle — настоящая асинхронность, и в пробе её пришлось бы крутить
  /// `runAsync`, а он вешал прогон на картинках предыдущего теста (замер 30.09).
  final PairsTheme? theme;

  @override
  State<PicturePairsScreen> createState() => _PicturePairsScreenState();
}

/// Набор картинок и рубашка под профиль — из `assets/pairs/themes.json`, который
/// собирает `tools/embed-pairs.mjs` из веб-таблицы наборов.
class PairsTheme {
  const PairsTheme({required this.sprites, required this.back, required this.icon});
  final List<String> sprites;
  final Color back;
  final IconData icon;

  /// Значки рубашек веба (Ionicons) → ближайшие значки Material.
  static const _icons = <String, IconData>{
    'paw': Icons.pets,
    'trophy': Icons.emoji_events,
    'pulse': Icons.monitor_heart_outlined,
    'briefcase': Icons.work_outline,
    'car-sport': Icons.directions_car,
    'school': Icons.school_outlined,
    'earth': Icons.public,
    'flower': Icons.local_florist_outlined,
    'bulb': Icons.lightbulb_outline,
  };

  static Future<PairsTheme> load(String profile, {AssetBundle? bundle}) async {
    final raw = await (bundle ?? rootBundle).loadString('assets/pairs/themes.json');
    return fromJson(jsonDecode(raw) as Map<String, dynamic>, profile);
  }

  /// Набор по профилю из уже прочитанного `themes.json`.
  static PairsTheme fromJson(Map<String, dynamic> d, String profile) {
    final theme = (d['profiles'] as Map<String, dynamic>)[profile] as String? ?? d['fallback'] as String;
    final back = (d['backs'] as Map<String, dynamic>)[theme] as Map<String, dynamic>;
    final hex = (back['color'] as String).replaceFirst('#', '');
    return PairsTheme(
      sprites: ((d['sprites'] as Map<String, dynamic>)[theme] as List).cast<String>(),
      back: Color(int.parse('ff$hex', radix: 16)),
      icon: _icons[back['icon']] ?? Icons.help_outline,
    );
  }
}

class _PicturePairsScreenState extends State<PicturePairsScreen> with WidgetsBindingObserver {
  late LevelLadder _ladder;
  late final ResumeStore _resume = ResumeStore(widget.state, pairsGameId, pairsResumeVersion);
  GameTimer? _saveTimer;

  /// Свободная партия и её настройки (веб: `mode === 'single'`, `pairsCount`,
  /// `photoMemoryMode`, `previewMs`).
  bool _free = false;

  /// Дуэль с ботом: свой режим, пары и память бота выбирает человек.
  bool _duelMode = false;
  PairsBotLevel _botLevel = PairsBotLevel.kitten;
  PairsDuel? _duel;
  GameTimer? _botTimer;

  /// «Малыши»: ступень поля (индекс в [pairsKidsSteps]) и итог последней партии.
  bool _kidsMode = false;
  int _kidsStep = 0;
  int? _kidsStars;
  bool _kidsUp = false;

  /// Ступень «Малышей» хранится у профиля — как уровень лестницы.
  String get _kidsKey => 'psygames_picture_pairs_kids_step_${widget.state.activeProfile}';
  int _freePairs = 6;
  bool _photo = true;
  int _previewMs = 500;

  /// Секунды, набежавшие до подъёма партии из снимка: секундомер идёт поверх них.
  double _elapsedBase = 0;
  late Random _rnd;
  PairsTheme? _theme;
  PairsGame? _game;
  Phase _phase = Phase.ready;

  /// Поле заперто: идёт показ промаха, снятие группы или обмены.
  bool _locked = false;

  /// Пара, которая сейчас меняется местами.
  List<int>? _swapPair;
  Timer? _timer;
  final Stopwatch _clock = Stopwatch();
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _rnd = widget.rnd ?? Random();
    _ladder = LevelLadder(gameId: 'picture_pairs', store: SharedLevelStore(widget.state));
    WidgetsBinding.instance.addObserver(this);
    _boot();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _flush(); // экран сносят — дописать партию сразу, а не через задержку
    _timer?.cancel();
    _botTimer?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  /// Приложение свернули — ровно тот случай, ради которого запись и существует.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _flush();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final theme = widget.theme ?? await PairsTheme.load(widget.state.activeProfile);
    final kidsStep = int.tryParse(widget.state.get(_kidsKey) ?? '') ?? 0;
    _kidsStep = kidsStep.clamp(0, pairsKidsSteps.length - 1);
    // Шаг зарядки старую партию не поднимает: он сам начинает свежий раунд (как в вебе).
    final saved = GamePreset.autostart ? null : await _resume.load();
    if (!mounted) return;
    final live = pairsRestore(saved, rnd: _rnd);
    setState(() {
      _theme = theme;
      _reset();
      if (live != null) {
        _game = live.game;
        _free = live.free;
        if (live.free) _freePairs = live.game.groups;
        _elapsedBase = live.elapsed;
        _phase = Phase.play;
      }
    });
    if (live != null) {
      _startClock();
      return;
    }
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (GamePreset.autostart) _start();
  }

  void _reset() {
    _timer?.cancel();
    _botTimer?.cancel();
    _botTimer = null;
    _duel = null;
    _tick?.cancel();
    _tick = null;
    _clock
      ..stop()
      ..reset();
    _elapsedBase = 0;
    if (GamePreset.isPreset) {
      // Шаг зарядки — свободная партия по шагу (веб: режим single). Число пар — желание шага,
      // но не больше освоенного + 1 (`capPresetByLevel`); показ — из шага, по умолчанию 3 с.
      final level = _ladder.level;
      _free = true;
      _duelMode = false;
      _kidsMode = false;
      _photo = true;
      _freePairs = capPresetByLevel(
        want: GamePreset.num('pairsCount', 6),
        atLevel: LevelCfg.of(level).pairs,
        atTop: level >= 9,
      );
      _previewMs = GamePreset.num('previewMs', 3000);
    }
    _game = _free
        ? PairsGame(
            level: _ladder.level,
            cfg: pairsFreeCfg(pairs: _freePairs, photo: _photo, previewMs: _previewMs),
            rnd: _rnd,
          )
        : _duelMode
            // Дуэль — классические пары без показа: память набирается ходами обоих.
            ? PairsGame(level: _ladder.level, cfg: pairsFreeCfg(pairs: _freePairs, photo: false, previewMs: 0), rnd: _rnd)
            : _kidsMode
                // «Малыши» — как движок MindLab: пары без показа, поле по ступени.
                ? PairsGame(
                    level: _ladder.level,
                    cfg: pairsFreeCfg(pairs: pairsKidsSteps[_kidsStep], photo: false, previewMs: 0),
                    rnd: _rnd,
                  )
                : PairsGame(level: _ladder.level, rnd: _rnd);
    _kidsStars = null;
    _kidsUp = false;
    if (_duelMode) _duel = PairsDuel(game: _game!, bot: PairsBot(_botLevel, rnd: _rnd));
    _phase = Phase.ready;
    _locked = false;
    _swapPair = null;
  }

  PairsMode get _mode => _duelMode
      ? PairsMode.duel
      : _kidsMode
          ? PairsMode.kids
          : _free
              ? PairsMode.free
              : PairsMode.levels;

  void _setMode(PairsMode m) {
    _free = m == PairsMode.free;
    _duelMode = m == PairsMode.duel;
    _kidsMode = m == PairsMode.kids;
    _reset();
  }

  /// Секунды партии: набежавшие до подъёма из снимка плюс секундомер.
  double get _elapsed => _elapsedBase + _clock.elapsed.inMilliseconds / 1000;

  /// «Заново»: новая партия, недоигранная запись стирается (веб: startGame → clearResume).
  void _restart() {
    _saveTimer?.cancel();
    unawaited(_resume.clear());
    setState(_reset);
  }

  /// Партия изменилась — отложенная запись перезаводится. На игровых часах: на паузе
  /// запись ждёт, а уход в фон и снос экрана дописывают партию сразу.
  void _changed() {
    _saveTimer?.cancel();
    _saveTimer = gameTimeout(pairsResumeDebounce, _flush);
  }

  /// Записать живую партию. Не пишется: фото-показ (снимок поля лицом вверх был бы
  /// сохранённой шпаргалкой), итог, раскрытое решение и партия, где ещё ничего не сделано.
  void _flush() {
    _saveTimer?.cancel();
    _saveTimer = null;
    final g = _game;
    // Дуэль и «Малыши» — нативные режимы, у веб-снимка (PairsResume) для них нет формы.
    if (g == null || _phase != Phase.play || _duelMode || _kidsMode) return;
    if (g.moves == 0 && g.matchedGroups == 0 && g.errors == 0) return;
    // Счёт цепочки уровней копит веб; нативная партия считает уровень сама — 0.
    unawaited(_resume.save(pairsSnapshot(g, free: _free, score: 0, elapsed: _elapsed)));
  }

  void _startClock() {
    _clock.start();
    _tick ??= Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted) setState(() {});
    });
  }

  void _stopClock() {
    _clock.stop();
    _tick?.cancel();
    _tick = null;
  }

  /// Показ: все карты лицом вверх `previewMs`, потом партия. Без фото-показа (свободная
  /// партия с выключенным флажком) — сразу партия.
  void _start() {
    final g = _game!;
    // Новая партия заменяет незаконченную: прежний расклад продолжать уже нечем.
    _saveTimer?.cancel();
    unawaited(_resume.clear());
    if (!g.cfg.photo || g.cfg.previewMs <= 0) {
      setState(() => _phase = Phase.play);
      _startClock();
      return;
    }
    setState(() => _phase = Phase.preview);
    _timer = Timer(Duration(milliseconds: g.cfg.previewMs), () {
      if (!mounted) return;
      setState(() => _phase = Phase.play);
      _startClock();
    });
  }

  void _tap(int i) {
    final g = _game!;
    if (_phase != Phase.play || _locked) return;
    final duel = _duel;
    if (duel != null) {
      _duelTap(duel, i);
      return;
    }
    final r = g.tap(i);
    if (r == TapResult.ignored) return;
    setState(() {});
    _changed();
    if (r == TapResult.groupMatched) {
      _locked = true;
      _timer = Timer(const Duration(milliseconds: 400), () {
        if (!mounted) return;
        setState(() {
          g.settleMatch();
          _locked = false;
        });
        if (g.isWon) {
          _win();
        } else {
          _changed();
        }
      });
    } else if (r == TapResult.groupMissed) {
      _locked = true;
      _timer = Timer(const Duration(milliseconds: 800), () {
        if (!mounted) return;
        setState(g.settleMiss);
        final swaps = swapsAfterMiss(g.cfg.swapsPerMiss, _rnd.nextDouble);
        if (swaps > 0) {
          _runSwaps(swaps);
        } else {
          setState(() => _locked = false);
        }
      });
    }
  }

  /// Обмены после ошибки: пара закрытых карт подсвечена `swapLitMs`, потом меняется
  /// местами, пауза `swapGapMs` — следующая. Поле заперто, секундомер стоит: это
  /// время навязано игрой и в счёт не идёт.
  void _runSwaps(int count) {
    final g = _game!;
    _clock.stop();
    void step(int left) {
      if (!mounted) return;
      final closed = g.closed;
      if (left <= 0 || closed.length < 2) {
        setState(() {
          _swapPair = null;
          _locked = false;
        });
        _clock.start();
        return;
      }
      final a = closed[_rnd.nextInt(closed.length)];
      final rest = closed.where((c) => c != a).toList();
      final b = rest[_rnd.nextInt(rest.length)];
      setState(() => _swapPair = [a, b]);
      _timer = Timer(const Duration(milliseconds: swapLitMs), () {
        if (!mounted) return;
        setState(() {
          g.swap(a, b);
          _swapPair = null;
        });
        _changed();
        _timer = Timer(const Duration(milliseconds: swapGapMs), () => step(left - 1));
      });
    }

    _timer = Timer(const Duration(milliseconds: swapGapMs), () => step(count));
  }

  /// Ход игрока в дуэли. Пока ходит бот, поле заперто.
  void _duelTap(PairsDuel duel, int i) {
    if (duel.botTurn) return;
    final r = duel.tap(i);
    if (r == TapResult.ignored) return;
    setState(() {});
    if (r != TapResult.opened) _afterDuelMove(duel, r);
  }

  /// Группа набрана — показать её и решить, кто ходит дальше. На игровых часах: на паузе
  /// бот не ходит.
  void _afterDuelMove(PairsDuel duel, TapResult r) {
    _locked = true;
    _botTimer = gameTimeout(Duration(milliseconds: r == TapResult.groupMatched ? 400 : 800), () {
      if (!mounted) return;
      setState(() => duel.settle(r));
      if (duel.over) {
        _winDuel(duel);
      } else if (duel.botTurn) {
        _botMove(duel);
      } else {
        setState(() => _locked = false);
      }
    });
  }

  /// Ход бота: карты по одной, с паузой — человек успевает увидеть каждую.
  void _botMove(PairsDuel duel) {
    void pick() {
      if (!mounted) return;
      final g = duel.game;
      late TapResult r;
      setState(() => r = duel.tap(g.open.isEmpty ? duel.bot.firstPick(g) : duel.bot.nextPick(g)));
      if (r == TapResult.opened) {
        _botTimer = gameTimeout(const Duration(milliseconds: pairsBotStepMs), pick);
      } else {
        _afterDuelMove(duel, r);
      }
    }

    _botTimer = gameTimeout(const Duration(milliseconds: pairsBotStepMs), pick);
  }

  /// Дуэль кончилась: итог по числу пар, лестница не двигается.
  void _winDuel(PairsDuel duel) {
    final g = duel.game;
    _stopClock();
    setState(() {
      _phase = Phase.won;
      _locked = false;
    });
    unawaited(
      SessionReport.send(
        gameType: 'picture_pairs',
        score: duel.playerGroups,
        timeSeconds: _elapsed.round(),
        difficulty: '${g.groups} pairs',
        mode: 'duel-${duel.bot.level.name}',
        errors: duel.playerMisses,
        details: {
          'pairs': g.groups,
          'player_pairs': duel.playerGroups,
          'bot_pairs': duel.botGroups,
          'bot': duel.bot.level.name,
          'bot_memory': duel.bot.level.memory ?? g.cards.length,
          'outcome': duel.outcome,
          'perseverations': duel.playerPerseverations,
        },
      ),
    );
  }

  void _win() {
    final g = _game!;
    _stopClock();
    final elapsed = _elapsed;
    final seconds = elapsed.round();
    // Партия доиграна — незаконченной больше нет, иначе «Продолжить» звало бы на разобранный расклад.
    _saveTimer?.cancel();
    unawaited(_resume.clear());
    setState(() => _phase = Phase.won);
    if (_kidsMode) {
      _winKids(g, seconds);
      return;
    }
    if (_free) {
      // Свободная партия лестницу не двигает — отчёт идёт сам, метками веба (`saveSession`, single).
      unawaited(
        SessionReport.send(
          gameType: 'picture_pairs',
          score: g.freeScore(elapsed),
          timeSeconds: seconds,
          difficulty: '${g.groups} pairs',
          mode: g.cfg.photo ? 'photo-${g.cfg.previewMs}ms' : 'classic',
          errors: g.errors,
          details: {
            'moves': g.moves,
            'optimal': g.groups,
            'photo_memory_mode': g.cfg.photo,
            'preview_ms': g.cfg.photo ? g.cfg.previewMs : 0,
            'extra_moves': g.extraMoves,
            ..._memoryDetails(g),
          },
        ),
      );
      return;
    }
    // Метки уровня — как веб `advanceLevel`: lvl<N>, game и details уровня.
    _ladder.win(
      score: g.score(seconds),
      timeSeconds: seconds,
      errors: g.errors,
      mode: 'game',
      difficulty: 'lvl${g.level}',
      details: {'level': g.level, 'moves': g.moves, 'pairs': g.groups, 'photo_memory_mode': g.cfg.photo, ..._memoryDetails(g)},
    );
  }

  /// «Малыши»: звёзды по эффективности, ступень — вперёд с двух звёзд. Лестницу не двигает.
  void _winKids(PairsGame g, int seconds) {
    final played = _kidsStep;
    final stars = pairsKidsStars(g.efficiency);
    final next = pairsKidsNextStep(played, stars);
    setState(() {
      _kidsStars = stars;
      _kidsUp = next > played;
      _kidsStep = next;
    });
    unawaited(widget.state.set(_kidsKey, '$next'));
    unawaited(
      SessionReport.send(
        gameType: 'picture_pairs',
        score: stars,
        timeSeconds: seconds,
        difficulty: '${g.groups} pairs',
        mode: 'kids',
        errors: g.errors,
        details: {'step': played + 1, 'pairs': g.groups, 'moves': g.moves, 'stars': stars, ..._memoryDetails(g)},
      ),
    );
  }

  /// Метрики памяти MindLab (задача cd9685ec) — только нативные: веб их не считает.
  /// `ideal_moves` — ходы идеальной памяти на этом раскладе, `efficiency` — они же на ходы
  /// игрока, `perseverations` — ходы, повторившие промах, известный заранее.
  Map<String, Object> _memoryDetails(PairsGame g) => {
        'ideal_moves': g.idealMoves,
        'efficiency': double.parse(g.efficiency.toStringAsFixed(2)),
        'perseverations': g.perseverations,
      };

  /// Показать решение: все карты лицом вверх, партия кончается без зачёта —
  /// подсмотренный расклад не поднимает уровень и не опускает его.
  void _reveal() {
    _timer?.cancel();
    _botTimer?.cancel();
    _stopClock();
    // Раскрытая партия кончилась без зачёта — продолжать в ней нечего.
    _saveTimer?.cancel();
    unawaited(_resume.clear());
    setState(() {
      _phase = Phase.revealed;
      _swapPair = null;
      _locked = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    final theme = _theme;
    if (g == null || theme == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final duel = _duel;
    return GameShell(
      title: L.t('picturePairs'),
      onLesson: () => openDemoLesson(context, title: L.t('picturePairs'), trials: pairsLessonTrials(theme)),
      hud: [
        // В свободной партии и дуэли уровня нет — тропинку и рекорд уровня не показываем (как веб).
        if (_mode == PairsMode.levels) HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        if (_mode == PairsMode.levels)
          HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        if (duel != null) ...[
          // Счёт дуэли — пары каждой стороны; ходы общие и в шапке ничего бы не значили.
          HudItem(label: L.t('pairsDuelYou'), value: '${duel.playerGroups}', icon: Icons.person_outline),
          HudItem(label: L.t('rbBot'), value: '${duel.botGroups}', icon: Icons.smart_toy_outlined),
        ] else ...[
          HudItem(label: L.t('hud_correct'), value: '${g.matchedGroups}/${g.groups}', icon: Icons.done_all),
          HudItem(label: L.t('hud_moves'), value: '${g.moves}', icon: Icons.swap_horiz),
        ],
        // У «Малышей» часов нет — как в движке MindLab: оценка по ходам, а не по времени.
        if (!_kidsMode) HudItem(label: L.t('time'), value: '${_elapsed.floor()}', icon: Icons.timer_outlined),
      ],
      field: (context, h) => _phase == Phase.ready
          ? _Ready(
              level: _ladder.level,
              mode: _mode,
              bot: _botLevel,
              kidsStep: _kidsStep,
              pairs: _freePairs,
              photo: _photo,
              previewMs: _previewMs,
              onMode: (m) => setState(() => _setMode(m)),
              onBot: (b) => setState(() {
                _botLevel = b;
                _reset();
              }),
              onPairs: (n) => setState(() {
                _freePairs = n;
                _reset();
              }),
              onPhoto: (v) => setState(() {
                _photo = v;
                _reset();
              }),
              onPreview: (ms) => setState(() {
                _previewMs = ms;
                _reset();
              }),
              onStart: _start,
            )
          : _Field(
              game: g,
              theme: theme,
              phase: _phase,
              swapPair: _swapPair,
              height: h,
              onTap: _tap,
              // Чей ход — главное, что нужно знать в дуэли.
              caption: duel == null || _phase != Phase.play
                  ? null
                  : duel.botTurn
                      ? L.t('pairsDuelBotTurn')
                      : L.t('pairsDuelYourTurn'),
            ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _restart),
        AuxAction(
          icon: Icons.visibility_outlined,
          label: L.t('puzzleShowSolution'),
          tint: const Color(0xFFB45309),
          onPressed: _phase == Phase.play && !_locked ? _reveal : null,
        ),
      ]),
      toolbar: _phase == Phase.won || _phase == Phase.revealed
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Дуэль — счёт сторон; одиночная партия — сравнение с идеальной памятью на том
                  // же раскладе (MindLab, cd9685ec).
                  if (_phase == Phase.won && duel != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        // Каждый ключ — отдельным L.t('…'): embed-l10n и гейт словаря видят только такие.
                        switch (duel.outcome) {
                          > 0 => L.t('pairsDuelWin'),
                          < 0 => L.t('pairsDuelLose'),
                          _ => L.t('pairsDuelDraw'),
                        }
                            .replaceAll('{you}', '${duel.playerGroups}')
                            .replaceAll('{bot}', '${duel.botGroups}'),
                        key: const Key('pp-duel-result'),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    )
                  else if (_phase == Phase.won) ...[
                    if (_kidsStars != null)
                      Semantics(
                        label: L.t('pairsKidsStars').replaceAll('{n}', '${_kidsStars!}'),
                        excludeSemantics: true,
                        child: Text(
                          '${'★' * _kidsStars!}${'☆' * (3 - _kidsStars!)}',
                          key: const Key('pp-kids-stars'),
                          style: const TextStyle(fontSize: 32, color: Color(0xFFF59E0B)),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        L.t('pairsIdealMoves').replaceAll('{n}', '${g.idealMoves}'),
                        key: const Key('pp-ideal'),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    if (_kidsUp)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          L.t('pairsKidsUp').replaceAll('{p}', '${pairsKidsSteps[_kidsStep]}'),
                          key: const Key('pp-kids-up'),
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                  ],
                  FilledButton.icon(
                    onPressed: _restart,
                    icon: const Icon(Icons.arrow_forward),
                    label: Text(_phase == Phase.won ? L.t('nextLabel') : L.t('retry')),
                  ),
                ],
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
      ],
    );
  }
}

/// Экран перед партией: выбор «уровни / свободно», затем уровень с его правилом или
/// настройки свободной партии, и старт.
///
/// ⚠️ Пока у каркаса нет общей карточки правил (задача e371fd3a), правило уровня
/// объявляется здесь, до показа карт — иначе тройки, четвёрки и обмены включались бы
/// молча. Ключи написаны целиком, а не собраны из имени: `embed-l10n` вырезает из
/// словаря только ключи, которые видит в исходнике.
class _Ready extends StatelessWidget {
  const _Ready({
    required this.level,
    required this.mode,
    required this.bot,
    required this.kidsStep,
    required this.pairs,
    required this.photo,
    required this.previewMs,
    required this.onMode,
    required this.onBot,
    required this.onPairs,
    required this.onPhoto,
    required this.onPreview,
    required this.onStart,
  });
  final int level;
  final PairsMode mode;
  final PairsBotLevel bot;
  final int kidsStep;
  final int pairs;
  final bool photo;
  final int previewMs;
  final ValueChanged<PairsMode> onMode;
  final ValueChanged<PairsBotLevel> onBot;
  final ValueChanged<int> onPairs;
  final ValueChanged<bool> onPhoto;
  final ValueChanged<int> onPreview;
  final VoidCallback onStart;

  static (String, String)? _rule(int level) => switch (LevelCfg.ruleAt(level)) {
        'triple' => (L.t('lr_picture_pairs_triple_title'), L.t('lr_picture_pairs_triple_rule')),
        'quad' => (L.t('lr_picture_pairs_quad_title'), L.t('lr_picture_pairs_quad_rule')),
        'swap' => (L.t('lr_picture_pairs_swap_title'), L.t('lr_picture_pairs_swap_rule')),
        _ => null,
      };

  /// Секунды показа, как в вебе: «0.5», «1.5», «3» — без хвоста «.0».
  static String _secs(int ms) => ms % 1000 == 0 ? '${ms ~/ 1000}' : '${ms / 1000}';

  /// Имя бота. Ключи написаны целиком: `embed-l10n` берёт в словарь только ключи из исходника.
  static String _botName(PairsBotLevel b) => switch (b) {
        PairsBotLevel.kitten => L.t('pairsBotKitten'),
        PairsBotLevel.fox => L.t('pairsBotFox'),
        // Ключи-близнецы не заводим (гейт dictionary-duplicates): «Сова» и «Бот» в словаре уже есть.
        PairsBotLevel.owl => L.t('cosName_avatar_owl'),
      };

  Widget _pairsChips() => Wrap(
        spacing: 8,
        alignment: WrapAlignment.center,
        children: [
          for (final n in pairsFreeCounts)
            ChoiceChip(
              key: Key('pp-pairs-$n'),
              label: Text('$n'),
              selected: n == pairs,
              onSelected: (_) => onPairs(n),
            ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final rule = _rule(level);
    final cfg = LevelCfg.of(level);
    // «Начать» прибита под настройками и видна без прокрутки — как полоса старта в вебе
    // (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»); прокручиваются только
    // настройки. На 360×640 с правилом уровня кнопка иначе уезжала за край.
    return Column(
      children: [
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Выбор режима — те же подписи, что у общего веб-переключателя (GameModeSwitch).
                  // Четыре режима — фишками с переносом: в один сегментный ряд на 360 они не влезают.
                  Wrap(
                    key: const Key('pp-mode'),
                    spacing: 8,
                    runSpacing: 4,
                    alignment: WrapAlignment.center,
                    children: [
                      for (final (m, label) in [
                        (PairsMode.levels, L.t('sudokuModeLevels')),
                        (PairsMode.free, L.t('sudokuModeFree')),
                        (PairsMode.duel, L.t('pairsModeDuel')),
                        (PairsMode.kids, L.t('pairsModeKids')),
                      ])
                        ChoiceChip(
                          key: Key('pp-mode-${m.name}'),
                          label: Text(label),
                          selected: m == mode,
                          showCheckmark: false,
                          onSelected: (_) => onMode(m),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    // Ключ — литералом в L.t('…'): ключ внутри тернарника или switch сборщик
                    // словаря не видит, и экран показал бы сам ключ (так было до 01.10).
                    switch (mode) {
                      PairsMode.levels => L.t('pairsModeLevelsHint'),
                      PairsMode.free => L.t('pairsModeFreeHint'),
                      PairsMode.duel => L.t('pairsDuelHint'),
                      PairsMode.kids => L.t('pairsKidsHint'),
                    },
                    textAlign: TextAlign.center,
                    style: text.bodySmall,
                  ),
                  const SizedBox(height: 16),
                  if (mode == PairsMode.kids) ...[
                    Text(
                      L.t('pairsKidsStep')
                          .replaceAll('{n}', '${kidsStep + 1}')
                          .replaceAll('{m}', '${pairsKidsSteps.length}')
                          .replaceAll('{p}', '${pairsKidsSteps[kidsStep]}'),
                      key: const Key('pp-kids-step'),
                      textAlign: TextAlign.center,
                      style: text.titleMedium,
                    ),
                    const SizedBox(height: 16),
                  ] else if (mode == PairsMode.duel) ...[
                    Text(L.t('pairsCount'), style: text.titleSmall),
                    const SizedBox(height: 6),
                    _pairsChips(),
                    const SizedBox(height: 12),
                    Text(L.t('pairsBotMemory'), style: text.titleSmall),
                    const SizedBox(height: 6),
                    SegmentedButton<PairsBotLevel>(
                      key: const Key('pp-bot'),
                      segments: [
                        for (final b in PairsBotLevel.values)
                          ButtonSegment(value: b, label: Text(_botName(b), key: Key('pp-bot-${b.name}'))),
                      ],
                      selected: {bot},
                      showSelectedIcon: false,
                      onSelectionChanged: (v) => onBot(v.first),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      bot.memory == null
                          ? L.t('pairsBotRemembersAll')
                          : L.t('pairsBotRemembersN').replaceAll('{n}', '${bot.memory}'),
                      key: const Key('pp-bot-memory'),
                      textAlign: TextAlign.center,
                      style: text.bodySmall,
                    ),
                    const SizedBox(height: 16),
                  ] else if (mode == PairsMode.levels) ...[
                    Text(
                      '${L.t('pairsLvlPairs').replaceAll('{n}', '${cfg.pairs}')} · '
                      '${L.t('pairsLvlFlash').replaceAll('{s}', (cfg.previewMs / 1000).toStringAsFixed(1))}',
                      key: const Key('pp-level-params'),
                      textAlign: TextAlign.center,
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 12),
                    if (rule != null) ...[
                      Text(rule.$1, key: const Key('правило'), textAlign: TextAlign.center, style: text.titleMedium),
                      const SizedBox(height: 6),
                      Text(rule.$2, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                    ],
                  ] else ...[
                    Text(L.t('pairsCount'), style: text.titleSmall),
                    const SizedBox(height: 6),
                    _pairsChips(),
                    const SizedBox(height: 8),
                    CheckboxListTile(
                      key: const Key('pp-photo'),
                      contentPadding: EdgeInsets.zero,
                      value: photo,
                      onChanged: (v) => onPhoto(v ?? true),
                      title: Text(L.t('label_photo_memory')),
                      subtitle: Text(L.t('desc_photo_memory'), style: text.bodySmall),
                    ),
                    if (photo)
                      Wrap(
                        spacing: 8,
                        alignment: WrapAlignment.center,
                        children: [
                          for (final ms in pairsFreePreviewMs)
                            ChoiceChip(
                              key: Key('pp-preview-$ms'),
                              // Секунды + готовая тройка «Легко/Средне/Сложно» из словаря, как в вебе.
                              label: Text(
                                '${_secs(ms)}${L.t('secShort')} '
                                '(${ms == 500
                                    ? L.t('hard')
                                    : ms == 1500
                                    ? L.t('medium')
                                    : L.t('easy')})',
                              ),
                              selected: ms == previewMs,
                              onSelected: (_) => onPreview(ms),
                            ),
                        ],
                      ),
                    const SizedBox(height: 16),
                  ],
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
          child: FilledButton(key: const Key('pp-start'), onPressed: onStart, child: Text(L.t('start'))),
        ),
      ],
    );
  }
}

/// Поле: сетка карт, размер — от поля каркаса (см. [pairsGrid]).
class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.theme,
    required this.phase,
    required this.swapPair,
    required this.height,
    required this.onTap,
    this.caption,
  });

  /// Подпись под полем вместо обычной — в дуэли это чей ход.
  final String? caption;

  final PairsGame game;
  final PairsTheme theme;
  final Phase phase;
  final List<int>? swapPair;
  final double height;
  final void Function(int) onTap;

  static const _hint = 40.0;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final grid = pairsGrid(
        groups: game.groups,
        cards: game.cards.length,
        containerWidth: min(c.maxWidth - 32, 480),
        fieldHeight: height,
        bottomReserve: 8,
        hint: _hint,
      );
      final board = SizedBox(
        width: grid.width,
        child: Wrap(
          spacing: pairsCardGap,
          runSpacing: pairsCardGap,
          children: [
            for (var i = 0; i < game.cards.length; i++)
              PairCardView(
                index: i,
                card: game.cards[i],
                size: grid.card,
                theme: theme,
                faceUp: phase == Phase.preview || phase == Phase.revealed || game.cards[i].flipped || game.cards[i].matched,
                lit: swapPair?.contains(i) ?? false,
                onTap: phase == Phase.play ? () => onTap(i) : null,
              ),
          ],
        ),
      );
      final caption = this.caption ?? (phase == Phase.preview ? L.t('label_memorize') : L.t('picturePairsHint'));
      final column = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          board,
          SizedBox(
            height: _hint,
            child: Center(
              child: Text(caption, key: const Key('pp-caption'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            ),
          ),
        ],
      );
      // На малых окнах при пальце 48 карты выше поля не помещаются — поле прокручивается,
      // а не сжимает карты мельче пальца.
      return Center(
        child: grid.fits ? column : SingleChildScrollView(key: const Key('поле-прокрутка'), child: column),
      );
    });
  }
}

/// Карта поля — ОДНА для партии и для разбора. Разбор, нарисованный «похоже», учил
/// бы не той игре: здесь и картинка, и рубашка, и подсветка обмена — те же.
class PairCardView extends StatelessWidget {
  const PairCardView({
    super.key,
    required this.index,
    required this.card,
    required this.size,
    required this.theme,
    required this.faceUp,
    required this.lit,
    required this.onTap,
    this.marked = false,
    this.keyPrefix = '',
  });

  final int index;
  final PairCard card;
  final double size;
  final PairsTheme theme;
  final bool faceUp;
  final bool lit;
  final VoidCallback? onTap;

  /// Разбор выделяет карты ответа рамкой.
  final bool marked;

  /// У карт разбора свои ключи: разбор открывается поверх партии, и пробе нужно
  /// различать, чью карту она читает. Префикс латиницей: русский литерал вне Key('…')
  /// гейт ui_text_debt считает зашитым текстом интерфейса.
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final Widget face = faceUp
        ? Container(
            key: Key('$keyPrefixлицо$index'),
            decoration: BoxDecoration(
              color: card.matched ? const Color(0xFF22C55E) : scheme.surface,
              border: marked ? Border.all(color: scheme.primary, width: 4) : null,
              borderRadius: BorderRadius.circular(10),
            ),
            padding: EdgeInsets.all(size * 0.09),
            child: Image.asset(theme.sprites[card.symbol], fit: BoxFit.contain),
          )
        : Container(
            key: lit ? Key('$keyPrefixобмен$index') : null,
            decoration: BoxDecoration(
              color: theme.back,
              borderRadius: BorderRadius.circular(10),
              // Подсвеченная пара: толстая рамка и значок обмена — одной рамки на
              // девяти цветах рубашек мало.
              border: Border.all(color: lit ? const Color(0xFFFDE047) : Colors.white24, width: lit ? 4 : 1),
            ),
            child: Icon(lit ? Icons.swap_horiz : theme.icon, color: Colors.white70, size: size * (lit ? 0.42 : 0.32)),
          );
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        borderRadius: BorderRadius.circular(10),
        clipBehavior: Clip.antiAlias,
        child: InkWell(key: Key('$keyPrefixкарта$index'), onTap: onTap, child: face),
      ),
    );
  }
}

/// Доска разбора: карты той же игры, в той же раскладке.
class PairsLessonArt extends StatelessWidget {
  const PairsLessonArt({
    super.key,
    required this.game,
    required this.theme,
    this.marked = const [],
    this.swapPair,
  });

  /// Партия, из которой взят пример: её колода и уровень.
  final PairsGame game;
  final PairsTheme theme;

  /// Карты ответа — места одной группы.
  final List<int> marked;

  /// Пара, которая меняется местами: тогда карты лежат рубашкой вверх.
  final List<int>? swapPair;

  @override
  Widget build(BuildContext context) {
    const cols = 4;
    const side = 52.0;
    return SizedBox(
      width: cols * side + (cols - 1) * pairsCardGap,
      child: Wrap(
        spacing: pairsCardGap,
        runSpacing: pairsCardGap,
        children: [
          for (var i = 0; i < game.cards.length; i++)
            PairCardView(
              index: i,
              card: game.cards[i],
              size: side,
              theme: theme,
              faceUp: swapPair == null,
              lit: swapPair?.contains(i) ?? false,
              marked: marked.contains(i),
              onTap: null,
              keyPrefix: 'lesson-',
            ),
        ],
      ),
    );
  }
}

/// Примеры разбора — ИЗ ГЕНЕРАТОРА САМОЙ ИГРЫ: колоды тянет `PairsGame`, уровень задаёт
/// размер группы, обмены — ось с L22 (`pairsVolumeTop`).
///
/// Три приёма, и каждый про то, на чём здесь ошибаются:
/// · места, а не картинки — на показе картинка привязывается к месту (L1, пары);
/// · группа целиком — у троек и четвёрок держать ВСЕ места одной картинки (L10);
/// · обмен — подсвеченная пара переехала, перенести картинку в памяти (с L22).
List<DemoTrial> pairsLessonTrials(PairsTheme theme, {Random? rnd}) {
  final r = rnd ?? Random(930);
  final pairs = PairsGame(level: 1, rnd: r);
  final triples = PairsGame(level: 10, rnd: r);
  List<int> placesOf(PairsGame g, int symbol) =>
      [for (var i = 0; i < g.cards.length; i++) if (g.cards[i].symbol == symbol) i];
  final closed = [for (var i = 0; i < pairs.cards.length; i++) i];
  final a = closed[r.nextInt(closed.length)];
  final rest = closed.where((c) => c != a).toList();
  final b = rest[r.nextInt(rest.length)];
  return [
    DemoTrial(
      text: '',
      rule: L.t('teachPicturePairsPlaces'),
      art: PairsLessonArt(game: pairs, theme: theme, marked: placesOf(pairs, pairs.cards.first.symbol)),
    ),
    DemoTrial(
      text: '',
      rule: L.t('teachPicturePairsGroup'),
      art: PairsLessonArt(game: triples, theme: theme, marked: placesOf(triples, triples.cards.first.symbol)),
    ),
    DemoTrial(
      text: '',
      rule: L.t('teachPicturePairsSwap'),
      art: PairsLessonArt(game: pairs, theme: theme, swapPair: [a, b]),
    ),
  ];
}
