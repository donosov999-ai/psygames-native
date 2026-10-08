import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_update.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/whats_new_screen.dart';

/// 🔴 «ЧТО НОВОГО» НА FLUTTER: СПИСОК ВЕРСИЙ — МОДЕЛЬ ВЕБА, ПРОВЕРКА ОБНОВЛЕНИЙ — ОБОЛОЧКА (задача 84df0687).
///
/// Образец выгружает веб-проба `whats-new-host-model.test.tsx` с настоящего экрана.
///   Список: каждая версия, дата и все пункты — строками модели.
///   «Проверить обновления»: запрос из Dart (`AppUpdate`, у сайта нет CORS для WebView), тем же путём,
///   что в Настройках (`update_check.dart`): новее — окно с переходом в магазин; не новее — «последняя»;
///   нет ответа — «не удалось». Пока идёт запрос, кнопка показывает «…» и второй раз не жмётся.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  Map<String, Object?> load(String f) => (jsonDecode(File('test/fixtures/$f').readAsStringSync()) as Map).cast<String, Object?>();
  const route = WhatsNewScreen.route;
  late Future<String?> Function() realFetch;

  setUpAll(() async {
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    realFetch = AppUpdate.fetchLatest;
  });

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
    WhatsNewScreen.appVersion = () async => '2.56.15';
  });
  tearDown(() => AppUpdate.fetchLatest = realFetch);

  Future<void> mount(WidgetTester t, Map<String, Object?>? m) async {
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(route).value = m;
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: WhatsNewScreen())));
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  testWidgets('без модели — ожидание', (t) async {
    await mount(t, null);
    expect(key('whats-new-screen-loading'), findsOneWidget);
  });

  testWidgets('🔴 каждая версия, дата и все пункты — строками модели; «назад» — действие веба', (t) async {
    final m = load('whats_new_model.json');
    await mount(t, m);
    final entries = [for (final e in m['entries']! as List) (e as Map).cast<String, Object?>()];
    expect(entries.length, greaterThan(10));
    // Все версии — в списке (кнопка проверки + карточка на каждую); строит их ListView по мере прокрутки.
    final list = t.widget<ListView>(key('whats-new-list'));
    expect((list.childrenDelegate as SliverChildListDelegate).children.length, entries.length + 1);
    Future<void> checkCard(Map<String, Object?> e) async {
      final card = key('whats-new-${e['version']}');
      await t.scrollUntilVisible(card, 600, maxScrolls: 500, scrollable: find.descendant(of: key('whats-new-list'), matching: find.byType(Scrollable)).first);
      expect(find.descendant(of: card, matching: find.text(e['date'] as String)), findsOneWidget, reason: '${e['version']}');
      for (final it in e['items']! as List) {
        expect(find.descendant(of: card, matching: find.text(it as String)), findsOneWidget, reason: '${e['version']}: $it');
      }
    }
    for (final e in entries.take(5)) {
      await checkCard(e);
    }
    await checkCard(entries.last);
    await t.scrollUntilVisible(key('whats-new-check'), -6000, maxScrolls: 100, scrollable: find.descendant(of: key('whats-new-list'), matching: find.byType(Scrollable)).first);
    expect(find.text(m['check'] as String), findsOneWidget);
    await t.tap(key('whats-new-back'));
    expect(js.single, contains('["/whats-new"].back()'));
  });

  testWidgets('🔴 «Проверить»: новее — окно с переходом в магазин; не новее — «последняя»; нет ответа — «не удалось»', (t) async {
    await mount(t, load('whats_new_model.json'));
    for (final (latest, expectText) in [
      ('2.57.0', '${L.t('updAvailable')} v2.57.0'),
      ('2.56.15', '✓ ${L.t('updLatest')}'),
      (null, L.t('updCheckFailed')),
    ]) {
      AppUpdate.fetchLatest = () async => latest;
      await t.tap(key('whats-new-check'));
      await t.pumpAndSettle();
      expect(find.text(expectText), findsOneWidget, reason: '$latest');
      if (latest == '2.57.0') expect(key('whats-new-download'), findsOneWidget);
      await t.tapAt(const Offset(5, 5));   // мимо окна — закрыть
      await t.pumpAndSettle();
    }
  });

  testWidgets('🔴 пока идёт запрос — «…» и второе нажатие не шлёт второй запрос', (t) async {
    final m = load('whats_new_model.json');
    await mount(t, m);
    var calls = 0;
    final gate = Completer<String?>();
    AppUpdate.fetchLatest = () {
      calls++;
      return gate.future;
    };
    await t.tap(key('whats-new-check'));
    await t.pump();
    expect(find.descendant(of: key('whats-new-check'), matching: find.text('…')), findsOneWidget);
    await t.tap(key('whats-new-check'));
    await t.pump();
    expect(calls, 1);
    gate.complete(null);
    await t.pumpAndSettle();
    expect(find.text(m['check'] as String), findsOneWidget, reason: 'ответ пришёл — подпись вернулась');
  });
}
