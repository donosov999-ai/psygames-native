import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/catalog.dart';
import 'package:psygames_flutter/shell/catalog_screen.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КАТАЛОГ «ИГРЫ»: ПОИСК И ФИЛЬТР ШИРЕ РАЗВИЛОК (задачи f5025027, 9bd1b15d).
///
/// Приёмка карточки: на 390×844 и 360×640, en-US и ru; поиск находит игру по английскому и
/// русскому названию; фильтр даёт плоский список; проба экрана + мутация. Решение Дениса:
/// поиск и фильтр — по ВСЕМ играм, без отсева по профилю; разделы без поиска — список профиля.
/// Данные — настоящие ассеты (`catalog.json`, `hubs.json`, словари), не выдуманные.
Map<String, dynamic> _asset(String p) => jsonDecode(File(p).readAsStringSync()) as Map<String, dynamic>;
Map<String, String> _dict(String lang) => _asset('assets/l10n/$lang.json').cast<String, String>();

Catalog _catalog() {
  final names = <String, List<String>>{};
  final base = Catalog.fromJson(_asset('assets/catalog.json'), _asset('assets/hubs.json'));
  for (final lang in ['en', 'ru']) {
    final d = _dict(lang);
    for (final e in base.entries) {
      final v = d[e.nameKey];
      if (v != null) (names[e.nameKey] ??= []).add(v);
    }
  }
  return Catalog(categories: base.categories, games: base.games, entries: base.entries, names: names);
}

Future<void> _open(WidgetTester t, Widget screen, {Size size = const Size(390, 844)}) async {
  t.view.physicalSize = size * 2;
  t.view.devicePixelRatio = 2;
  addTearDown(t.view.reset);
  await t.runAsync(() async {
    await t.pumpWidget(MaterialApp(
      home: Navigator(onGenerateRoute: (_) => MaterialPageRoute(builder: (_) => screen)),
    ));
    for (var i = 0; i < 60; i++) {
      await t.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(ListTile).evaluate().isNotEmpty) break;
    }
  });
  await t.pump();
}

Future<void> _type(WidgetTester t, Key field, String text) async {
  await t.enterText(find.byKey(field), text);
  await t.pump();
}

void main() {
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    L.useForTest('en', _dict('en'));
  });

  group('модель', () {
    test('shell passes the home search query to the native catalog', () {
      GamePreset.set({'search': 'Мосты'});
      addTearDown(GamePreset.clear);
      final screen = HybridApp.shell['/games']!(state) as CatalogScreen;
      expect(screen.initialQuery, 'Мосты');
    });
    testWidgets('home query opens catalog already filtered and can be cleared', (t) async {
      await _open(t, CatalogScreen(state: state, catalog: _catalog(), initialQuery: '  Bridges  '));
      expect(find.byKey(const ValueKey('catalog-flat')), findsOneWidget);
      final field = t.widget<TextField>(find.byKey(const ValueKey('catalog-search')));
      expect(field.controller!.text, 'Bridges');
      expect(find.byType(ListTile), findsWidgets);
      await t.tap(find.byKey(const ValueKey('catalog-search-clear')));
      await t.pump();
      expect(find.byKey(const ValueKey('catalog-sections')), findsOneWidget);
      expect(t.takeException(), isNull);
    });
    test('🔴 поиск видит ВСЕ игры: записи GAMES и каждую карточку за развилками', () {
      final c = _catalog();
      final hubs = _asset('assets/hubs.json')['hubs'] as Map<String, dynamic>;
      final routes = {
        for (final g in c.games) g.route,
        for (final l in hubs.values) for (final x in l as List) (x as Map)['route'] as String,
      };
      expect(c.entries.map((e) => e.route).toSet(), containsAll(routes));
      expect(c.entries.length, greaterThanOrEqualTo(routes.length));
      expect(routes.length, greaterThan(c.games.length), reason: 'за развилками есть игры, которых нет в GAMES');
    });

    test('🔴 карточка без своей записи берёт раздел и навык у развилки', () {
      final c = _catalog();
      final bridges = c.entries.firstWhere((e) => e.route == '/games/puzzles?mode=Bridges');
      final hub = c.games.firstWhere((g) => g.route == '/games/puzzles-hub');
      expect([bridges.category, bridges.skillKey], [hub.category, hub.skillKey]);
      final stroop = c.entries.where((e) => e.route == '/games/stroop').toList();
      expect(stroop, hasLength(1), reason: 'повторов нет: игра GAMES и карточка развилки — одна строка');
      expect(stroop.single.id, 'stroop', reason: 'своя запись главнее: у неё свой навык');
    });

    test('🔴 английский экран находит игру и по-английски, и по-русски, и по адресу', () {
      final c = _catalog();
      for (final q in ['bridges', 'Мосты', 'мост', 'mode=bridges']) {
        expect(c.find(q, null).map((e) => e.route), contains('/games/puzzles?mode=Bridges'), reason: '«$q»');
      }
      expect(c.find('zzzqqq', null), isEmpty);
    });

    test('🔴 фильтр шире развилок: разделы + навыки больше 13', () {
      final c = _catalog();
      expect(c.categories.length + c.skills.length, greaterThan(13));
      final logic = c.find('', const CatalogFilter.section('logic'));
      expect(logic.every((e) => e.category == 'logic'), isTrue);
      expect(logic.map((e) => e.route), contains('/games/puzzles?mode=Bridges'), reason: 'фильтр тоже по ВСЕМ играм');
      final insp = c.find('', const CatalogFilter.skill('skillInhibition'));
      expect(insp.map((e) => e.route), contains('/games/stroop'));
      expect(insp.every((e) => e.skillKey == 'skillInhibition'), isTrue);
    });

    test('🔴 подпись навыка — целиком, как на карточке: есть на всех двенадцати языках', () {
      final c = _catalog();
      for (final lang in ['en', 'ru', 'de', 'es', 'fr', 'it', 'pt', 'ar', 'hi', 'zh', 'ja', 'ko']) {
        L.useForTest(lang, _dict(lang));
        for (final k in c.skills) {
          expect(skillTitle(k), isNot(k), reason: '$lang: нет строки навыка $k');
          expect(skillTitle(k), L.t(k), reason: '$lang/$k: срезанная подпись в ru стоит в винительном падеже');
        }
      }
      L.useForTest('ru', _dict('ru'));
      expect(skillTitle('skillInhibition'), startsWith('Тренируем'));
    });
  });

  group('экран «Игры»', () {
    for (final size in const [Size(390, 844), Size(360, 640)]) {
      testWidgets('🔴 ${size.width.toInt()}×${size.height.toInt()}: разделы → поиск → плоский список → нажатие отдаёт маршрут',
          (t) async {
        await _open(t, CatalogScreen(state: state), size: size);
        expect(find.byKey(const ValueKey('catalog-sections')), findsOneWidget);
        expect(find.byKey(const ValueKey('catalog-section-memory')), findsOneWidget);

        await _type(t, const ValueKey('catalog-search'), 'Мосты');
        expect(find.byKey(const ValueKey('catalog-flat')), findsOneWidget);
        expect(find.byKey(const ValueKey('catalog-row-/games/puzzles?mode=Bridges')), findsOneWidget);

        await _type(t, const ValueKey('catalog-search'), 'zzzqqq');
        expect(find.byKey(const ValueKey('catalog-nothing')), findsOneWidget);
        expect(find.text('No games match your search'), findsOneWidget);
        expect(t.takeException(), isNull, reason: 'нет переполнений');
      });
    }

    testWidgets('🔴 фильтр по навыку из выпадающего списка — плоский список этого навыка', (t) async {
      await _open(t, CatalogScreen(state: state));
      await t.tap(find.byKey(const ValueKey('catalog-filter')));
      await t.pumpAndSettle();
      expect(find.text('SKILLS'), findsWidgets, reason: 'группа навыков в списке');
      final label = skillTitle('skillInhibition');
      // Список фильтра длинный (6 разделов + 29 навыков) и строит только видимые строки.
      await t.scrollUntilVisible(find.text(label), 200, scrollable: find.byType(Scrollable).last);
      await t.tap(find.text(label).last);
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('catalog-flat')), findsOneWidget);
      final flat = find.descendant(of: find.byKey(const ValueKey('catalog-flat')), matching: find.byType(Scrollable));
      await t.scrollUntilVisible(find.byKey(const ValueKey('catalog-row-/games/stroop')), 300, scrollable: flat);
      expect(find.byKey(const ValueKey('catalog-row-/games/stroop')), findsOneWidget);
      // Шульте — навык «внимание»: в списке «торможения» её нет нигде, даже ниже.
      await t.scrollUntilVisible(find.byKey(const ValueKey('catalog-row-/games/stroop')), -300, scrollable: flat);
      expect(find.byKey(const ValueKey('catalog-row-/games/schulte')), findsNothing);
    });

    testWidgets('🔴 нажатие на строку возвращает маршрут оболочке', (t) async {
      Object? got;
      t.view.physicalSize = const Size(780, 1688);
      t.view.devicePixelRatio = 2;
      addTearDown(t.view.reset);
      await t.runAsync(() async {
        await t.pumpWidget(MaterialApp(
          home: Builder(
            builder: (ctx) => TextButton(
              onPressed: () async => got = await Navigator.of(ctx)
                  .push<Object?>(MaterialPageRoute<Object?>(builder: (_) => CatalogScreen(state: state))),
              child: const Text('go'),
            ),
          ),
        ));
      });
      await t.tap(find.text('go'));
      await t.runAsync(() async {
        for (var i = 0; i < 60; i++) {
          await t.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 50));
          if (find.byType(ListTile).evaluate().isNotEmpty) break;
        }
      });
      await _type(t, const ValueKey('catalog-search'), 'bridges');
      await t.tap(find.byKey(const ValueKey('catalog-row-/games/puzzles?mode=Bridges')));
      await t.pumpAndSettle();
      expect(got, isA<HubCardTap>());
      expect((got! as HubCardTap).route, '/games/puzzles?mode=Bridges');
    });

    testWidgets('🔴 разделы — список ПРОФИЛЯ от веба; поиск — по всем играм', (t) async {
      await state.set(HubScreen.visibleKey,
          jsonEncode({'profile': state.activeProfile, 'hubs': {}, 'catalog': ['schulte_table', 'puzzles_hub']}));
      await _open(t, CatalogScreen(state: state));
      expect(find.byKey(const ValueKey('catalog-row-/games/schulte')), findsOneWidget);
      expect(find.byKey(const ValueKey('catalog-row-/games/stroop')), findsNothing, reason: 'профиль её не открывает');
      await _type(t, const ValueKey('catalog-search'), 'stroop');
      expect(find.byKey(const ValueKey('catalog-row-/games/stroop')), findsOneWidget,
          reason: 'решение Дениса: поиск не режется профилем');
    });

    testWidgets('список посчитан для ДРУГОГО профиля — не применяется', (t) async {
      await state.set(HubScreen.visibleKey, jsonEncode({'profile': 'kids', 'hubs': {}, 'catalog': ['schulte_table']}));
      await _open(t, CatalogScreen(state: state));
      // Первая строка раздела «Память» — развилка «Объём памяти»: чужой список её бы спрятал.
      expect(find.byKey(const ValueKey('catalog-row-/games/span')), findsOneWidget);
    });

    testWidgets('русский экран: подписи по-русски, поиск по английскому имени работает', (t) async {
      L.useForTest('ru', _dict('ru'));
      await _open(t, CatalogScreen(state: state));
      expect(find.text('Найти игру'), findsOneWidget);
      await _type(t, const ValueKey('catalog-search'), 'Bridges');
      expect(find.text('Мосты'), findsOneWidget);
    });
  });

  group('развилка', () {
    testWidgets('🔴 «Головоломки»: поиск по-русски сужает развилку; фильтра нет — навык у всех один', (t) async {
      await _open(
          t,
          HubScreen(
              state: state, hubRoute: '/games/puzzles-hub', icon: Icons.extension, gradient: const [Colors.blue, Colors.indigo]));
      final before = find.byType(ListTile).evaluate().length;
      expect(before, greaterThan(1));
      expect(find.byKey(const ValueKey('hub-search')), findsNothing, reason: 'поле не занимает места, пока не открыто');
      expect(find.byKey(const ValueKey('hub-filter')), findsNothing);
      await t.tap(find.byKey(const ValueKey('hub-search-toggle')));
      await t.pump();
      // Состав развилки зависит от раскладки профиля (режимы Тэтхэма разнесены по тематическим):
      // у профиля по умолчанию здесь «Чёрный ящик», и в адресе у него пробел (`Black%20Box`).
      await _type(t, const ValueKey('hub-search'), 'чёрный');
      expect(find.byKey(const ValueKey('hub-card-/games/puzzles?mode=Black%20Box')), findsOneWidget);
      expect(find.byType(ListTile), findsOneWidget);
      await _type(t, const ValueKey('hub-search'), 'zzzqqq');
      expect(find.byKey(const ValueKey('hub-nothing')), findsOneWidget);
    });

    testWidgets('🔴 «Конфликт внимания»: навыков несколько — фильтр есть и отбирает', (t) async {
      await _open(
          t,
          HubScreen(
              state: state,
              hubRoute: '/games/attention-conflict',
              icon: Icons.bolt,
              gradient: const [Colors.red, Colors.orange]));
      expect(find.byKey(const ValueKey('hub-filter')), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('hub-filter')));
      await t.pumpAndSettle();
      await t.tap(find.text(skillTitle('skillInhibition')).last);
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('hub-card-/games/stroop')), findsOneWidget);
      final shown = find.byType(ListTile).evaluate().length;
      expect(shown, lessThan(9), reason: 'фильтр отбирает, а не показывает все 9');
    });
  });
}
