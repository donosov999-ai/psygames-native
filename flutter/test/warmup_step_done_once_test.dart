import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/games/switching_task/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/warmup_step_bridge.dart';

import 'hybrid_overlay_route_repro_test.dart' show FakeWebViewPlatform, Trace, resetHarnessSingletons;

/// 🔴 ОДИН ШАГ ЗАРЯДКИ — ОДИН ПЕРЕХОД.
///
/// 06.10.2026, 2.56.12, отчёт 02d98918 («зарядка не дала перейти от третьего к
/// следующему»): трасса `/games/sdmt → / → /games/switching-task → /`. После SDMT
/// пришли ДВА `warmupStepDone{fromIdx:2}` — партию сохранили и нативный экран, и
/// веб-копия игры под ним. Встали два моста; первый снялся пустым, закрыл уже
/// открытый следующий шаг и остановил зарядку. Здесь — настоящая оболочка
/// [HybridApp] на подменённом WebView: повтор «готов» того же шага — не новый мост.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssetServer server;
  late SharedState state;
  late FakeWebViewPlatform web;
  late Trace trace;
  setUp(() async {
    resetHarnessSingletons();
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await GameRules.load();
    await LevelRules.load();
    server = await AssetServer.start();
    web = FakeWebViewPlatform();
    wv.WebViewPlatform.instance = web;
    trace = Trace();
  });
  tearDown(() async => server.stop());

  testWidgets('два «готов» после SDMT — один мост, дальше «Переключение задач», зарядка не остановлена', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(navigatorObservers: [trace], home: HybridApp(state: state, server: server)));
    await tester.pump(const Duration(milliseconds: 400));
    final page = web.controllers.first;
    page.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/sdmt?wu=1'});
    for (var i = 0; i < 40 && find.byType(SdmtScreen).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(SdmtScreen), findsOneWidget);

    final stepDone = {
      'op': 'warmupStepDone',
      'fromIdx': 2,
      'total': 4,
      'evening': false,
      'next': {'url': '/games/switching-task?wu=1', 'title': 'Переключение задач'},
      'afterNext': null,
      'played': {'score': 12, 'time_seconds': 60},
    };
    page.emit(SharedState.channel, stepDone);
    page.emit(SharedState.channel, stepDone);   // веб-копия SDMT под нативным экраном
    // Итог игры 2 с — затем мост.
    for (var i = 0; i < 25; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(WarmupStepBridge), findsOneWidget, reason: 'повтор того же шага — не второй мост');

    // Отсчёт моста 5 с — «дальше».
    for (var i = 0; i < 70; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(SwitchingTaskScreen), findsOneWidget);
    expect(find.byType(SdmtScreen), findsNothing);
    expect(find.byType(WarmupStepBridge), findsNothing);
    expect(page.js.where((j) => j.contains('goTo(3)')), hasLength(1));
    expect(page.js.where((j) => j.contains('.stop()')), isEmpty, reason: 'зарядка не останавливается');
    expect(GameRules.currentRoute, '/games/switching-task');
  });
}
