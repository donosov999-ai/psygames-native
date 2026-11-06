// Стенд 3D-дороги «Числового забега» (задача 84bcf2c9): настоящий уровень из ядра, автопилот
// по полосам — видно мосты, трамплины, стены, арки и финал без прохода через всё приложение.
//
// Запуск: flutter run -t lib/number_run_3d_preview.dart --dart-define=LEVEL=7 --dart-define=SEED=1
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'games/number_run/level.dart';
import 'games/number_run/road_3d.dart';
import 'games/number_run/screen.dart' show finaleDuration;
import 'games/runner/road.dart';
import 'games/runner/solver.dart';

const _level = int.fromEnvironment('LEVEL', defaultValue: 7);
const _seed = int.fromEnvironment('SEED', defaultValue: 1);

void main() => runApp(const MaterialApp(debugShowCheckedModeBanner: false, home: _Stand()));

class _Stand extends StatefulWidget {
  const _Stand();
  @override
  State<_Stand> createState() => _StandState();
}

class _StandState extends State<_Stand> with SingleTickerProviderStateMixin {
  late RoadCourse course = makeLevel(_level, _seed, countingTasksFor('ru'), boss: isBossLevel(_level));
  late RoadState s = roadResume(roadInitial(course));
  late final Ticker ticker = createTicker(_tick);

  @override
  void initState() {
    super.initState();
    ticker.start();
  }
  Duration? last;
  double finaleT = 0;
  late List<SolverStep> path = solveCourse(course) ?? const [];

  /// Автопилот — по эталонному пути решателя: полоса ряда впереди, у построений — следующая точка пути.
  double _pilot() {
    if (s.nextRow >= course.rows.length) return s.target;
    final row = course.rows[s.nextRow];
    final step = path.where((p) => p.id == row.id).firstOrNull;
    if (step == null) return s.target;
    final route = row.routes?.where((r) => r.id == step.route).firstOrNull;
    if (route != null) {
      for (final p in [route.entry, ...route.waypoints]) {
        if (row.z + p.dz > s.z + .5) return p.x;
      }
      return route.exit;
    }
    return step.lane;
  }

  void _tick(Duration now) {
    final dt = last == null ? 0.0 : math.min(.05, (now - last!).inMicroseconds / 1e6);
    last = now;
    setState(() {
      if (s.status == RoadStatus.running) {
        // Автопилот: раз в 2,5 с — другая полоса.
        s = roadSetTarget(s, _pilot());
        s = roadAdvanceFrame(s, dt, course);
        if (s.status != RoadStatus.running) debugPrint('STAND ${s.status.name} sum ${s.sum} z ${s.z.toStringAsFixed(0)}');
      } else if (s.status == RoadStatus.won && finaleT < finaleDuration(course, s.sum) + 1) {
        finaleT += dt;
      } else {
        course = makeLevel(_level, _seed + 1, countingTasksFor('ru'), boss: isBossLevel(_level));
        s = roadResume(roadInitial(course));
        path = solveCourse(course) ?? const [];
        finaleT = 0;
      }
    });
  }

  @override
  void dispose() {
    ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Stack(children: [
          Positioned.fill(
            child: Road3d(course: course, state: s, finaleT: finaleT, fallback: const ColoredBox(color: Colors.red)),
          ),
          Positioned(
            left: 12,
            top: 60,
            child: Text('L$_level  z ${s.z.toStringAsFixed(0)}  ${s.status.name}  ${s.sum}',
                style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
          ),
        ]),
      );
}
