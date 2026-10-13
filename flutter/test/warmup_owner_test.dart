import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;
import 'package:psygames_flutter/games/n_back/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/warmup_step_bridge.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';

import 'hybrid_overlay_route_repro_test.dart' show resetHarnessSingletons;
import 'fixtures/warmup_host.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssetServer server;
  late SharedState state;
  late WarmupWebViewPlatform web;
  setUp(() async {
    resetHarnessSingletons();
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await GameRules.load();
    await LevelRules.load();
    server = await AssetServer.start();
    web = WarmupWebViewPlatform();
    wv.WebViewPlatform.instance = web;
  });
  tearDown(() async => server.stop());

  Map<String, Object?> owner(String run, [String attempt = 'a']) =>
      {'run_id': run, 'step_idx': 0, 'attempt_id': attempt};
  void route(String run, [String attempt = 'a']) => web.controllers.first.emit(
      SharedState.channel,
      {'op': 'route', 'url': '${server.origin}/games/n-back?wu=1&wuRun=$run&wuStep=0&wuAttempt=$attempt'});
  void done(String run, [String attempt = 'a']) => web.controllers.first.emit(
      SharedState.channel,
      {'op': 'warmupLastStepDone', 'fromIdx': 0, 'total': 1, 'owner': owner(run, attempt)});
  Future<void> mount(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: HybridApp(state: state, server: server)));
    await tester.pump(const Duration(milliseconds: 400));
  }
  Future<void> settle(WidgetTester tester, int ticks) async {
    for (var i = 0; i < ticks; i++) { await tester.pump(const Duration(milliseconds: 100)); }
  }

  testWidgets('two runs at step zero within sixty seconds both complete', (tester) async {
    await mount(tester);
    route('first'); await settle(tester, 5);
    done('first'); await settle(tester, 25);
    expect(find.byType(NBackScreen, skipOffstage: false), findsNothing);
    route('second'); await settle(tester, 5);
    done('second'); await settle(tester, 25);
    expect(find.byType(NBackScreen, skipOffstage: false), findsNothing,
        reason: 'a new run is not a duplicate merely because its index is zero');
  });

  testWidgets('delayed old completion cannot close a new same-route run', (tester) async {
    await mount(tester);
    route('first'); await settle(tester, 5);
    final first = tester.state(find.byType(NBackScreen));
    done('first'); await settle(tester, 5);
    route('second'); await settle(tester, 12);
    expect(find.byType(NBackScreen), findsOneWidget);
    final second = tester.state(find.byType(NBackScreen));
    expect(identical(first, second), isFalse, reason: 'same route, different owner means a new page');
    await settle(tester, 20);
    expect(find.byType(NBackScreen), findsOneWidget);
    expect(web.controllers.first.js.where((j) => j.contains('.advance(')), isEmpty);
  });

  testWidgets('late done and ownerless done cannot finish current run', (tester) async {
    await mount(tester);
    route('second'); await settle(tester, 5);
    done('first');
    web.controllers.first.emit(SharedState.channel,
        {'op': 'warmupLastStepDone', 'fromIdx': 0, 'total': 1});
    await settle(tester, 25);
    expect(find.byType(NBackScreen), findsOneWidget);
    expect(web.controllers.first.js.where((j) => j.contains('.advance(')), isEmpty);
  });

  testWidgets('leaving during native delay does not advance abandoned run', (tester) async {
    await mount(tester);
    route('first'); await settle(tester, 5);
    done('first'); await settle(tester, 5);
    web.controllers.first.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/'});
    await settle(tester, 25);
    expect(web.controllers.first.js.where((j) => j.contains('.advance(')), isEmpty);
  });

  testWidgets('restart waits for a fresh attempt and rejects old completion', (tester) async {
    await mount(tester);
    route('first'); await settle(tester, 5);
    final first = tester.state(find.byType(NBackScreen));
    final answer = Completer<Object>();
    web.reply = (js) => js.contains('.retry(') ? answer.future : Future.value('null');
    final gameContext = tester.element(find.byType(NBackScreen));
    RestartScope.of(gameContext)!();
    await settle(tester, 2);
    expect(identical(tester.state(find.byType(NBackScreen)), first), isTrue);
    answer.complete(jsonEncode({'active': true, 'idx': 0, 'total': 1, 'title': 'N-back',
      'owner': owner('first', 'retry'),
      'url': '/games/n-back?wu=1&wuRun=first&wuStep=0&wuAttempt=retry'}));
    await settle(tester, 5);
    expect(identical(tester.state(find.byType(NBackScreen)), first), isFalse);
    expect(GamePreset.params['wuAttempt'], 'retry');
    done('first'); await settle(tester, 25);
    expect(find.byType(NBackScreen), findsOneWidget);
    done('first', 'retry'); await settle(tester, 25);
    expect(find.byType(NBackScreen, skipOffstage: false), findsNothing);
  });

  testWidgets('late next-step acknowledgement cannot close a new run', (tester) async {
    await mount(tester);
    route('first'); await settle(tester, 5);
    final answer = Completer<Object>();
    web.reply = (js) => js.contains('.goTo(') ? answer.future : Future.value('null');
    web.controllers.first.emit(SharedState.channel, {
      'op': 'warmupStepDone', 'fromIdx': 0, 'total': 2, 'owner': owner('first'),
      'next': {'url': '/games/n-back?wu=1', 'title': 'N-back'},
    });
    await settle(tester, 25);
    expect(find.byType(WarmupStepBridge), findsOneWidget);
    await tester.tap(find.byKey(const Key('warmup-bridge-go')));
    await settle(tester, 4);
    route('second'); await settle(tester, 12);
    expect(find.byType(NBackScreen), findsOneWidget);
    final second = tester.state(find.byType(NBackScreen));
    answer.complete(jsonEncode({'active': true, 'idx': 1, 'total': 2, 'title': 'N-back',
      'owner': {'run_id': 'first', 'step_idx': 1, 'attempt_id': 'b'},
      'url': '/games/n-back?wu=1&wuRun=first&wuStep=1&wuAttempt=b'}));
    await settle(tester, 10);
    expect(identical(tester.state(find.byType(NBackScreen)), second), isTrue);
    expect(GamePreset.params['wuRun'], 'second');
    expect(web.controllers.first.js.where((j) => j.contains('.stop(')), isEmpty);
  });
}
