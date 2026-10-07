import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/stats_screen.dart';

/// 🔴 «ПРОГРЕСС» НА FLUTTER РИСУЕТ МОДЕЛЬ ВЕБА, А НЕ СЧИТАЕТ САМ (задача 6ff4a966, правило 4e679f41).
///
/// Модель — образец, который выгружает веб-проба `stats-host-model.test.tsx` с НАСТОЯЩЕГО экрана
/// `app/statistics.tsx` (`test/fixtures/stats_model.json`): натив проверяется на той форме, что шлёт
/// страница.
///   · сводка: герой, баланс по областям, карточки игр — те же строки и числа, что в модели;
///   · столбики спарклайна — высоты и прозрачность из модели (`sparkBars` веба), не свой расчёт;
///   · вкладки «Сводка / История» — здесь; охват, «Обновить» и «Назад» — действиями веба;
///   · пустая история зовёт на Главную, спрятанная фильтром — включает «Все игры».
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Map<String, Object?> model;
  final js = <String>[];
  final tabs = <String>[];

  setUp(() {
    model = (jsonDecode(File('test/fixtures/stats_model.json').readAsStringSync()) as Map).cast<String, Object?>();
    ScreenUi.reset();
    js.clear();
    tabs.clear();
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, [Map<String, Object?>? m]) async {
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(StatsScreen.route).value = m ?? model;
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(body: StatsScreen(onTab: tabs.add)),
      ),
    );
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));
  List<Map<String, Object?>> list(Object? v) => [for (final x in v as List) (x as Map).cast<String, Object?>()];
  Map<String, Object?> map(Object? v) => (v as Map).cast<String, Object?>();

  testWidgets('без модели — ожидание, а не пустой экран', (t) async {
    ScreenUi.model(StatsScreen.route).value = null;
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(body: StatsScreen(onTab: tabs.add)),
      ),
    );
    expect(key('stats-loading'), findsOneWidget);
    expect(key('stats-screen'), findsNothing);
  });

  testWidgets('🔴 сводка: заголовок, охват, герой и баланс — строки модели как есть', (t) async {
    await mount(t);
    expect(find.text(model['title'] as String), findsOneWidget);
    final scope = map(model['scope']);
    expect(find.text(scope['profile'] as String), findsOneWidget);
    expect(find.text(scope['all'] as String), findsOneWidget);
    expect(find.text(model['totalPlayed'] as String), findsOneWidget);
    final hero = map(model['hero']);
    for (final k in ['level', 'levelTitle', 'games', 'time', 'tokensLabel', 'streakLabel']) {
      expect(find.text(hero[k] as String), findsOneWidget, reason: k);
    }
    final areas = map(model['areas']);
    expect(find.text(areas['title'] as String), findsOneWidget);
    final rows = list(areas['rows']);
    expect(rows, isNotEmpty);
    for (final r in rows) {
      expect(find.text(r['label'] as String), findsOneWidget);
      expect(find.bySemanticsLabel(r['a11y'] as String), findsOneWidget);
    }
    // Доля полосы — из модели: у двух областей поровну — по половине ширины.
    final bars = t.widgetList<FractionallySizedBox>(find.descendant(of: key('stats-areas'), matching: find.byType(FractionallySizedBox)));
    expect([for (final b in bars) b.widthFactor], [for (final r in rows) (r['pct'] as num) / 100]);
  });

  testWidgets('🔴 карточки игр: четыре числа и столбики — из модели, высоты не пересчитываются', (t) async {
    await mount(t);
    final games = list(model['games']);
    expect(games, isNotEmpty);
    for (final g in games) {
      final card = key('stats-game-${g['id']}');
      await t.scrollUntilVisible(
        card,
        200,
        scrollable: find.descendant(of: key('stats-summary'), matching: find.byType(Scrollable)).first,
      );
      expect(find.descendant(of: card, matching: find.text(g['name'] as String)), findsOneWidget);
      for (final s in list(g['stats'])) {
        expect(find.descendant(of: card, matching: find.text(s['label'] as String)), findsOneWidget);
        expect(find.descendant(of: card, matching: find.text(s['value'] as String)), findsWidgets);
      }
      final spark = map(g['spark']);
      final want = list(spark['bars']);
      final opac = t.widgetList<Opacity>(find.descendant(of: card, matching: find.byType(Opacity))).toList();
      expect(opac.length, want.length);
      for (var i = 0; i < want.length; i++) {
        expect(opac[i].opacity, closeTo((want[i]['op'] as num).toDouble(), 1e-9));
        final box = t.getSize(find.descendant(of: find.byWidget(opac[i]), matching: find.byType(Container)).first);
        expect(box.height, (want[i]['h'] as num).toDouble(), reason: 'столбик $i');
      }
      expect(find.descendant(of: card, matching: find.text(spark['caption'] as String)), findsOneWidget);
    }
  });

  testWidgets('вкладка «История»: дни и партии строками модели', (t) async {
    await mount(t);
    await t.tap(key('stats-tab-history'));
    await t.pump();
    expect(key('stats-history'), findsOneWidget);
    final day = list(map(model['history'])['days']).first;
    expect(find.text(day['label'] as String), findsOneWidget);
    for (final e in list(day['entries'])) {
      expect(find.bySemanticsLabel(e['label'] as String), findsOneWidget);
    }
    expect(js, isEmpty, reason: 'вкладки не ходят в веб — обе части уже в модели');
  });

  testWidgets('🔴 охват, «Обновить», «Назад» — действия веба, не свой расчёт', (t) async {
    await mount(t);
    await t.tap(key('stats-scope-all'));
    await t.tap(key('stats-refresh'));
    await t.tap(key('stats-back'));
    await t.tap(key('stats-scope-profile'));
    await t.pump();
    String call(String a) => "window.__psyScreenUi['/statistics'].$a".replaceAll("'", '"');
    expect(js.length, 4);
    expect(js[0], contains('${call('scope')}(true)'));
    expect(js[1], contains('${call('refresh')}()'));
    expect(js[2], contains('${call('back')}()'));
    expect(js[3], contains('${call('scope')}(false)'));
  });

  testWidgets('пустая история — на Главную; спрятанная фильтром — «Все игры»', (t) async {
    final empty = Map<String, Object?>.from(model)
      ..['history'] = {'kind': 'empty', 'icon': 'time-outline', 'title': 'T', 'hint': 'H', 'cta': 'Играть', 'action': 'home'};
    await mount(t, empty);
    await t.tap(key('stats-tab-history'));
    await t.pump();
    await t.tap(key('stats-history-cta'));
    expect(tabs, ['/']);
    expect(js, isEmpty);

    final scoped = Map<String, Object?>.from(model)
      ..['history'] = {'kind': 'scoped', 'icon': 'funnel-outline', 'title': 'T', 'hint': 'H', 'cta': 'Все', 'action': 'scopeAll'};
    ScreenUi.model(StatsScreen.route).value = scoped;
    await t.pump();
    await t.tap(key('stats-history-cta'));
    await t.pump();
    expect(js.single, contains('.scope(true)'));
  });

  testWidgets('модель обновилась — экран перерисован без перезапуска', (t) async {
    await mount(t);
    final next = Map<String, Object?>.from(model)..['totalPlayed'] = 'Всего сыграно: 99';
    ScreenUi.model(StatsScreen.route).value = next;
    await t.pump();
    expect(find.text('Всего сыграно: 99'), findsOneWidget);
  });
}
