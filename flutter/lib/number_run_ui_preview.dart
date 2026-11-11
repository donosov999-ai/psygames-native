/// Real NumberRunScreen, isolated in-memory data. No user's store or reports.
/// LEVEL=9 by default. UI locale via LANG, dark/light via LIGHT.
library;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'games/number_run/screen.dart';
import 'games/runner/road.dart';
import 'games/runner/solver.dart';
import 'shell/app_theme.dart';
import 'shell/aurora_scope.dart';
import 'shell/design_template.dart';
import 'shell/game_clock.dart';
import 'shell/game_preset.dart';
import 'shell/l10n.dart';
import 'shell/restart_scope.dart';
import 'shell/session_report.dart';
import 'shell/shared_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const lang = String.fromEnvironment('LANG', defaultValue: 'en');
  const level = int.fromEnvironment('LEVEL', defaultValue: 9);
  // ignore: invalid_use_of_visible_for_testing_member
  SharedPreferences.setMockInitialValues({
    'language': lang,
    'psygames_active_profile': 'nzt48',
    '${SharedState.prefix}number_run_level_nzt48': '$level',
    uiTemplateKey: UiTemplate.aurora.id,
  });
  final state = await SharedState.open();
  await L.load(lang);
  SessionReport.sink = (_) async {};
  installGameClockLifecycle();
  GamePreset.clear();
  // AUTO=true — стенд сам ведёт число по пути решателя и жмёт «Применить» за три ряда до финиша.
  if (const bool.fromEnvironment('AUTO')) {
    RoadCourse? solved;
    var path = const <SolverStep>[];
    // ignore: invalid_use_of_visible_for_testing_member
    numberRunAutopilot = (course, s) {
      if (!identical(course, solved)) {
        solved = course;
        path = solveCourse(course) ?? const [];
      }
      if (s.nextRow >= course.rows.length) return null;
      final row = course.rows[s.nextRow];
      final step = path.where((p) => p.id == row.id).firstOrNull;
      if (step == null) return null;
      final route = row.routes?.where((r) => r.id == step.route).firstOrNull;
      if (route != null) {
        for (final p in [route.entry, ...route.waypoints]) {
          if (row.z + p.dz > s.z + .5) return p.x;
        }
        return route.exit;
      }
      return step.lane;
    };
    // ignore: invalid_use_of_visible_for_testing_member
    // Как решатель: применить перед следующим «×2» (слот один) и перед финишем.
    numberRunAutoApply = (course, s) =>
        s.reserve != null &&
        (s.nextRow >= course.rows.length - 3 ||
            (s.nextRow < course.rows.length && course.rows[s.nextRow].station == 'reserve'));
  }
  runApp(
    MaterialApp(
      title: 'Number Run Review — isolated data',
      debugShowCheckedModeBanner: false,
      theme: appShellTheme(state, brightness: Brightness.light),
      darkTheme: appShellTheme(state, brightness: Brightness.dark),
      themeMode: const bool.fromEnvironment('LIGHT')
          ? ThemeMode.light
          : ThemeMode.dark,
      home: AuroraGameScope(
        route: '/games/number-run',
        child: RestartScope(
          builder: (_) => NumberRunScreen(state: state, seed: 1),
        ),
      ),
    ),
  );
}
