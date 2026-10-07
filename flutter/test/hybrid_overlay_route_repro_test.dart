import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;
import 'package:psygames_flutter/games/one_line/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_pet.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/warmup_screens.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';

class FakeWebViewPlatform extends wv.WebViewPlatform {
  final controllers = <FakeController>[];
  @override
  wv.PlatformWebViewController createPlatformWebViewController(wv.PlatformWebViewControllerCreationParams p) {
    final c = FakeController(p); controllers.add(c); return c;
  }
  @override
  wv.PlatformNavigationDelegate createPlatformNavigationDelegate(wv.PlatformNavigationDelegateCreationParams p) => FakeDelegate(p);
  @override
  wv.PlatformWebViewWidget createPlatformWebViewWidget(wv.PlatformWebViewWidgetCreationParams p) => FakeWidget(p);
}

class FakeController extends wv.PlatformWebViewController {
  FakeController(super.params) : super.implementation();
  final channels = <String, void Function(wv.JavaScriptMessage)>{};
  /// Что оболочка выполнила в странице — для проб перехода зарядки (`goTo`, `stop`).
  final js = <String>[];
  void emit(String channel, Map<String, Object?> message) => channels[channel]?.call(wv.JavaScriptMessage(message: jsonEncode(message)));
  @override Future<void> setJavaScriptMode(wv.JavaScriptMode mode) async {}
  @override Future<void> addJavaScriptChannel(wv.JavaScriptChannelParams p) async { channels[p.name] = p.onMessageReceived; }
  @override Future<void> removeJavaScriptChannel(String name) async { channels.remove(name); }
  @override Future<void> setOnConsoleMessage(void Function(wv.JavaScriptConsoleMessage) cb) async {}
  @override Future<void> setPlatformNavigationDelegate(wv.PlatformNavigationDelegate handler) async {}
  @override Future<void> loadRequest(wv.LoadRequestParams params) async {}
  @override Future<void> clearCache() async {}
  @override Future<void> clearLocalStorage() async {}
  @override Future<void> runJavaScript(String js) async => this.js.add(js);
  @override Future<Object> runJavaScriptReturningResult(String js) async => 'null';
}

class FakeDelegate extends wv.PlatformNavigationDelegate {
  FakeDelegate(super.params) : super.implementation();
  @override Future<void> setOnNavigationRequest(wv.NavigationRequestCallback cb) async {}
  @override Future<void> setOnPageStarted(wv.PageEventCallback cb) async {}
  @override Future<void> setOnPageFinished(wv.PageEventCallback cb) async {}
}

class FakeWidget extends wv.PlatformWebViewWidget {
  FakeWidget(super.params) : super.implementation();
  @override Widget build(BuildContext context) => const SizedBox.expand(key: Key('fake-webview'));
}

class Trace extends NavigatorObserver {
  final routes = <Route<dynamic>>[];
  final events = <Map<String, Object?>>[];
  void add(String op, Route<dynamic> route) {
    if (op == 'push') {
      routes.add(route);
    } else {
      routes.remove(route);
    }
    events.add({'op': op, 'route': route.runtimeType.toString(), 'routeId': identityHashCode(route), 'depth': routes.length});
  }
  @override void didPush(Route<dynamic> r, Route<dynamic>? p) => add('push', r);
  @override void didPop(Route<dynamic> r, Route<dynamic>? p) => add('pop', r);
  @override void didRemove(Route<dynamic> r, Route<dynamic>? p) => add('remove', r);
}

void resetHarnessSingletons() {
  HybridApp.open = null;
  HybridApp.runJs = null;
  GameExit.home = null;
  GameExit.feedback = null;
  GamePreset.clear();
  GameRules.currentRoute = null;
  PetHost.state = null;
  PetHost.origin = null;
  SessionReport.sink = null;
  WarmupUi.run = null;
  WarmupUi.picker.value = null;
  WarmupUi.complete.value = null;
  WarmupUi.bridge.value = null;
  LevelRules.debugSetTable(null);
}



void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssetServer server;
  late SharedState state;
  late FakeWebViewPlatform web;
  late Trace trace;
  setUp(() async {
    resetHarnessSingletons();
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open(); await GameRules.load(); await LevelRules.load();
    server = await AssetServer.start(); web = FakeWebViewPlatform(); wv.WebViewPlatform.instance = web; trace = Trace();
  });
  tearDown(() async => server.stop());
  Future<void> mount(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(navigatorObservers: [trace], home: HybridApp(state: state, server: server)));
    await tester.pump(const Duration(milliseconds: 400));
    web.controllers.first.emit(SharedState.channel, {'op':'route', 'url':'${server.origin}/games/one-line'});
    for (var i = 0; i < 40 && find.byIcon(Icons.pause).evaluate().isEmpty; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    expect(find.byType(OneLineScreen), findsOneWidget);
    expect(find.byIcon(Icons.pause), findsWidgets);
  }
  Future<void> sendWebOnlyRoute(WidgetTester tester) async {
    web.controllers.first.emit(SharedState.channel, {'op':'route', 'url':'${server.origin}/'});
    for (var i = 0; i < 5; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    for (var i = 0; i < 10; i++) { await tester.pump(const Duration(milliseconds: 100)); }
  }

  testWidgets('both real HybridApp route overlay cases in one isolated run', (tester) async {
    await mount(tester);
    final base = trace.routes.length;
    await tester.tap(find.byIcon(Icons.pause).first);
    for (var i = 0; i < 5; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    expect(find.byKey(const Key('pause-leave')), findsOneWidget);
    final pauseBefore = trace.routes.map(identityHashCode).toList();
    await sendWebOnlyRoute(tester);
    final pauseAfter = {
      'baseDepth': base,
      'before': pauseBefore.length,
      'after': trace.routes.length,
      'stackBefore': pauseBefore,
      'stackAfter': trace.routes.map(identityHashCode).toList(),
      'events': trace.events.map((e) => Map<String, Object?>.from(e)).toList(),
      'gameAfter': find.byType(OneLineScreen, skipOffstage: false).evaluate().isNotEmpty,
    };
    debugPrint('PAUSE_STACK ${jsonEncode(pauseAfter)}');

    // Start the second case with a game even when the first close is fixed.
    if (find.byType(OneLineScreen, skipOffstage: false).evaluate().isEmpty) {
      web.controllers.first.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/one-line'});
      for (var i = 0; i < 5; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    }
    await tester.tap(find.byIcon(Icons.pause).first);
    for (var i = 0; i < 5; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    await tester.ensureVisible(find.byKey(const Key('pause-feedback')));
    await tester.pump(const Duration(milliseconds: 150));
    await tester.tap(find.byKey(const Key('pause-feedback')));
    for (var i = 0; i < 5; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    final feedbackBefore = trace.routes.map(identityHashCode).toList();
    await sendWebOnlyRoute(tester);
    final feedbackAfter = {
      'before': feedbackBefore.length,
      'after': trace.routes.length,
      'stackBefore': feedbackBefore,
      'stackAfter': trace.routes.map(identityHashCode).toList(),
      'events': trace.events.map((e) => Map<String, Object?>.from(e)).toList(),
      'gameAfter': find.byType(OneLineScreen, skipOffstage: false).evaluate().isNotEmpty,
      'pauseAfter': find.byKey(const Key('pause-leave')).evaluate().isNotEmpty,
    };
    debugPrint('FEEDBACK_STACK ${jsonEncode(feedbackAfter)}');

    // Both state captures happen before evaluating the regression expectations.
    expect(
      {'pause.gameAfter': pauseAfter['gameAfter'], 'feedback.gameAfter': feedbackAfter['gameAfter'], 'feedback.afterDepth': feedbackAfter['after']},
      {'pause.gameAfter': false, 'feedback.gameAfter': false, 'feedback.afterDepth': 1},
      reason: 'each web-only route must dismiss the native game and its overlays',
    );
    web.controllers.first.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/one-line'});
    for (var i = 0; i < 5; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    await tester.tap(find.byIcon(Icons.pause).first);
    for (var i = 0; i < 5; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    web.controllers.first.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/stroop?wu=1'});
    for (var i = 0; i < 15; i++) { await tester.pump(const Duration(milliseconds: 100)); }
    expect(trace.routes.length, 2, reason: 'host and new game, without old game or pause');
    expect(find.byType(OneLineScreen, skipOffstage: false), findsNothing);
    expect(GameRules.currentRoute, '/games/stroop');
    expect(GamePreset.isPreset, isTrue, reason: 'old completion must not erase the new warmup preset');
    await sendWebOnlyRoute(tester);
    expect(trace.routes.length, 1);
  });
}
