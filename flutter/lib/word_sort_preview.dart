/// Isolated review runner for the REAL screen. No WebView and no user storage.
/// flutter run -d macos -t lib/word_sort_preview.dart
library;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'games/semantic_sort/screen.dart';
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
  // This entry point must never read/write an installed player's preferences.
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
  GamePreset.set({'auto': '1', 'mode': 'baskets', 'targetLang': 'en'});
  runApp(
    MaterialApp(
      title: 'Word Sort Review — isolated data',
      theme: appShellTheme(state, brightness: Brightness.light),
      darkTheme: appShellTheme(state, brightness: Brightness.dark),
      themeMode: ThemeMode.dark,
      home: AuroraGameScope(
        route: '/games/semantic-sort',
        child: RestartScope(builder: (_) => SemanticSortScreen(state: state)),
      ),
    ),
  );
}
