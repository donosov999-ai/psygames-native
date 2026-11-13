import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/aux_action.dart';
import '../../shell/boss_round.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/design_template.dart';
import '../../shell/game_colors.dart';
import '../../shell/game_shell.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_result.dart';
import '../../shell/level_rules.dart';
import '../../shell/preset_cap.dart';
import '../../shell/session_report.dart';
import '../../shell/setup_scroll.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';
import 'series_screen.dart';

/// «Таблица Шульте» на общем каркасе — первая перенесённая тап-игра раздела.
///
/// Жалоба Дениса, с которой начался переезд, ровно про этот класс игр: «везде,
/// где перетаскивание тапом или соединением, глюки сильнее всего». Здесь нажатие
/// идёт по клетке напрямую, без веб-слоя.
///
/// 🔴 ПОЛЕ БЕРЁТ ВЫСОТУ У КАРКАСА ЧИСЛОМ. Веб считал клетку от ОКНА
/// (`windowDimensions.height - 230`), и это число приходилось держать в голове
/// при каждой правке шапки: любой новый ряд счётчиков уводил нижний ряд клеток
/// за экран. Здесь высота приходит из `field: (context, h)`.
class SchulteScreen extends StatefulWidget {
  const SchulteScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<SchulteScreen> createState() => _SchulteScreenState();
}

/// РУЧНЫЕ НАСТРОЙКИ «СВОБОДНО» — все модификации веб-Шульте (`schulte.tsx`, блок `playMode == 'free'`):
/// размер, содержимое (цифры / буквы / Шульте–Горбов), письменность, направление (вперёд / назад / от
/// центра), разделённое внимание (2–4 группы), убегающая цель и цвет. Партия по ним лестницу НЕ двигает.
class SchulteFreeConfig {
  SchulteFreeConfig({required this.script});

  int size = 5;
  ContentMode content = ContentMode.numbers;
  String script;
  Direction direction = Direction.forward;
  int groups = 1;
  bool moving = false;
  bool color = false;

  /// Наименьшая сторона, при которой алфавит «букв» ещё годится (веб: фильтр `chars.length >= 25`).
  static const lettersMinGrid = 5;

  /// Правила веба, которые экран держит сам, чтобы нельзя было собрать то, что не играется:
  /// у Горбова порядок всегда вперёд; группы — только цифры; «от центра» — только цифры и без
  /// групп; бедный алфавит (греческий) для «букв» заменяется; сторона не больше, чем держит алфавит.
  void normalize({required String fallbackScript}) {
    if (content == ContentMode.mixed) direction = Direction.forward;
    if (content != ContentMode.numbers) {
      groups = 1;
      if (direction == Direction.centerOut) direction = Direction.forward;
    }
    if (groups > 1 && direction == Direction.centerOut) direction = Direction.forward;
    if (content == ContentMode.letters && !schulteScriptById(script).fitsLetters(lettersMinGrid)) {
      script = fallbackScript;
    }
    final cap = maxGridFor(content, schulteScriptById(script).length);
    if (size > cap) size = cap;
    if (groups > 1) color = false; // цвет группы — её идентификатор, не помеха
  }

  int get maxSize => maxGridFor(content, schulteScriptById(script).length);

  LevelParams toParams() => LevelParams(
        gridSize: size,
        contentMode: content,
        direction: direction,
        colorMode: color,
        surpriseStart: false,
        moving: moving,
        groupCount: content == ContentMode.numbers ? groups : 1,
      );

  /// Метка режима партии для статистики — те же строки, что пишет веб (`schulte.tsx:550`).
  String get sessionMode {
    if (content == ContentMode.numbers && groups > 1) return 'divided_attention_${groups}g';
    final c = switch (content) {
      ContentMode.numbers => 'numbers',
      ContentMode.letters => 'letters',
      ContentMode.mixed => 'mixed',
    };
    final d = switch (direction) {
      Direction.forward => 'forward',
      Direction.backward => 'backward',
      Direction.centerOut => 'center-out',
    };
    return '${c}_${d}_${color ? 'color' : 'bw'}${moving ? '_moving' : ''}';
  }
}

enum _Phase { ready, playing, done }

class _SchulteScreenState extends State<SchulteScreen> {
  static const _levelErrorsAllowed = 2;   // ровно как в вебе: errsArg <= 2 — уровень взят
  static const _ruleRevealDelay = Duration(milliseconds: 1500);

  late LevelLadder _ladder;
  late final SessionLaunch _sessionLaunch;
  SchulteGame? _game;

  /// «Свободно» (веб `playMode == 'free'`): ручные настройки, лестница стоит. По умолчанию — «Уровни».
  bool _free = false;
  late final SchulteFreeConfig _cfg;

  bool get _isFree => _free && !GamePreset.isPreset;
  _Phase _phase = _Phase.ready;

  /// Ось 9: до объявления правило скрыто, а нажатия не считаются.
  bool _ruleRevealed = true;
  bool _won = false;

  /// Итог боя с боссом после этой партии; `null` — боя не было (веб: `bossWon`).
  bool? _boss;
  Duration _elapsed = Duration.zero;

  /// Время на таблицу этого уровня, секунд; `null` — лимита нет (уровни до 19-го).
  double? _limitSec;

  /// Партия кончилась тем, что время вышло, — а не ошибками.
  bool _timedOut = false;

  GameTimer? _reveal;
  GameTimer? _ticker;

  /// Часы партии — на игровом времени каркаса (shell/game_clock.dart): пауза и разбор поверх
  /// игры время не съедают. До 02.10.2026 здесь стоял Stopwatch — настенные часы, и лимит
  /// времени засчитал бы чтение паузы как медленную игру.
  int? _startedAt;
  int _frozenMs = 0;
  int get _elapsedMs => _startedAt == null ? _frozenMs : gameNow() - _startedAt!;
  void _clockStop() {
    _frozenMs = _elapsedMs;
    _startedAt = null;
  }

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'schulte_table', store: SharedLevelStore(widget.state));
    _sessionLaunch = SessionLaunch.capture();
    _cfg = SchulteFreeConfig(script: _langScript);
    _boot();
  }

  @override
  void dispose() {
    _reveal?.cancel();
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_reset);
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (отчёт Дениса 01.10.2026).
    if (GamePreset.autostart) _start();
  }

  /// Письменность по умолчанию, как в вебе: у русского языка — кириллица, иначе латиница
  /// (`app/games/schulte.tsx:274`).
  String get _langScript {
    final lang = widget.state.get('${SharedState.prefix}language') ??
        widget.state.get('language') ??
        'ru';
    return lang.startsWith('ru') ? 'cyrillic' : 'latin';
  }

  /// Алфавит партии: по ступеням — по языку; в «Свободно» — выбранная письменность.
  String get _alphabet => schulteScriptById(_isFree ? _cfg.script : _langScript).chars;

  void _reset() {
    // Новая партия — снова зачётная (договор shell/lesson.dart: отметку «разбор
    // смотрели» снимает новая раздача). Отметка общая на всё приложение, и без
    // сброса один открытый разбор выключал бы рост уровня во всех играх.
    LessonUsed.reset();
    _reveal?.cancel();
    _ticker?.cancel();
    _startedAt = null;
    _frozenMs = 0;
    _elapsed = Duration.zero;
    final preset = _presetParams() ?? _freeParams();
    _game = SchulteGame(level: _ladder.level, alphabet: _alphabet, override: preset);
    // Таблица шага — не таблица уровня: лимит времени уровня к ней не относится (у веба его нет).
    _limitSec = preset != null ? null : schulteTimeLimitSec(_ladder.level);
    _timedOut = false;
    _phase = _Phase.ready;
    _ruleRevealed = !_game!.params.surpriseStart;
    _won = false;
  }

  /// ШАГ ЗАРЯДКИ — СВОЯ ТАБЛИЦА: числа по порядку, сторона `?size=` шага (по умолчанию 5), но не
  /// больше освоенной больше чем на одну; с 7×7 по уровню — как просит шаг. Перенос веб-пресета
  /// (`schulte.tsx:470–479`, `capPresetByLevel`). Без этого натив молча играл таблицу уровня —
  /// с буквами, обратным порядком и цветом (сторож каркаса 44f7e4e0, задача 50139f1d).
  LevelParams? _presetParams() {
    if (!GamePreset.isPreset) return null;
    final atLevel = LevelParams.of(_ladder.level).gridSize;
    final size = capPresetByLevel(want: GamePreset.num('size', 5), atLevel: atLevel, atTop: atLevel >= 7);
    return LevelParams(
      gridSize: size,
      contentMode: ContentMode.numbers,
      direction: Direction.forward,
      colorMode: false,
      surpriseStart: false,
      moving: false,
    );
  }

  /// «Свободно»: параметры из ручных настроек (после правил `normalize`).
  LevelParams? _freeParams() {
    if (!_isFree) return null;
    _cfg.normalize(fallbackScript: _langScript);
    return _cfg.toParams();
  }

  /// Любая правка настроек или режима пересобирает партию: экран настройки показывает ровно то, что
  /// будет сыграно (число клеток, правило). Идёт только на экране «Начать» — в партии настроек нет.
  void _setup(VoidCallback change) {
    if (_phase != _Phase.ready) return;
    setState(() {
      change();
      _reset();
    });
  }

  void _start() {
    final g = _game!;
    setState(() {
      _phase = _Phase.playing;
      _ruleRevealed = !g.params.surpriseStart;
    });
    _startedAt = gameNow();
    _frozenMs = 0;
    _ticker = gameInterval(const Duration(milliseconds: 100), () {
      if (!mounted) return;
      setState(() => _elapsed = Duration(milliseconds: _elapsedMs));
      if (!_inTime) _timeUp();
    });
    if (!g.params.surpriseStart) return;
    // Правило объявляется ПОСЛЕ показа поля: полторы секунды — столько, чтобы
    // взгляд успел пробежать таблицу и не успел построить план.
    _reveal = gameTimeout(_ruleRevealDelay, () {
      if (!mounted) return;
      setState(() => _ruleRevealed = true);
    });
  }

  void _tap(int cell) {
    final g = _game!;
    if (_phase != _Phase.playing) return;
    final res = g.press(cell, ruleRevealed: _ruleRevealed);
    if (res == PressResult.ignored) return;
    setState(() {});
    if (res != PressResult.finished) return;
    _clockStop();
    _ticker?.cancel();
    if (_isFree) {
      _finishFree(g);
      return;
    }
    // Последнее нажатие могло прийти после лимита, но до тика часов: решают часы, а не тик.
    final inTime = _inTime;
    final ok = g.errors <= _levelErrorsAllowed && inTime;
    setState(() {
      _phase = _Phase.done;
      _won = ok;
      _timedOut = !inTime;
      _boss = null; // итог боя — только этой партии; бой, если будет, допишет его ниже
      _elapsed = Duration(milliseconds: _elapsedMs);
    });
    if (!ok) {
      _ladder.fail();
      return;
    }
    _winThenBoss();
  }

  /// Конец свободной партии. 🔴 Лестницу не двигает ни в какую сторону (веб: `passed = useLevelRef &&
  /// …`, у PRL «классика» так же): ни уровня, ни провала, ни босса. Но партия — партия: она уходит в
  /// статистику, токены и серию (`saveSession` веба) под своей меткой режима и размером поля.
  void _finishFree(SchulteGame g) {
    final ms = _elapsedMs;
    final cells = g.total;
    setState(() {
      _phase = _Phase.done;
      _won = true;
      _timedOut = false;
      _boss = null;
      _elapsed = Duration(milliseconds: ms);
    });
    final seconds = ms / 1000;
    SessionReport.send(
      launch: _sessionLaunch,
      gameType: 'schulte_table',
      score: cells - g.errors,
      timeSeconds: seconds.round(),
      errors: g.errors,
      difficulty: '${g.size}x${g.size}',
      mode: _cfg.sessionMode,
      details: {
        'level': _ladder.level,
        'hits': cells - g.errors,
        'errors': g.errors,
        'total_cells': cells,
        'mean_rt_per_cell': cells > 0 ? seconds / cells : 0,
        if (_cfg.content != ContentMode.numbers && _cfg.groups <= 1) 'script': _cfg.script,
        if (g.grouped) 'group_count': _cfg.groups,
      },
    );
  }

  /// Уложился ли человек в лимит уровня. Мерят часы партии, а не последний тик.
  bool get _inTime => schulteWithinLimit(_limitSec, _elapsedMs);

  /// Время вышло: таблица останавливается сразу, уровень не засчитан.
  void _timeUp() {
    if (_phase != _Phase.playing) return;
    _clockStop();
    _ticker?.cancel();
    _reveal?.cancel();
    setState(() {
      _phase = _Phase.done;
      _won = false;
      _timedOut = true;
      _boss = null;
      _elapsed = Duration(milliseconds: _elapsedMs);
    });
    _ladder.fail();
  }

  /// Лимит подписью: до десятых, а целые — без «,0».
  String _secText(double s) {
    final t = (s * 10).round() / 10;
    return '${t == t.roundToDouble() ? t.toStringAsFixed(0) : t.toStringAsFixed(1)} ${L.t('secShort')}';
  }

  /// Веха как в вебе: каждый третий ЗАСЧИТАННЫЙ уровень — бой «сложи подсвеченные».
  Future<void> _winThenBoss() async {
    final boss = await BossRound.winThenBoss(context, _ladder,
        type: BossType.counting, color: const Color(0xFF667EEA));
    if (!mounted || boss == null) return;
    setState(() => _boss = boss);
  }

  String get _time {
    final s = _elapsed.inMilliseconds / 1000;
    return '${s.toStringAsFixed(1)} ${L.t('secShort')}';
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => L.t('schulteTable');

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachSchulteCenter')),
      ];

  /// Подпись направления: диапазон ЗНАКОВ, которые реально лягут на поле (первые `n×n`), а не весь
  /// алфавит; у цифр — `1 → n×n`.
  String _dirLabel(bool forward) {
    final cells = _cfg.size * _cfg.size;
    String first, last;
    if (_cfg.content == ContentMode.numbers) {
      first = '1';
      last = '$cells';
    } else {
      final r = schulteScriptById(_cfg.script).chars.runes.toList();
      final used = cells < r.length ? cells : r.length;
      first = String.fromCharCode(r.first);
      last = String.fromCharCode(r[used - 1]);
    }
    return forward ? '$first → $last' : '$last → $first';
  }

  /// ЭКРАН НАСТРОЙКИ: «Уровни / Свободно» (образец — `prl/screen.dart`, виджеты каркаса
  /// `SetupScroll`/`SetupChoice`). «Уровни» — прежнее: правило ступени и дверь серии. «Свободно» —
  /// все ручные модификации веба, каждая подписью, а не номером ступени.
  Widget _setupPanel(double height, SchulteGame g) {
    final text = Theme.of(context).textTheme;
    final cfg = _cfg;
    final small = text.bodySmall;
    return SetupScroll(
      height: height,
      onStart: _start,
      children: [
        SetupChoice<bool>(
          label: L.t('mode'),
          options: [
            (false, L.t('sudokuModeLevels'), 'schulte-mode-levels'),
            (true, L.t('sudokuModeFree'), 'schulte-mode-free'),
          ],
          value: _free,
          onPick: (v) => _setup(() => _free = v),
        ),
        const SizedBox(height: 12),
        if (!_isFree) ...[
          Text(_schulteRule(g.params), key: const Key('schulte-rule'), style: text.titleMedium, textAlign: TextAlign.center),
          if (g.params.surpriseStart)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(L.t('schulteSurpriseStart'), style: small, textAlign: TextAlign.center),
            ),
          const SizedBox(height: 16),
          SchulteSeriesDoor(state: widget.state, ladderSize: g.params.gridSize),
        ] else ...[
          // Что будет сыграно — живой пересказ выбранного: по нему видно, что кнопки сделали.
          Text(
            g.grouped ? L.t('schulteDividedHint') : _schulteRule(g.params),
            key: const Key('schulte-rule'),
            style: text.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          SetupChoice<ContentMode>(
            label: L.t('label_type'),
            options: [
              (ContentMode.numbers, L.t('label_digits_numbers'), 'schulte-content-numbers'),
              (ContentMode.letters, L.t('label_letters'), 'schulte-content-letters'),
              // Шульте–Горбов — по имени: красно-чёрная таблица, числа и буквы вперемешку (1-А-2-Б).
              (ContentMode.mixed, '${L.t('schulteGorbov')} ${L.t('label_mixed_1a2b')}', 'schulte-content-mixed'),
            ],
            value: cfg.content,
            onPick: (v) => _setup(() => cfg.content = v),
          ),
          if (cfg.content != ContentMode.numbers) ...[
            const SizedBox(height: 12),
            SetupChoice<String>(
              label: L.t('scriptLabel'),
              options: [
                for (final sc in schulteScripts)
                  // Для «букв» скрыты алфавиты короче 25 знаков (греческий): сетка 5×5 не наберётся.
                  if (cfg.content == ContentMode.mixed || sc.fitsLetters(SchulteFreeConfig.lettersMinGrid))
                    (sc.id, L.t(sc.labelKey), 'schulte-script-${sc.id}'),
              ],
              value: cfg.script,
              onPick: (v) => _setup(() => cfg.script = v),
            ),
          ],
          // У Горбова порядок всегда вперёд, а при группах направление не работает — ряда нет.
          if (cfg.content != ContentMode.mixed && cfg.groups <= 1) ...[
            const SizedBox(height: 12),
            SetupChoice<Direction>(
              label: L.t('srsDirection'),
              options: [
                (Direction.forward, _dirLabel(true), 'schulte-dir-forward'),
                (Direction.backward, _dirLabel(false), 'schulte-dir-backward'),
                if (cfg.content == ContentMode.numbers)
                  (Direction.centerOut, L.t('schulteCenterOut'), 'schulte-dir-center'),
              ],
              value: cfg.direction,
              onPick: (v) => _setup(() => cfg.direction = v),
            ),
            const SizedBox(height: 4),
            Text(L.t('hint_backward_harder'), style: small, textAlign: TextAlign.center),
          ],
          if (cfg.content == ContentMode.numbers) ...[
            const SizedBox(height: 12),
            SetupChoice<int>(
              label: L.t('schulteDivided'),
              options: [
                for (final n in const [1, 2, 3, 4])
                  (n, n == 1 ? L.t('classicLabel') : '$n', 'schulte-groups-$n'),
              ],
              value: cfg.groups,
              onPick: (v) => _setup(() => cfg.groups = v),
            ),
            const SizedBox(height: 4),
            Text(L.t('schulteDividedHint'), style: small, textAlign: TextAlign.center),
          ],
          const SizedBox(height: 12),
          SetupChoice<bool>(
            label: L.t('schulteMoving'),
            options: [(false, L.t('label_off'), 'schulte-moving-off'), (true, L.t('label_on'), 'schulte-moving-on')],
            value: cfg.moving,
            onPick: (v) => _setup(() => cfg.moving = v),
          ),
          const SizedBox(height: 4),
          Text(L.t('schulteMovingHint'), style: small, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          SetupChoice<int>(
            label: L.t('size'),
            options: [
              // Выше, чем держит алфавит, сторону не предлагаем: партия бы не собралась (`maxGridFor`).
              for (var n = 5; n <= 10; n += 1)
                if (n <= cfg.maxSize) (n, '$n×$n', 'schulte-size-$n'),
            ],
            value: cfg.size,
            onPick: (v) => _setup(() => cfg.size = v),
          ),
          if (cfg.groups <= 1) ...[
            const SizedBox(height: 12),
            SetupChoice<bool>(
              label: L.t('mode'),
              options: [(false, L.t('bwMode'), 'schulte-color-off'), (true, L.t('colorMode'), 'schulte-color-on')],
              value: cfg.color,
              onPick: (v) => _setup(() => cfg.color = v),
            ),
          ],
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    if (g == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: _title,
      // «Свободно» — партия не по лестнице: ни карты уровней, ни «проще / сложнее» в паузе (каркас сам
      // убирает их при `levelMap: false`) — выбор двигал бы лестницу, по которой эта партия не идёт.
      levelMap: !_isFree,
      // …и карточки правил уровня там не к месту.
      levelRule: _isFree
          ? null
          : LevelRuleSpot(
              gameId: 'schulte_table', level: _ladder.level, state: widget.state, calm: _phase != _Phase.playing),
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        if (!_isFree) HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        if (!_isFree) HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('errors'), value: '${g.errors}', icon: Icons.close),
        HudItem(
          label: L.t('time'),
          value: _limitSec == null ? _time : '$_time / ${_secText(_limitSec!)}',
          icon: Icons.timer_outlined,
        ),
      ],
      field: (context, h) {
        if (_phase != _Phase.done) {
          return _Field(
            game: g,
            phase: _phase,
            ruleRevealed: _ruleRevealed,
            won: _won,
            height: h,
            onStart: _start,
            onTap: _tap,
            // Серия блоков — дверь уровней; в «Свободно» её нет (веб: она в блоке уровней).
            door: GamePreset.isPreset || _isFree
                ? null
                : SchulteSeriesDoor(state: widget.state, ladderSize: g.params.gridSize),
            setup: GamePreset.isPreset ? null : (h) => _setupPanel(h, g),
          );
        }
        // Итог — общий каркаса ([LevelResult], задача e90a53d5): автопереход на следующий уровень. Таблица,
        // как её оставила партия (сколько собрано до лимита), и итог боя с боссом — в подробностях.
        final board = (h * 0.3).clamp(0.0, 220.0);
        return SizedBox(
          height: h,
          child: LevelResult(
            passed: _won,
            // «Свободно» — без лестницы: итог «Готово!» и новая таблица, без «Ур. N+1».
            level: _isFree || GamePreset.isPreset ? null : g.level,
            score: _won
                ? L.f('schulteResultWin', {'t': _time, 'errors': '${g.errors}'})
                : _timedOut
                    ? L.f('schulteResultTimeUp', {'limit': _secText(_limitSec!)})
                    : L.f('schulteResultFail', {'errors': '${g.errors}', 'max': '$_levelErrorsAllowed'}),
            details: Column(mainAxisSize: MainAxisSize.min, children: [
              BossOutcomeLine(_boss),
              // Нажатия по вставшей таблице не считаются и не уводят с итога (тап по итогу — «дальше»).
              GestureDetector(
                onTap: () {},
                child: SizedBox(
                  height: board,
                  child: _Field(
                    game: g,
                    phase: _phase,
                    ruleRevealed: _ruleRevealed,
                    won: _won,
                    height: board,
                    onStart: _start,
                    onTap: _tap,
                  ),
                ),
              ),
            ]),
            // Автопереход сразу в следующую таблицу (задача e90a53d5), а не на экран «Начать».
            onNext: () {
              setState(_reset);
              _start();
            },
            // «Настройки» — экран настройки: «Уровни / Свободно», размер и модификации.
            onSettings: GamePreset.isPreset ? null : () => setState(_reset),
          ),
        );
      },
      auxRow: AuxBar(children: [
        AuxAction(
          // Тот же обработчик, что «Заново» в паузе — под «Авророй» только в паузе.
          inPause: true,
          icon: Icons.refresh,
          label: L.t('restart'),
          onPressed: () => setState(_reset),
        ),
        AuxAction(
          icon: Icons.grid_view,
          label: L.f('schulteGridSize', {'n': '${g.size}'}),
          onPressed: null,
        ),
      ]),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

/// Фраза целиком на каждое сочетание «что ищем × в каком порядке»: склейка
/// «Ищи $что $куда» не переводится — в других языках другой порядок слов.
String _schulteRule(LevelParams p) => switch ((p.contentMode, p.direction)) {
      (ContentMode.numbers, Direction.forward) => L.t('schulteRuleNumFwd'),
      (ContentMode.numbers, Direction.backward) => L.t('schulteRuleNumBack'),
      (ContentMode.numbers, Direction.centerOut) => L.t('schulteRuleNumCenter'),
      (ContentMode.letters, Direction.forward) => L.t('schulteRuleLetFwd'),
      (ContentMode.letters, Direction.backward) => L.t('schulteRuleLetBack'),
      (ContentMode.letters, Direction.centerOut) => L.t('schulteRuleLetCenter'),
      (ContentMode.mixed, Direction.forward) => L.t('schulteRuleMixFwd'),
      (ContentMode.mixed, Direction.backward) => L.t('schulteRuleMixBack'),
      (ContentMode.mixed, Direction.centerOut) => L.t('schulteRuleMixCenter'),
    };

/// Цвета клеток: у режима «цвет» — помеха по значению, у «разделённого внимания» — идентификатор
/// группы (цвет номер `g`). Четыре цвета на четыре группы — больше групп веб не даёт.
const _cellPalette = [Color(0xFFEF4444), Color(0xFF2563EB), Color(0xFF16A34A), Color(0xFFB45309)];

/// Поле: квадратная сетка внутри высоты, которую дал каркас, и строка цели над ней.
class _Field extends StatelessWidget {
  const _Field({
    required this.game,
    required this.phase,
    required this.ruleRevealed,
    required this.won,
    required this.height,
    required this.onStart,
    required this.onTap,
    this.door,
    this.setup,
  });

  final SchulteGame game;
  final _Phase phase;
  final bool ruleRevealed;
  final bool won;
  final double height;
  final VoidCallback onStart;
  final void Function(int) onTap;

  /// Дверь серии блоков под «Начать» (веб `schulte.tsx:888`); в шаге зарядки её нет.
  final Widget? door;

  /// Экран настройки «Уровни / Свободно»; `null` — шаг зарядки: таблицу задаёт сам шаг.
  final Widget Function(double height)? setup;

  String get _rule => _schulteRule(game.params);

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (phase == _Phase.ready && setup != null) return setup!(height);
    if (phase == _Phase.ready) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_rule, style: text.titleMedium, textAlign: TextAlign.center),
            if (game.params.surpriseStart)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(L.t('schulteSurpriseStart'),
                    style: text.bodySmall, textAlign: TextAlign.center),
              ),
            const SizedBox(height: 12),
            FilledButton(onPressed: onStart, child: Text(L.t('start'))),
            if (door != null) ...[const SizedBox(height: 16), door!],
          ],
        ),
      );
    }

    final target = ruleRevealed ? '${game.target}' : '?';
    // «Аврора» (лист 11): цель — карточкой ПОД полем, число выделено; Classic — строка над полем.
    final aurora = Theme.of(context).extension<UiTemplateTheme>()?.template == UiTemplate.aurora;
    // В группах число окрашено цветом активной группы: без этого «найди 4» не говорит, в какой из раскрасок.
    final accent = game.grouped ? _cellPalette[game.activeGroup % _cellPalette.length] : null;
    final goal = phase == _Phase.done
        ? Text(won ? L.t('storyDone') : L.t('schulteCollected'), key: const Key('цель'), style: text.titleMedium)
        : aurora
            ? _auroraGoal(context, target, accent: accent)
            : accent != null
                ? _groupGoal(context, target, accent)
                : Text(L.f('schulteFind', {'x': target}), key: const Key('цель'), style: text.titleMedium);
    return Column(
      children: [
        if (!aurora) Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: goal),
        Expanded(
          child: LayoutBuilder(
            builder: (context, c) {
              // 🔴 Сторона берётся от МЕНЬШЕГО из высоты каркаса и ширины. Высота
              // здесь — та, что осталась под полем, а не высота окна.
              final free = height - (aurora ? 76 : 34);   // строка цели над сеткой / карточка под ней
              final side = (free < c.maxWidth ? free : c.maxWidth) - 12;
              final n = game.size;
              final cell = side / n;
              // «Аврора»: сетка прижата к карточке цели под ней (лист 11), Classic — по центру.
              return Align(
                alignment: aurora ? Alignment.bottomCenter : Alignment.center,
                child: SizedBox(
                  width: side,
                  height: side,
                  child: Column(
                    children: [
                      for (var row = 0; row < n; row++)
                        SizedBox(
                          height: cell,
                          child: Row(
                            children: [
                              for (var col = 0; col < n; col++)
                                _Cell(
                                  index: row * n + col,
                                  size: cell,
                                  game: game,
                                  enabled: phase == _Phase.playing && ruleRevealed,
                                  onTap: onTap,
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        if (aurora) Padding(padding: const EdgeInsets.only(top: 8), child: goal),
      ],
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.index,
    required this.size,
    required this.game,
    required this.enabled,
    required this.onTap,
  });

  final int index;
  final double size;
  final SchulteGame game;
  final bool enabled;
  final void Function(int) onTap;

  /// Цвет клетки — помеха, а не правило (ось «двойная задача»). Он закреплён за
  /// ЗНАЧЕНИЕМ, а не за местом: на убегающей цели клетки меняются местами, и
  /// цвет, привязанный к месту, мигал бы на каждом ходу.
  Color? _tint(ColorScheme scheme) {
    if (game.grouped) return _cellPalette[game.cellGroup[index] % _cellPalette.length];
    if (!game.params.colorMode) return null;
    return _cellPalette[game.items[index].hashCode.abs() % _cellPalette.length];
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final value = game.items[index];
    final tint = _tint(scheme);
    return SizedBox(
      width: size,
      height: size,
      child: Padding(
        padding: const EdgeInsets.all(2),
        child: Material(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            key: Key('клетка$index'),
            borderRadius: BorderRadius.circular(8),
            onTap: enabled ? () => onTap(index) : null,
            child: Center(
              child: Text(
                '$value',
                style: TextStyle(
                  fontSize: size * 0.42,
                  fontWeight: FontWeight.w700,
                  // Найденное в группах гаснет (веб: `isFound`), чтобы глаз шёл по оставшимся.
                  color: game.isFound(index) ? (tint ?? scheme.onSurface).withValues(alpha: 0.3) : (tint ?? scheme.onSurface),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// «Аврора» (лист 11): карточка цели под полем — «Ищи: 12», число выделено `highlight`.
/// Подпись берётся из словаря целиком и режется по `{x}`: в других языках другой порядок слов.
Widget _auroraGoal(BuildContext context, String target, {Color? accent}) {
  final roles = GameColors.of(context);
  final style = Theme.of(context).textTheme.titleLarge?.copyWith(color: roles.onCell, fontWeight: FontWeight.w600);
  final parts = L.t('schulteFind').split('{x}');
  return Container(
    height: 60,
    width: double.infinity,
    alignment: Alignment.center,
    padding: const EdgeInsets.symmetric(horizontal: 16),
    decoration: BoxDecoration(
      color: roles.cellAlt,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: roles.boardLine),
    ),
    child: Text.rich(
      TextSpan(children: [
        TextSpan(text: parts.first),
        TextSpan(text: target, style: TextStyle(color: accent ?? roles.highlight, fontWeight: FontWeight.w800, fontSize: 26)),
        if (parts.length > 1) TextSpan(text: parts.sublist(1).join('{x}')),
      ]),
      key: const Key('цель'),
      style: style,
    ),
  );
}

/// Строка цели в группах под Classic: число — цветом активной группы, остальное прежнее.
Widget _groupGoal(BuildContext context, String target, Color accent) {
  final style = Theme.of(context).textTheme.titleMedium;
  final parts = L.t('schulteFind').split('{x}');
  return Text.rich(
    TextSpan(children: [
      TextSpan(text: parts.first),
      TextSpan(text: target, style: TextStyle(color: accent, fontWeight: FontWeight.w800)),
      if (parts.length > 1) TextSpan(text: parts.sublist(1).join('{x}')),
    ]),
    key: const Key('цель'),
    style: style,
  );
}
