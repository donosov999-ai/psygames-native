/// Isolated review runner for the REAL «Пауза» (дыхание) screen. No WebView and no user storage.
///
/// Нужен затем, чтобы снять кадры ночного шага (`dim=1`) в «Авроре» тёмной и светлой и убедиться
/// глазами в том, что подтверждено пробой `test/pause_dim_aurora_test.dart` (задача 6eee32e2).
///
///   flutter build apk --debug -t lib/pause_preview.dart \
///     --dart-define=LIGHT=true --dart-define=DIM=true --dart-define=START=true
///
/// Параметры (`--dart-define`): `LIGHT` — светлая тема приложения (по умолчанию тёмная);
/// `DIM` — ночной шаг `dim=1` (по умолчанию да); `TECH` — техника (`calm478`); `START` — сразу идти
/// в практику, как шаг зарядки (`wu=1`), иначе остаться на экране настроек.
library;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'games/pause/screen.dart';
import 'shell/app_theme.dart';
import 'shell/aurora_scope.dart';
import 'shell/design_template.dart';
import 'shell/game_clock.dart';
import 'shell/game_preset.dart';
import 'shell/l10n.dart';
import 'shell/restart_scope.dart';
import 'shell/session_report.dart';
import 'shell/shared_state.dart';

const _light = bool.fromEnvironment('LIGHT');
const _dim = bool.fromEnvironment('DIM', defaultValue: true);
const _start = bool.fromEnvironment('START');
const _tech = String.fromEnvironment('TECH', defaultValue: 'calm478');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Deliberately in-memory: this review runner must not touch installed player data.
  // ignore: invalid_use_of_visible_for_testing_member
  SharedPreferences.setMockInitialValues({
    'language': 'en',
    'psygames_active_profile': 'nzt48',
    uiTemplateKey: UiTemplate.aurora.id,
  });
  final state = await SharedState.open();
  await L.load('en');
  SessionReport.sink = (_) async {};
  installGameClockLifecycle();
  GamePreset.set({
    'tech': _tech,
    if (_dim) 'dim': '1',
    if (_start) 'wu': '1',
  });
  runApp(
    MaterialApp(
      title: 'Pause Review — isolated data',
      theme: appShellTheme(state, brightness: Brightness.light),
      darkTheme: appShellTheme(state, brightness: Brightness.dark),
      themeMode: _light ? ThemeMode.light : ThemeMode.dark,
      home: AuroraGameScope(
        route: '/games/breathing',
        child: RestartScope(builder: (_) => PauseScreen(state: state, flavor: PauseFlavor.breathing)),
      ),
    ),
  );
}
