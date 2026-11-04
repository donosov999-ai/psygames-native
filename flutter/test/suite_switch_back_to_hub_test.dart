import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/span_hub/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;

import 'hybrid_overlay_route_repro_test.dart' show FakeController, FakeWebViewPlatform, resetHarnessSingletons;

/// 🔴 ПЛАШКИ НАБОРА — ЗАМЕНА ЭКРАНА: ОДНО «НАЗАД» ВЕДЁТ В РАЗВИЛКУ (задача a0fd8105).
///
/// Замер раздела «Объём памяти» 08.10 (2.56.20): развилка → «Позиции» → плашки «Corsi», «Matrix», «Corsi»,
/// «Matrix» → «назад» — пять нажатий, каждая плашка ложилась в историю. Задумано (PR #204): переход плашкой —
/// замена, как `router.replace` веба. Проба идёт через настоящую оболочку (`HybridApp`): suite_switch_test
/// проверяет только `pop(HubCardTap)`, до каркаса он не доходит — поэтому дефект и прошёл.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssetServer server;
  late SharedState state;
  late FakeWebViewPlatform web;

  setUp(() async {
    resetHarnessSingletons();
    // Профиль и состав, посчитанный вебом (`hubVisibility.ts`): у набора «Позиции» открыты три игры.
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'odv999',
      for (final k in ['grid6', 'fast', 'two_series', 'decoys']) LevelRules.seenKey('memory_matrix', k): '1',
      'psygames_hub_visible': jsonEncode({
        'profile': 'odv999',
        'hubs': <String, Object>{},
        'suites': {
          'suite_positions': ['/games/memory-matrix', '/games/corsi', '/games/spatial-span'],
        },
      }),
    });
    state = await SharedState.open();
    await GameRules.load();
    await LevelRules.load();
    server = await AssetServer.start();
    web = FakeWebViewPlatform();
    wv.WebViewPlatform.instance = web;
  });
  tearDown(() async => server.stop());

  FakeController page() => web.controllers.first;

  Future<void> until(WidgetTester t, bool Function() ok) async {
    for (var i = 0; i < 60 && !ok(); i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
  }

  Finder chip(String route) => find.byKey(Key('suite-mode-$route'));

  testWidgets('🔴 развилка → «Позиции» → три плашки → одно «назад» — снова развилка', (t) async {
    t.view.physicalSize = const Size(780, 1600);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: HybridApp(state: state, server: server),
      ),
    );
    await t.pump(const Duration(milliseconds: 400));
    page().emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/span'});
    await until(t, () => find.byType(SpanHubScreen).evaluate().isNotEmpty);
    expect(find.byType(SpanHubScreen), findsOneWidget);

    final matrixCard = find.byKey(const ValueKey('hub-card-/games/memory-matrix'));
    await until(t, () => matrixCard.evaluate().isNotEmpty);
    await t.ensureVisible(matrixCard);
    await t.tap(matrixCard);
    await until(t, () => chip('/games/corsi').evaluate().isNotEmpty);

    for (final route in ['/games/corsi', '/games/memory-matrix', '/games/corsi']) {
      // Переход живой: пока старый экран уезжает, плашек на экране две — ждём, когда останется один экран.
      await until(t, () => chip(route).evaluate().length == 1);
      await t.ensureVisible(chip(route));
      await t.tap(chip(route));
      await until(t, () => chip(route).evaluate().length == 1 && t.widget<ChoiceChip>(chip(route)).selected);
      expect(t.widget<ChoiceChip>(chip(route)).selected, isTrue, reason: 'открыт $route');
    }

    t.state<NavigatorState>(find.byType(Navigator).first).pop();
    await until(t, () => chip('/games/corsi').evaluate().isEmpty);
    await t.pump(const Duration(milliseconds: 300));
    expect(chip('/games/corsi'), findsNothing, reason: 'после одного «назад» игр набора на экране нет');
    expect(find.byType(SpanHubScreen), findsOneWidget, reason: 'одно «назад» — в развилку');
  });
}
