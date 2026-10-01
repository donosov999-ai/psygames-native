/// РАННЕР «ПОИСКА ГЛАЗАМИ» — упражнения раздела станциями на дороге.
///
/// Схема: `~/dev/psygames/search-chat/SPEC_RUNNER_SEARCH.md`. Дорога — общее ядро раннеров
/// (`road.dart`, перенос ядра «Числового забега»), станции и порог — `level.dart`.
///
/// 🔴 ВИД СВЕРХУ, А НЕ В ПЕРСПЕКТИВЕ. У «Числового забега» дорога уходит к горизонту, и
/// дальние числа мелкие — их и не надо читать заранее. Здесь в арках фигуры, которые надо
/// РАЗГЛЯДЕТЬ: в перспективе дальняя арка сжимается ровно тогда, когда в неё смотрят. Сверху
/// арка подъезжает в полный размер, а время на поиск задаёт расстояние между рядами.
///
/// Управление одним пальцем: тап по левой/правой половине дороги или свайп — соседняя
/// полоса; стрелки на клавиатуре. Смерти нет: промах не засчитывается, уровень решает
/// порог 70 % в конце (решение Дениса 30.09.2026). Каждый третий засчитанный уровень —
/// общий бой с боссом (`BossRound.winThenBoss`).
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../shell/boss_round.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../object_tracker/model.dart' as tracker;
import '../visual_search/screen.dart' show VsGlyph;
import 'level.dart';
import 'road.dart';

/// Цвета полос: ими кольца трекера указывают арку. Различимы и при дальтонизме
/// (синий / оранжевый / розовый — та же тройка, что у палитры зрительного поиска).
const List<Color> runnerLaneColors = [Color(0xFF3B82F6), Color(0xFFF59E0B), Color(0xFFEC4899)];

/// Цвет раздела на кнопках боя.
const Color runnerAccent = Color(0xFF0E7490);

/// Бой на вехе — три «найди» задания по очереди: резкая смена правила внутри поиска.
BossType runnerBossType(int level) =>
    const [BossType.gonogo, BossType.oddletter, BossType.finderror][((level ~/ 3) - 1) % 3];

class SearchRunnerScreen extends StatefulWidget {
  const SearchRunnerScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Пробы подают зерно; в игре — случайное.
  final int? seed;

  @override
  State<SearchRunnerScreen> createState() => _SearchRunnerScreenState();
}

enum _Phase { ready, running, result }

class _SearchRunnerScreenState extends State<SearchRunnerScreen> with SingleTickerProviderStateMixin {
  late final LevelLadder _ladder;
  late final Ticker _ticker;
  final FocusNode _focus = FocusNode();
  SearchLevel? _lv;
  RoadState? _s;
  Duration _last = Duration.zero;
  _Phase _phase = _Phase.ready;
  bool _won = false;
  bool? _boss;
  int _found = 0;
  int _games = 0;

  // Мир трекера двигается по пройденной дороге, а не по часам: пауза останавливает и его.
  tracker.TrackerWorld? _world;
  TrackerRow? _worldOf;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'search_runner', store: SharedLevelStore(widget.state));
    _ticker = createTicker(_tick);
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (mounted) setState(_newLevel);
  }

  @override
  void dispose() {
    _ticker.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _newLevel() {
    LessonUsed.reset();
    final seed = widget.seed != null ? widget.seed! + _games : math.Random().nextInt(1 << 31);
    _games += 1;
    _lv = makeSearchLevel(_ladder.level, seed, alphabet: searchAlphabet(L.locale));
    _s = roadInitial(_lv!.course);
    _phase = _Phase.ready;
    _won = false;
    _boss = null;
    _found = 0;
    _world = null;
    _worldOf = null;
  }

  void _start() {
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
    if (_phase != _Phase.running || dt <= 0) return;
    final lv = _lv!;
    setState(() => _s = roadAdvanceFrame(_s!, dt, lv.course));
    if (_s!.nextRow >= lv.rows.length) _finish();
  }

  void _lane(int d) {
    if (_phase != _Phase.running) return;
    setState(() => _s = roadChangeLane(_s!, d));
  }

  Future<void> _finish() async {
    _ticker.stop();
    final lv = _lv!;
    final s = _s!;
    final answers = {for (final e in s.answers) e.id!: e.ok!};
    final found = lv.found(answers);
    final passed = lv.passed(answers);
    final seconds = s.elapsed.round();
    final misses = lv.scored.length - found;
    setState(() {
      _phase = _Phase.result;
      _found = found;
    });
    bool? boss;
    if (passed) {
      boss = await BossRound.winThenBoss(
        context,
        _ladder,
        type: runnerBossType(lv.level),
        color: runnerAccent,
        win: () => _ladder.win(score: found * 100, timeSeconds: seconds, errors: misses),
      );
    } else {
      await _ladder.fail(score: found * 100, timeSeconds: seconds, errors: misses);
    }
    if (!mounted) return;
    setState(() {
      _won = passed;
      _boss = boss;
    });
  }

  /// Мир трекера на отметке [ms] от старта слежения (без показа целей — с его конца).
  tracker.TrackerWorld _trackerWorld(TrackerRow row, double ms) {
    if (_worldOf != row || _world == null || _world!.timeMs > ms) {
      _worldOf = row;
      _world = row.round.initialWorld.copy();
    }
    final target = math.min(ms, row.round.durationMs.toDouble());
    if (target > _world!.timeMs) {
      _world = tracker.advanceTrackerWorld(row.round, _world!, target - _world!.timeMs);
    }
    return _world!;
  }

  @override
  Widget build(BuildContext context) {
    final lv = _lv;
    final s = _s;
    if (lv == null || s == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final answered = {for (final e in s.answers) e.id!: e.ok!};
    final foundNow = lv.scored.where((i) => answered[i] == true).length;
    return GameShell(
      title: L.t('searchRunner'),
      onLesson: () => openDemoLesson(context, title: L.t('searchRunner'), trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '${lv.level}', icon: Icons.flag_outlined),
        // «Найдено X/Y» и отдельно «Цель N»: одной дробью «15/11» порог читался как загадка
        // (кадры 30.09).
        HudItem(label: L.t('label_found'), value: '$foundNow/${lv.scored.length}', icon: Icons.search),
        HudItem(label: L.t('goalLabel'), value: '${lv.needed}', icon: Icons.flag_circle_outlined),
      ],
      field: (context, h) => KeyboardListener(
        focusNode: _focus,
        autofocus: true,
        onKeyEvent: (e) {
          if (e is! KeyDownEvent) return;
          if (e.logicalKey == LogicalKeyboardKey.arrowLeft) _lane(-1);
          if (e.logicalKey == LogicalKeyboardKey.arrowRight) _lane(1);
        },
        child: LayoutBuilder(builder: (context, c) {
          final signH = (h * 0.28).clamp(96.0, 180.0);
          return Column(children: [
            SizedBox(height: signH, width: c.maxWidth, child: _sign(lv, s, signH)),
            Expanded(
              child: GestureDetector(
                key: const Key('runner-road'),
                behavior: HitTestBehavior.opaque,
                onTapUp: (d) => _lane(d.localPosition.dx < c.maxWidth / 2 ? -1 : 1),
                onHorizontalDragEnd: (d) {
                  final v = d.primaryVelocity ?? 0;
                  if (v.abs() > 150) _lane(v < 0 ? -1 : 1);
                },
                child: _RoadView(level: lv, state: s, answered: answered),
              ),
            ),
          ]);
        }),
      ),
      toolbar: _toolbar(lv),
      pauseActions: [
        PauseAction(
          label: L.t('restart'),
          icon: Icons.refresh,
          onPressed: () {
            _ticker.stop();
            setState(_newLevel);
          },
        ),
      ],
    );
  }

  Widget? _toolbar(SearchLevel lv) {
    final text = Theme.of(context).textTheme;
    if (_phase == _Phase.ready) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: FilledButton.icon(
          key: const Key('runner-start'),
          onPressed: _start,
          icon: const Icon(Icons.play_arrow),
          label: Text(L.t('start')),
        ),
      );
    }
    if (_phase != _Phase.result) return null;
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(
          '${_won ? L.t('nextLabel') : L.t('retry')} · ${L.t('label_found')} $_found/${lv.scored.length}'
          ' · ${L.t('goalLabel')} ${lv.needed}',
          key: const Key('runner-result'),
          textAlign: TextAlign.center,
          style: text.titleMedium,
        ),
        BossOutcomeLine(_boss),
        const SizedBox(height: 8),
        FilledButton.icon(
          key: const Key('runner-next'),
          onPressed: () => setState(_newLevel),
          icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
          label: Text(_won ? L.t('nextLabel') : L.t('retry')),
        ),
      ]),
    );
  }

  /// Вывеска над дорогой: вопрос ближайшей станции. Слова не нужны — знаки, образец, фигуры.
  Widget _sign(SearchLevel lv, RoadState s, double h) {
    final scheme = Theme.of(context).colorScheme;
    final i = math.min(s.nextRow, lv.rows.length - 1);
    final row = lv.rows[i];
    Widget body;
    // Трекер: вывеска занята слежением от старта до ответа.
    final tr = _activeTracker(lv, s);
    if (tr != null) {
      final ms = (s.z - tr.startZ) / searchSpeed * 1000;
      final flashing = ms < trackerFlashMs;
      final moveMs = ms - trackerFlashMs;
      final world = _trackerWorld(tr, math.max(0, moveMs));
      final stopped = moveMs >= tr.round.durationMs;
      body = AspectRatio(
        aspectRatio: 1,
        child: CustomPaint(
          key: const Key('runner-tracker'),
          painter: _TrackerPainter(
            world: world,
            radius: tr.round.objectRadius,
            targets: flashing ? tr.round.targetIds.toSet() : const {},
            rings: stopped ? {for (var lane = 0; lane < 3; lane += 1) tr.ringed[lane]: runnerLaneColors[lane]} : const {},
            ink: scheme.onSurface,
          ),
        ),
      );
    } else {
      body = switch (row) {
        GatesRow() => FittedBox(key: const Key('runner-ask'), child: _GatesAsk(shown: row.shown, size: 44)),
        WindowsRow() => Row(
            key: const Key('runner-ask'),
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.search, size: 40, color: scheme.onSurfaceVariant),
              const SizedBox(width: 12),
              VsGlyph(shape: row.target.shape, color: row.target.color, size: math.min(64, h * 0.5)),
            ],
          ),
        TrackerRow() || TokenRow() => Icon(
            row is TokenRow && row.trackerStart ? Icons.visibility : Icons.star_rounded,
            key: const Key('runner-ask'),
            size: 48,
            color: const Color(0xFFFBBF24),
          ),
      };
    }
    return Container(
      key: const Key('runner-sign'),
      margin: const EdgeInsets.fromLTRB(8, 6, 8, 4),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      alignment: Alignment.center,
      child: body,
    );
  }

  /// РАЗБОР — ПРИЁМ КАЖДОЙ СТАНЦИИ НА НАСТОЯЩЕЙ РАЗДАЧЕ. Рисунок шага — те же вывеска и
  /// арки, что на дороге (виджеты самой игры), взятые из этого уровня, а если станции в нём
  /// ещё нет — из первого уровня её главы. Верная арка обведена: шаг показывает ПРИЁМ
  /// («смотри на оба знака», «одна примета», «держи группой»), ответ здесь — иллюстрация.
  List<DemoTrial> _demoTrials() {
    final lv = _lv!;
    SearchRow firstOf(bool Function(SearchRow) test, int chapterLevel) {
      for (final r in lv.rows) {
        if (test(r)) return r;
      }
      return makeSearchLevel(chapterLevel, 1, alphabet: searchAlphabet(L.locale)).rows.firstWhere(test);
    }

    return [
      DemoTrial(text: '', rule: L.t('searchRunnerDesc'), art: _LessonArt(row: lv.rows.first)),
      DemoTrial(text: '', rule: L.t('teachRunnerGates'), art: _LessonArt(row: firstOf((r) => r is GatesRow, 4))),
      DemoTrial(text: '', rule: L.t('teachRunnerWindows'), art: _LessonArt(row: firstOf((r) => r is WindowsRow, 7))),
      DemoTrial(text: '', rule: L.t('teachTrackerGroup'), art: _LessonArt(row: firstOf((r) => r is TrackerRow, 10))),
    ];
  }

  /// Станция трекера, которая сейчас идёт: старт пройден, ответ ещё впереди.
  TrackerRow? _activeTracker(SearchLevel lv, RoadState s) {
    for (var i = s.nextRow; i < lv.rows.length; i += 1) {
      final r = lv.rows[i];
      if (r is TrackerRow) return s.z >= r.startZ ? r : null;
      if (r is TokenRow && r.trackerStart) return null;
      if (r.isStation) return null;
    }
    return null;
  }
}

/// Вопрос ворот: два последних знака ряда и «что дальше». Стрелка — значком, а не знаком
/// «→»: на кадрах 30.09 в шрифте его не оказалось, и вывеска показывала пустой квадрат.
class _GatesAsk extends StatelessWidget {
  const _GatesAsk({required this.shown, required this.size});
  final List<String> shown;
  final double size;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontSize: size, fontWeight: FontWeight.w800);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Text('${shown[0]} · ${shown[1]}', style: style),
      Padding(
        padding: EdgeInsets.symmetric(horizontal: size * 0.2),
        child: Icon(Icons.arrow_forward_rounded, size: size * 0.9),
      ),
      Text('?', style: style),
    ]);
  }
}

/// Рисунок шага разбора: вывеска станции и три её арки, верная обведена.
class _LessonArt extends StatelessWidget {
  const _LessonArt({required this.row});
  final SearchRow row;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final Widget ask = switch (row) {
      GatesRow(:final shown) => _GatesAsk(shown: shown, size: 32),
      WindowsRow(:final target) => Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.search, size: 30, color: scheme.onSurfaceVariant),
          const SizedBox(width: 8),
          VsGlyph(shape: target.shape, color: target.color, size: 44),
        ]),
      TrackerRow(:final round) => SizedBox(
          width: 110,
          height: 110,
          child: CustomPaint(
            painter: _TrackerPainter(
              world: round.initialWorld,
              radius: round.objectRadius,
              targets: round.targetIds.toSet(),
              rings: const {},
              ink: scheme.onSurface,
            ),
          ),
        ),
      TokenRow() => const Icon(Icons.star_rounded, size: 40, color: Color(0xFFFBBF24)),
    };
    return FittedBox(
      child: SizedBox(
        width: 300,
        height: 230,
        child: Column(children: [
          SizedBox(height: 120, child: Center(child: ask)),
          const SizedBox(height: 10),
          Row(children: [
            for (var lane = 0; lane < 3; lane += 1)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: SizedBox(
                    height: 90,
                    child: _Arch(row: row, lane: lane, verdict: lane == row.answer ? true : null),
                  ),
                ),
              ),
          ]),
        ]),
      ),
    );
  }
}

/// Дорога сверху: три полосы, ряды приезжают сверху, машина внизу.
class _RoadView extends StatelessWidget {
  const _RoadView({required this.level, required this.state, required this.answered});

  final SearchLevel level;
  final RoadState state;
  final Map<int, bool> answered;

  /// Сколько дороги видно впереди машины: чуть больше ряда — следующая арка видна за ~5 с.
  static const double viewAhead = searchRowGap * 1.35;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth, h = c.maxHeight;
      final lw = w / 3;
      final carH = math.min(44.0, h * 0.14);
      final carY = h - carH / 2 - 6;
      final archW = lw - 10;
      final archH = math.max(48.0, math.min(lw * 0.78, h * 0.34));
      final ppu = (carY - archH / 2) / viewAhead;
      final children = <Widget>[
        Positioned.fill(child: CustomPaint(painter: _LanesPainter(color: scheme.outlineVariant))),
      ];
      for (var i = 0; i < level.rows.length; i += 1) {
        final rz = level.course.rows[i].z;
        final dy = (rz - state.z) * ppu;
        final y = carY - dy;
        if (y < -archH || y > h + archH) continue;
        final row = level.rows[i];
        for (var lane = 0; lane < 3; lane += 1) {
          final chosen = answered.containsKey(i) && _laneOf(i) == lane;
          children.add(Positioned(
            left: lane * lw + 5,
            top: y - archH / 2,
            width: archW,
            height: archH,
            child: _Arch(
              key: Key('arch-$i-$lane'),
              row: row,
              lane: lane,
              verdict: chosen ? answered[i] : null,
            ),
          ));
        }
      }
      final carX = w / 2 + state.x * lw;
      children.add(Positioned(
        key: const Key('runner-car'),
        left: carX - 18,
        top: carY - carH / 2,
        width: 36,
        height: carH,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: runnerAccent,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.white, width: 2),
          ),
        ),
      ));
      return ClipRect(child: Stack(children: children));
    });
  }

  int? _laneOf(int rowId) {
    for (final e in state.answers) {
      if (e.id == rowId) return e.lane! + 1;
    }
    return null;
  }
}

/// Арка на полосе: что в ней лежит, и — после проезда — верно ли выбрана.
class _Arch extends StatelessWidget {
  const _Arch({super.key, required this.row, required this.lane, this.verdict});

  final SearchRow row;
  final int lane;
  final bool? verdict;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final frame = verdict == null
        ? scheme.outline
        : verdict!
            ? const Color(0xFF22C55E)
            : const Color(0xFFEF4444);
    Widget? content;
    switch (row) {
      case TokenRow(:final answer):
        if (lane == answer) content = const Icon(Icons.star_rounded, color: Color(0xFFFBBF24), size: 36);
      case GatesRow(:final arches, :final colors):
        content = FittedBox(
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Text(
              arches[lane],
              style: TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w800,
                color: colors[lane] == null ? scheme.onSurface : _gateColors[colors[lane]!],
              ),
            ),
          ),
        );
      case WindowsRow(:final arches):
        content = LayoutBuilder(builder: (context, c) {
          final g = math.min(c.maxWidth, c.maxHeight) * 0.24;
          return Stack(children: [
            for (final it in arches[lane])
              Positioned(
                left: (it.x * c.maxWidth - g / 2).clamp(0, c.maxWidth - g),
                top: (it.y / 0.75 * c.maxHeight - g / 2).clamp(0, c.maxHeight - g),
                width: g,
                height: g,
                child: Transform.rotate(
                  angle: it.rot * math.pi / 180,
                  child: Stack(children: [
                    VsGlyph(shape: it.shape, color: it.color, size: g),
                    if (it.decoy)
                      Align(
                        alignment: Alignment.center,
                        child: Container(
                          width: g * 0.22,
                          height: g * 0.22,
                          decoration: const BoxDecoration(color: Color(0xFFEF4444), shape: BoxShape.circle),
                        ),
                      ),
                  ]),
                ),
              ),
          ]);
        });
      case TrackerRow():
        content = Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: runnerLaneColors[lane], width: 5),
          ),
        );
    }
    return Semantics(
      label: _label(),
      child: Container(
        decoration: BoxDecoration(
          color: row is WindowsRow ? const Color(0xFF1F2937) : scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: frame, width: verdict == null ? 1.5 : 3),
        ),
        clipBehavior: Clip.hardEdge,
        alignment: Alignment.center,
        child: content,
      ),
    );
  }

  /// Подпись для диктора: что в арке. Ответ не выдаётся — диктор читает то же, что видит глаз.
  String _label() => switch (row) {
        TokenRow(:final answer) => lane == answer ? '★' : '',
        GatesRow(:final arches) => arches[lane],
        WindowsRow(:final arches) =>
          arches[lane].map((it) => '${it.shape.name} ${it.color}${it.decoy ? ' dot' : ''}').join(', '),
        TrackerRow() => 'ring $lane',
      };
}

const List<Color> _gateColors = [Color(0xFFEF4444), Color(0xFF2563EB), Color(0xFF16A34A), Color(0xFFB45309)];

class _LanesPainter extends CustomPainter {
  const _LanesPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 2;
    for (var k = 1; k < 3; k += 1) {
      final x = size.width * k / 3;
      for (var y = 0.0; y < size.height; y += 22) {
        canvas.drawLine(Offset(x, y), Offset(x, math.min(size.height, y + 12)), p);
      }
    }
  }

  @override
  bool shouldRepaint(_LanesPainter old) => old.color != color;
}

class _TrackerPainter extends CustomPainter {
  const _TrackerPainter({
    required this.world,
    required this.radius,
    required this.targets,
    required this.rings,
    required this.ink,
  });

  final tracker.TrackerWorld world;
  final double radius;
  final Set<String> targets;
  final Map<String, Color> rings;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final side = math.min(size.width, size.height);
    final r = radius * side;
    for (final o in world.objects) {
      final c = Offset(o.x * side, o.y * side);
      canvas.drawCircle(c, r, Paint()..color = targets.contains(o.id) ? const Color(0xFF22C55E) : ink);
      final ring = rings[o.id];
      if (ring != null) {
        canvas.drawCircle(
          c,
          r * 1.55,
          Paint()
            ..color = ring
            ..style = PaintingStyle.stroke
            ..strokeWidth = math.max(3, r * 0.45),
        );
      }
    }
  }

  @override
  bool shouldRepaint(_TrackerPainter old) => true;
}
