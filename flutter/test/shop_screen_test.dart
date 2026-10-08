import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shop_screen.dart';

/// 🔴 «МАГАЗИН» НА FLUTTER РИСУЕТ МОДЕЛЬ ВЕБА (задача 9424da3a).
///
/// Образец выгружает веб-проба `shop-host-model.test.tsx` с настоящего экрана.
///   Баланс, вкладки разделов (включённая — цветом профиля), способности с двумя кнопками, ставка,
///   разделы косметики — строками модели; доступность кнопок — из модели (`abilityButtons`,
///   `cosmeticRow` веба), а не своя.
///   Нажатия — действия веба: вкладка, купить/применить, ставка, купить/надеть, «назад».
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  Map<String, Object?> load(String f) => (jsonDecode(File('test/fixtures/$f').readAsStringSync()) as Map).cast<String, Object?>();
  const route = ShopScreen.route;

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, Map<String, Object?>? m) async {
    t.view.physicalSize = const Size(780, 60000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(route).value = m;
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ShopScreen(origin: 'http://127.0.0.1:1'))));
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));
  List<Map<String, Object?>> list(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, Object?>()];

  testWidgets('без модели — ожидание', (t) async {
    await mount(t, null);
    expect(key('shop-screen-loading'), findsOneWidget);
  });

  testWidgets('🔴 баланс, вкладки, способности, ставка и все товары разделов — строками модели', (t) async {
    final m = load('shop_model.json');
    await mount(t, m);
    expect(find.descendant(of: key('shop-balance'), matching: find.text(m['balance'] as String)), findsOneWidget);
    final cats = list(m['cats']);
    expect(cats.length, 12);
    for (final c in cats) {
      final box = t.widget<Container>(find.descendant(of: key('shop-cat-${c['id'] ?? 'all'}'), matching: find.byType(Container)).first);
      expect((box.decoration! as BoxDecoration).color == cssColor(m['primary']), c['on'] == true, reason: '${c['id']}');
    }
    final ab = (m['abilities']! as Map).cast<String, Object?>();
    for (final a in list(ab['rows'])) {
      expect(key('shop-ability-${a['id']}'), findsOneWidget);
      expect(find.descendant(of: key('shop-ability-${a['id']}'), matching: find.text(a['price'] as String)), findsOneWidget);
    }
    expect(key('shop-wager'), findsOneWidget);
    var items = 0;
    for (final sec in list(m['sections'])) {
      expect(find.text(sec['title'] as String), findsOneWidget);
      for (final it in list(sec['items'])) {
        items++;
        expect(key('shop-item-${it['id']}'), findsOneWidget, reason: '${it['id']}');
      }
    }
    expect(items, greaterThan(20));
    expect(find.text(m['earnHint'] as String), findsOneWidget);
  });

  testWidgets('🔴 доступность кнопок — из модели: недоступная молчит, доступная зовёт веб', (t) async {
    final m = load('shop_model.json');
    await mount(t, m);
    final ab = (m['abilities']! as Map).cast<String, Object?>();
    final rows = list(ab['rows']);
    final off = rows.firstWhere((a) => (a['buy']! as Map)['enabled'] != true);
    final on = rows.firstWhere((a) => (a['buy']! as Map)['enabled'] == true);
    await t.tap(key('shop-ability-buy-${off['id']}'));
    expect(js, isEmpty, reason: 'недоступная «Купить» не зовёт веб');
    await t.tap(key('shop-ability-buy-${on['id']}'));
    expect(js.single, contains('["/shop"].buyAbility("${on['id']}")'));
    js.clear();
    final items = [for (final s in list(m['sections'])) ...list(s['items'])];
    final owned = items.firstWhere((i) => i['owned'] == true);
    final buyable = items.firstWhere((i) => i['owned'] != true && (i['btn']! as Map)['enabled'] == true);
    final pricey = items.firstWhere((i) => i['owned'] != true && (i['btn']! as Map)['enabled'] != true);
    await t.tap(key('shop-equip-${owned['id']}'));
    await t.tap(key('shop-buy-${buyable['id']}'));
    await t.tap(key('shop-buy-${pricey['id']}'));
    expect(js, [contains('["/shop"].toggle("${owned['id']}")'), contains('["/shop"].buy("${buyable['id']}")')]);
  });

  testWidgets('🔴 надетое — в рамке цвета товара; вкладка и «назад» — действия веба', (t) async {
    final m = load('shop_model.json');
    await mount(t, m);
    final items = [for (final s in list(m['sections'])) ...list(s['items'])];
    final on = items.firstWhere((i) => i['on'] == true);
    final border = ((t.widget<Container>(key('shop-item-${on['id']}')).decoration! as BoxDecoration).border! as Border).top;
    expect(border.width, 2);
    expect(border.color, cssColor(on['accent']));
    await t.tap(key('shop-cat-avatar'));
    await t.tap(key('shop-cat-all'));
    await t.tap(key('shop-back'));
    expect(js, [contains('["/shop"].cat("avatar")'), contains('["/shop"].cat(null)'), contains('["/shop"].back()')]);
  });

  testWidgets('отчёт о последней трате — строкой модели над разделами; нет отчёта — нет строки', (t) async {
    final m = load('shop_model.json');
    await mount(t, {...m, 'note': null});
    expect(key('shop-note'), findsNothing);
    ScreenUi.model(route).value = {...m, 'note': 'Списано 300 ⭐ · Щит серии ×1'};
    await t.pump();
    expect(find.descendant(of: key('shop-note'), matching: find.text('Списано 300 ⭐ · Щит серии ×1')), findsOneWidget);
  });
}
