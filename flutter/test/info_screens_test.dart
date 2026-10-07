import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/info_screens.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';

/// 🔴 «ИСТОЧНИКИ», «КОЛЛЕКЦИЯ», «ДОСТИЖЕНИЯ», «ЛИГИ» НА FLUTTER РИСУЮТ МОДЕЛЬ ВЕБА
/// (задачи 78165c68, 8111eea4, 56660caa, ac902ebf).
///
/// Образцы выгружает веб-проба `info-pages-host-model.test.tsx` с настоящих экранов.
///   Источники: каждая карточка и каждый чтец — строками модели; ссылка и «назад» — действия веба.
///   Коллекция: фигурки по модели (собранные — в рамке цвета профиля); тап — действие `tap(i)`.
///   Достижения: каждая карточка; открытые — с датой.
///   Лиги: очки, ровно одна текущая лига в рамке цвета профиля.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  Map<String, Object?> load(String f) => (jsonDecode(File('test/fixtures/$f').readAsStringSync()) as Map).cast<String, Object?>();

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, String route, Map<String, Object?>? m, Widget w) async {
    t.view.physicalSize = const Size(780, 6000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(route).value = m;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: w)));
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  testWidgets('без модели — ожидание на каждом из четырёх', (t) async {
    for (final (route, w, k) in [
      (SourcesScreen.route, const SourcesScreen(), 'sources-screen'),
      (CollectionScreen.route, const CollectionScreen(), 'collection-screen'),
      (AchievementsScreen.route, const AchievementsScreen(), 'achievements-screen'),
      (LeaguesScreen.route, const LeaguesScreen(), 'leagues-screen'),
    ]) {
      await mount(t, route, null, w);
      expect(key('$k-loading'), findsOneWidget, reason: route);
    }
  });

  testWidgets('🔴 источники: карточки и чтецы строками модели; ссылка и «назад» — действия веба', (t) async {
    final m = load('sources_model.json');
    await mount(t, SourcesScreen.route, m, const SourcesScreen());
    final cards = (m['cards'] as List).cast<Map>();
    for (final c in cards) {
      expect(find.text(c['name'] as String), findsOneWidget);
      expect(find.text(c['url'] as String), findsOneWidget);
    }
    final voices = ((m['voices'] as Map)['rows'] as List).cast<Map>();
    expect(find.text(voices.first['author'] as String), findsWidgets);
    await t.tap(key('sources-link-${cards.first['name']}'));
    await t.tap(key('sources-back'));
    expect(js[0], contains('["/sources"].open(${jsonEncode(cards.first['url'])})'));
    expect(js[1], contains('["/sources"].back()'));
  });

  testWidgets('🔴 коллекция: фигурки по модели; тап — tap(i) веба; подсказка — из модели', (t) async {
    final m = load('collection_model.json');
    await mount(t, CollectionScreen.route, m, const CollectionScreen());
    final figs = (m['figures'] as List).cast<Map>();
    for (final (i, f) in figs.indexed) {
      expect(find.bySemanticsLabel(f['a11y'] as String), findsOneWidget, reason: '$i');
    }
    await t.tap(key('collection-figure-${figs.length - 1}'));
    expect(js.single, contains('["/collection"].tap(${figs.length - 1})'));
    ScreenUi.model(CollectionScreen.route).value = {...m, 'hint': 'Компас откроется через ⭐100'};
    await t.pump();
    expect(find.text('Компас откроется через ⭐100'), findsOneWidget);
  });

  testWidgets('🔴 достижения: каждая карточка, открытые — с датой', (t) async {
    final m = load('achievements_model.json');
    await mount(t, AchievementsScreen.route, m, const AchievementsScreen());
    expect(find.text(m['title'] as String), findsOneWidget);
    final cards = [for (final s in (m['sections'] as List).cast<Map>()) ...(s['cards'] as List).cast<Map>()];
    for (final c in cards) {
      expect(key('achievement-${c['id']}'), findsOneWidget);
    }
    for (final c in cards.where((c) => c['date'] != null)) {
      expect(find.descendant(of: key('achievement-${c['id']}'), matching: find.text(c['date'] as String)), findsOneWidget);
    }
    await t.tap(key('achievements-back'));
    expect(js.single, contains('["/achievements"].back()'));
  });

  testWidgets('🔴 лиги: очки и одна текущая лига в рамке цвета профиля', (t) async {
    final m = load('leagues_model.json');
    await mount(t, LeaguesScreen.route, m, const LeaguesScreen());
    expect(find.text((m['card'] as Map)['pts'] as String), findsOneWidget);
    final leagues = (m['leagues'] as List).cast<Map>();
    final here = leagues.where((l) => l['here'] == true).single;
    final box = t.widget<Container>(find.descendant(of: key('league-${here['id']}'), matching: find.byType(Container)).first);
    expect(((box.decoration! as BoxDecoration).border! as Border).top.width, 2);
    expect(((box.decoration! as BoxDecoration).border! as Border).top.color, cssColor(m['primary']));
  });
}
