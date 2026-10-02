import 'dart:math' as math;

import 'package:flutter/gestures.dart' show DeviceGestureSettings;
import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/js_compat.dart' show jsRound;
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/preset_cap.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// Цвета игры — те же, что у веба (`GRADIENT` в `frontend/app/games/trail-making.tsx`).
const trailGradient = [Color(0xFFFC6076), Color(0xFFFF9A44)];

enum TrailPhase { ready, playing, done }

/// «СОЕДИНИ ЦЕПОЧКУ» — экран на общем каркасе. Перенос `frontend/app/games/trail-making.tsx`.
///
/// Ввод перенесён целиком: тап по узлу И протяжка через узлы, не отрывая пальца. Протяжка начинается
/// со смещения 6 точек, как у веба (`DRAG_SLOP`); у Flutter по умолчанию 36 — короткое ведение
/// превращалось бы в тапы. Неверный узел при протяжке — одна ошибка на один вход, жест не рвётся.
///
/// Канва считается от высоты ПОЛЯ каркаса, а не от окна: у веба `min(высота·0.55, 460)` — окно не
/// знает про шапку, счётчики и ряд значков.
class TrailMakingScreen extends StatefulWidget {
  const TrailMakingScreen({super.key, required this.state, this.random, this.now});

  final SharedState state;

  /// Случайность раскладки; проба подставляет семенную.
  final math.Random? random;

  /// Часы партии в секундах; проба подставляет свои.
  final double Function()? now;

  @override
  State<TrailMakingScreen> createState() => _TrailMakingScreenState();
}

class _TrailMakingScreenState extends State<TrailMakingScreen> {
  late final LevelLadder _ladder =
      LevelLadder(gameId: 'trail_making', store: SharedLevelStore(widget.state), maxLevel: trailLevels);
  bool _ready = false;
  TrailPhase _phase = TrailPhase.ready;
  TrailGame? _game;
  int _level = 1;
  TrailMode _mode = TrailMode.a;
  int _count = 6;
  int _timeLimit = 0;
  double _startedAt = 0;
  double _elapsed = 0;
  bool _passed = false;
  GameTimer? _tick;
  Offset? _drag;

  /// Канва партии. Считается в ПЕРВОМ кадре партии, а не до старта: до старта снизу стоит кнопка
  /// «Начать», и поле на её высоту ниже — канва вышла бы на ~80 точек меньше, чем помещается.
  Size _canvas = const Size(328, 352);
  math.Random? _rnd;

  /// Время партии в секундах — по ИГРОВЫМ часам (`lib/shell/game_clock.dart`): на паузе каркаса,
  /// в разборе и в фоне они стоят, и лимит ступени не тает, пока человек читает меню.
  double _now() => widget.now?.call() ?? gameNow() / 1000;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() => _ready = true);
    // Шаг зарядки начинается сам — перенос веб-`useAutostartWhenReady` (trail-making.tsx:183;
    // отчёт Дениса 01.10.2026: «каждое упражнение надо вручную»). Один раз, после загрузки уровня.
    if (GamePreset.autostart) _start();
  }

  void _start() {
    LessonUsed.reset();
    _tick?.cancel();
    final p = trailLevelParams(_ladder.level);
    _level = _ladder.level;
    if (GamePreset.isPreset) {
      // Шаг зарядки: вид и число узлов — из адреса, но не больше освоенного плюс шаг; лимита нет.
      _mode = GamePreset.str('mode', 'B') == 'A' ? TrailMode.a : TrailMode.b;
      _count = capPresetByLevel(want: GamePreset.num('count', 8), atLevel: p.count, atTop: _ladder.level >= 14);
      _timeLimit = 0;
    } else {
      _mode = p.mode;
      _count = p.count;
      _timeLimit = p.timeLimitSec;
    }
    _rnd = widget.random ?? math.Random();
    setState(() {
      _game = null; // раскладку поставит первый кадр партии — по полю, каким оно будет в игре
      _phase = TrailPhase.playing;
      _passed = false;
      _drag = null;
      _startedAt = _now();
      _elapsed = 0;
    });
    _tick = gameInterval(const Duration(milliseconds: 100), () {
      if (mounted && _phase == TrailPhase.playing) setState(() => _elapsed = _now() - _startedAt);
    });
  }

  void _step(TrailStep step) {
    if (step == TrailStep.done) {
      _finish();
    } else if (step != TrailStep.ignored) {
      setState(() {});
    }
  }

  Future<void> _finish() async {
    _tick?.cancel();
    final g = _game!;
    final seconds = _now() - _startedAt;
    final passed = !GamePreset.isPreset && trailPassed(seconds: seconds, timeLimitSec: _timeLimit, errors: g.errors);
    setState(() {
      _elapsed = seconds;
      _passed = passed;
      _phase = TrailPhase.done;
      _drag = null;
    });
    final score = trailScore(seconds, g.errors);
    final time = jsRound(seconds).toInt();
    if (passed) {
      await _ladder.win(score: score, timeSeconds: time, errors: g.errors, mode: '${_count}n');
    } else {
      await _ladder.fail(score: score, timeSeconds: time, errors: g.errors, mode: '${_count}n');
    }
    if (mounted) setState(() {});
  }

  void _restart() {
    _tick?.cancel();
    setState(() {
      _phase = TrailPhase.ready;
      _game = null;
      _drag = null;
      _elapsed = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final g = _game;
    final total = g?.layout.nodes.length ?? 0;
    return GameShell(
      title: L.t('trailMaking'),
      onLesson: () => openDemoLesson(context, title: L.t('trailMaking'), trials: trailLessonTrials(L.locale)),
      hud: [
        HudItem(label: L.t('hud_point'), value: '${g?.current ?? 0}/$total', icon: Icons.my_location),
        HudItem(
          label: L.t('time'),
          value: '${_elapsed.toStringAsFixed(1)}${_timeLimit > 0 ? '/$_timeLimit' : ''}${L.t('secShort')}',
          icon: Icons.timer_outlined,
        ),
      ],
      field: (context, h) => _field(context, h),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _phase == TrailPhase.playing ? _restart : null),
      ]),
      toolbar: switch (_phase) {
        TrailPhase.ready => Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton.icon(
              key: const Key('trail-start'),
              onPressed: _start,
              icon: const Icon(Icons.play_arrow),
              label: Text(L.t('start')),
            ),
          ),
        TrailPhase.done => Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton.icon(
              key: const Key('trail-next'),
              onPressed: _start,
              icon: Icon(_passed ? Icons.arrow_forward : Icons.replay),
              label: Text(_passed ? L.t('nextLabel') : L.t('retry')),
            ),
          ),
        _ => null,
      },
      pauseActions: [PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart)],
    );
  }

  Widget _field(BuildContext context, double h) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(builder: (context, c) {
      // Канва — от поля: у веба ширина `min(ширина−32, 600)`, высота от окна; здесь высота — остаток поля
      // под двумя строками подсказки.
      final canvas = Size(
        math.min(c.maxWidth - 32, 600).toDouble(),
        math.max(0.0, math.min(460.0, h - 56)),
      );
      if (_phase == TrailPhase.ready) return _readyCard(context);
      if (_game == null) {
        _canvas = canvas;
        _game = TrailGame(trailMakeNodes(_mode, _count, L.locale, canvas.width, canvas.height, _rnd!));
        // Шапка со счётчиком узлов строилась раньше поля — перерисовать её со свежим числом.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() {});
        });
      }
      final g = _game!;
      final next = g.current < g.layout.nodes.length ? g.layout.nodes[g.current].label : null;
      return Column(
        children: [
          const SizedBox(height: 6),
          Text(
            _phase == TrailPhase.done ? _resultLine() : '${L.t('nextLabel')}: $next',
            key: const Key('trail-hint'),
            textAlign: TextAlign.center,
            style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600),
          ),
          SizedBox(
            height: 22,
            child: g.current == 0 && _phase == TrailPhase.playing
                ? Text(L.t('trailCrossOk'),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant.withValues(alpha: 0.8)))
                : null,
          ),
          const SizedBox(height: 4),
          _Canvas(
            game: g,
            size: _canvas,
            drag: _drag,
            onTap: _phase == TrailPhase.playing ? (i) => _step(g.tap(i)) : null,
            onDrag: _phase == TrailPhase.playing
                ? (p) {
                    _drag = p;
                    final s = g.dragAt(p.dx, p.dy);
                    s == TrailStep.ignored ? setState(() {}) : _step(s);
                  }
                : null,
            onDragEnd: () => setState(() {
              g.endDrag();
              _drag = null;
            }),
          ),
        ],
      );
    });
  }

  String _resultLine() {
    final g = _game!;
    final head = _passed ? L.f('levelDone', {'n': '$_level'}) : L.t('done');
    return '$head · ${L.t('score')}: ${trailScore(_elapsed, g.errors)} · ${L.t('errors')}: ${g.errors}';
  }

  Widget _readyCard(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final p = trailLevelParams(_ladder.level);
    final params = p.mode == TrailMode.a ? L.f('trailLvlParamsA', {'n': '${p.count}'}) : L.t('trailLvlParamsB');
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Container(
          key: const Key('trail-ready'),
          constraints: const BoxConstraints(maxWidth: 520),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${L.t('level')} ${_ladder.level}',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text('$params · ${L.f('trailNodes', {'n': '${p.totalNodes}'})}',
                  textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
              const SizedBox(height: 6),
              Text(
                L.f('trailPass', {'t': '${p.timeLimitSec}', 'e': '$trailMaxPassErrors'}),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Канва партии: линия по пройденным узлам, «резинка» к пальцу, кружки узлов.
class _Canvas extends StatelessWidget {
  const _Canvas({
    required this.game,
    required this.size,
    required this.drag,
    required this.onTap,
    required this.onDrag,
    required this.onDragEnd,
  });

  final TrailGame game;
  final Size size;
  final Offset? drag;
  final void Function(int index)? onTap;
  final void Function(Offset at)? onDrag;
  final VoidCallback onDragEnd;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = game.layout;
    // Протяжка с 6 точек, как `DRAG_SLOP` у веба: порог протяжки Flutter — удвоенный touchSlop.
    return MediaQuery(
      data: MediaQuery.of(context).copyWith(gestureSettings: const DeviceGestureSettings(touchSlop: 3)),
      child: GestureDetector(
        key: const Key('trail-canvas'),
        behavior: HitTestBehavior.opaque,
        onPanStart: onDrag == null ? null : (d) => onDrag!(d.localPosition),
        onPanUpdate: onDrag == null ? null : (d) => onDrag!(d.localPosition),
        onPanEnd: (_) => onDragEnd(),
        onPanCancel: onDragEnd,
        child: Container(
          width: size.width,
          height: size.height,
          decoration: BoxDecoration(color: scheme.surface, borderRadius: BorderRadius.circular(16)),
          child: Stack(
            children: [
              Positioned.fill(child: CustomPaint(painter: TrailLinePainter(l.nodes, game.current, drag))),
              for (var i = 0; i < l.nodes.length; i++)
                Positioned(
                  left: l.nodes[i].x - l.size / 2,
                  top: l.nodes[i].y - l.size / 2,
                  width: l.size,
                  height: l.size,
                  child: TrailNodeDot(
                    key: Key('trail-node-$i'),
                    label: l.nodes[i].label,
                    size: l.size,
                    done: i < game.current,
                    onTap: onTap == null ? null : () => onTap!(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Кружок узла. Следующий НЕ подсвечивается: искать его по порядку и есть суть игры.
class TrailNodeDot extends StatelessWidget {
  const TrailNodeDot({super.key, required this.label, required this.size, required this.done, this.onTap});

  final String label;
  final double size;
  final bool done;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: onTap != null,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done ? trailGradient[0] : scheme.surfaceContainerHighest,
            border: Border.all(color: done ? trailGradient[0] : scheme.onSurfaceVariant, width: 2),
          ),
          alignment: Alignment.center,
          // Подпись узла уже в Semantics выше — без этого чтец произносил номер дважды («1, 1»).
          child: ExcludeSemantics(
            child: Text(
              label,
              style: TextStyle(
                fontSize: math.max(11, (size * 0.34).roundToDouble()),
                fontWeight: FontWeight.w800,
                color: done ? Colors.white : scheme.onSurface,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Линия по пройденным узлам и «резинка» от последнего пройденного к пальцу.
class TrailLinePainter extends CustomPainter {
  TrailLinePainter(this.nodes, this.current, this.drag);

  final List<TrailNode> nodes;
  final int current;
  final Offset? drag;

  @override
  void paint(Canvas canvas, Size size) {
    final line = Paint()
      ..color = trailGradient[0]
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    for (var i = 1; i < current && i < nodes.length; i++) {
      canvas.drawLine(Offset(nodes[i - 1].x, nodes[i - 1].y), Offset(nodes[i].x, nodes[i].y), line);
    }
    final d = drag;
    if (d != null && current > 0 && current < nodes.length) {
      canvas.drawLine(Offset(nodes[current - 1].x, nodes[current - 1].y), d,
          line..color = trailGradient[0].withValues(alpha: 0.55));
    }
  }

  @override
  bool shouldRepaint(TrailLinePainter old) => old.current != current || old.drag != drag || old.nodes != nodes;
}

/// РАЗБОР: два режима — два приёма, стимул — канва самой игры с началом пути.
///
/// ⚠️ Раскладка разбора — своя, со своим зерном: разбор учит приёму и не подсказывает партию.
List<DemoTrial> trailLessonTrials(String locale) {
  Widget board(TrailLayout l, int passed) {
    final g = TrailGame(l)..current = passed;
    return SizedBox(
      width: 260,
      height: 220,
      child: Stack(children: [
        Positioned.fill(child: CustomPaint(painter: TrailLinePainter(l.nodes, g.current, null))),
        for (var i = 0; i < l.nodes.length; i++)
          Positioned(
            left: l.nodes[i].x - l.size / 2,
            top: l.nodes[i].y - l.size / 2,
            width: l.size,
            height: l.size,
            child: TrailNodeDot(label: l.nodes[i].label, size: l.size, done: i < g.current),
          ),
      ]),
    );
  }

  String path(TrailLayout l) => '${l.nodes.take(5).map((n) => n.label).join(' → ')} → …';
  final a = trailMakeNodes(TrailMode.a, 8, locale, 260, 220, math.Random(20260930));
  final b = trailMakeNodes(TrailMode.b, 4, locale, 260, 220, math.Random(20260931));
  return [
    DemoTrial(text: '', art: board(a, 3), answer: path(a), rule: L.t('teachTrailA')),
    DemoTrial(text: '', art: board(b, 3), answer: path(b), rule: L.t('teachTrailB')),
  ];
}
