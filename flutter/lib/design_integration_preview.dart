// Isolated acceptance entrypoint. Uses the REAL app shell and game routes,
// but never imports or writes the user's installed app preferences/account.
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'main.dart' show PsyGamesPilotApp;
import 'shell/app_look.dart';
import 'shell/asset_server.dart';
import 'shell/design_template.dart';
import 'shell/game_clock.dart';
import 'shell/game_rules.dart';
import 'shell/l10n.dart';
import 'shell/level_rules.dart';
import 'shell/native_tabs.dart';
import 'shell/shared_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Manual acceptance harness only: in-memory storage is intentional safety,
  // not an app storage implementation. Production still targets lib/main.dart.
  // ignore: invalid_use_of_visible_for_testing_member
  SharedPreferences.setMockInitialValues({
    uiTemplateKey: 'aurora_v1',
    'psygames_theme_override': 'dark',
    'language': 'en',
  });
  final state = await SharedState.open();
  await L.load(state.language);
  await AppLook.load(state);
  await GameRules.load();
  await LevelRules.load();
  // Review must fail visibly on an invalid manifest, not silently fall back to
  // a bare WebView when the shell's asynchronous tab-manifest load is delayed.
  await NativeTabs.load();
  final server = await AssetServer.start();
  server.reviveOnResume();
  installGameClockLifecycle();
  runApp(PsyGamesPilotApp(state: state, server: server));
}
