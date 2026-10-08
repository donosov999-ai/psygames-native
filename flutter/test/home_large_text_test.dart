import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/home_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КРУПНЫЙ СИСТЕМНЫЙ ШРИФТ: КАРТОЧКИ ГЛАВНОЙ — В ДВЕ КОЛОНКИ, ПОДПИСЬ КНОПКИ НЕ РЕЖЕТСЯ
/// (отчёты 316f0438, a7318e1e; задача a0d262ce п.1).
///
/// Кадр 07.10 нативной Главной, EN, 390 pt: при ×1,15 «CHOOS|E» посреди слова, при ×1,3
/// «Daily challen…» и «CHOO…», при ×1,5 «Schulte: Attenti…» и «Daily ch allenge». Ошибок
/// переполнения при этом нет — Text режет молча, ловится только раскладкой.
///   · ×1,0 — три карточки в одном ряду, как у веба;
///   · ×1,15 и крупнее — две колонки: третья карточка под первой, той же ширины;
///   · подпись кнопки — без предела строк, как `heroCtaText` веба.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  late Map<String, Object?> model;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    model = (jsonDecode(File('test/fixtures/home_model_ru.json').readAsStringSync()) as Map).cast<String, Object?>();
    model['goalSheet'] = null;
    ScreenUi.reset();
    ScreenUi.run = (s) async {};
  });

  Future<List<Rect>> cards(WidgetTester t, double scale, String kind) async {
    t.view.physicalSize = const Size(780, 6000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(HomeScreen.route).value = model;
    await t.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(size: const Size(390, 3000), textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            body: HomeScreen(state: state, origin: 'http://127.0.0.1:1', kit: null, onOpen: (_) {}, onTab: (_) {}, onSwitcher: () {}, ownModel: false),
          ),
        ),
      ),
    );
    await t.pump();
    final block = find.byKey(ValueKey('home-$kind'));
    expect(block, findsOneWidget, reason: kind);
    final found = find.descendant(of: block, matching: find.byWidgetPredicate((w) => '${w.key}'.contains("home-card-")));
    return [for (final e in found.evaluate()) t.getRect(find.byWidget(e.widget))];
  }

  for (final kind in ['reco', 'practices']) {
    testWidgets('🔴 $kind: ×1,0 — все в один ряд; ×1,15 и ×1,3 — не больше двух в ряду, третья под первой', (t) async {
      final one = await cards(t, 1.0, kind);
      expect(one.length, greaterThanOrEqualTo(2));
      expect({for (final r in one) r.top.round()}, hasLength(1), reason: 'один ряд');
      // Ширина колонки — доля ряда по числу карточек: две — по половине, три — по трети.
      final row = one.last.right - one.first.left;
      expect(one.first.width, closeTo((row - 10 * (one.length - 1)) / one.length, 0.5));
      for (final scale in [1.15, 1.3]) {
        final big = await cards(t, scale, kind);
        expect(big, hasLength(one.length));
        expect(big[0].top, big[1].top, reason: '×$scale: первые две — один ряд');
        expect(big[0].width, closeTo((row - 10) / 2, 0.5), reason: '×$scale: по половине ряда');
        if (big.length >= 3) {
          expect(big[2].top, greaterThan(big[0].bottom), reason: '×$scale: третья — ниже');
          expect(big[2].left, big[0].left, reason: '×$scale: под первой');
          expect(big[2].width, closeTo(big[0].width, 0.5), reason: '×$scale: той же ширины');
        }
      }
    });
  }

  testWidgets('подпись кнопки карточки — без предела строк, как у веба', (t) async {
    await cards(t, 1.5, 'practices');
    final ctas = [
      for (final b in (model['blocks']! as List).cast<Map>())
        if (b['kind'] == 'practices')
          for (final c in (b['cards'] as List).cast<Map>()) (c['cta'] as Map)['text'] as String,
    ];
    expect(ctas, isNotEmpty);
    for (final text in ctas) {
      final w = t.widget<Text>(find.text(text).first);
      expect(w.maxLines, isNull, reason: text);
    }
  });
}
