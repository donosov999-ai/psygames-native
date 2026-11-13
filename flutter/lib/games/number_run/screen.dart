import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../shell/design_template.dart';
import '../../shell/game_colors.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/js_compat.dart' show jsNum, jsRound;
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_result.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../math_slider/model.dart' show numberLocale;
import '../runner/road.dart';
import 'campaign.dart';
import 'level.dart';
import 'nr_material.dart';
import 'readout.dart';
import 'road_3d.dart';
import 'task_cards.dart';

/// ЭКРАН «ЧИСЛОВОГО ЗАБЕГА» — раздел «Счёт», перенос веб-экрана `app/games/number-run.tsx`
/// на общее ядро дороги раннеров (`../runner/road.dart`).
///
/// Два режима, как в вебе: УРОВНИ — 90 секунд, станции хаба «Счёт» входят по главам, каждый
/// третий уровень — «Страж»; пройден — пробито ≥ 5 стен из 10 или число не меньше стража.
/// СВОБОДНО — забег 12 этапов × 42 с без уровней, итог один на весь забег.
///
/// Управление — как в вебе: протяжка пальцем по дороге (полный размах руля — примерно
/// треть ширины) и три кнопки внизу: левый край, середина, правый край. Руление свободное,
/// до полосы не округляется. Стрелки клавиатуры — к соседней полосе.
///
/// Дорога — вид сверху: ряды едут вниз к числу игрока. Синее прибавляет, красное вычитает,
/// янтарное — часть ворот «ровно N»; вода — провал (мост и трамплин перекрывают её).
///
/// ⚠️ ОТЛИЧИЯ ОТ ВЕБА, НАЗВАННЫЕ: полноэкранного слоя нет — у Flutter-каркаса его нет ни у
/// одной игры (решение «полосы телефона прячет каркас» — дело каркаса, а не экрана); карты
/// уровней нет — ни у одного нативного экрана её нет, уровень ведёт лестница. Причина конца
/// партии в данных — латиницей (`finished` / `fell`), а не «дошёл / упал»: кириллица только
/// в видимом тексте.
class NumberRunScreen extends StatefulWidget {
  const NumberRunScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно для проб; без него — случайное на каждую партию, как в вебе.
  final int? seed;

  @override
  State<NumberRunScreen> createState() => _NumberRunScreenState();
}

enum NumberRunMode { levels, free }

enum _Phase { config, running, finale, result }

const Color numberRunAccent = Color(0xFF2563EB);

/// Секунд уровня (30 рядов по 24 при скорости 8) и этапов забега — из переноса, не выдумано.
const int numberRunLevelSeconds = 90;
const int numberRunStageSeconds = 42;

/// ФОРМА ЧИСЛА — КУЧКА КЛЕТОК вместо цифры: шестой перенос дорожной карты «Числового забега»
/// (counter, обсуждено с Денисом 13.09.2026: «значение видно только если сосчитал; мост к
/// субитизации „Поиска“»). В вебе его не было — это нативная ось. Правила НЕ меняются: число
/// то же, меняется только вид, поэтому курс уровня по-прежнему байт в байт с вебом.
/// · до L21 — цифры;
/// · L22–24 — обучающая глава (после смеси станций на L19): числа змейки и сетки — кучкой;
/// · с L25 — смесь: кучкой половина чисел (по чётности места), остальные цифрой.
/// Кучка — «рамки десяти»: полная рамка (два столбика по пять) — десяток, в неполной видны и
/// клетки, и пустые места (47 = 4 рамки + 7 клеток, «семь — это десять без трёх»); знак —
/// цветом, как у цифр.
/// ⚠️ ТОЛЬКО ЗМЕЙКА И СЕТКА, НЕ БОЛЬШЕ 49 — по кадрам 01.10: у строя пять чисел через
/// полполосы и значения 4k–5k (на L22 — 92 и 115), кучки из девяти столбиков сливались в
/// штрихкод и налезали друг на друга. У змейки и сетки числа k и k/2 (на L22–30 — 11…31) и
/// между ними целая полоса. Стопки у столба, трамплин и части «ровно N» — цифрой: там приём —
/// сравнить суммы и набрать точно, а не сосчитать.
const int pileFromLevel = 22;
const int pileMixFromLevel = 25;

/// Больше 49 — цифрой: четыре полные рамки и неполная — предел, который схватывается глазом.
const int pileMax = 49;
const Set<String> _pileShapes = {'snake', 'grid'};

/// Кучка для числа [index] ряда [row]: (столбиков по десять, клеток). `null` — цифрой.
(int, int)? pileOf(RoadCourse course, RoadRow row, int index) {
  if (course.format != 'level' || course.levelId < pileFromLevel) return null;
  if (!_pileShapes.contains(row.shape)) return null;
  final it = row.items[index];
  if (it.part) return null;
  final v = it.value.abs().round();
  if (v == 0 || v > pileMax) return null;
  if (course.levelId >= pileMixFromLevel && (row.id + index).isEven) return null;
  return (v ~/ 10, v % 10);
}

/// Ключи шагов разбора. Шаги зовут их через `step(key, …)`, а словарь приложения собирает
/// только литералы и такие списки (`embed-l10n` читает `const …Keys = <String>[…]`) — без
/// списка разбор показал бы ключи вместо текста.
const numberRunLessonKeys = <String>[
  'teachRunMiddle', 'teachRunColumns', 'teachRunWalls', 'teachRunRamp', 'teachRunBridge', 'teachRunArches', //
  'teachMathRound', 'teachBondsTen', 'teachPatternPeriod', 'teachSliderAnchor', 'teachSpanChunks', 'teachRunGuard',
  'teachRunPile',
];

/// Итог партии: одна запись на уровень или на весь забег.
class NumberRunOutcome {
  const NumberRunOutcome({
    required this.reached,
    required this.passed,
    required this.number,
    required this.walls,
    required this.wallsTotal,
    required this.level,
    required this.guard,
    required this.stagesCleared,
    required this.hits,
    required this.mistakes,
    required this.seconds,
    required this.reason,
  });

  /// Доехал до финала (черта пройдена, не упал).
  final bool reached;

  /// Уровень засчитан: ≥ 5 стен или страж побеждён; в забеге — доехал.
  final bool passed;
  final int number, walls, wallsTotal;
  final int? level, guard;
  final int stagesCleared, hits, mistakes, seconds;

  /// `finished` — доехал; `fell` — упал с моста или мимо трамплина.
  final String reason;
}

/// Итог по состоянию ядра — перенос `завершить` веб-адаптера.
NumberRunOutcome numberRunOutcome(RoadCourse course, RoadState s) {
  final reached = s.status == RoadStatus.won;
  final f = course.finale;
  final guard = f?.boss;
  final walls = !reached || f == null
      ? 0
      : guard != null
          ? (s.sum >= guard ? 1 : 0)
          : wallsBroken(f, s.sum);
  return NumberRunOutcome(
    reached: reached,
    passed: reached && (course.format == 'level' ? levelPassed(course, s.sum) : true),
    number: jsRound(s.sum).toInt(),
    walls: walls,
    wallsTotal: guard != null ? 1 : f?.walls?.length ?? 0,
    level: course.format == 'level' ? course.levelId : null,
    guard: guard?.toInt(),
    stagesCleared: s.clearedStages,
    hits: s.hits,
    mistakes: s.mistakes,
    seconds: jsRound(s.elapsed).toInt(),
    reason: reached ? 'finished' : 'fell',
  );
}

/// Сколько идёт финал — перенос `finaleDuration` сцены: дорога до последней пробитой стены
/// (5 единиц между стенами, 12 единиц в секунду) и секунда показать, где остановился.
const double finaleGap = 5, finaleSpeed = 12;

List<double> finaleWalls(RoadCourse c) => c.finale?.boss != null ? [c.finale!.boss!] : c.finale?.walls ?? const [];

int finaleBroken(RoadCourse c, double value) =>
    c.finale?.boss != null ? (value >= c.finale!.boss! ? 1 : 0) : (c.finale == null ? 0 : wallsBroken(c.finale!, value));

double finaleDistance(RoadCourse c, double value) {
  final walls = finaleWalls(c);
  if (walls.isEmpty) return 0;
  final broken = finaleBroken(c, value);
  return broken == walls.length ? finaleGap * walls.length + 6 : finaleGap * (broken + 1) - 1.4;
}

double finaleDuration(RoadCourse c, double value) => c.finale == null ? 0 : finaleDistance(c, value) / finaleSpeed + 1.3;

/// Что показать строкой задания: ближайшая станция в пределах 70 единиц дороги (≈ 9 с) и
/// не дальше трёх рядов — перенос `станцияВпереди` веб-адаптера.
String? stationAhead(RoadCourse course, RoadState s) {
  for (var i = s.nextRow; i < math.min(course.rows.length, s.nextRow + 3); i++) {
    final r = course.rows[i];
    if (r.z - s.z > 70) return null;
    if (r.show != null) return L.t('numberRunMemorize');
    if (r.recall) return L.t('numberRunRecall');
    if (r.kind == 'answer' || r.kind == 'scale') return r.prompt;
    if (r.exact != null) return L.t('numberRunExact').replaceAll('{n}', '${jsNum(r.exact!.target)}');
  }
  return null;
}

/// Стенд приёмки (`lib/number_run_ui_preview.dart`): автопилот — куда рулить и когда жать
/// «Применить». В приложении оба `null` и ни на что не влияют.
@visibleForTesting
double? Function(RoadCourse course, RoadState s)? numberRunAutopilot;
@visibleForTesting
bool Function(RoadCourse course, RoadState s)? numberRunAutoApply;

class _NumberRunScreenState extends State<NumberRunScreen> with SingleTickerProviderStateMixin {
  late final LevelLadder _ladder;
  late final Ticker _ticker;
  final FocusNode _focus = FocusNode();
  NumberRunMode _mode = NumberRunMode.levels;
  _Phase _phase = _Phase.config;
  RoadCourse? _course;
  RoadState? _s;
  int _seed = 0;
  int _games = 0;
  Duration _last = Duration.zero;
  double _finaleT = 0;
  NumberRunOutcome? _outcome;
  double? _dragX;
  double _dragTarget = 0;
  bool _loaded = false;

  late final SessionLaunch _sessionLaunch;

  @override
  void initState() {
    super.initState();
    _sessionLaunch = SessionLaunch.capture();
    _ladder = LevelLadder(gameId: 'number_run', store: SharedLevelStore(widget.state), sessionMode: 'levels');
    _ticker = createTicker(_tick);
    // 3D-сцена грузится, пока человек на настройке: к «Старту» нет голубого экрана ожидания.
    Road3d.prewarm().catchError((Object _) {});
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _loaded = true;
      _deal();
    });
    // Шаг зарядки начинается сам — без «Начать» (проба warmup_step_starts_itself_test,
    // отчёт Дениса 01.10.2026). Веб-забег так не умел; правило общее для нативных игр.
    if (GamePreset.autostart) _start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// Новая раздача: разбор показывает приёмы на ЭТОЙ дороге, поэтому она строится до старта.
  void _deal() {
    LessonUsed.reset();
    _seed = widget.seed != null ? widget.seed! + _games : math.Random().nextInt(1000000);
    _games += 1;
    final level = _ladder.level;
    _course = _mode == NumberRunMode.levels
        ? makeLevel(level, _seed, countingTasksFor(numberLocale(L.locale)), boss: isBossLevel(level))
        : makeCampaign(_seed);
    _s = roadInitial(_course!);
    _phase = _Phase.config;
    _outcome = null;
    _finaleT = 0;
  }

  void _setMode(NumberRunMode m) {
    if (m == _mode || _phase != _Phase.config) return;
    setState(() {
      _mode = m;
      _deal();
    });
  }

  void _start() {
    if (_phase != _Phase.config || isGameHeld()) return;
    setState(() {
      _s = roadResume(_s!);
      _phase = _Phase.running;
    });
    _last = Duration.zero;
    _ticker.start();
    _focus.requestFocus();
  }

  void _tick(Duration elapsed) {
    final dt = (elapsed - _last).inMicroseconds / 1e6;
    _last = elapsed;
    // Keep the ticker's wall timestamp fresh while the shared pause is held:
    // resuming must not advance movement, memory or active time by the pause.
    if (isGameHeld()) return;
    if (dt <= 0) return;
    final course = _course!;
    if (_phase == _Phase.running) {
      final pilot = numberRunAutopilot?.call(course, _s!);
      if (pilot != null) _s = roadSetTarget(_s!, pilot);
      if (numberRunAutoApply?.call(course, _s!) ?? false) _s = roadApplyReserve(_s!, course);
      final next = roadAdvanceFrame(_s!, dt, course);
      setState(() => _s = next);
      if (next.status == RoadStatus.failed) {
        _finish();
      } else if (next.status == RoadStatus.won) {
        setState(() {
          _phase = _Phase.finale;
          _finaleT = 0;
        });
      }
    } else if (_phase == _Phase.finale) {
      // Кадр больше 0,1 с не проматывает финал рывком — как в вебе.
      setState(() => _finaleT += math.min(dt, .1));
      if (_finaleT >= finaleDuration(course, _s!.sum)) _finish();
    }
  }

  /// «Применить» операцию из запаса (вариант Б, Денис 11.11.2026): решение — ядра, экран только зовёт.
  void _applyReserve() {
    final s = _s;
    final course = _course;
    if (s == null || course == null || _phase != _Phase.running) return;
    setState(() => _s = roadApplyReserve(s, course));
  }

  /// Есть ли на этой дороге «×2» в запас — тогда под дорогой слот с кнопкой.
  bool _hasReserve(RoadCourse course) => course.rows.any((r) => r.items.any((i) => i.reserve != null));

  void _steer(double x) {
    if (_phase != _Phase.running || isGameHeld()) return;
    setState(() => _s = roadSetTarget(_s!, x));
  }

  void _lane(int d) {
    if (_phase != _Phase.running || isGameHeld()) return;
    setState(() => _s = roadChangeLane(_s!, d));
  }

  Future<void> _finish() async {
    _ticker.stop();
    final course = _course!;
    final o = numberRunOutcome(course, _s!);
    setState(() {
      _phase = _Phase.result;
      _outcome = o;
    });
    final details = <String, Object?>{
      'stages': o.stagesCleared,
      'hits': o.hits,
      'mistakes': o.mistakes,
      'number': o.number,
      'reason': o.reason,
      'seed': _seed,
      'walls': o.walls,
      'walls_total': o.wallsTotal,
      'level': o.level,
      'boss': o.guard != null,
      'guard': o.guard,
    };
    if (o.level != null) {
      if (o.passed) {
        await _ladder.win(score: o.number, timeSeconds: o.seconds, errors: o.hits + o.mistakes,
            difficulty: 'level-${o.level}', details: details);
      } else {
        await _ladder.fail(score: o.number, timeSeconds: o.seconds, errors: o.hits + o.mistakes,
            difficulty: 'level-${o.level}', details: details);
      }
    } else {
      // Забег «Свободно» лестницы не двигает; партия с разбором несёт `lesson`, как у лестницы.
      final lesson = LessonUsed.inRound;
      LessonUsed.reset();
      if (lesson) details['lesson'] = true;
      await SessionReport.send(
        launch: _sessionLaunch,
        gameType: 'number_run',
        score: o.number,
        timeSeconds: o.seconds,
        errors: o.hits + o.mistakes,
        mode: 'journey',
        difficulty: 'journey-${o.stagesCleared}/$campaignStageCount',
        details: details,
      );
    }
    if (mounted) setState(() {});
  }

  void _next() {
    _ticker.stop();
    setState(_deal);
  }

  @override
  Widget build(BuildContext context) {
    final course = _course;
    final s = _s;
    if (!_loaded || course == null || s == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final level = course.format == 'level' ? course.levelId : null;
    return GameShell(
      title: L.t('numberRun'),
      onLesson: () => openDemoLesson(context, title: L.t('numberRun'), trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('score'), value: '${jsRound(s.sum).toInt()}', icon: Icons.trending_up),
        level != null
            ? HudItem(label: L.t('level'), value: '$level', icon: Icons.flag_outlined)
            : HudItem(label: L.t('round'), value: '${s.stage}/$campaignStageCount', icon: Icons.flag_outlined),
        HudItem(label: L.t('errors'), value: '${s.hits + s.mistakes}', icon: Icons.cancel_outlined),
      ],
      field: (context, h) => KeyboardListener(
        focusNode: _focus,
        autofocus: true,
        onKeyEvent: (e) {
          if (e is! KeyDownEvent) return;
          if (e.logicalKey == LogicalKeyboardKey.arrowLeft) _lane(-1);
          if (e.logicalKey == LogicalKeyboardKey.arrowRight) _lane(1);
        },
        child: _phase == _Phase.config ? _config(course) : _play(course, s, h),
      ),
      toolbar: _toolbar(course),
      // Забег — во весь экран: шапки, счётчиков и тулбара нет, пауза плавает внизу (Денис 11.11.2026).
      fieldOnly: _phase != _Phase.config,
      fieldOnlyPauseBottom: true,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _next),
      ],
    );
  }

  /// Настройка: во что человек входит — правило, режим, длительность.
  Widget _config(RoadCourse course) {
    final text = Theme.of(context).textTheme;
    final level = course.format == 'level' ? course.levelId : null;
    final duration = level != null
        ? '${L.t('level')} $level · $numberRunLevelSeconds ${L.t('secShort')}'
            '${isBossLevel(level) ? ' · ${L.t('numberRunGuard')}' : ''}'
        : '$campaignStageCount × $numberRunStageSeconds ${L.t('secShort')} · '
            '${campaignStageCount * numberRunStageSeconds ~/ 60}:'
            '${'${campaignStageCount * numberRunStageSeconds % 60}'.padLeft(2, '0')}';
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(children: [
        Text(L.t('numberRunRule'), key: const Key('nr-rule'), textAlign: TextAlign.center, style: text.bodyLarge),
        const SizedBox(height: 14),
        Text(
          _mode == NumberRunMode.levels
              ? '${L.t('numberRunLevelsHint')} ${L.t('numberRunReserveHint')}'
              : L.t('numberRunMarathonHint'),
          textAlign: TextAlign.center,
          style: text.bodyMedium,
        ),
        const SizedBox(height: 10),
        Text(duration, key: const Key('nr-duration'), style: text.titleSmall),
      ]),
    );
  }

  /// Партия: строка задания и дорога (или финал — лестница стен).
  Widget _play(RoadCourse course, RoadState s, double h) {
    return LayoutBuilder(builder: (context, c) {
      // ПОЛНЫЙ ЭКРАН (Денис 11.11.2026): дорога — весь экран, HUD и карточка лежат прямо на ней,
      // «×2» — плавающий слот, пауза — плавающая внизу (каркас, fieldOnly), итог — окно поверх.
      final road = Road3d.available
          ? _road3d(c, course, s)
              : _phase == _Phase.running
              ? GestureDetector(
                  key: const Key('nr-road'),
                  behavior: HitTestBehavior.opaque,
                  onHorizontalDragStart: (d) {
                    _dragX = d.localPosition.dx;
                    _dragTarget = _s!.target;
                  },
                  onHorizontalDragUpdate: (d) {
                    final start = _dragX;
                    if (start == null) return;
                    // Делитель 0,3 ширины — из веба: полный размах руля примерно за треть экрана.
                    _steer(_dragTarget + (d.localPosition.dx - start) / (c.maxWidth * 0.3));
                  },
                  onHorizontalDragEnd: (_) => _dragX = null,
                  child: NumberRoadView(course: course, state: s),
                )
              : _phase == _Phase.finale || (_phase == _Phase.result && s.status == RoadStatus.won)
                  ? FinaleView(course: course, value: s.sum, t: _finaleT, done: _phase == _Phase.result)
                  : NumberRoadView(course: course, state: s);
      final result = _phase == _Phase.result ? _resultWindow() : null;
      return Stack(children: [
        Positioned.fill(child: road),
        Positioned(
          key: const Key('nr-readout-viewport'),
          top: 8 + MediaQuery.paddingOf(context).top,
          left: 16,
          right: 16,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: math.max(48, h * .34)),
            child: SingleChildScrollView(child: _sign(course, s)),
          ),
        ),
        if (_hasReserve(course) && result == null)
          Positioned(
            right: 12,
            bottom: 86 + MediaQuery.paddingOf(context).bottom,
            child: NumberRunReserveSlot(state: s, running: _phase == _Phase.running, onApply: _applyReserve),
          ),
        if (result != null)
          Positioned.fill(
            child: ColoredBox(
              color: Colors.black.withValues(alpha: .28),
              child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(16), child: result)),
            ),
          ),
      ]);
    });
  }

  /// 3D-дорога (перенос сцены веба). Один и тот же узел на забеге, финале и итоге: сцена не
  /// пересобирается при смене фазы, финальная лестница стен едет в той же сцене, как в вебе.
  Widget _road3d(BoxConstraints c, RoadCourse course, RoadState s) {
    final running = _phase == _Phase.running;
    final wonFinale = _phase == _Phase.finale || (_phase == _Phase.result && s.status == RoadStatus.won);
    final flat = wonFinale
        ? FinaleView(course: course, value: s.sum, t: _finaleT, done: _phase == _Phase.result)
        : NumberRoadView(course: course, state: s);
    return GestureDetector(
      key: const Key('nr-road'),
      behavior: HitTestBehavior.opaque,
      onHorizontalDragStart: (d) {
        if (!running) return;
        _dragX = d.localPosition.dx;
        _dragTarget = _s!.target;
      },
      onHorizontalDragUpdate: (d) {
        final start = _dragX;
        if (!running || start == null) return;
        _steer(_dragTarget + (d.localPosition.dx - start) / (c.maxWidth * 0.3));
      },
      onHorizontalDragEnd: (_) => _dragX = null,
      child: Road3d(
        course: course,
        state: s,
        finaleT: _phase == _Phase.result && s.status == RoadStatus.won ? finaleDuration(course, s.sum) : _finaleT,
        screenReadouts: true,
        fallback: flat,
      ),
    );
  }

  Widget _sign(RoadCourse course, RoadState s) {
    return NumberRunReadoutPanel(
      key: const Key('nr-sign'), value: NumberRunReadout.from(course, s),
      showTask: _phase == _Phase.running,
    );
  }

  Widget? _toolbar(RoadCourse course) {
    switch (_phase) {
      case _Phase.config:
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            SegmentedButton<NumberRunMode>(
              key: const Key('nr-mode'),
              segments: [
                ButtonSegment(value: NumberRunMode.levels, label: Text(L.t('sudokuModeLevels'))),
                ButtonSegment(value: NumberRunMode.free, label: Text(L.t('sudokuModeFree'))),
              ],
              selected: {_mode},
              onSelectionChanged: (v) => _setMode(v.first),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              key: const Key('nr-start'),
              onPressed: _start,
              icon: const Icon(Icons.play_arrow),
              label: Text(L.t('start')),
            ),
          ]),
        );
      case _Phase.running:
      case _Phase.finale:
      case _Phase.result:
        // Забег — во весь экран: ряда кнопок и тулбара нет (Денис 11.11.2026). Руль — свайп по дороге
        // и стрелки клавиатуры; итог — окно поверх дороги ([_resultWindow]).
        return null;
    }
  }

  /// ОКНО РЕЗУЛЬТАТА (UI22, лист 03 референса Кодекса): карточка поверх дороги, «Число на финише»
  /// крупно, порог стража или пробитые стены ярлыком. Заголовок, звёзды, кнопки и автопереход — общий
  /// итог каркаса ([LevelResult], задача e90a53d5); игра отдаёт снимок итога. Особый вердикт (страж
  /// пройден, «почти», забег доехал) — строкой в подробностях. «Дальше» сразу ведёт на дорогу
  /// следующей раздачи (раньше — на экран настройки), «Настройки» — туда.
  Widget? _resultWindow() {
    final o = _outcome;
    if (o == null) return null;
    final won = o.level == null ? o.reached : o.passed;
    final note = o.level == null
        ? (o.reached ? L.t('numberRunDone') : null)
        : o.passed
            ? (o.guard != null ? L.t('numberRunGuardPassed') : null)
            : o.reached
                ? L.t('levelAlmost').replaceAll('{n}', '${o.level}')
                : null;
    const nb = '\u00a0';
    final threshold = o.guard != null
        ? L.t('numberRunThreshold').replaceAll('{n}', '${o.guard}')
        : (o.reached && o.wallsTotal > 0 ? '${L.t('numberRunWalls')}$nb${o.walls}/${o.wallsTotal}' : null);
    final stats = [
      if (o.level == null) '${L.t('round')}$nb${o.stagesCleared}/$campaignStageCount',
      '${L.t('errors')}$nb${o.hits + o.mistakes}',
      '${L.t('time')}$nb${o.seconds}$nb${L.t('secShort')}',
    ].join('  ·  ');
    return ConstrainedBox(
      key: const Key('nr-result'),
      constraints: const BoxConstraints(maxWidth: 358),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(
          color: Nr.ivory,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Nr.gold, width: 3),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .35), blurRadius: 18, offset: const Offset(0, 6))],
        ),
        // Карточка светлая при любой теме — итог каркаса рисуется светлой схемой забега.
        child: Theme(
          data: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Nr.violet)),
          child: LevelResult(
            passed: won,
            level: o.level,
            score: stats,
            details: Column(mainAxisSize: MainAxisSize.min, children: [
              if (note != null)
                Text(note.toUpperCase(),
                    key: const Key('nr-verdict'),
                    textAlign: TextAlign.center,
                    style: nrText(15, won ? Nr.violet : Nr.navy)),
              Text(L.t('numberRunFinishNumber').toUpperCase(), textAlign: TextAlign.center, style: nrText(13, Nr.ink)),
              Text(
                '${o.number}',
                key: const Key('nr-finish-number'),
                textAlign: TextAlign.center,
                style: nrText(56, o.number < 0 ? Nr.red : Nr.blue, height: 1.1).copyWith(
                  shadows: [Shadow(color: (o.number < 0 ? Nr.red : Nr.blue).withValues(alpha: .35), blurRadius: 14)],
                ),
              ),
              if (threshold != null)
                KeyedSubtree(key: const Key('nr-threshold'), child: NrTab(threshold, upper: false)),
            ]),
            onNext: () {
              _next();
              _start();
            },
            onSettings: _next,
          ),
        ),
      ),
    );
  }

  /// РАЗБОР — ПРИЁМЫ НА ЭТОЙ ДОРОГЕ. Рисунок шага — ряд самой игры из этой раздачи, а если
  /// такого ряда в ней нет — из первого уровня, где он есть. Шаги — только то, что на этом
  /// уровне встречается: дорога всегда, станции — введённые главами, «Страж» — на его уровне.
  /// Станции называют приём своей игры («Мат. спринт», «Состав числа», «Паттерны»,
  /// «Мат. шкала», «Объём памяти») — тот, что засчитывает её ядро.
  List<DemoTrial> _demoTrials() {
    final course = _course!;
    final level = course.format == 'level' ? course.levelId : 0;
    (RoadRow, RoadCourse)? find(bool Function(RoadRow r) test, int fallbackLevel) {
      for (final r in course.rows) {
        if (test(r)) return (r, course);
      }
      final other = _fallbacks.putIfAbsent(
          fallbackLevel, () => makeLevel(fallbackLevel, 1, countingTasksFor(numberLocale(L.locale)), boss: isBossLevel(fallbackLevel)));
      for (final r in other.rows) {
        if (test(r)) return (r, other);
      }
      return null;
    }

    DemoTrial step(String key, (RoadRow, RoadCourse)? at) =>
        DemoTrial(text: '', rule: L.t(key), art: at == null ? null : RowArt(course: at.$2, row: at.$1));
    final known = {
      for (final c in chapters)
        if (level >= c.from) c.station,
    };
    final blitz = find((r) => r.station == 'blitz', 4);
    return [
      step('teachRunMiddle', find((r) => r.shape == 'line' && r.id > 0, 1)),
      step('teachRunColumns', find((r) => r.shape == 'columns', 2)),
      step('teachRunWalls', find((r) => r.kind == 'operation', 1)),
      step('teachRunRamp', find((r) => r.shape == 'ramp', 2)),
      step('teachRunBridge', find((r) => r.terrain == 'bridge', 1)),
      if (known.contains('blitz')) ...[step('teachRunArches', blitz), step('teachMathRound', blitz)],
      if (known.contains('exact')) step('teachBondsTen', find((r) => r.shape == 'exact', 7)),
      if (known.contains('pattern')) step('teachPatternPeriod', find((r) => r.station == 'pattern', 10)),
      if (known.contains('scale')) step('teachSliderAnchor', find((r) => r.station == 'scale', 13)),
      if (known.contains('memory')) step('teachSpanChunks', find((r) => r.recall, 16)),
      if (level >= pileFromLevel)
        step('teachRunPile', find((r) => _pileShapes.contains(r.shape) && r.items.any((i) => !i.part), pileFromLevel)),
      if (course.finale?.boss != null) step('teachRunGuard', null),
    ];
  }

  /// Уровни для рисунков разбора, если нужного ряда в этой раздаче нет (зерно 1 — одно на всех).
  final Map<int, RoadCourse> _fallbacks = {};
}

// ── Дорога ───────────────────────────────────────────────────────────────────────────────────────

/// Цвета сцены веба (`runner-scene.mjs`): вода, настил, числа, стены.
const Color _water = Color(0xFF57C7DF);
Color get numberRunWater => _water;
const Color _scaleInk = Color(0xFF312E81), _scaleSurface = Color(0xFFE0E7FF);
const Color _deckA = Color(0xFFF4F5FA), _deckB = Color(0xFFE3E8EF);
const Color _plus = Color(0xFF443BFF), _minus = Color(0xFFFF1839), _part = Color(0xFFD97706);
const Color _plank = Color(0xFFC3A780), _ramp = Color(0xFF22C55E), _pole = Color(0xFF456AA1);

Color _wallColor(String label) => switch (label.isEmpty ? '' : label[0]) {
      '−' => const Color(0xFFFF4D6D),
      '+' => const Color(0xFF4F7BFF),
      '×' => const Color(0xFF9B6BFF),
      _ => const Color(0xFF65829D),
    };

String _num(double v) => v < 0 ? '−${jsNum(-v)}' : '${jsNum(v)}';

/// Дорога видом сверху. Число игрока внизу, ряды едут к нему: `y = низ − (z − z игрока) · масштаб`.
class NumberRoadView extends StatelessWidget {
  const NumberRoadView({super.key, required this.course, required this.state});

  final RoadCourse course;
  final RoadState state;

  /// Сколько дороги видно впереди: ряд идёт 3 с, впереди видно почти два ряда (≈ 5,5 с).
  static const double viewAhead = 44;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth, h = c.maxHeight;
      final lw = w / 3;
      final carH = math.min(40.0, h * 0.12);
      final carY = h - carH / 2 - 6;
      final lift = jumpHeight(state);
      final carW = math.min(lw * 0.9, lw * 0.5 * numberScale(state.sum)) * (1 + lift / 8);
      final carX = w / 2 + state.x * lw;
      return ClipRect(
        child: Stack(children: [
          Positioned.fill(
            child: CustomPaint(
              key: const Key('nr-road-paint'),
              painter: RoadPainter(
                course: course,
                camZ: state.z,
                nextRow: state.nextRow,
                collected: state.collected,
                carY: carY,
                viewAhead: viewAhead,
                ink: Theme.of(context).colorScheme.onSurface,
                roles: GameColors.of(context),
                aurora: Theme.of(context).extension<UiTemplateTheme>()?.template == UiTemplate.aurora,
                font: DefaultTextStyle.of(context).style.fontFamily,
              ),
            ),
          ),
          if (lift > 0)
            Positioned(
              left: carX - carW / 2 + lift * 2,
              top: carY - carH / 2 + lift * 3,
              width: carW,
              height: carH,
              child: const DecoratedBox(
                decoration: BoxDecoration(color: Color(0x33000000), borderRadius: BorderRadius.all(Radius.circular(10))),
              ),
            ),
          Positioned(
            key: const Key('nr-car'),
            left: carX - carW / 2,
            top: carY - carH / 2 - lift * 4,
            width: carW,
            height: carH,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: state.sum < 0 ? _minus : numberRunAccent,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: Center(
                child: FittedBox(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(
                      _num(jsRound(state.sum)),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ]),
      );
    });
  }
}

/// Рисует дорогу: настил и вода, мосты, трамплины, числа, стены, арки, шкалы, черты.
class RoadPainter extends CustomPainter {
  RoadPainter({
    required this.course,
    required this.camZ,
    required this.nextRow,
    required this.collected,
    required this.carY,
    required this.viewAhead,
    required this.ink,
    required this.roles,
    this.aurora = false,
    this.font,
    this.showPassedScale = true,
  });

  /// Шрифт темы: `TextPainter` внутри рисовальщика его не наследует, и без явной передачи
  /// цифры на числах шли другим шрифтом, чем всё приложение (кадр 01.10 — квадраты).
  final String? font;

  final RoadCourse course;
  final double camZ;
  final int nextRow;
  final List<int> collected;
  final double carY, viewAhead;
  final Color ink;

  /// Роли исхода (`GameColors`): верная арка и флажок верного ответа. Сцена дороги — своя.
  final GameColors roles;

  /// «Аврора»: верная арка — роль `correct`; Classic — прежний `#16A34A` (Classic не меняется).
  final bool aurora;
  final bool showPassedScale;

  @override
  void paint(Canvas canvas, Size size) {
    piles = 0;
    _paint(canvas, size);
    lastPiles = piles;
  }

  void _paint(Canvas canvas, Size size) {
    final w = size.width, lw = w / 3;
    final ppu = (carY - 8) / viewAhead;
    double y(double z) => carY - (z - camZ) * ppu;
    double x(double lane) => w / 2 + lane * lw;
    final zTop = camZ + (carY + 40) / ppu, zBottom = camZ - (size.height - carY + 40) / ppu;
    canvas.drawRect(Offset.zero & size, Paint()..color = _water);

    // Настил по полосам: вода там, где у препятствия опасная полоса в пролёте.
    for (var lane = 0; lane < 3; lane++) {
      final left = lane * lw + 2, right = (lane + 1) * lw - 2;
      final holes = <(double, double)>[];
      for (final r in course.rows) {
        if (r.kind != 'obstacle' || r.span == 0) continue;
        if (r.z < zBottom || r.z - r.span > zTop) continue;
        if (r.penalties[lane] > 0) holes.add((r.z - r.span, r.z));
      }
      final deck = Paint()..color = lane.isEven ? _deckA : _deckB;
      var from = zBottom;
      holes.sort((a, b) => a.$1.compareTo(b.$1));
      for (final (a, b) in [...holes, (zTop, zTop)]) {
        if (a > from) canvas.drawRect(Rect.fromLTRB(left, y(a), right, y(from)), deck);
        from = math.max(from, b);
      }
    }

    for (final r in course.rows) {
      final top = r.z + 30, bottom = r.z - 30;
      if (bottom > zTop || top < zBottom) continue;
      switch (r.kind) {
        case 'obstacle':
          _obstacle(canvas, r, x, y, lw);
        case 'operation':
          _wall(canvas, r, x, y, lw);
        case 'gate':
          _line(canvas, y(r.z), w);
        case 'answer':
          _arches(canvas, r, x, y, lw);
        case 'scale':
          _scale(canvas, r, x, y, lw, w);
        default:
          _pickups(canvas, r, x, y, lw);
      }
    }
  }

  void _obstacle(Canvas canvas, RoadRow r, double Function(double) x, double Function(double) y, double lw) {
    if (r.terrain == 'bridge') {
      for (var lane = 0; lane < 3; lane++) {
        if (r.penalties[lane] > 0) continue;
        final left = lane * lw + 8, right = (lane + 1) * lw - 8;
        final plank = Paint()..color = _plank;
        for (var z = r.z - r.span; z < r.z; z += .9) {
          canvas.drawRect(Rect.fromLTRB(left, y(z + .55), right, y(z)), plank);
        }
        final rail = Paint()
          ..color = const Color(0xFFFFB345)
          ..strokeWidth = 3;
        canvas.drawLine(Offset(left - 3, y(r.z)), Offset(left - 3, y(r.z - r.span)), rail);
        canvas.drawLine(Offset(right + 3, y(r.z)), Offset(right + 3, y(r.z - r.span)), rail);
      }
    }
    final j = r.jump;
    if (j != null) _pad(canvas, x(j.lane), y(r.z - j.launchOffset), lw);
    if (r.span == 0) {
      // Блок: у полосы со штрафом — красный брус с числом, у пустой — ничего.
      for (var lane = 0; lane < 3; lane++) {
        final p = r.penalties[lane];
        if (p == 0) continue;
        final rect = Rect.fromCenter(center: Offset(x(lane - 1.0), y(r.z)), width: lw - 16, height: 26);
        canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(6)), Paint()..color = const Color(0xFF7F1D1D));
        _text(canvas, _num(-p), rect.center, 15, Colors.white);
      }
    }
  }

  void _pad(Canvas canvas, double cx, double cy, double lw) {
    final rect = Rect.fromCenter(center: Offset(cx, cy), width: lw - 18, height: 22);
    canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(8)), Paint()..color = _ramp);
    final arrow = Paint()
      ..color = Colors.white
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;
    canvas.drawPath(
        Path()
          ..moveTo(cx - 10, cy + 5)
          ..lineTo(cx, cy - 5)
          ..lineTo(cx + 10, cy + 5),
        arrow);
  }

  void _wall(Canvas canvas, RoadRow r, double Function(double) x, double Function(double) y, double lw) {
    for (var lane = 0; lane < 3; lane++) {
      final label = r.options[lane] as String;
      final rect = Rect.fromCenter(center: Offset(x(lane - 1.0), y(r.z)), width: lw - 6, height: 30);
      canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(6)), Paint()..color = _wallColor(label));
      _text(canvas, label, rect.center, 17, Colors.white);
    }
  }

  void _line(Canvas canvas, double yy, double w) {
    const cell = 12.0;
    for (var i = 0; i * cell < w; i++) {
      for (var k = 0; k < 2; k++) {
        if ((i + k).isOdd) continue;
        canvas.drawRect(Rect.fromLTWH(i * cell, yy - cell + k * cell, cell, cell), Paint()..color = const Color(0xFF111827));
      }
    }
  }

  void _arches(Canvas canvas, RoadRow r, double Function(double) x, double Function(double) y, double lw) {
    for (var lane = 0; lane < 3; lane++) {
      final rect = Rect.fromCenter(center: Offset(x(lane - 1.0), y(r.z)), width: lw - 10, height: 34);
      final passed = nextRow > r.id;
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(8)),
        Paint()..color = passed && lane == r.correct ? (aurora ? roles.correct : const Color(0xFF16A34A)) : const Color(0xFF1E3A8A),
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(8)),
        Paint()
          ..color = const Color(0xFF3B82F6)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3,
      );
      _text(canvas, _num((r.options[lane] as num).toDouble()), rect.center, 18, Colors.white);
    }
  }

  void _scale(Canvas canvas, RoadRow r, double Function(double) x, double Function(double) y, double lw, double w) {
    final yy = y(r.z);
    double tx(double v) => x((v - r.min) / (r.max - r.min) * 2 - 1);
    canvas.drawRect(Rect.fromLTRB(4, yy - 4, w - 4, yy + 4), Paint()..color = _scaleSurface);
    final every = r.ticks.length <= 6 ? 1 : 2;
    for (var i = 0; i < r.ticks.length; i++) {
      final v = r.ticks[i];
      final tick = Paint()
        ..color = _scaleInk
        ..strokeWidth = 2;
      canvas.drawLine(Offset(tx(v), yy - 9), Offset(tx(v), yy + 9), tick);
      if (i % every == 0 || i == r.ticks.length - 1) {
        final label = '${jsNum((v * 10).roundToDouble() / 10)}'.replaceFirst('-', '−');
        _text(canvas, label, Offset(tx(v).clamp(14, w - 14), yy - 20), 12, _scaleInk, bg: _scaleSurface);
      }
    }
    // Флажок верного ответа — после проезда: показать, где было надо.
    if (showPassedScale && nextRow > r.id) {
      canvas.drawCircle(Offset(tx(r.answer), yy), 7, Paint()..color = roles.correct);
    }
  }

  void _pickups(Canvas canvas, RoadRow r, double Function(double) x, double Function(double) y, double lw) {
    final show = r.show;
    if (show != null) {
      for (var i = 0; i < show.symbols.length; i++) {
        _badge(canvas, show.symbols[i], Offset(x(0), y(r.z + show.dzs[i])), 34, const Color(0xFF0F766E));
      }
      return;
    }
    final d = r.divider;
    if (d != null) {
      final pole = Paint()
        ..color = _pole
        ..strokeWidth = 6
        ..strokeCap = StrokeCap.round;
      canvas.drawLine(Offset(x(0), y(r.z + d.fromDz)), Offset(x(0), y(r.z + d.toDz)), pole);
    }
    final j = r.jump;
    if (j != null) _pad(canvas, x(j.lane), y(r.z - j.launchOffset), lw);
    final current = r.id == nextRow;
    if (r.id < nextRow) return;
    for (var i = 0; i < r.items.length; i++) {
      if (current && collected.contains(i)) continue;
      final it = r.items[i];
      final c = Offset(x(it.x), y(r.z + (it.dz ?? 0)));
      if (r.recall) {
        _badge(canvas, it.symbol ?? '', c, 30, const Color(0xFF134E4A));
        continue;
      }
      if (it.reserve != null) {
        // «×2» в запас — фиолетовая операция, как стена «×».
        final rect = Rect.fromCenter(center: c, width: 52, height: 30);
        canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(8)), Paint()..color = _wallColor('×'));
        _text(canvas, it.reserve!, c, 17, Colors.white);
        continue;
      }
      final half = it.half ?? .18;
      final color = it.part
          ? _part
          : it.value < 0
              ? _minus
              : _plus;
      final pile = pileOf(course, r, i);
      if (pile != null) {
        _pile(canvas, c, pile.$1, pile.$2, color);
        continue;
      }
      final width = math.max(40.0, math.min(2 * half * lw, 2.9 * lw));
      final rect = Rect.fromCenter(center: c, width: width, height: 26);
      canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(7)), Paint()..color = color);
      _text(canvas, _num(it.value), c, 16, Colors.white);
    }
  }

  /// Кучка: «рамки десяти» — два столбика по пять клеток. Полные рамки — десятки, последняя —
  /// единицы: клетки залиты, пустые места обведены, чтобы «сколько не хватает до десяти» было
  /// видно без пересчёта. Знак — цветом плашки.
  void _pile(Canvas canvas, Offset c, int tens, int ones, Color color) {
    const cell = 4.6, gap = 1.2, frameGap = 3.0, pad = 5.0;
    const frameW = 2 * cell + gap, frameH = 5 * cell + 4 * gap;
    final frames = tens + (ones > 0 ? 1 : 0);
    final w = 2 * pad + frames * frameW + (frames - 1) * frameGap;
    final rect = Rect.fromCenter(center: c, width: w, height: frameH + 2 * pad);
    canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(7)), Paint()..color = color);
    final full = Paint()..color = Colors.white;
    final empty = Paint()
      ..color = Colors.white.withValues(alpha: .6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.9;
    for (var f = 0; f < frames; f++) {
      final left = rect.left + pad + f * (frameW + frameGap);
      final filled = f < tens ? 10 : ones;
      for (var k = 0; k < 10; k++) {
        // Сверху вниз по строкам, по две клетки в строке — как заполняют рамку десяти на уроке.
        final r = Rect.fromLTWH(left + (k % 2) * (cell + gap), rect.top + pad + (k ~/ 2) * (cell + gap), cell, cell);
        if (k < filled) {
          canvas.drawRect(r, full);
        } else {
          canvas.drawRect(r.deflate(.45), empty);
        }
      }
    }
    piles++;
  }

  /// Сколько кучек нарисовано последним кадром — пробе, чтобы мерить НАРИСОВАННОЕ, а не правило.
  @visibleForTesting
  static int lastPiles = 0;
  int piles = 0;

  void _badge(Canvas canvas, String symbol, Offset c, double d, Color bg) {
    canvas.drawCircle(c, d / 2, Paint()..color = bg);
    _text(canvas, symbol, c, d * 0.55, Colors.white);
  }

  void _text(Canvas canvas, String s, Offset c, double size, Color color, {Color? bg}) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(fontFamily: font, fontSize: size, fontWeight: FontWeight.w800, color: color)),
      textDirection: TextDirection.ltr,
    )..layout();
    final o = c - Offset(tp.width / 2, tp.height / 2);
    if (bg != null) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(o.dx - 3, o.dy - 1, tp.width + 6, tp.height + 2), const Radius.circular(4)),
        Paint()..color = bg,
      );
    }
    tp.paint(canvas, o);
  }

  @override
  bool shouldRepaint(RoadPainter old) =>
      old.camZ != camZ ||
      old.nextRow != nextRow ||
      old.collected != collected ||
      old.course != course ||
      old.ink != ink ||
      old.roles != roles ||
      old.aurora != aurora ||
      old.font != font;
}

/// Рисунок шага разбора: один ряд этой дороги, камера — перед ним. Размер свой и
/// постоянный, а в плеер он вписывается `FittedBox`: плеер даёт рисунку поле без границ,
/// и `AspectRatio` там падал (поймано пробой разбора 01.10.2026).
class RowArt extends StatelessWidget {
  const RowArt({super.key, required this.course, required this.row});

  final RoadCourse course;
  final RoadRow row;

  static const Size size = Size(270, 300);

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      child: SizedBox.fromSize(
        size: size,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: CustomPaint(
            key: Key('nr-art-${row.id}'),
            size: size,
            painter: RoadPainter(
              course: course,
              camZ: row.z - 26,
              nextRow: row.id,
              collected: const [],
              carY: size.height - 10,
              viewAhead: 40,
              ink: Theme.of(context).colorScheme.onSurface,
              roles: GameColors.of(context),
              aurora: Theme.of(context).extension<UiTemplateTheme>()?.template == UiTemplate.aurora,
              font: DefaultTextStyle.of(context).style.fontFamily,
              showPassedScale: false,
            ),
          ),
        ),
      ),
    );
  }
}

/// ФИНАЛ: лестница из десяти стен (или одна стена «Стража»). Число едет вверх и пробивает,
/// сколько хватит; где остановилось — там и итог. Время — `finaleDuration`, как в вебе.
class FinaleView extends StatelessWidget {
  const FinaleView({super.key, required this.course, required this.value, required this.t, required this.done});

  final RoadCourse course;
  final double value, t;
  final bool done;

  static const List<Color> _ladder = [
    Color(0xFFFFE14D), Color(0xFFF4E84A), Color(0xFFDCEE52), Color(0xFFBCF05C), Color(0xFF98EC69), //
    Color(0xFF78E27C), Color(0xFF5DD697), Color(0xFF4FCAB4), Color(0xFF4CC0D1), Color(0xFF53B5EA),
  ];

  @override
  Widget build(BuildContext context) {
    final walls = finaleWalls(course);
    final guard = course.finale?.boss != null;
    final broken = finaleBroken(course, value);
    final travelled = done ? finaleDistance(course, value) : math.min(finaleDistance(course, value), t * finaleSpeed);
    return LayoutBuilder(builder: (context, c) {
      final h = c.maxHeight, w = c.maxWidth;
      // Вся лестница должна войти в поле: шаг стены — от высоты поля, а не от окна.
      final total = finaleGap * walls.length + 8;
      final ppu = (h - 60) / total;
      final carY = h - 30 - travelled * ppu;
      return Stack(key: const Key('nr-finale'), children: [
        Positioned.fill(child: Container(color: _water)),
        Positioned(left: w * 0.15, right: w * 0.15, top: 0, bottom: 0, child: Container(color: _deckA)),
        for (var i = 0; i < walls.length; i++)
          Positioned(
            key: Key('nr-wall-$i'),
            left: w * 0.12,
            right: w * 0.12,
            top: h - 30 - finaleGap * (i + 1) * ppu - 14,
            height: 28,
            child: Opacity(
              opacity: i < broken && travelled >= finaleGap * (i + 1) - 1.4 ? 0.18 : 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: guard ? const Color(0xFF7C3AED) : _ladder[i % _ladder.length],
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Center(
                  child: Text(
                    '${jsNum(walls[i])}',
                    style: TextStyle(fontWeight: FontWeight.w900, color: guard ? Colors.white : const Color(0xFF1F2937)),
                  ),
                ),
              ),
            ),
          ),
        Positioned(
          key: const Key('nr-finale-car'),
          left: w / 2 - 34,
          top: carY - 18,
          width: 68,
          height: 36,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: numberRunAccent,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white, width: 2),
            ),
            child: Center(
              child: FittedBox(
                child: Text(_num(jsRound(value)),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
              ),
            ),
          ),
        ),
      ]);
    });
  }
}
