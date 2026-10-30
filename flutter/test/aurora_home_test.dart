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
  final tabs = <String>[];
  var switcher = 0;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    model = (jsonDecode(File('test/fixtures/home_model_ru.json').readAsStringSync()) as Map).cast<String, Object?>();
    ScreenUi.reset();
    ScreenUi.run = (s) async {};
    opened.clear();
    tabs.clear();
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
          onTab: tabs.add,
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

  testWidgets('«Аврора»: «Любимые разделы» — плитки разделов, нажатие → «Игры» с этим разделом (Q1 Дениса 29.10)', (t) async {
    await mount(t, template: UiTemplate.aurora);
    final fav = (model['blocks'] as List).cast<Map>().firstWhere((b) => b['kind'] == 'favourites');
    final first = ((fav['sections'] as List).first as Map)['category'] as String;
    final list = find.descendant(of: key('home-list'), matching: find.byType(Scrollable)).first;
    await t.scrollUntilVisible(key('home-section-tile-$first'), 200, scrollable: list);
    expect(find.descendant(of: key('home-favourites'), matching: find.byType(GridView)), findsNothing);
    expect(key('home-section-$first'), findsNothing, reason: 'ряда игр раздела под «Авророй» нет');
    await t.ensureVisible(key('home-section-tile-$first'));
    await t.pump();
    await t.tap(key('home-section-tile-$first'));
    expect(tabs, ['/games?filter=section:$first']);
  });

  testWidgets('«Аврора»: компактная главная (реф 30.10) — порядок блоков и маленькие плитки с прежними переходами', (t) async {
    // Высокий экран — ленивый список строит все блоки сразу, порядок меряется без прокрутки.
    await mount(t, template: UiTemplate.aurora, size: const Size(780, 6000));
    // Порядок как на рефе: «Продолжить» → счётчики → «Зачем сегодня» → «Сегодня» → «Рекомендуем» → «Практики».
    double y(String k) => t.getTopLeft(key(k)).dy;
    final kinds = [for (final b in (model['blocks'] as List).cast<Map>()) b['kind'] as String];
    final shown = [for (final k in ['resume', 'goal', 'today', 'reco', 'practices']) if (kinds.contains(k)) k];
    expect(shown, ['resume', 'goal', 'today', 'reco', 'practices'], reason: 'проба модели должна содержать все пять блоков');
    expect(y('home-resume') < y('aurora-home-stats') && y('aurora-home-stats') < y('home-goal'), isTrue,
        reason: 'счётчики — между «Продолжить» и «Зачем сегодня»');
    for (var i = 1; i < shown.length; i++) {
      expect(y('home-${shown[i - 1]}') < y('home-${shown[i]}'), isTrue, reason: '${shown[i - 1]} выше ${shown[i]}');
    }
    // «Сегодня» компактно: игры одной строкой, нажатие — статистика, «+N ⭐» — магазин, как раньше.
    expect(key('home-today-line'), findsOneWidget);
    await t.tap(key('home-today'));
    expect(opened.removeLast(), '/statistics');
    // Плитки: до 4 в ряд, низкие — не прежние большие карточки.
    final reco = t.getSize(key('home-card-schulte_table'));
    expect(reco.width, lessThan(120));
    expect(reco.height, lessThan(150));
    // Причина рекомендации видна под названием, не только чтецу экрана.
    expect(find.descendant(of: key('home-card-hanoi'), matching: find.text('Сегодня сыграно')), findsOneWidget);
    // ▶ — только у прямого запуска, у зарядки и релаксации › к выбору.
    expect(find.descendant(of: key('home-card-schulte_table'), matching: find.byIcon(Icons.play_arrow_rounded)), findsOneWidget);
    expect(find.descendant(of: key('home-card-warmup'), matching: find.byIcon(Icons.chevron_right)), findsOneWidget);
    expect(find.descendant(of: key('home-card-warmup'), matching: find.byIcon(Icons.play_arrow_rounded)), findsNothing);
    expect(find.descendant(of: key('home-card-relaxation'), matching: find.byIcon(Icons.play_arrow_rounded)), findsNothing);
    for (final id in ['schulte_table', 'warmup', 'relaxation']) {
      await t.tap(key('home-card-$id'));
    }
    expect(opened, ['/games/schulte?calm=1', '/warmup-picker', '/games/relaxation-hub']);
  });

  testWidgets('«Аврора»: цель «Как прошло?» — два ответа в одну строку, нажатие уходит в модель', (t) async {
    final js = <String>[];
    final blocks = [for (final b in (model['blocks'] as List).cast<Map>()) b['kind'] == 'goal' ? ({...b, 'state': 'review'}) : b];
    model = {...model, 'blocks': blocks};
    await mount(t, template: UiTemplate.aurora, size: const Size(780, 6000));
    ScreenUi.run = (s) async => js.add(s);
    expect(t.getTopLeft(key('goal-yes')).dy, t.getTopLeft(key('goal-no')).dy, reason: '«Да» и «Не сегодня» — в одной строке');
    await t.tap(key('goal-yes'));
    await t.pump();
    expect(js.join(), contains('goalOutcome'));
  });

  testWidgets('«Аврора»: планшет 768 pt — плитки остаются маленькими (колонок больше, а не шире)', (t) async {
    await mount(t, template: UiTemplate.aurora, size: const Size(1536, 6000));
    expect(t.getSize(key('home-card-schulte_table')).width, lessThan(130));
    expect(t.takeException(), isNull);
  });

  testWidgets('«Аврора»: плитки нажимаются и из чтеца экрана (действие нажатия в подписи)', (t) async {
    final handle = t.ensureSemantics();
    await mount(t, template: UiTemplate.aurora, size: const Size(780, 6000));
    for (final id in ['schulte_table', 'warmup', 'relaxation', 'challenge']) {
      expect(t.getSemantics(key('home-card-$id')), isSemantics(isButton: true, hasTapAction: true), reason: id);
    }
    final fav = (model['blocks'] as List).cast<Map>().firstWhere((b) => b['kind'] == 'favourites');
    final first = ((fav['sections'] as List).first as Map)['category'] as String;
    expect(t.getSemantics(key('home-section-tile-$first')), isSemantics(isButton: true, hasTapAction: true));
    handle.dispose();
  });

  testWidgets('Classic: новой шапки нет, классическая на месте', (t) async {
    await mount(t, template: UiTemplate.classic);
    expect(key('aurora-home-top'), findsNothing);
    expect(key('aurora-home-stats'), findsNothing);
    expect(key('home-header'), findsOneWidget);
    final fav = (model['blocks'] as List).cast<Map>().firstWhere((b) => b['kind'] == 'favourites');
    final first = ((fav['sections'] as List).first as Map)['category'] as String;
    await t.scrollUntilVisible(key('home-section-$first'), 200,
        scrollable: find.descendant(of: key('home-list'), matching: find.byType(Scrollable)).first);
    expect(key('home-section-tile-$first'), findsNothing, reason: 'Classic — прежний раздел с рядом игр');
  });

  testWidgets('«Аврора»: 320 pt и шрифт ×2 — ничего не вылезает за края', (t) async {
    await mount(t, template: UiTemplate.aurora, size: const Size(640, 1400), textScale: 2);
    expect(t.takeException(), isNull);
    final list = find.descendant(of: key('home-list'), matching: find.byType(Scrollable)).first;
    await t.scrollUntilVisible(key('aurora-home-stats'), 200, scrollable: list);
    // Компактные плитки при шрифте ×2: колонок меньше, подписи не вылезают.
    await t.scrollUntilVisible(key('home-practices'), 200, scrollable: list);
    await t.pump();
    expect(t.takeException(), isNull);
  });
}
