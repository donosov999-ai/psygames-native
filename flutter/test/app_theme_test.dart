import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;
import 'package:psygames_flutter/main.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'hybrid_overlay_route_repro_test.dart' show FakeWebViewPlatform, resetHarnessSingletons;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('explicit theme survives restart and profile changes', () async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    for (final mode in ['light', 'dark', 'system']) {
      await state.set('psygames_theme_override', mode);
      await state.set('psygames_active_profile', 'chess');
      final reopened = await SharedState.open();
      expect(appThemeMode(reopened), {
        'light': ThemeMode.light, 'dark': ThemeMode.dark, 'system': ThemeMode.system,
      }[mode]);
      await reopened.set('psygames_active_profile', 'free');
      expect(appThemeMode(reopened), appThemeMode(state));
    }
    await state.remove('psygames_theme_override');
    expect(appThemeMode(state), ThemeMode.light);
    await state.set('psygames_active_profile', 'chess');
    expect(appThemeMode(state), ThemeMode.dark);
  });

  testWidgets('real app updates native theme from web bridge without restart', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_theme_override': 'light'});
    final oldPlatform = wv.WebViewPlatform.instance;
    wv.WebViewPlatform.instance = FakeWebViewPlatform();
    resetHarnessSingletons();
    late SharedState state;
    late AssetServer server;
    await tester.runAsync(() async {
      state = await SharedState.open();
      server = await AssetServer.start();
    });
    addTearDown(() async {
      resetHarnessSingletons();
      if (oldPlatform != null) wv.WebViewPlatform.instance = oldPlatform;
      await server.stop();
    });
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await tester.pumpWidget(PsyGamesPilotApp(state: state, server: server));
    await tester.pump();
    Brightness actual() => Theme.of(tester.element(find.byKey(const Key('fake-webview')))).brightness;
    expect(actual(), Brightness.light);
    for (final mode in ['dark', 'light', 'system']) {
      await tester.runAsync(() => state.applyFromWeb(jsonEncode({
        'op': 'set', 'key': 'psygames_theme_override', 'value': mode,
      })));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
      expect(actual(), mode == 'light' ? Brightness.light : Brightness.dark);
    }
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(actual(), Brightness.light);
    expect(tester.takeException(), isNull);
  });
}
