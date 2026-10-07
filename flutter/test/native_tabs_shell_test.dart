import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/one_line/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/catalog_screen.dart';
import 'package:psygames_flutter/shell/feedback_fab.dart';
import 'package:psygames_flutter/shell/friends_screen.dart';
import 'package:psygames_flutter/shell/home_screen.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/stats_screen.dart';
import 'package:psygames_flutter/shell/streak_calendar_screen.dart';
import 'package:psygames_flutter/shell/assessment_result_screen.dart';
import 'package:psygames_flutter/shell/onboarding_screen.dart';
import 'package:psygames_flutter/shell/info_screens.dart';
import 'package:psygames_flutter/shell/walking_pet.dart';
import 'package:psygames_flutter/shell/web_game_screen.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart' show WebViewWidget;
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
///     хоста говорит вебу, что полоса нативная (`__psyNativeTabs`);
///   · страница (WebView) не пересоздаётся при переходах по вкладкам;
///   · цвета — веба: фон `#F5F5F7`, активная вкладка — акцент профиля, надетый акцент главнее;
///   · на нативной вкладке есть кнопка отзыва веба: место, форма, скрытие настройкой, перетаскивание.
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

  /// Ответы веб-питомца на вопросы моста (`__psyPet.ask`); `null` — моста на странице нет.
  Map<String, Object? Function(Object? arg)>? pet;
  final petAsked = <String>[];
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
  Future<void> runJavaScript(String javaScript) async {
    js.add(javaScript);
    final m = RegExp(r'__psyPet\.ask\(("[^"]*"), ("[^"]*"), (.*)\);$').firstMatch(javaScript);
    if (m != null && pet != null) {
      final id = jsonDecode(m.group(1)!) as String;
      final op = jsonDecode(m.group(2)!) as String;
      petAsked.add(op);
      final data = pet![op]?.call(jsonDecode(m.group(3)!));
      emit(SharedState.channel, {'op': 'petAnswer', 'id': id, 'data': data});
    }
  }

  @override
  Future<Object> runJavaScriptReturningResult(String javaScript) async =>
      javaScript.contains('__psyPet') && pet != null ? true : 'null';
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
    PetBridge.reset();
    ScreenUi.reset();
    WalkingPet.lastX = null;
    WalkingPet.randomForTest = null;
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await GameRules.load();
    await LevelRules.load();
    await NativeTabs.load();
    await WebTheme.load();
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

  Future<void> mount(WidgetTester t, {Map<String, String> prefs = const {}}) async {
    for (final e in prefs.entries) {
      await state.set(e.key, e.value);
    }
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

  testWidgets('🔴 /games?filter=hubs — вкладка со списком только развилок; ?search= после него фильтр снимает', (t) async {
    await mount(t);
    await route(t, '/games?filter=hubs');
    await settle(t, () => find.byKey(const ValueKey('catalog-flat')).evaluate().isNotEmpty);
    expect(active(t), '/games');
    final rows = find.descendant(of: find.byKey(const ValueKey('catalog-flat')), matching: find.byWidgetPredicate(
        (w) => w.key is ValueKey && '${(w.key! as ValueKey).value}'.startsWith('catalog-row-')));
    final routes = [for (final e in rows.evaluate()) '${(e.widget.key! as ValueKey).value}'.substring('catalog-row-'.length)];
    expect(routes, contains('/games/relaxation-hub'));
    final catalog = (jsonDecode(File('assets/catalog.json').readAsStringSync()) as Map)['games'] as List;
    final hubs = {for (final g in catalog.cast<Map>()) if (g['hub'] == true) g['route']};
    expect(routes.every(hubs.contains), isTrue, reason: 'в списке только развилки: $routes');
    await route(t, '/games?search=${Uri.encodeQueryComponent('Мосты')}');
    await settle(t, () => find.byKey(const ValueKey('catalog-search')).evaluate().isNotEmpty);
    expect(t.widget<TextField>(find.byKey(const ValueKey('catalog-search'))).controller!.text, 'Мосты');
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

  Future<void> toGames(WidgetTester t) async {
    await t.tap(find.byKey(const ValueKey('native-tab-/games')));
    await settle(t, () => find.byKey(const ValueKey('catalog-sections')).evaluate().isNotEmpty);
  }

  testWidgets('🔴 страница не пересоздаётся при переходах по вкладкам', (t) async {
    await mount(t);
    final before = t.element(find.byType(WebViewWidget, skipOffstage: false));
    await toGames(t);
    await t.tap(find.byKey(const ValueKey('native-tab-/statistics')));
    await t.pump();
    await toGames(t);
    expect(identical(t.element(find.byType(WebViewWidget, skipOffstage: false)), before), isTrue,
        reason: 'WebView тот же — страница и её состояние живы');
    expect(web.controllers.length, 1);
  });

  testWidgets('🔴 цвета веба: фон #F5F5F7, активная вкладка — акцент профиля, надетый акцент главнее', (t) async {
    await mount(t);
    expect(t.widget<Scaffold>(find.byType(Scaffold).first).backgroundColor, const Color(0xFFF5F5F7));
    expect(t.widget<NativeTabBar>(find.byType(NativeTabBar)).accent, const Color(0xFFA855F7), reason: 'nzt48');
    await toGames(t);
    final active = t.widget<Icon>(
        find.descendant(of: find.byKey(const ValueKey('native-tab-/games')), matching: find.byType(Icon)));
    expect(active.color, const Color(0xFFA855F7));
    final idle = t.widget<Icon>(find.descendant(of: find.byKey(const ValueKey('native-tab-/')), matching: find.byType(Icon)));
    expect(idle.color, const Color(0xFF6E6E73), reason: 'невыбранная — textSecondary веба');
  });

  testWidgets('надетый в магазине акцент красит активную вкладку', (t) async {
    await mount(t, prefs: {'psygames_cosmetics_equipped_nzt48': '{"accent":"accent_neon"}'});
    expect(t.widget<NativeTabBar>(find.byType(NativeTabBar)).accent, const Color(0xFF00E5A0));
  });

  testWidgets('🔴 на нативной вкладке — кнопка отзыва веба на её месте; нажатие открывает форму', (t) async {
    await mount(t);
    expect(find.byKey(const ValueKey('feedback-fab')), findsNothing, reason: 'на странице кнопку рисует веб');
    await toGames(t);
    final fab = find.byKey(const ValueKey('feedback-fab'));
    expect(fab, findsOneWidget);
    final r = t.getRect(fab);
    // Окно 390×844, безопасной зоны в пробе нет: слева 14, снизу 92 (`FAB_BOTTOM`), сторона 48.
    expect(r, const Rect.fromLTWH(14, 844 - 92 - 48, 48, 48));
    expect(r.bottom <= t.getRect(find.byType(NativeTabBar)).top, isTrue, reason: 'над полосой, а не под ней');

    await t.tap(fab);
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    final form = t.widget<WebGameScreen>(find.byType(WebGameScreen));
    expect(Uri.parse(form.url).path, '/feedback');
    expect(Uri.parse(form.url).queryParameters['sourceRoute'], '/games');
  });

  testWidgets('кнопка отзыва скрыта, если человек выключил её в настройках', (t) async {
    await mount(t, prefs: {'psygames_devchat_on': '0'});
    await toGames(t);
    expect(find.byKey(const ValueKey('feedback-fab')), findsNothing);
  });

  testWidgets('кнопку отзыва можно перетащить: место запоминается долей экрана, подрезается под экран', (t) async {
    await mount(t);
    await toGames(t);
    final fab = find.byKey(const ValueKey('feedback-fab'));
    await t.drag(fab, const Offset(200, -300));
    await t.pump();
    final spot = FabRules.readSpot(state.get('psygames_feedback_fab_spot'));
    expect(spot, isNotNull);
    expect(t.getRect(fab).topLeft, const Offset(214, 844 - 92 - 48 - 300));
    expect(find.byType(WebGameScreen), findsNothing, reason: 'перетаскивание — не нажатие');
    // Подрезка: доля 1×1 — правый нижний угол внутри безопасной зоны, а не за краем.
    expect(FabRules.spotToPixels(const Offset(1, 1), const Size(390, 844), EdgeInsets.zero),
        const Offset(390 - 6 - 48, 844 - 6 - 48));
    expect(FabRules.readSpot('{"fx":"5","fy":1}'), isNull, reason: 'мусор — «не сохранено»');
  });

  /// Веб-питомец страницы: облик кота с вещью на нулевом кадре, реплики и встреча.
  Map<String, Object? Function(Object? arg)> petPage({bool visible = true, bool walks = true, Object? first, Object? line}) => {
        'config': (_) => {
              'visible': visible,
              'walks': walks,
              'size': 56,
              'skin': 'cat',
              'specs': {
                for (final st in ['idle', 'walk', 'wave', 'jump', 'celebrate', 'sleepcurl', 'yawn'])
                  st: {
                    'kind': 'frames',
                    'uris': ['/assets/assets/images/pet/cat/${st}0.h.webp', '/assets/assets/images/pet/cat/${st}1.h.webp'],
                    'frames': 2,
                    'tickMs': 300,
                    'accessory': {
                      'uri': '/assets/assets/images/pet/accessories/hat.h.png',
                      'boxes': [
                        {'left': 0.27, 'top': -0.2, 'size': 0.46},
                        null,
                      ],
                    },
                  },
              },
              'cycles': {'yawn': 1820, 'sleepcurl': 2480},
              'fidgets': ['yawn'],
              'sleepPoses': ['sleepcurl'],
              'walk': {
                'size': 56, 'speed': 34, 'pauseMin': 3000, 'pauseSpan': 5000, 'speechMin': 20000,
                'speechSpan': 20000, 'speechShow': 4000, 'firstSpeechMin': 4000, 'firstSpeechSpan': 4000,
                'greetShow': 6000,
              },
            },
        'first': (_) => first,
        'line': (_) => line ?? {'text': 'Мяу'},
        'petted': (_) => {'text': 'Мур'},
        'coach': (skill) => '/games/one-line',
      };

  Future<void> petMount(WidgetTester t, Map<String, Object? Function(Object? arg)> answers) async {
    await mount(t);
    page().pet = answers;
    await toGames(t);
    await t.pump(const Duration(milliseconds: 50));
  }

  testWidgets('🔴 на нативной вкладке гуляет питомец: облик и кадры — от веба, над полосой', (t) async {
    await petMount(t, petPage());
    final pet = find.byKey(const ValueKey('walking-pet-body'));
    expect(pet, findsOneWidget);
    expect(page().petAsked.first, 'config');
    final img = t.widget<Image>(find.descendant(of: pet, matching: find.byType(Image)).first);
    expect((img.image as NetworkImage).url, '${server.origin}/assets/assets/images/pet/cat/idle0.h.webp',
        reason: 'кадр — адрес веб-сборки с хешем, а не придуманное имя');
    final r = t.getRect(pet);
    expect(r.size, const Size(56, 56));
    expect(r.bottom, 844 - 6 - 58, reason: 'над полосой вкладок на 6, как BOTTOM_BAR_LIFT веба');
    // Вещь — на месте нулевого кадра, в долях размера.
    expect(t.getRect(find.byKey(const ValueKey('pet-accessory'))).topLeft,
        Offset(r.left + 0.27 * 56, r.top - 0.2 * 56));
    // Нет на веб-вкладке (там гуляет питомец самой страницы). «Прогресс» с 07.10 нативный — берём «Зарядку».
    await t.tap(find.byKey(const ValueKey('native-tab-/warmup-picker')));
    await t.pump();
    expect(find.byKey(const ValueKey('walking-pet-body')), findsNothing);
  });

  testWidgets('🔴 питомец гуляет: через 1,2 с идёт, мордой по ходу, и приходит в полосу 10–90 %', (t) async {
    await petMount(t, petPage());
    final x0 = t.getRect(find.byKey(const ValueKey('walking-pet-body'))).left;
    await t.pump(const Duration(milliseconds: 1300));
    expect(find.byKey(const ValueKey('pet-frames-walk')), findsOneWidget, reason: 'в пути — кадры ходьбы');
    await t.pump(const Duration(seconds: 12));
    final x1 = t.getRect(find.byKey(const ValueKey('walking-pet-body'))).left;
    expect(x1, isNot(x0));
    expect(x1 >= 390 * 0.10 - 0.5 && x1 <= 390 * 0.90 - 56 + 0.5, isTrue, reason: 'x=$x1');
  });

  testWidgets('🔴 встреча от веба доходит до пузыря и не повторяется при новом заходе', (t) async {
    // Ноль — самая ранняя болтовня (4-я секунда), то есть ВНУТРИ окна встречи 1,3–7,3 с.
    WalkingPet.randomForTest = _Zero();
    await petMount(t, petPage(first: {'state': 'wave', 'text': 'Серия 4, до цели 26', 'showMs': 6000}));
    await t.pump(const Duration(milliseconds: 1400));
    expect(find.text('Серия 4, до цели 26'), findsOneWidget);
    // Текст пузыря — со стилем приложения, а не запасным стилем Flutter без Material
    // (жёлтое двойное подчёркивание; живой замер на эмуляторе 07.10.2026).
    final bubble = t.widget<RichText>(find.descendant(of: find.byKey(const ValueKey('walking-pet-bubble')), matching: find.byType(RichText)));
    expect(bubble.text.style?.decoration, isNot(TextDecoration.underline));
    // Болтовня (4–8 с) встречу не затирает: она держится свои 6 с.
    await t.pump(const Duration(seconds: 5));
    expect(find.text('Серия 4, до цели 26'), findsOneWidget);
    await t.pump(const Duration(seconds: 2));
    expect(find.text('Серия 4, до цели 26'), findsNothing);
    await t.tap(find.byKey(const ValueKey('native-tab-/')));
    await t.pump();
    await toGames(t);
    await t.pump(const Duration(seconds: 2));
    expect(page().petAsked.where((o) => o == 'first').length, 1, reason: 'встреча — раз за запуск');
  });

  testWidgets('тап — экран питомца тем же router.push; тренерский пузырь — игра слабой шкалы', (t) async {
    await petMount(t, petPage(line: {'text': 'Память отстаёт — сыграем?', 'skill': 'memory'}));
    await t.tap(find.byKey(const ValueKey('walking-pet-body')));
    await t.pump(const Duration(milliseconds: 500));
    expect(page().js.any((s) => s.contains('__psyPush("/pet")')), isTrue);

    // Первая болтовня — на 4–8 с и держится 4 с: идём по полсекунды, пока не появится.
    for (var i = 0; i < 20 && find.text('Память отстаёт — сыграем?').evaluate().isEmpty; i++) {
      await t.pump(const Duration(milliseconds: 500));
    }
    expect(find.text('Память отстаёт — сыграем?'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('walking-pet-bubble')));
    await settle(t, () => find.byType(OneLineScreen).evaluate().isNotEmpty);
    expect(page().petAsked, contains('coach'));
    expect(find.byType(OneLineScreen), findsOneWidget, reason: 'перенесённая игра — нативно поверх');
  });

  testWidgets('🔴 не гуляет (по умолчанию, ed85e191) — сидит у правого края, но живёт: мелочи безделья и встреча', (t) async {
    // Ноль случайности: отдых 3 с — короткий, значит мелочь безделья (зевок 1,82 с) успевает.
    WalkingPet.randomForTest = _Zero();
    await petMount(t, petPage(walks: false, first: {'state': 'wave', 'text': 'Серия 4, до цели 26', 'showMs': 6000}));
    final seat = WalkingPet.seatX(390, 56);
    expect(t.getRect(find.byKey(const ValueKey('walking-pet'))).left, seat, reason: 'с первого кадра — на своём месте');
    var walked = false, yawned = false;
    for (var i = 0; i < 120; i++) {
      await t.pump(const Duration(milliseconds: 100));
      walked |= find.byKey(const ValueKey('pet-frames-walk')).evaluate().isNotEmpty;
      yawned |= find.byKey(const ValueKey('pet-frames-yawn')).evaluate().isNotEmpty;
      expect(t.getRect(find.byKey(const ValueKey('walking-pet'))).left, seat, reason: 'не сходит с места (${i * 100} мс)');
    }
    expect(walked, isFalse, reason: 'кадров ходьбы нет');
    expect(yawned, isTrue, reason: 'мелочь безделья на месте — играет');
    expect(page().petAsked, contains('first'), reason: 'встреча спрошена');
  });

  testWidgets('встреча доходит до пузыря и у сидящего питомца', (t) async {
    WalkingPet.randomForTest = _Zero();
    await petMount(t, petPage(walks: false, first: {'state': 'wave', 'text': 'Серия 4, до цели 26', 'showMs': 6000}));
    await t.pump(const Duration(milliseconds: 1400));
    expect(find.text('Серия 4, до цели 26'), findsOneWidget);
  });

  testWidgets('питомец выключен в настройках — его нет; страница без моста — его нет', (t) async {
    await petMount(t, petPage(visible: false));
    expect(find.byKey(const ValueKey('walking-pet-body')), findsNothing);
  });

  testWidgets('щадящий режим системы: стоит на месте, кадры не листает', (t) async {
    await mount(t);
    page().pet = petPage();
    t.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(t.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await toGames(t);
    await t.pump(const Duration(milliseconds: 50));
    final x0 = t.getRect(find.byKey(const ValueKey('walking-pet'))).left;
    final img0 = (t.widget<Opacity>(find.descendant(of: find.byKey(const ValueKey('pet-frames-idle')), matching: find.byType(Opacity)).first)).opacity;
    await t.pump(const Duration(seconds: 10));
    expect(t.getRect(find.byKey(const ValueKey('walking-pet'))).left, x0, reason: 'место колонки не меняется — не ходит');
    expect(find.byKey(const ValueKey('pet-frames-walk')), findsNothing);
    expect((t.widget<Opacity>(find.descendant(of: find.byKey(const ValueKey('pet-frames-idle')), matching: find.byType(Opacity)).first)).opacity, img0);
  });

  Map<String, Object?> homeModel() =>
      (jsonDecode(File('test/fixtures/home_model_ru.json').readAsStringSync()) as Map).cast<String, Object?>()..['goalSheet'] = null;

  testWidgets('🔴 «/» от страницы — нативная Главная; рисуется, как только пришла модель', (t) async {
    await mount(t);
    web.delegates.first.finished!('${server.origin}/'); // загрузка документа: скрипт хоста + выбор вкладки
    await t.pump();
    expect(find.byKey(const ValueKey('home-loading')), findsOneWidget, reason: 'модели ещё нет — ждём, а не пустота');
    expect(find.byType(NativeTabBar), findsOneWidget);
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': '/', 'model': homeModel()});
    await settle(t, () => find.byKey(const ValueKey('home-header')).evaluate().isNotEmpty);
    expect(find.byKey(const ValueKey('home-header')), findsOneWidget);
    expect(t.widget<NativeTabBar>(find.byType(NativeTabBar)).active, '/');
    expect(page().js.any((s) => s.contains('window.__psyHostScreens=["/","#switcher","/statistics","/streak-calendar","/assessment-result","/onboarding","/sources","/collection","/achievements","/leagues","/friends"]')), isTrue,
        reason: 'веб узнаёт, какие экраны рисуем мы');
    // Вкладка «Игры» и назад — Главная та же, модель жива.
    await toGames(t);
    await t.tap(find.byKey(const ValueKey('native-tab-/')));
    await t.pump();
    expect(find.byKey(const ValueKey('home-header')), findsOneWidget);
    expect(page().js.any((s) => s.contains('__psyReplace("/")')), isTrue);
  });

  testWidgets('🔴 модель не пришла за 6 с — показываем саму страницу, а не вечную загрузку', (t) async {
    await mount(t);
    await route(t, '/');
    await t.pump(const Duration(seconds: 7));
    await t.pump();
    expect(find.byType(WebViewWidget), findsOneWidget, reason: 'страница видна (не за сценой)');
    expect(find.byKey(const ValueKey('home-loading')), findsNothing);
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': '/', 'model': homeModel()});
    await settle(t, () => find.byKey(const ValueKey('home-header')).evaluate().isNotEmpty);
    expect(find.byKey(const ValueKey('home-header')), findsOneWidget, reason: 'модель пришла — снова нативная');
  });

  testWidgets('🔴 после игры поверх Главная просит веб перечитать «Сегодня» и монеты', (t) async {
    await mount(t);
    await route(t, '/');
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': '/', 'model': homeModel()});
    await settle(t, () => find.byKey(const ValueKey('home-header')).evaluate().isNotEmpty);
    page().js.clear();
    // Игра с карточки Главной — нативно поверх; страница под ней остаётся на «/».
    await t.scrollUntilVisible(find.byKey(const ValueKey('home-card-schulte_table')), 200,
        scrollable: find.descendant(of: find.byKey(const ValueKey('home-list')), matching: find.byType(Scrollable)).first);
    await t.ensureVisible(find.byKey(const ValueKey('home-card-schulte_table')));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('home-card-schulte_table')));
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(HomeScreen).hitTestable(), findsNothing, reason: 'игра легла поверх');
    Navigator.of(t.element(find.byType(NativeTabBar, skipOffstage: false))).pop();
    await settle(t, () => page().js.any((s) => s.contains('["/"].refresh(')));
    expect(page().js.any((s) => s.contains('["/"].refresh(')), isTrue);
  });

  Map<String, Object?> statsModel() =>
      (jsonDecode(File('test/fixtures/stats_model.json').readAsStringSync()) as Map).cast<String, Object?>();

  testWidgets('🔴 вкладка «Прогресс» — нативный экран по модели страницы; охват уходит вебу действием', (t) async {
    await mount(t);
    await t.tap(find.byKey(const ValueKey('native-tab-/statistics')));
    await t.pump();
    expect(page().js.any((s) => s.contains('__psyReplace("/statistics")')), isTrue, reason: 'страница уведена на тот же адрес');
    expect(find.byKey(const ValueKey('stats-loading')), findsOneWidget, reason: 'модели ещё нет — ждём');
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': StatsScreen.route, 'model': statsModel()});
    await settle(t, () => find.byKey(const ValueKey('stats-screen')).evaluate().isNotEmpty);
    expect(active(t), '/statistics');
    expect(find.byKey(const ValueKey('stats-hero')), findsOneWidget);
    page().js.clear();
    await t.tap(find.byKey(const ValueKey('stats-scope-all')));
    await t.pump();
    expect(page().js.any((s) => s.contains('["/statistics"].scope(true)')), isTrue);
    // Адрес от страницы (ссылка «Прогресс» с Главной) тоже выбирает вкладку, а не страницу.
    await toGames(t);
    await route(t, '/statistics');
    expect(active(t), '/statistics');
    expect(find.byKey(const ValueKey('stats-hero')), findsOneWidget);
  });

  testWidgets('«Прогресс» без модели 6 с — сама страница; модель пришла — нативный', (t) async {
    await mount(t);
    await route(t, '/statistics');
    await t.pump(const Duration(seconds: 7));
    await t.pump();
    expect(find.byType(WebViewWidget), findsOneWidget, reason: 'страница видна (не за сценой)');
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': StatsScreen.route, 'model': statsModel()});
    await settle(t, () => find.byKey(const ValueKey('stats-screen')).evaluate().isNotEmpty);
    expect(find.byKey(const ValueKey('stats-hero')), findsOneWidget);
  });

  Map<String, Object?> fixture(String f) =>
      (jsonDecode(File('test/fixtures/$f').readAsStringSync()) as Map).cast<String, Object?>();

  testWidgets('🔴 /streak-calendar от страницы — нативный календарь, полоса на месте, кнопка отзыва есть', (t) async {
    await mount(t);
    await route(t, '/streak-calendar');
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': StreakCalendarScreen.route, 'model': fixture('calendar_model.json')});
    await settle(t, () => find.byKey(const ValueKey('calendar-screen')).evaluate().isNotEmpty);
    expect(find.byKey(const ValueKey('calendar-card')), findsOneWidget);
    expect(find.byType(NativeTabBar), findsOneWidget, reason: 'tabBarVisible веба: на календаре полоса стоит');
    expect(find.byType(FeedbackFab), findsOneWidget);
    page().js.clear();
    await t.tap(find.byKey(const ValueKey('calendar-back')));
    await t.pump();
    expect(page().js.any((s) => s.contains('["/streak-calendar"].back()')), isTrue);
    // Страница вернулась на Главную своим переходом — тело снова Главная.
    await route(t, '/');
    expect(find.byKey(const ValueKey('calendar-screen')), findsNothing);
  });

  testWidgets('🔴 /assessment-result — нативный итог без полосы (noBar веба), кнопка отзыва на месте', (t) async {
    await mount(t);
    await route(t, '/assessment-result');
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': AssessmentResultScreen.route, 'model': fixture('assessment_model.json')});
    await settle(t, () => find.byKey(const ValueKey('assessment-screen')).evaluate().isNotEmpty);
    expect(find.byKey(const ValueKey('assessment-hero')), findsOneWidget);
    expect(find.byType(NativeTabBar), findsNothing);
    expect(find.byType(FeedbackFab), findsOneWidget);
  });

  testWidgets('🔴 /onboarding — нативное знакомство без полосы; выбор игры уходит вебу', (t) async {
    await mount(t);
    await route(t, '/onboarding');
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': OnboardingScreen.route, 'model': fixture('onboarding_model.json')});
    await settle(t, () => find.byKey(const ValueKey('onboarding-quiz')).evaluate().isNotEmpty);
    expect(find.byType(NativeTabBar), findsNothing, reason: 'noBar веба: на знакомстве полосы нет');
    page().js.clear();
    await t.tap(find.byKey(const ValueKey('onboarding-exit')));
    await t.pump();
    expect(page().js.any((s) => s.contains('["/onboarding"].skipPicker()')), isTrue);
  });

  testWidgets('🔴 системная «назад»: страница — по её истории, вкладка — на Главную, Главная — выход', (t) async {
    // Живой замер 07.10.2026: «назад» на календаре серии закрывала приложение целиком.
    await mount(t);
    await route(t, '/streak-calendar');
    page().js.clear();
    final onPage = await t.binding.handlePopRoute();
    await t.pump();
    expect(onPage, isTrue, reason: 'оболочка сама обработала «назад», приложение не закрылось');
    expect(page().js.any((s) => s.contains('__psyBack')), isTrue, reason: 'назад по истории страницы — goBackOrHome веба');
    await route(t, '/statistics');
    page().js.clear();
    await t.binding.handlePopRoute();
    await t.pump();
    expect(page().js.any((s) => s.contains('__psyReplace("/")')), isTrue, reason: 'с вкладки — на Главную');
    expect(active(t), '/');
    await route(t, '/');
    page().js.clear();
    await t.binding.handlePopRoute();
    await t.pump();
    expect(page().js.where((s) => s.contains('__psyBack') || s.contains('__psyReplace')), isEmpty,
        reason: 'на Главной «назад» не перехватываем — система закрывает приложение');
  });

  testWidgets('🔴 окно цели серии Главной не всплывает поверх другого экрана тела (знакомство)', (t) async {
    // Живой замер 07.10.2026: на свежей установке окно «сколько дней подряд» легло поверх знакомства —
    // Главная стоит в теле всегда, а её последняя модель несла goalSheet.
    await mount(t);
    final home = fixture('home_model_ru.json'); // с окном цели (homeModel() его снимает нарочно)
    expect(home['goalSheet'], isNotNull, reason: 'образец Главной несёт окно цели');
    await route(t, '/onboarding');
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': '/', 'model': home});
    page().emit(SharedState.channel, {'op': 'screenUi', 'route': OnboardingScreen.route, 'model': fixture('onboarding_model.json')});
    await settle(t, () => find.byKey(const ValueKey('onboarding-quiz')).evaluate().isNotEmpty);
    expect(find.byKey(const ValueKey('goal-sheet')), findsNothing, reason: 'Главная не на экране — окна нет');
    // Вернулись на Главную — окно открывается, как у веба.
    await route(t, '/');
    await settle(t, () => find.byKey(const ValueKey('goal-sheet')).evaluate().isNotEmpty);
    expect(find.byKey(const ValueKey('goal-sheet')), findsOneWidget);
  });

  testWidgets('🔴 источники, коллекция, достижения, лиги, друзья — нативные страницы с полосой; «назад» — по истории', (t) async {
    await mount(t);
    for (final (path, file, k) in [
      (SourcesScreen.route, 'sources_model.json', 'sources-screen'),
      (CollectionScreen.route, 'collection_model.json', 'collection-screen'),
      (AchievementsScreen.route, 'achievements_model.json', 'achievements-screen'),
      (LeaguesScreen.route, 'leagues_model.json', 'leagues-screen'),
      (FriendsScreen.route, 'friends_model.json', 'friends-screen'),
    ]) {
      await route(t, path);
      page().emit(SharedState.channel, {'op': 'screenUi', 'route': path, 'model': fixture(file)});
      await settle(t, () => find.byKey(ValueKey(k)).evaluate().isNotEmpty);
      expect(find.byKey(ValueKey(k)), findsOneWidget, reason: path);
      expect(find.byType(NativeTabBar), findsOneWidget, reason: '$path: tabBarVisible веба — полоса есть');
      page().js.clear();
      await t.binding.handlePopRoute();
      await t.pump();
      expect(page().js.any((s) => s.contains('__psyBack')), isTrue, reason: '$path: «назад» — по истории страницы');
    }
  });

  testWidgets('итог оценки без модели 6 с — сама страница', (t) async {
    await mount(t);
    await route(t, '/assessment-result');
    await t.pump(const Duration(seconds: 7));
    await t.pump();
    expect(find.byType(WebViewWidget), findsOneWidget, reason: 'страница видна (не за сценой)');
  });
}

class _Zero implements Random {
  @override
  double nextDouble() => 0;
  @override
  int nextInt(int max) => 0;
  @override
  bool nextBool() => false;
}
