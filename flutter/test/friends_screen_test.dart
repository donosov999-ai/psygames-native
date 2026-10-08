import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/friends_screen.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';

/// 🔴 «ДРУЗЬЯ» НА FLUTTER РИСУЮТ МОДЕЛЬ ВЕБА (задача 7bb8035b).
///
/// Образец выгружает веб-проба `friends-host-model.test.tsx` с настоящего экрана.
///   Код группами и «Копировать» (буфер — оболочки, итог — действие `copied`).
///   Поле: каждый знак — `draft(текст, номер)`; нормализованный код веба встаёт в поле, только
///   когда модель ответила на последний номер — старый ответ набранное не затирает.
///   «Добавить» живо только по `ready` веба; исход — фразой модели.
///   Чипы — все игры модели, включённая в цвете профиля; таблица — строки модели, «я» подсвечен.
///   Крестик только открывает подтверждение (`ask`), рвёт — «Разорвать» (`drop`).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  Map<String, Object?> load(String f) => (jsonDecode(File('test/fixtures/$f').readAsStringSync()) as Map).cast<String, Object?>();
  const route = FriendsScreen.route;

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, Map<String, Object?>? m) async {
    t.view.physicalSize = const Size(780, 5000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(route).value = m;
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: FriendsScreen())));
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));
  Map<String, Object?> withPart(Map<String, Object?> m, String part, Map<String, Object?> patch) => {
    ...m,
    part: {...(m[part]! as Map).cast<String, Object?>(), ...patch},
  };
  Color boxColor(WidgetTester t, String k) =>
      (t.widget<Container>(find.descendant(of: key(k), matching: find.byType(Container)).first).decoration! as BoxDecoration).color!;

  testWidgets('без модели — ожидание', (t) async {
    await mount(t, null);
    expect(key('friends-screen-loading'), findsOneWidget);
  });

  testWidgets('🔴 код группами; чипы — все игры модели, включённая в цвете профиля; строки таблицы и круг', (t) async {
    final m = load('friends_model.json');
    await mount(t, m);
    final my = m['my']! as Map;
    expect(find.text(my['shown'] as String), findsOneWidget);
    expect(find.text(my['label'] as String), findsOneWidget);
    final table = m['table']! as Map;
    final chips = (table['chips'] as List).cast<Map>();
    expect(chips.length, 9);
    for (final c in chips) {
      expect(find.text(c['label'] as String), findsOneWidget);
      expect(boxColor(t, 'friends-chip-${c['id']}') == cssColor(m['primary']), c['on'] == true, reason: '${c['id']}');
    }
    final rows = (table['rows'] as List).cast<Map>();
    expect(rows, isNotEmpty);
    for (final r in rows) {
      expect(find.descendant(of: key('friends-row-${r['id']}'), matching: find.text(r['score'] as String)), findsOneWidget);
      final bg = (t.widget<Container>(key('friends-row-${r['id']}')).decoration! as BoxDecoration).color;
      expect(bg, r['me'] == true ? cssColor(m['meBg']) : null, reason: '${r['id']}');
    }
    for (final f in ((m['circle']! as Map)['rows'] as List).cast<Map>()) {
      expect(key('friends-friend-${f['id']}'), findsOneWidget);
    }
    expect(find.text(m['scoresOnly'] as String), findsOneWidget);
  });

  testWidgets('🔴 набор: каждый знак — draft с номером; старый ответ веба поле не затирает', (t) async {
    final m = load('friends_model.json');
    await mount(t, m);
    await t.enterText(key('friends-field'), 'k');
    await t.enterText(key('friends-field'), 'k7');
    expect(js, [contains('["/friends"].draft("k",1)'), contains('["/friends"].draft("k7",2)')]);
    // Ответ на первый знак пришёл позже второго знака — поле остаётся «k7».
    ScreenUi.model(route).value = withPart(m, 'add', {'draft': 'K', 'seq': 1});
    await t.pump();
    expect(t.widget<TextField>(key('friends-field')).controller!.text, 'k7');
    // Ответ на последний — нормализованный код встаёт в поле, курсор в конце.
    ScreenUi.model(route).value = withPart(m, 'add', {'draft': 'K7', 'seq': 2});
    await t.pump();
    final c = t.widget<TextField>(key('friends-field')).controller!;
    expect(c.text, 'K7');
    expect(c.selection, const TextSelection.collapsed(offset: 2));
  });

  testWidgets('🔴 «Добавить» живо только по ready веба; занят — значок; исход — фраза модели', (t) async {
    final m = load('friends_model.json');
    await mount(t, m);
    await t.tap(key('friends-add-btn'));
    expect(js, isEmpty);
    ScreenUi.model(route).value = withPart(m, 'add', {'ready': true});
    await t.pump();
    await t.tap(key('friends-add-btn'));
    expect(js.single, contains('["/friends"].add()'));
    ScreenUi.model(route).value = withPart(m, 'add', {'sending': true});
    await t.pump();
    expect(find.descendant(of: key('friends-add-btn'), matching: find.byType(CircularProgressIndicator)), findsOneWidget);
    ScreenUi.model(route).value = withPart(m, 'add', {
      'note': {'ok': false, 'text': 'Такого кода нет'},
    });
    await t.pump();
    expect(t.widget<Text>(find.text('Такого кода нет')).style!.color, cssColor(m['error']));
  });

  testWidgets('🔴 чип — game(id); крестик только открывает подтверждение; рвёт «Разорвать»', (t) async {
    final m = load('friends_model.json');
    await mount(t, m);
    final chips = ((m['table']! as Map)['chips'] as List).cast<Map>();
    // Последний чип за краем ряда — до него докручивают, как пальцем.
    await t.ensureVisible(key('friends-chip-${chips.last['id']}'));
    await t.pumpAndSettle();
    await t.tap(key('friends-chip-${chips.last['id']}'));
    expect(js.single, contains('["/friends"].game("${chips.last['id']}")'));
    js.clear();
    final circle = (m['circle']! as Map).cast<String, Object?>();
    final friend = (circle['rows']! as List).cast<Map>().last;
    final id = friend['id'];
    await t.tap(key('friends-drop-$id'));
    expect(js.single, contains('["/friends"].ask("$id")'));
    expect(js.single, isNot(contains('drop')));
    js.clear();
    final rows = [
      for (final r in (circle['rows']! as List).cast<Map>()) {...r.cast<String, Object?>(), 'pending': r['id'] == id},
    ];
    ScreenUi.model(route).value = {
      ...m,
      'circle': {...circle, 'rows': rows},
    };
    await t.pump();
    expect(find.text(friend['warn'] as String), findsOneWidget);
    await t.tap(key('friends-cancel-$id'));
    await t.tap(key('friends-confirm-$id'));
    expect(js, [contains('["/friends"].cancel()'), contains('["/friends"].drop("$id")')]);
  });

  testWidgets('🔴 «Копировать»: код — в буфер оболочки, итог — вебу действием copied', (t) async {
    final m = load('friends_model.json');
    final copies = <Object?>[];
    t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copies.add((call.arguments as Map)['text']);
      return null;
    });
    addTearDown(() => t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await mount(t, m);
    await t.tap(key('friends-copy'));
    await t.pump();
    expect(copies, [(m['my']! as Map)['code']]);
    expect(js.single, contains('["/friends"].copied(true)'));
  });

  testWidgets('пустота таблицы — фраза модели вместо строк; нет связи — фраза вместо кода', (t) async {
    final m = load('friends_model.json');
    await mount(t, {
      ...withPart(m, 'table', {'kind': 'offline', 'empty': 'Нет связи с сервером', 'rows': <Object?>[]}),
      'my': {...(m['my']! as Map).cast<String, Object?>(), 'state': 'offline', 'code': null, 'shown': null},
    });
    expect(find.text('Нет связи с сервером'), findsOneWidget);
    expect(find.byKey(const ValueKey('friends-code')), findsNothing);
    expect(key('friends-copy'), findsNothing);
    expect(find.text((m['my']! as Map)['offline'] as String), findsOneWidget);
  });
}
