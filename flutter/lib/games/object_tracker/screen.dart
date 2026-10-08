import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/l10n.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Трекер объектов» на общем каркасе — игра про удержание нескольких целей.
///
/// 🔴 ПОЛЕ КВАДРАТНОЕ И БЕРЁТ СТОРОНУ У МЕНЬШЕЙ ИЗ ДВУХ ВЕЛИЧИН. В вебе сторона
/// считалась ТОЛЬКО от ширины экрана (`min(640, max(240, ширина − 16))`), и на
/// низком экране квадрат вылезал за низ — та самая жалоба «игры ездят». Здесь
/// сторона = min(ширина поля, высота поля каркаса), и высота приходит числом.
///
/// ⚠️ РАЗМЕР ШАРИКА ПЕРЕНЕСЁН ИЗ ВЕБА ВМЕСТЕ С НИЖНЕЙ ГРАНИЦЕЙ 48 ТОЧЕК. Это не
/// украшение: на малых полях доля радиуса даёт шарик, в который не попасть пальцем.
/// Правило вёрстки здесь такое же правило, как правило игры, и переносится так же.
class ObjectTrackerScreen extends StatefulWidget {
  const ObjectTrackerScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<ObjectTrackerScreen> createState() => _ObjectTrackerScreenState();
}

enum _Phase { preview, moving, selection, result }

class _ObjectTrackerScreenState extends State<ObjectTrackerScreen> with SingleTickerProviderStateMixin {
  static const double _minBall = 48;
  static const double _fieldMax = 640;
  static const double _fieldPad = 8;
  static const double _reducedStepMs = 250;

  late LevelLadder _ladder;
  late Ticker _ticker;
  Duration _lastTick = Duration.zero;

  ObjectTrackerRound? _round;
  TrackerWorld? _world;
  _Phase _phase = _Phase.preview;
  final List<String> _selected = [];
  ObjectTrackerMetrics? _result;
  bool _reduced = false;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    // Потолка нет (правило Дениса 06.09): выше 41-го растёт скорость — см. model.dart.
    _ladder = LevelLadder(gameId: 'object_tracker', store: SharedLevelStore(widget.state), maxLevel: 999);
    _ticker = createTicker(_onTick);
    _boot();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _reset();
      _ready = true;
    });
  }

  /// Зерно круга — `object-tracker-<уровень>`, как в вебе: тот же уровень даёт
  /// тот же расклад, и «ещё раз» повторяет ровно ту партию.
  /// 🔴 УРОВЕНЬ ПАРТИИ — ИЗ ШАГА ЗАРЯДКИ, ЕСЛИ ШАГ ЕГО ЗАДАЛ, ИНАЧЕ ЛИЧНЫЙ.
  ///
  /// Как в вебе (`object-tracker.tsx`: `Math.min(LEVELS, num('level', lvl.level))`):
  /// шаг несёт уровень по правилу «освоенный минус 20 %», а потолок лестницы
  /// держится и здесь — выше генератор не растёт. Зерно строится от него же.
  /// Уровень шага зарядки — но не выше предела лестницы: с 02.10.2026 это 999, а не прежний потолок 41.
  int get _playLevel => math.min(_ladder.maxLevel, GamePreset.num('level', _ladder.level));

  String get _seed => 'object-tracker-$_playLevel';

  void _reset() {
    // Новая партия — снова зачётная (договор shell/lesson.dart: отметку «разбор
    // смотрели» снимает новая раздача). Отметка общая на всё приложение, и без
    // сброса один открытый разбор выключал бы рост уровня во всех играх.
    LessonUsed.reset();
    _ticker.stop();
    _lastTick = Duration.zero;
    final round = generateObjectTrackerRound(_seed, _playLevel);
    _round = round;
    _world = round.initialWorld.copy();
    _phase = _Phase.preview;
    _selected.clear();
    _result = null;
  }

  void _begin() {
    setState(() => _phase = _Phase.moving);
    if (_reduced) return;   // в щадящем режиме мир двигают нажатием, а не кадрами
    _lastTick = Duration.zero;
    _ticker.start();
  }

  /// Мир двигают ДЕЛЬТЫ КАДРОВ, а не часы: на паузе тикер остановлен, поэтому
  /// шарики не разлетаются, пока человек читает правила или пишет отзыв.
  void _onTick(Duration elapsed) {
    final round = _round!;
    final delta = _lastTick == Duration.zero ? 16.0 : (elapsed - _lastTick).inMicroseconds / 1000.0;
    _lastTick = elapsed;
    final next = advanceTrackerWorld(round, _world!, delta);
    setState(() => _world = next);
    if (next.timeMs >= round.durationMs) {
      _ticker.stop();
      setState(() => _phase = _Phase.selection);
    }
  }

  void _step() {
    final round = _round!;
    final next = advanceTrackerWorld(round, _world!, _reducedStepMs);
    setState(() => _world = next);
    if (next.timeMs >= round.durationMs) setState(() => _phase = _Phase.selection);
  }

  void _toggle(String id) {
    if (_phase != _Phase.selection) return;
    setState(() {
      if (_selected.contains(id)) {
        _selected.remove(id);
      } else if (_selected.length < _round!.targetCount) {
        _selected.add(id);
      }
    });
  }

  Future<void> _submit() async {
    final round = _round!;
    final metrics = scoreObjectTrackerCompletion(
      round,
      List<String>.of(_selected),
      durationMs: _world!.timeMs.round(),
      closeApproaches: _world!.closeApproaches,
    );
    if (isPassed(metrics)) {
      await _ladder.win();
    } else {
      await _ladder.fail();
    }
    if (!mounted) return;
    setState(() {
      _result = metrics;
      _phase = _Phase.result;
    });
  }

  String get _line {
    switch (_phase) {
      case _Phase.preview:
        return L.f('trkPreview', {'n': '${_round!.targetCount}'});
      case _Phase.moving:
        return L.t('trkMoving');
      case _Phase.selection:
        return L.t('trkSelect');
      case _Phase.result:
        final m = _result!;
        return isPassed(m)
            ? L.f('trkResultWin', {'hits': '${m.hits}', 'total': '${m.hits + m.misses}', 'extra': '${m.falseSelections}'})
            : L.f('trkResultFail', {'hits': '${m.hits}', 'total': '${m.hits + m.misses}', 'extra': '${m.falseSelections}'});
    }
  }

  /// Заголовок один на экран и на разбор: вторая такая строка — второй долг
  /// храповика подписей (`test/ui_text_debt_does_not_grow_test.dart`).
  String get _title => L.t('objectTracker');

  /// Разбор объясняет ПРИЁМ: верный ответ человек и так увидит по итогу раунда,
  /// а вот чем объём берётся — нет.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachTrackerGroup')),
      ];

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final round = _round!;
    final world = _world!;
    final left = round.durationMs - world.timeMs;
    return GameShell(
      title: _title,
      onLesson: () => openDemoLesson(context, title: _title, trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '$_playLevel', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('trkTargets'), value: '${round.targetCount}', icon: Icons.adjust),
        HudItem(
          label: _phase == _Phase.moving ? L.t('timeLeftLabel') : L.t('puzzleHudMarked'),
          value: _phase == _Phase.moving
              ? '${(left / 1000).ceil()} ${L.t('secShort')}'
              : '${_selected.length}/${round.targetCount}',
          icon: _phase == _Phase.moving ? Icons.timer_outlined : Icons.check_circle_outline,
        ),
      ],
      field: (context, h) => _Field(
        round: round,
        world: world,
        phase: _phase,
        selected: _selected,
        height: h,
        minBall: _minBall,
        fieldMax: _fieldMax,
        pad: _fieldPad,
        onTap: _toggle,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.slow_motion_video,
          label: L.t('trkGentle'),
          active: _reduced,
          onPressed: _phase == _Phase.preview ? () => setState(() => _reduced = !_reduced) : null,
        ),
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_line, key: const Key('строка'), textAlign: TextAlign.center),
          const SizedBox(height: 8),
          if (_phase == _Phase.preview)
            FilledButton.icon(
              key: const Key('поехали'),
              onPressed: _begin,
              icon: const Icon(Icons.play_arrow),
              label: Text(L.t('onbSlideGoTitle')),
            ),
          if (_phase == _Phase.moving && _reduced)
            FilledButton.icon(
              key: const Key('шаг'),
              onPressed: _step,
              icon: const Icon(Icons.skip_next),
              label: Text(L.t('hud_step')),
            ),
          if (_phase == _Phase.selection)
            FilledButton.icon(
              key: const Key('готово'),
              onPressed: _selected.isEmpty ? null : _submit,
              icon: const Icon(Icons.check),
              label: Text(L.t('storyDone')),
            ),
          if (_phase == _Phase.result)
            FilledButton.icon(
              key: const Key('дальше'),
              onPressed: () => setState(_reset),
              icon: Icon(isPassed(_result!) ? Icons.arrow_forward : Icons.refresh),
              label: Text(isPassed(_result!) ? L.t('nextLabel') : L.t('retry')),
            ),
        ]),
      ),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

/// Квадратное поле: сторона берётся у МЕНЬШЕЙ из величин — ширины и высоты,
/// которую отдал каркас. Шарик не мельче 48 точек, иначе в него не попасть пальцем.
class _Field extends StatelessWidget {
  const _Field({
    required this.round,
    required this.world,
    required this.phase,
    required this.selected,
    required this.height,
    required this.minBall,
    required this.fieldMax,
    required this.pad,
    required this.onTap,
  });

  final ObjectTrackerRound round;
  final TrackerWorld world;
  final _Phase phase;
  final List<String> selected;
  final double height, minBall, fieldMax, pad;
  final void Function(String) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(builder: (context, c) {
      final side = math.min(fieldMax, math.max(0.0, math.min(c.maxWidth, height) - pad * 2));
      final diameter = math.max(minBall, side * round.objectRadius * 2);
      final targets = round.targetIds.toSet();

      return Center(
        child: SizedBox(
          key: const Key('поле'),
          width: side,
          height: side,
          child: Stack(children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            for (var i = 0; i < world.objects.length; i += 1)
              _Ball(
                key: Key('шарик$i'),
                index: i,
                object: world.objects[i],
                side: side,
                diameter: diameter,
                marked: phase == _Phase.preview && targets.contains(world.objects[i].id),
                chosen: selected.contains(world.objects[i].id),
                revealed: phase == _Phase.result && targets.contains(world.objects[i].id),
                enabled: phase == _Phase.selection,
                onTap: () => onTap(world.objects[i].id),
              ),
          ]),
        ),
      );
    });
  }
}

class _Ball extends StatelessWidget {
  const _Ball({
    super.key,
    required this.index,
    required this.object,
    required this.side,
    required this.diameter,
    required this.marked,
    required this.chosen,
    required this.revealed,
    required this.enabled,
    required this.onTap,
  });

  final int index;
  final TrackerObjectState object;
  final double side, diameter;
  final bool marked, chosen, revealed, enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Место шарика прижато к полю ТЕМ ЖЕ зажимом, что в вебе: центр не даёт
    // шарику вылезти краем за поле, когда диаметр поднят до минимальных 48.
    final leftPx = math.min(side - diameter, math.max(0.0, object.x * side - diameter / 2));
    final topPx = math.min(side - diameter, math.max(0.0, object.y * side - diameter / 2));
    final outlined = marked || chosen || revealed;
    return Positioned(
      left: leftPx,
      top: topPx,
      child: Semantics(
        button: enabled,
        label: [
          L.f('trkBallA11y', {'n': '${index + 1}'}),
          if (marked) L.t('trkA11yTarget'),
          if (chosen) L.t('trkA11yChosen'),
          if (revealed) L.t('trkA11yWasTarget'),
        ].join(', '),
        child: GestureDetector(
          onTap: enabled ? onTap : null,
          child: Container(
            width: diameter,
            height: diameter,
            decoration: BoxDecoration(
              color: scheme.primary.withValues(alpha: chosen ? 0.9 : 0.55),
              shape: BoxShape.circle,
              border: Border.all(
                color: outlined ? scheme.tertiary : Colors.transparent,
                width: outlined ? 5 : 0,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
