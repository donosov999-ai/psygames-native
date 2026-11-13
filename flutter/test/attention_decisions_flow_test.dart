import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/bart/screen.dart';
import 'package:psygames_flutter/games/prl/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/suite_switch.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;
import 'dart:io';

import 'hybrid_overlay_route_repro_test.dart' show FakeWebViewPlatform, resetHarnessSingletons;

/// 🔴 «КОНФЛИКТ → РЕШЕНИЯ → BART» ДОХОДИТ ДО ЭКРАНА BART (отчёт 13.11: Денис BART не нашёл).
///
/// В развилке «Конфликт внимания» карточка набора одна — «Решения» (первый режим — PRL); Iowa и BART —
/// её режимы, и до них ведут только плашки «Режим» на экране настройки. Проба идёт через настоящую
/// оболочку (`HybridApp`): развилка → карточка → плашка → экран BART → одно «назад» → развилка.
/// Список веба (`psygames_hub_visible`) НЕ задан: игра открывается и без веб-половины.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssetServer server;
  late SharedState state;
  late FakeWebViewPlatform web;

  setUp(() async {
    resetHarnessSingletons();
    Profiles.useForTest(Profiles.parse(File('assets/profiles.json').readAsStringSync()));
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await GameRules.load();
    await LevelRules.load();
    await GameSuites.load();
    server = await AssetServer.start();
    web = FakeWebViewPlatform();
    wv.WebViewPlatform.instance = web;
  });
  tearDown(() async => server.stop());

  Future<void> until(WidgetTester t, bool Function() ok) async {
    for (var i = 0; i < 80 && !ok(); i++) {
      // Развилка читает ассеты — настоящий ввод-вывод идёт вне поддельных часов теста.
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump(const Duration(milliseconds: 100));
    }
  }

  Finder chip(String route) => find.byKey(Key('suite-mode-$route'));

  testWidgets('🔴 развилка → «Решения» (PRL) → плашка BART → BART → «назад» — развилка', (t) async {
    // Высокий экран: ListView строит карточки лениво, а «Решения» — восьмая.
    t.view.physicalSize = const Size(800, 4000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: HybridApp(state: state, server: server)));
    await t.pump(const Duration(milliseconds: 400));
    web.controllers.first.emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/attention-conflict'});
    final card = find.byKey(const ValueKey('hub-card-/games/prl'));
    await until(t, () => card.evaluate().isNotEmpty);
    expect(card, findsOneWidget, reason: 'карточка набора «Решения» в развилке');
    // Карточка называет режимы: иначе не видно, что внутри есть Iowa и BART.
    expect(find.byKey(const ValueKey('hub-modes-/games/prl')), findsOneWidget);

    await t.ensureVisible(card);
    await t.tap(card);
    await until(t, () => find.byType(PrlScreen).evaluate().isNotEmpty && chip('/games/bart').evaluate().isNotEmpty);
    expect(find.byType(PrlScreen), findsOneWidget);

    await t.ensureVisible(chip('/games/bart'));
    await t.tap(chip('/games/bart'));
    await until(t, () => find.byType(BartScreen).evaluate().isNotEmpty && find.byType(PrlScreen).evaluate().isEmpty);
    expect(find.byType(BartScreen), findsOneWidget, reason: 'BART открылся плашкой');
    await until(t, () => chip('/games/bart').evaluate().length == 1);
    expect(t.widget<ChoiceChip>(chip('/games/bart')).selected, isTrue);

    // Замена маршрута: одно «назад» — в развилку, а не обратно в PRL.
    t.state<NavigatorState>(find.byType(Navigator).first).pop();
    await until(t, () => find.byType(BartScreen).evaluate().isEmpty);
    await t.pump(const Duration(milliseconds: 300));
    expect(find.byType(BartScreen), findsNothing);
    expect(find.byType(PrlScreen), findsNothing, reason: 'плашка — замена экрана, а не ещё один слой');
    expect(find.byType(HubScreen), findsOneWidget, reason: 'одно «назад» — в развилку');
  });
}
