import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/catalog_kit.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/home_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ГЛАВНАЯ В «АВРОРЕ» — новая раскладка (лист 01 Codex), но те же данные и те же действия,
/// что у классической шапки: ни одна функция не потерялась. Classic проверяет `home_screen_test.dart`.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  late Map<String, Object?> model;
  final opened = <String>[];
  var switcher = 0;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    model = (jsonDecode(File('test/fixtures/home_model_ru.json').readAsStringSync()) as Map).cast<String, Object?>();
    ScreenUi.reset();
    ScreenUi.run = (s) async {};
    opened.clear();
    switcher = 0;
  });

  Future<void> mount(WidgetTester t, {required UiTemplate template, Size size = const Size(780, 1688), double textScale = 1}) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    final m = Map<String, Object?>.from(model)..['goalSheet'] = null;
    late CatalogKit kit;
    await t.runAsync(() async => kit = await CatalogKit.load());
    ScreenUi.model(HomeScreen.route).value = m;
    await t.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: Scaffold(
        body: HomeScreen(
          state: state,
          origin: 'http://127.0.0.1:1',
          kit: kit,
          onOpen: opened.add,
          onTab: (_) {},
          onSwitcher: () => switcher++,
          ownModel: false,
        ),
      ),
    ));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  testWidgets('«Аврора»: шапка, строка «Режим», карточка зарядки и счётчики — все прежние действия на месте', (t) async {
    await mount(t, template: UiTemplate.aurora);
    expect(key('aurora-home-top'), findsOneWidget);
    expect(key('home-header'), findsNothing, reason: 'классическая шапка под «Авророй» не рисуется');
    expect(find.text('PsyGames'), findsOneWidget);
    expect(key('aurora-home-stats'), findsOneWidget);
    expect(find.descendant(of: key('home-tokens'), matching: find.text('235')), findsOneWidget);
    expect(find.descendant(of: key('home-tokens'), matching: find.text('Lv 3')), findsOneWidget);
    expect(find.descendant(of: key('home-streak'), matching: find.text('4')), findsOneWidget);
    expect(find.descendant(of: key('home-achievements'), matching: find.text('5')), findsOneWidget);
    expect(find.text('${((model['header'] as Map)['chip'] as Map)['name']}'), findsOneWidget);
    // «Продолжить» — значок самой игры, тот же переход.
    final resume = (model['blocks'] as List).cast<Map>().firstWhere((b) => b['kind'] == 'resume', orElse: () => const {});
    if (resume.isNotEmpty) {
      await t.scrollUntilVisible(key('home-resume'), 200, scrollable: find.descendant(of: key('home-list'), matching: find.byType(Scrollable)).first);
      expect(find.descendant(of: key('home-resume'), matching: find.byType(Image)), findsOneWidget);
      await t.tap(key('home-resume'));
      expect(opened.removeLast(), resume['href']);
      await t.scrollUntilVisible(key('home-profile-chip'), -200, scrollable: find.descendant(of: key('home-list'), matching: find.byType(Scrollable)).first);
    }

    await t.tap(key('home-profile-chip'));
    expect(switcher, 1);
    for (final k in ['home-tokens', 'home-streak', 'home-achievements', 'home-pet', 'home-settings', 'home-friends']) {
      await t.tap(key(k));
    }
    expect(opened, ['/shop', '/streak-calendar', '/achievements', '/pet', '/settings', '/friends']);
  });

  testWidgets('Classic: новой шапки нет, классическая на месте', (t) async {
    await mount(t, template: UiTemplate.classic);
    expect(key('aurora-home-top'), findsNothing);
    expect(key('aurora-home-stats'), findsNothing);
    expect(key('home-header'), findsOneWidget);
  });

  testWidgets('«Аврора»: 320 pt и шрифт ×2 — ничего не вылезает за края', (t) async {
    await mount(t, template: UiTemplate.aurora, size: const Size(640, 1400), textScale: 2);
    expect(t.takeException(), isNull);
    expect(key('aurora-home-stats'), findsOneWidget);
  });
}
