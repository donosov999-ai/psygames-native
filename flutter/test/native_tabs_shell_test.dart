import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/one_line/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/catalog_screen.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;

import 'hybrid_overlay_route_repro_test.dart' show FakeWidget, resetHarnessSingletons;

/// 🔴 НИЖНЯЯ ПОЛОСА — У ОБОЛОЧКИ; «ИГРЫ» — ВКЛАДКА РЯДОМ СО СТРАНИЦЕЙ (задачи 5136754e, 99628ecf).
///
/// Настоящий [HybridApp] на поддельном WebView (образец — `hybrid_overlay_route_repro_test.dart`
/// Кодекса): страница «шлёт» смену адреса тем же сообщением `op: route`, а скрипты, которые оболочка
/// просит выполнить в странице, записываются. Проверяется поведение, не устройство:
///   · полоса стоит на главной, подсвечена «Главная»;
///   · нажатие «Игры» показывает нативную вкладку и уводит страницу `router.replace` — история веба
///     совпадает с вкладкой;
///   · адрес `/games` от страницы (ссылка «ещё ›», «назад» из игры) выбирает вкладку, а не кладёт
///     каталог поверх; `?search=` с главной доезжает в поле;
///   · на адресе игры полосы нет (`tabBarVisible` веба), назад на `/games` — снова вкладка;
///   · игра из плитки — нативный экран поверх, после него человек снова во вкладке с полосой;
///   · поиск во вкладке переживает уход на другую вкладку и обратно (99628ecf, п. 6);
///   · загрузка документа (первый адрес, `location.replace`) тоже определяет вкладку, а скрипт
///     хоста говорит вебу, что полоса нативная (`__psyNativeTabs`).
class RecWebViewPlatform extends wv.WebViewPlatform {
  final controllers = <RecController>[];
  final delegates = <RecDelegate>[];
  @override
  wv.PlatformWebViewController createPlatformWebViewController(wv.PlatformWebViewControllerCreationParams p) {
    final c = RecController(p);
    controllers.add(c);
    return c;
  }

  @override
  wv.PlatformNavigationDelegate createPlatformNavigationDelegate(wv.PlatformNavigationDelegateCreationParams p) {
    final d = RecDelegate(p);
    delegates.add(d);
    return d;
  }

  @override
  wv.PlatformWebViewWidget createPlatformWebViewWidget(wv.PlatformWebViewWidgetCreationParams p) => FakeWidget(p);
}

class RecController extends wv.PlatformWebViewController {
  RecController(super.params) : super.implementation();
  final channels = <String, void Function(wv.JavaScriptMessage)>{};
  final js = <String>[];
  void emit(String channel, Map<String, Object?> message) =>
      channels[channel]?.call(wv.JavaScriptMessage(message: jsonEncode(message)));
  @override
  Future<void> setJavaScriptMode(wv.JavaScriptMode mode) async {}
  @override
  Future<void> addJavaScriptChannel(wv.JavaScriptChannelParams p) async => channels[p.name] = p.onMessageReceived;
  @override
  Future<void> removeJavaScriptChannel(String name) async => channels.remove(name);
  @override
  Future<void> setOnConsoleMessage(void Function(wv.JavaScriptConsoleMessage) cb) async {}
  @override
  Future<void> setPlatformNavigationDelegate(wv.PlatformNavigationDelegate handler) async {}
  @override
  Future<void> loadRequest(wv.LoadRequestParams params) async {}
  @override
  Future<void> clearCache() async {}
  @override
  Future<void> clearLocalStorage() async {}
  @override
  Future<void> runJavaScript(String javaScript) async => js.add(javaScript);
  @override
  Future<Object> runJavaScriptReturningResult(String javaScript) async => 'null';
}

class RecDelegate extends wv.PlatformNavigationDelegate {
  RecDelegate(super.params) : super.implementation();
  wv.PageEventCallback? finished;
  @override
  Future<void> setOnNavigationRequest(wv.NavigationRequestCallback cb) async {}
  @override
  Future<void> setOnPageStarted(wv.PageEventCallback cb) async {}
  @override
  Future<void> setOnPageFinished(wv.PageEventCallback cb) async => finished = cb;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssetServer server;
  late SharedState state;
  late RecWebViewPlatform web;

  setUp(() async {
    resetHarnessSingletons();
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await GameRules.load();
    await LevelRules.load();
    await NativeTabs.load();
    server = await AssetServer.start();
    web = RecWebViewPlatform();
    wv.WebViewPlatform.instance = web;
  });
  tearDown(() async => server.stop());

  RecController page() => web.controllers.first;

  /// Подождать настоящими часами: каталог читает ассеты.
  Future<void> settle(WidgetTester t, bool Function() until) async {
    await t.runAsync(() async {
      for (var i = 0; i < 80 && !until(); i++) {
        await t.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 25));
      }
    });
    await t.pump();
  }

  Future<void> mount(WidgetTester t) async {
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: HybridApp(state: state, server: server)));
    await settle(t, () => find.byType(NativeTabBar).evaluate().isNotEmpty);
  }

  Future<void> route(WidgetTester t, String path) async {
    page().emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}$path'});
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }
  }

  String? active(WidgetTester t) => t.widget<NativeTabBar>(find.byType(NativeTabBar)).active;
  bool catalogShown() => find.byType(CatalogScreen).evaluate().isNotEmpty; // скрытая вкладка — вне сцены

  testWidgets('🔴 полоса на главной; «Игры» — нативная вкладка, страница уводится router.replace', (t) async {
    await mount(t);
    expect(find.byKey(const ValueKey('native-tab-bar')), findsOneWidget);
    expect(active(t), '/');
    expect(catalogShown(), isFalse);
    expect(find.byKey(const ValueKey('native-tab-/games')), findsOneWidget);

    await t.tap(find.byKey(const ValueKey('native-tab-/games')));
    await settle(t, () => find.byKey(const ValueKey('catalog-sections')).evaluate().isNotEmpty);
    expect(catalogShown(), isTrue);
    expect(active(t), '/games');
    expect(page().js.any((s) => s.contains('__psyReplace("/games")')), isTrue,
        reason: 'страница идёт на вкладку тем же replace, что веб-полоса');
    expect(find.byType(AppBar), findsNothing, reason: 'вкладка, не экран поверх: своей панели нет');

    await t.tap(find.byKey(const ValueKey('native-tab-/statistics')));
    await t.pump();
    expect(catalogShown(), isFalse);
    expect(page().js.any((s) => s.contains('__psyReplace("/statistics")')), isTrue);
  });

  testWidgets('🔴 /games от страницы выбирает вкладку, а не кладёт каталог поверх; ?search= — в поле', (t) async {
    await mount(t);
    await route(t, '/games?search=${Uri.encodeQueryComponent('Мосты')}');
    await settle(t, () => find.byKey(const ValueKey('catalog-search')).evaluate().isNotEmpty);
    expect(catalogShown(), isTrue);
    expect(active(t), '/games');
    expect(t.widget<TextField>(find.byKey(const ValueKey('catalog-search'))).controller!.text, 'Мосты');
    expect(Navigator.of(t.element(find.byType(NativeTabBar))).canPop(), isFalse, reason: 'ничего не легло поверх');
  });

  testWidgets('🔴 на адресе игры полосы нет; назад на /games — снова вкладка с полосой', (t) async {
    await mount(t);
    await route(t, '/statistics');
    expect(find.byType(NativeTabBar), findsOneWidget);
    expect(active(t), '/statistics');
    // Адрес, которого нет в карте перехвата, — страница рисует сама; `/games/…` без полосы, как в вебе.
    await route(t, '/games/__web_only_probe__');
    expect(find.byType(NativeTabBar), findsNothing);
    expect(catalogShown(), isFalse);
    await route(t, '/games');
    await settle(t, () => find.byType(NativeTabBar).evaluate().isNotEmpty);
    expect(find.byType(NativeTabBar), findsOneWidget);
    expect(catalogShown(), isTrue);
  });

  testWidgets('🔴 плитка перенесённой игры — экран поверх; после него человек снова во вкладке «Игры»', (t) async {
    await mount(t);
    await t.tap(find.byKey(const ValueKey('native-tab-/games')));
    await settle(t, () => find.byKey(const ValueKey('catalog-sections')).evaluate().isNotEmpty);
    await t.enterText(find.byKey(const ValueKey('catalog-search')), 'one-line');
    await t.pump();
    await t.tap(find.byKey(const ValueKey('catalog-row-/games/one-line')));
    await settle(t, () => find.byType(OneLineScreen).evaluate().isNotEmpty);
    expect(find.byType(OneLineScreen), findsOneWidget);
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 100)); // переход экрана до конца
    }
    expect(find.byType(NativeTabBar).hitTestable(), findsNothing, reason: 'в игре полосы нет — экран лёг поверх');

    Navigator.of(t.element(find.byType(OneLineScreen))).pop();
    await settle(t, () => find.byType(NativeTabBar).evaluate().isNotEmpty);
    expect(find.byType(NativeTabBar), findsOneWidget);
    expect(catalogShown(), isTrue);
    expect(t.widget<TextField>(find.byKey(const ValueKey('catalog-search'))).controller!.text, 'one-line',
        reason: 'поиск дожил до возврата из игры');
  });

  testWidgets('🔴 поиск во вкладке переживает уход на другую вкладку и обратно', (t) async {
    await mount(t);
    await t.tap(find.byKey(const ValueKey('native-tab-/games')));
    await settle(t, () => find.byKey(const ValueKey('catalog-search')).evaluate().isNotEmpty);
    await t.enterText(find.byKey(const ValueKey('catalog-search')), 'bridg');
    await t.pump();
    await t.tap(find.byKey(const ValueKey('native-tab-/')));
    await t.pump();
    expect(catalogShown(), isFalse);
    await t.tap(find.byKey(const ValueKey('native-tab-/games')));
    await t.pump();
    expect(t.widget<TextField>(find.byKey(const ValueKey('catalog-search'))).controller!.text, 'bridg');
  });

  testWidgets('загрузка документа определяет вкладку; хост говорит вебу, что полоса нативная', (t) async {
    await mount(t);
    web.delegates.first.finished!('${server.origin}/games');
    await settle(t, () => find.byKey(const ValueKey('catalog-sections')).evaluate().isNotEmpty);
    expect(catalogShown(), isTrue);
    expect(page().js.any((s) => s.contains('window.__psyNativeTabs=true;')), isTrue);
  });
}
