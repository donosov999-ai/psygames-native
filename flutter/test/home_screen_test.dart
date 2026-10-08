import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/catalog_kit.dart';
import 'package:psygames_flutter/shell/home_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ГЛАВНАЯ НА FLUTTER РИСУЕТ МОДЕЛЬ ВЕБА, А НЕ СЧИТАЕТ САМА (задача 7c88c0b8, правило 4e679f41).
///
/// Модель — образец, который выгружает веб-проба `home-model.test.ts` настоящей `buildHomeModel`
/// (`test/fixtures/home_model_ru.json`): натив проверяется на той форме, что шлёт страница.
///   · шапка: монеты, уровень, серия, чип профиля, четыре кнопки; значки — шрифтом Ionicons веба;
///   · лента — блоки в порядке веба; «Сегодня» — три строки и «ещё N»;
///   · нажатия-переходы уходят оболочке адресом (с параметрами вечера), нажатия-решения — вебу
///     действием (цель, вызов дня, поиск);
///   · окно цели серии открывается моделью поверх экрана и закрывается выбором.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  late Map<String, Object?> model;
  final js = <String>[];
  final opened = <String>[];
  final tabs = <String>[];
  var switcher = 0;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    model = (jsonDecode(File('test/fixtures/home_model_ru.json').readAsStringSync()) as Map).cast<String, Object?>();
    ScreenUi.reset();
    js.clear();
    opened.clear();
    tabs.clear();
    switcher = 0;
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, {bool sheet = false}) async {
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    final m = Map<String, Object?>.from(model);
    if (!sheet) m['goalSheet'] = null;
    late CatalogKit kit;
    await t.runAsync(() async => kit = await CatalogKit.load());
    ScreenUi.model(HomeScreen.route).value = m;
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HomeAccent(
          color: const Color(0xFFA855F7),
          child: HomeScreen(
            state: state,
            origin: 'http://127.0.0.1:1',
            kit: kit,
            onOpen: opened.add,
            onTab: tabs.add,
            onSwitcher: () => switcher++,
            // Рисунок проверяется на модели веба (`home_model_ru.json`); свою модель — `home_own_model_test.dart`.
            ownModel: false,
          ),
        ),
      ),
    ));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  Future<void> scrollTo(WidgetTester t, String k) async {
    await t.scrollUntilVisible(key(k), 200, scrollable: find.descendant(of: key('home-list'), matching: find.byType(Scrollable)).first);
    await t.pump();
  }

  testWidgets('🔴 шапка: монеты, уровень, серия, чип; значки — шрифтом Ionicons веба', (t) async {
    await mount(t);
    expect(find.descendant(of: key('home-tokens'), matching: find.text('235')), findsOneWidget);
    expect(find.descendant(of: key('home-tokens'), matching: find.text('Lv 3')), findsOneWidget);
    expect(find.descendant(of: key('home-streak'), matching: find.text('🔥4')), findsOneWidget);
    // Имя профиля — из модели (словарь веба), во Flutter-словаре его нет и не нужно.
    expect(find.text('${((model['header'] as Map)['chip'] as Map)['name']}'), findsOneWidget);
    final trophy = t.widget<Icon>(find.descendant(of: key('home-icon-achievements'), matching: find.byType(Icon)));
    expect(trophy.icon!.fontFamily, 'Ionicons');
    expect(find.descendant(of: key('home-icon-achievements'), matching: find.text('5')), findsOneWidget, reason: 'счётчик достижений');

    await t.tap(key('home-profile-chip'));
    expect(switcher, 1);
    await t.tap(key('home-tokens'));
    await t.tap(key('home-streak'));
    await t.tap(key('home-icon-statistics'));
    await t.tap(key('home-pet'));
    expect(opened, ['/shop', '/streak-calendar', '/statistics', '/pet']);
  });

  testWidgets('🔴 лента — блоки в порядке веба', (t) async {
    await mount(t);
    final order = ['home-search', 'home-ladder', 'home-chest', 'home-resume', 'home-goal', 'home-today', 'home-reco', 'home-practices', 'home-favourites', 'home-all-forks'];
    double? last;
    for (final k in order) {
      await scrollTo(t, k);
      final y = t.getTopLeft(key(k)).dy + (t.widget<Scrollable>(find.descendant(of: key('home-list'), matching: find.byType(Scrollable)).first).controller?.offset ?? 0);
      if (last != null) expect(y > last, isTrue, reason: '$k ниже предыдущего');
      last = y;
    }
  });

  testWidgets('🔴 «Сегодня»: три строки, ×2, «ещё 1»; блок ведёт в статистику, сумма — в магазин', (t) async {
    await mount(t);
    await scrollTo(t, 'home-today');
    final today = (model['blocks'] as List).cast<Map>().firstWhere((b) => b['kind'] == 'today');
    for (final r in (today['rows'] as List).cast<Map>()) {
      expect(find.descendant(of: key('home-today'), matching: find.text('${r['name']}')), findsOneWidget);
    }
    expect(find.descendant(of: key('home-today'), matching: find.text('×2')), findsOneWidget);
    expect(find.descendant(of: key('home-today'), matching: find.text('${today['more']}')), findsOneWidget);
    await t.tap(key('home-today-total'));
    await t.tap(find.descendant(of: key('home-today'), matching: find.text('${today['title']}')));
    expect(opened, ['/shop', '/statistics']);
  });

  testWidgets('🔴 карточки: рекомендация — адрес с параметрами вечера, вызов дня — действие веба', (t) async {
    await mount(t);
    await scrollTo(t, 'home-reco');
    await t.tap(key('home-card-schulte_table'));
    expect(opened.single, contains('calm=1'));
    await scrollTo(t, 'home-practices');
    await t.tap(key('home-card-challenge'));
    await t.pump();
    expect(js.last, contains('["/"].challenge('), reason: 'вызов дня ставит отметку на вебе и уводит туда же');
    // 07.10.2026 (b271f702): практика дня ведёт в развилку «Релаксация», а не в одну «Паузу».
    await t.tap(key('home-card-relaxation'));
    expect(opened.last, '/games/relaxation-hub');
  });

  testWidgets('🔴 «Все развилки ›» внизу Главной — вкладка «Игры» с фильтром «только развилки»', (t) async {
    await mount(t);
    await scrollTo(t, 'home-all-forks');
    final b = (model['blocks'] as List).cast<Map>().firstWhere((b) => b['kind'] == 'allForks');
    expect(find.descendant(of: key('home-all-forks'), matching: find.text('${b['label']}')), findsOneWidget);
    await t.tap(key('home-all-forks'));
    expect(tabs, ['/games?filter=hubs']);
  });

  testWidgets('цель дня: свёрнутый вопрос раскрывается, пустое не сохраняется, текст уходит вебу', (t) async {
    await mount(t);
    await scrollTo(t, 'home-goal');
    expect(key('goal-input'), findsNothing);
    await t.tap(key('goal-expand'));
    await t.pump();
    await t.tap(key('goal-save'));
    expect(js.where((s) => s.contains('goalSave')), isEmpty, reason: 'пустое поле не сохраняется');
    await t.enterText(key('goal-input'), 'Сдать отчёт без спешки');
    await t.pump();
    await t.tap(key('goal-save'));
    expect(js.last, contains('goalSave("Сдать отчёт без спешки")'));
    await t.tap(key('goal-close'));
    expect(js.last, contains('goalDismiss('));
  });

  testWidgets('поиск уходит вебу (он знает адрес каталога с запросом)', (t) async {
    await mount(t);
    await t.enterText(key('home-search'), 'мосты');
    await t.testTextInput.receiveAction(TextInputAction.search);
    await t.pump();
    expect(js.last, contains('search("мосты")'));
  });

  testWidgets('любимые разделы: плитки каталога, «Все игры ›» и «ещё N» ведут во вкладку', (t) async {
    await mount(t);
    await scrollTo(t, 'home-favourites');
    expect(key('home-section-attention'), findsOneWidget);
    expect(find.descendant(of: key('home-favourites'), matching: find.byType(GridView)), findsNothing);
    await t.tap(key('home-all-games'));
    await scrollTo(t, 'home-more-attention');
    await t.tap(key('home-more-attention'));
    expect(tabs, ['/games', '/games']);
  });

  testWidgets('🔴 окно цели серии: открывается моделью поверх, выбор уходит вебу и закрывает окно', (t) async {
    await mount(t, sheet: true);
    await t.pump(const Duration(milliseconds: 400));
    expect(key('goal-sheet'), findsOneWidget);
    expect(key('goal-option-7'), findsOneWidget);
    await t.tap(key('goal-option-14'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    await t.pump();
    expect(js.last, contains('goalPick(14)'));
    expect(key('goal-sheet'), findsNothing);
  });

  testWidgets('модели ещё нет — значок загрузки, а не пустой экран', (t) async {
    await t.pumpWidget(MaterialApp(
      home: HomeScreen(state: state, origin: '', onOpen: opened.add, onTab: tabs.add, onSwitcher: () {}, kit: null, ownModel: false),
    ));
    expect(key('home-loading'), findsOneWidget);
  });
}
