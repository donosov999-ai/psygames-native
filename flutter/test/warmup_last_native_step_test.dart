import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;
import 'package:psygames_flutter/games/n_back/screen.dart';
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/warmup_step_bridge.dart';

import 'hybrid_overlay_route_repro_test.dart' show FakeWebViewPlatform, Trace, resetHarnessSingletons;

/// 🔴 ПОСЛЕДНИЙ ШАГ ЗАРЯДКИ — НАТИВНЫЙ: ПОСЛЕ ПАРТИИ ИГРА ЗАКРЫВАЕТСЯ, ОТКРЫВАЕТСЯ ИТОГ.
///
/// 08.10.2026, Денис, iPhone (кадр «ЗАРЯДКА · 6/6», N-back, «Точность 95%»): «зарядка закончилась,
/// а окно продолжает висеть, не закрывается автоматом». Шаг 6/6 открыла сама оболочка (мост
/// между двумя нативными шагами), а итог зарядки открывает уже веб — сменой адреса на
/// `/warmup-complete` под нативной игрой. Свой таймер на 2 с веб ставил под невидимым WebView,
/// а его iOS придерживает — конец зарядки теперь ведёт оболочка (`warmupLastStepDone`).
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

  testWidgets('шаг 6/6 открыт мостом оболочки → страница ушла на /warmup-complete → N-back закрыт', (tester) async {
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
    page.emit(SharedState.channel, {
      'op': 'warmupStepDone', 'fromIdx': 4, 'total': 6, 'evening': false,
      'next': {'url': '/games/n-back?wu=1&diff=easy&mode=1-back', 'title': 'N-back'},
      'afterNext': null,
      'played': {'score': 12, 'time_seconds': 60},
    });
    for (var i = 0; i < 100 && find.byType(NBackScreen).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(NBackScreen), findsOneWidget, reason: 'мост оболочки открыл последний шаг');
    expect(page.js.where((j) => j.contains('goTo(5)')), hasLength(1));
    // Веб догоняет оболочку: адрес страницы встаёт на тот же шаг (для перехвата — «тот же экран»).
    page.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/n-back?wu=1&diff=easy&mode=1-back'});
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(NBackScreen), findsOneWidget);

    // Партия последнего шага засчитана — веб ушёл на итог.
    page.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/warmup-complete'});
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(NBackScreen, skipOffstage: false), findsNothing, reason: 'игра последнего шага должна закрыться');
    expect(find.byType(WarmupStepBridge), findsNothing);
  });

  testWidgets('«последний готов» → оболочка сама через 2 с снимает N-back и зовёт advance(5)', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(navigatorObservers: [trace], home: HybridApp(state: state, server: server)));
    await tester.pump(const Duration(milliseconds: 400));
    final page = web.controllers.first;
    page.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/n-back?wu=1&diff=easy&mode=1-back'});
    for (var i = 0; i < 40 && find.byType(NBackScreen).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(NBackScreen), findsOneWidget);
    final last = {'op': 'warmupLastStepDone', 'fromIdx': 5, 'total': 6, 'evening': false};
    page.emit(SharedState.channel, last);
    page.emit(SharedState.channel, last);   // повтор — не второй переход
    await tester.pump(const Duration(milliseconds: 1500));
    expect(find.byType(NBackScreen), findsOneWidget, reason: 'итог игры виден 2 с');
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(NBackScreen, skipOffstage: false), findsNothing, reason: 'игра последнего шага снята оболочкой');
    expect(page.js.where((j) => j.contains('advance(5)')), hasLength(1));
    expect(page.js.where((j) => j.contains('.stop()')), isEmpty);
  });
}
