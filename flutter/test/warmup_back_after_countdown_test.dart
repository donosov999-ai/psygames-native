import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;
import 'package:psygames_flutter/games/picture_pairs/screen.dart';
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/warmup_step_bridge.dart';

import 'hybrid_overlay_route_repro_test.dart' show Trace, resetHarnessSingletons;
import 'fixtures/warmup_host.dart';

/// 🔴 «НАЗАД» НА ШАГЕ ЗАРЯДКИ, ОТКРЫТОМ ПОСЛЕ ОТСЧЁТА, — ВЫХОД ИЗ ЗАРЯДКИ, А НЕ ВЕБ-ШАГ.
///
/// 21.10.2026, задача 3795a9be, 3 из 3 на 2.56.32/2.56.33: шаг 1 нативный → мост →
/// отсчёт → шаг 2 открывает сама оболочка (`goTo`) → системная «Назад» → на экране
/// ВЕБ-копия шага 2 без нижней панели. По `goTo` веб ставит адрес шага через
/// `router.replace`, поэтому `history.back()` оболочки не уводил страницу с игры.
/// Здесь — настоящая оболочка [HybridApp] на подменённом WebView: после «Назад» она
/// обязана попросить веб-хост завершить зарядку (`stop` с хозяином шага 2) — так же,
/// как веб сам поступает с «Назад» во время зарядки (`WarmupContext`, hardwareBackPress).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssetServer server;
  late SharedState state;
  late WarmupWebViewPlatform web;
  late Trace trace;
  setUp(() async {
    resetHarnessSingletons();
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await GameRules.load();
    await LevelRules.load();
    server = await AssetServer.start();
    web = WarmupWebViewPlatform();
    web.nextUrls[2] = '/games/picture-pairs?wu=1';
    wv.WebViewPlatform.instance = web;
    trace = Trace();
  });
  tearDown(() async => server.stop());

  testWidgets('шаг 1 → мост → отсчёт → шаг 2 → «Назад»: веб-хост завершает зарядку хозяином шага 2', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(navigatorObservers: [trace], home: HybridApp(state: state, server: server)));
    await tester.pump(const Duration(milliseconds: 400));
    final page = web.controllers.first;
    page.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/sdmt?wu=1&wuRun=run&wuStep=1&wuAttempt=step-1'});
    for (var i = 0; i < 40 && find.byType(SdmtScreen).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(SdmtScreen), findsOneWidget);

    page.emit(SharedState.channel, {
      'op': 'warmupStepDone',
      'fromIdx': 1,
      'owner': {'run_id': 'run', 'step_idx': 1, 'attempt_id': 'step-1'},
      'total': 5,
      'evening': false,
      'next': {'url': '/games/picture-pairs?wu=1', 'title': 'Picture Pairs'},
      'afterNext': null,
      'played': {'score': 12, 'time_seconds': 60},
    });
    for (var i = 0; i < 25; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(WarmupStepBridge), findsOneWidget);
    // Отсчёт моста — шаг 2 открывает оболочка.
    for (var i = 0; i < 70 && find.byType(PicturePairsScreen).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(PicturePairsScreen), findsOneWidget);
    expect(page.js.where((j) => j.contains('goTo(2,')), hasLength(1));
    // Веб, как в жизни, подменяет адрес страницы на шаг 2 — для оболочки «тот же экран».
    page.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/picture-pairs?wu=1&wuRun=run&wuStep=2&wuAttempt=step-2'});
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byType(PicturePairsScreen), findsOneWidget);

    final before = page.js.length;
    await tester.binding.handlePopRoute(); // системная «Назад»
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(PicturePairsScreen), findsNothing);
    final after = page.js.sublist(before);
    final stop = after.where((j) => j.contains('__psyWarmupHost') && j.contains('.stop(')).toList();
    expect(stop, hasLength(1), reason: '«Назад» на шаге зарядки — выход из зарядки через веб-хост, а не history.back(): $after');
    expect(stop.single, contains('"run_id":"run"'));
    expect(stop.single, contains('"step_idx":2'));
    expect(stop.single, contains('"attempt_id":"step-2"'));
  });
}
