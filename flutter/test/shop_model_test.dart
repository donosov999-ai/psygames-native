import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/shop_model.dart';
import 'package:psygames_flutter/shell/shop_screen.dart';
import 'package:psygames_flutter/shell/training_history.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «МАГАЗИН»: МОДЕЛЬ DART = МОДЕЛЬ ВЕБА НА ТОМ ЖЕ ХРАНИЛИЩЕ (задача d6a60b02, вариант Б).
///
/// Эталоны выгружает веб-проба `shop-dart-model.test.tsx`: настоящий экран с провайдерами профиля, темы
/// и языка на подготовленном хранилище при замороженных часах — хранилище до монтирования, модель и
/// хранилище после (сгоревшую ставку `peekWager` стирает). Здесь то же хранилище кладётся в общую
/// память, и Dart собирает модель сам — и стирает ту же запись.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Map<String, Object?> obj(String f) => (jsonDecode(File(f).readAsStringSync()) as Map).cast<String, Object?>();
  final data = ShopData(obj('assets/shop.json'));
  final profiles = Profiles.parse(File('assets/profiles.json').readAsStringSync());
  void lang(String l) => L.useForTest(l, (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>());
  Wall wallOf(int offsetMinutes) =>
      (ms) => DateTime.fromMillisecondsSinceEpoch(ms - offsetMinutes * 60000, isUtc: true);
  setUpAll(() => WebTheme.use((jsonDecode(File('assets/web_theme.json').readAsStringSync()) as Map).cast<String, dynamic>()));

  for (final name in ['fresh', 'rich', 'lost', 'cat']) {
    test('🔴 shop_dart_$name: модель Dart = модель веба на том же хранилище и часах', () async {
      final f = obj('test/fixtures/shop_dart_$name.json');
      final want = (f['model']! as Map).cast<String, Object?>();
      final language = f['language']! as String;
      SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
      final state = await SharedState.open();
      lang(language);
      final pid = state.get(Profiles.activeKey)!;
      final wager = await peekShopWager(state, pid, now: (f['now']! as num).toInt(), wall: wallOf((f['tzOffsetMinutes']! as num).toInt()));
      final dart = shopModelFrom(state, data, profiles: profiles, language: language, wager: wager, cat: f['cat'] as String?);
      final got = (jsonDecode(jsonEncode(dart)) as Map).cast<String, Object?>();
      for (final k in want.keys) {
        expect(got[k], want[k], reason: 'поле $k');
      }
      expect(got.keys.toSet(), want.keys.toSet());
      final after = (f['after']! as Map).cast<String, Object?>();
      expect(state.get('psygames_wager_v1'), after['psygames_wager_v1'], reason: 'ставка в памяти после показа — как у веба');
    });
  }

  test('отчёт о трате — со страницы; сгоревшую ставку страница объявляет сама', () {
    final own = <String, Object?>{'note': null, 'balance': '5'};
    expect(withShopPageEvents(own, null), same(own));
    final m = withShopPageEvents(own, {'note': '−500 ⭐ · Вторая жизнь ×1', 'balance': '999'});
    expect(m['note'], '−500 ⭐ · Вторая жизнь ×1');
    expect(m['balance'], '5', reason: 'своё остаётся своим');
    expect(pageSawLostWager(null), isFalse);
    expect(
      pageSawLostWager({
        'abilities': {
          'wager': {'lost': true},
        },
      }),
      isTrue,
    );
    expect(pageSawLostWager({'abilities': null}), isFalse);
  });

  testWidgets('🔴 экран считает сам: без страницы — баланс и ставка из памяти; вкладка — своя; запись → пересчёт', (t) async {
    final f = obj('test/fixtures/shop_dart_lost.json');
    SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
    final state = await SharedState.open();
    lang('ar');
    Profiles.useForTest(profiles);
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    ShopScreen.now = () => (f['now']! as num).toInt();
    ShopScreen.wall = wallOf((f['tzOffsetMinutes']! as num).toInt());
    addTearDown(() {
      ShopScreen.now = () => DateTime.now().millisecondsSinceEpoch;
      ShopScreen.wall = deviceWall;
    });
    // Высокое окно: строки на арабском в шрифте проб длинные, и ставка иначе ниже края ленты.
    t.view.physicalSize = const Size(780, 8000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ShopScreen(origin: 'http://127.0.0.1:1', state: state),
        ),
      ),
    );
    Future<void> settle(bool Function() until) async {
      for (var i = 0; i < 60 && !until(); i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
        await t.pump();
      }
    }

    final want = (f['model']! as Map).cast<String, Object?>();
    final desc = ((want['abilities']! as Map)['wager']! as Map)['desc'] as String;
    await settle(() => find.text(desc).evaluate().isNotEmpty);
    expect(ScreenUi.model(ShopScreen.route).value, isNull, reason: 'модель не от страницы');
    expect(find.text('350'), findsOneWidget);
    expect(find.text(desc), findsOneWidget, reason: 'сгоревшая ставка — с объяснением');
    expect(state.get('psygames_wager_v1'), (f['after']! as Map)['psygames_wager_v1'], reason: 'и запись стёрта');
    // Запись стёрта, а объяснение держится — как у веба до следующей траты.
    await t.runAsync(() => state.set('psygames_tokens_v1', jsonEncode({'kids': 100})));
    await settle(() => find.text('100').evaluate().isNotEmpty);
    expect(find.text('100'), findsOneWidget);
    expect(find.textContaining(L.t('wagerLostMsg')), findsOneWidget);
    // Вкладка «Звуки» — своя: способности и ставка уходят, раздел один.
    await t.tap(find.byKey(const ValueKey('shop-cat-sound')));
    await settle(() => find.byKey(const ValueKey('shop-wager')).evaluate().isEmpty);
    expect(find.byKey(const ValueKey('shop-wager')), findsNothing);
    expect(find.byKey(const ValueKey('shop-item-sound_retro')), findsOneWidget);
    expect(find.byKey(const ValueKey('shop-item-accent_gold')), findsNothing);
    // Отчёт о трате — со страницы, поверх своей модели.
    ScreenUi.model(ShopScreen.route).value = {'note': 'تم'};
    await settle(() => find.text('تم').evaluate().isNotEmpty);
    expect(find.text('تم'), findsOneWidget);
    expect(find.text('100'), findsOneWidget, reason: 'своё остаётся своим');
  });
}
