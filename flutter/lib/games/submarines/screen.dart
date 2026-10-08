import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_clock.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// ЭКРАН «ПОДЛОДКИ» — развилка «Поиск глазами», движок MindLab `submarinos/sea.py`.
///
/// Нажатие по клетке — выстрел: точка — мимо, красное — попал, тёмное — потоплен.
/// Под полем флот: какие корабли ещё живы. Ступень взята, если флот потоплен за
/// бюджет выстрелов; бюджет кончился — флот показывается, ступень не взята.
class SubmarinesScreen extends StatefulWidget {
  const SubmarinesScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно раздачи для проб; без него — случайная.
  final int? seed;

  @override
  State<SubmarinesScreen> createState() => _SubmarinesScreenState();
}

class _SubmarinesScreenState extends State<SubmarinesScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  late final LevelLadder _ladder;
  late final math.Random _rnd;
  SubBoard? _board;
  int _levelNo = 1;
  bool _over = false;
  bool _won = false;
  // Часы партии (lib/shell/game_clock.dart): стоят под паузой, разбором и в фоне.
  int _startedMs = gameNow();

  @override
  void initState() {
    super.initState();
    _rnd = math.Random(widget.seed);
    _ladder = LevelLadder(gameId: 'submarines', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_newLevel);
  }

  void _newLevel() {
    // Новая партия — снова зачётная: отметку разбора снимает новая раздача.
    LessonUsed.reset();
    _levelNo = _ladder.level;
    _board = SubBoard.deal(_levelNo, _rnd);
    _over = false;
    _won = false;
    _startedMs = gameNow();
  }

  Future<void> _fire(int r, int c) async {
    final b = _board;
    if (b == null || _over || b.sea.shots.containsKey((r, c))) return;
    setState(() => b.sea.fire(r, c));
    // Попадание — щелчок; промах выстрелом не ошибка, а разведка: без толчка.
    if (b.sea.shots[(r, c)] == true) _haptics.hit();
    final used = b.sea.shots.length;
    if (b.sea.done || used >= b.budget) await _finish();
  }

  Future<void> _finish() async {
    final b = _board!;
    final passed = b.sea.done && b.sea.shots.length <= b.budget;
    final seconds = (gameNow() - _startedMs) ~/ 1000;
    final misses = b.sea.shots.values.where((hit) => !hit).length;
    final details = <String, Object?>{
      'size': b.level.size,
      'fleet': [for (final s in b.level.fleet) s.length],
      'shots': b.sea.shots.length,
      'budget': b.budget,
      'bot': b.bot,
      'factor': b.level.factor,
      'sunk': b.sea.sunk.length,
    };
    final score = passed ? math.max(0, (b.budget - b.sea.shots.length) * 10 + 100) : b.sea.sunk.length * 20;
    setState(() => _over = true);
    passed ? _haptics.win() : _haptics.miss();
    if (passed) {
      await _ladder.win(score: score, timeSeconds: seconds, errors: misses, details: details);
    } else {
      await _ladder.fail(score: score, timeSeconds: seconds, errors: misses, details: details);
    }
    if (!mounted) return;
    setState(() => _won = passed);
  }

  /// РАЗБОР — ТРИ ПРИЁМА, НЕ ОТВЕТ: шахматка (самый короткий корабль — две клетки, и шахматка
  /// его не пропустит), добивание по линии после попадания, и карта: где больше способов
  /// поставить живой корабль — туда и стрелять. Карта — мозг бота движка на ЭТИХ выстрелах.
  List<DemoTrial> _demoTrials() {
    final b = _board!;
    final heat = probMap(b.level.size, b.level.fleet, b.sea.shots, b.sea.sunk);
    return [
      DemoTrial(text: '', rule: L.t('teachSubParity'), art: _LessonGrid(size: b.level.size, mode: _Art.parity)),
      DemoTrial(text: '', rule: L.t('teachSubFinish'), art: _LessonGrid(size: b.level.size, mode: _Art.finish)),
      DemoTrial(
        text: '',
        rule: L.t('teachSubHeat'),
        art: _LessonGrid(size: b.level.size, mode: _Art.heat, heat: heat, shots: b.sea.shots),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final b = _board;
    if (b == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final alive = b.level.fleet.where((s) => !b.sea.sunk.contains(s.name)).length;
    return GameShell(
      title: L.t('submarines'),
      onLesson: _over ? null : () => openDemoLesson(context, title: L.t('submarines'), trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('level'), value: '$_levelNo', icon: Icons.flag_outlined),
        HudItem(label: L.t('hud_moves'), value: '${b.sea.shots.length}/${b.budget}', icon: Icons.gps_fixed),
        HudItem(label: L.t('label_found'), value: '${b.level.fleet.length - alive}/${b.level.fleet.length}',
            icon: Icons.directions_boat_outlined),
      ],
      field: (context, h) => LayoutBuilder(builder: (context, c) {
        const fleetH = 34.0;
        final side = math.min(c.maxWidth, c.maxHeight - fleetH - 8) - 12;
        final cell = side / b.level.size;
        final shipAt = <(int, int), String>{
          for (final e in b.sea.ships.entries)
            for (final x in e.value) x: e.key,
        };
        return Column(children: [
          Expanded(
            child: Center(
              child: SizedBox(
                key: const ValueKey('sub-board'),
                width: side,
                height: side,
                child: Stack(children: [
                  for (var r = 0; r < b.level.size; r++)
                    for (var col = 0; col < b.level.size; col++)
                      Positioned(
                        left: col * cell,
                        top: r * cell,
                        width: cell,
                        height: cell,
                        child: _Cell(
                          key: _over && !b.sea.shots.containsKey((r, col)) && shipAt.containsKey((r, col))
                              ? ValueKey('sub-reveal-$r-$col')
                              : null,
                          tapKey: ValueKey('sub-cell-$r-$col'),
                          shot: b.sea.shots[(r, col)],
                          sunk: b.sea.sunk.contains(shipAt[(r, col)]),
                          reveal: _over && shipAt.containsKey((r, col)),
                          onTap: () => _fire(r, col),
                        ),
                      ),
                ]),
              ),
            ),
          ),
          SizedBox(
            height: fleetH,
            child: Wrap(
              key: const ValueKey('sub-fleet'),
              alignment: WrapAlignment.center,
              spacing: 10,
              children: [
                for (final s in b.level.fleet)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    for (var k = 0; k < s.length; k++)
                      Container(
                        width: 10,
                        height: 10,
                        margin: const EdgeInsets.all(1),
                        color: b.sea.sunk.contains(s.name) ? const Color(0xFF334155) : const Color(0xFF94A3B8),
                      ),
                  ]),
              ],
            ),
          ),
        ]);
      }),
      toolbar: !_over
          ? null
          : Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const ValueKey('sub-next'),
                onPressed: () => setState(_newLevel),
                icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
                label: Text('${_won ? L.t('nextLabel') : L.t('retry')} · ${b.sea.shots.length}/${b.budget}'),
              ),
            ),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_newLevel)),
      ],
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    super.key,
    required this.tapKey,
    required this.shot,
    required this.sunk,
    required this.reveal,
    required this.onTap,
  });

  final Key tapKey;
  final bool? shot; // null — не стреляли; true — попал; false — мимо
  final bool sunk;
  final bool reveal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hit = shot == true;
    final Color fill = sunk
        ? const Color(0xFF334155)
        : hit
            ? const Color(0xFFDC2626)
            : const Color(0xFFBFDBFE);
    return Semantics(
      button: shot == null,
      label: shot == null ? '' : (hit ? (sunk ? 'sunk' : 'hit') : 'miss'),
      child: GestureDetector(
        key: tapKey,
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.all(1),
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(3),
            border: reveal && shot == null ? Border.all(color: const Color(0xFFF59E0B), width: 2.5) : null,
          ),
          alignment: Alignment.center,
          child: shot == false
              ? FractionallySizedBox(
                  widthFactor: 0.28,
                  heightFactor: 0.28,
                  child: Container(decoration: const BoxDecoration(color: Color(0xFF1E3A8A), shape: BoxShape.circle)),
                )
              : null,
        ),
      ),
    );
  }
}

enum _Art { parity, finish, heat }

/// Рисунок шага разбора на поле той же стороны: шахматка, добивание, карта бота.
class _LessonGrid extends StatelessWidget {
  const _LessonGrid({required this.size, required this.mode, this.heat = const {}, this.shots = const {}});
  final int size;
  final _Art mode;
  final Map<Cell, int> heat;
  final Map<Cell, bool> shots;

  @override
  Widget build(BuildContext context) {
    final top = heat.isEmpty ? 1 : heat.values.reduce(math.max);
    final mid = size ~/ 2;
    return FittedBox(
      child: SizedBox(
        width: 300,
        height: 300,
        child: Stack(children: [
          for (var r = 0; r < size; r++)
            for (var c = 0; c < size; c++)
              Positioned(
                left: c * 300 / size,
                top: r * 300 / size,
                width: 300 / size,
                height: 300 / size,
                child: Container(
                  margin: const EdgeInsets.all(1),
                  color: switch (mode) {
                    _Art.parity => (r + c).isEven ? const Color(0xFF60A5FA) : const Color(0xFFE0F2FE),
                    _Art.finish => (r, c) == (mid, mid)
                        ? const Color(0xFFDC2626)
                        : ((r - mid).abs() + (c - mid).abs() == 1)
                            ? const Color(0xFFFBBF24)
                            : const Color(0xFFE0F2FE),
                    _Art.heat => shots.containsKey((r, c))
                        ? (shots[(r, c)]! ? const Color(0xFFDC2626) : const Color(0xFF94A3B8))
                        : Color.lerp(const Color(0xFFE0F2FE), const Color(0xFFB91C1C), (heat[(r, c)] ?? 0) / top)!,
                  },
                ),
              ),
        ]),
      ),
    );
  }
}
