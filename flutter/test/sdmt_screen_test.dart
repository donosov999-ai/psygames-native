import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sdmt/model.dart';
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ ПО ЦИФРАМ. Легенду проба читает С ЭКРАНА — как
/// человек: сопоставляет значок в клетке легенды с цифрой под ним.
void main() {
  late SharedState state;
  var opens = 0;

  setUpAll(() async {
    // Подписи берутся из общего словаря, как в приложении: проба заодно
    // проверяет, что assets/l10n/ru.json собран и читается.
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester,
      {int level = 1, Size? screen, String seed = 'проба', int seconds = 10}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}sdmt_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: SdmtScreen(
        key: ValueKey('открытие${opens += 1}'),
        state: state,
        rnd: createRng(seed),
        seconds: seconds,
      ),
    ));
    await tester.pump();
    await tester.pump();
  }

  /// Читает легенду с экрана: значок клетки → цифра под ним.
  Map<IconData, int> legendOnScreen(WidgetTester tester, int count) {
    final out = <IconData, int>{};
    for (var i = 0; i < count; i += 1) {
      final cell = find.byKey(Key('легенда$i'));
      final icon = tester.widget<Icon>(find.descendant(of: cell, matching: find.byType(Icon)));
      final digit = tester.widget<Text>(find.descendant(of: cell, matching: find.byType(Text)));
      out[icon.icon!] = int.parse(digit.data!);
    }
    return out;
  }

  IconData stimOnScreen(WidgetTester tester) => tester
      .widget<Icon>(find.descendant(of: find.byKey(const Key('стимул')), matching: find.byType(Icon)))
      .icon!;

  testWidgets('🔴 партия играется нажатиями: значок с экрана, цифра из легенды', (tester) async {
    await open(tester);
    final p = levelParams(1);
    expect(find.text(L.t('sdmt')), findsOneWidget);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();

    final legend = legendOnScreen(tester, p.symbolCount);
    expect(legend.length, p.symbolCount, reason: 'в легенде столько клеток, сколько обещает уровень');

    for (var i = 0; i < 12; i += 1) {
      final digit = legend[stimOnScreen(tester)]!;
      await tester.tap(find.byKey(Key('цифра$digit')));
      await tester.pump();
      expect(find.text('${i + 1}/${p.targetHits}'), findsOneWidget, reason: 'верных ${i + 1}');
    }
  });

  testWidgets('🔴 цель и точность решают вместе: 12 верных мало, если цель выше', (tester) async {
    await open(tester, seed: 'порог', seconds: 3);
    final p = levelParams(1);
    expect(p.targetHits, 14, reason: 'на первом уровне цель — четырнадцать');
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    final legend = legendOnScreen(tester, p.symbolCount);
    for (var i = 0; i < 12; i += 1) {
      final digit = legend[stimOnScreen(tester)]!;
      await tester.tap(find.byKey(Key('цифра$digit')));
      await tester.pump();
    }
    await tester.pump(const Duration(seconds: 4));
    expect(find.textContaining(L.t('retry')), findsWidgets, reason: '12 верных при цели 14 — уровень не взят');
  });

  testWidgets('🔴 цель НАБРАНА, но точность низкая — уровень не берётся', (tester) async {
    // ⚠️ Без этой пробы порог точности не проверен ничем: мутация «0,8 → 0» не
    // краснела, потому что соседняя проба меряла только НЕДОБОР цели.
    await open(tester, seed: 'точность', seconds: 3);
    final p = levelParams(1);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    final legend = legendOnScreen(tester, p.symbolCount);

    for (var i = 0; i < p.targetHits; i += 1) {
      await tester.tap(find.byKey(Key('цифра${legend[stimOnScreen(tester)]}')));
      await tester.pump();
    }
    // Цель взята — а теперь портим точность: пять заведомо неверных.
    for (var i = 0; i < 5; i += 1) {
      final right = legend[stimOnScreen(tester)]!;
      final wrong = right == 9 ? 1 : right + 1;
      await tester.tap(find.byKey(Key('цифра$wrong')));
      await tester.pump();
    }
    await tester.pump(const Duration(seconds: 4));
    expect(find.textContaining(L.t('retry')), findsWidgets,
        reason: '14 верных из 19 — это 74%, порога 80% не хватает');
  });

  testWidgets('🔴 легенда видна ВСЁ время партии — иначе это замер памяти', (tester) async {
    await open(tester);
    expect(find.byKey(const Key('легенда')), findsOneWidget);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    expect(find.byKey(const Key('легенда')), findsOneWidget, reason: 'в игре легенда на экране');
    final legend = legendOnScreen(tester, levelParams(1).symbolCount);
    await tester.tap(find.byKey(Key('цифра${legend[stimOnScreen(tester)]}')));
    await tester.pump();
    expect(find.byKey(const Key('легенда')), findsOneWidget, reason: 'и после ответа тоже');
  });

  testWidgets('🔴 РАСКЛАДКА: три клавиши в ряд и не мельче пальца — 360×640 и 390×844', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      await open(tester, level: 13, screen: screen, seed: 'раскладка');
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();
      final want = sdmtLayout(screen.width, screen.height);
      final rects = <Rect>[];
      for (final d in [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        final r = tester.getRect(find.byKey(Key('цифра$d')));
        rects.add(r);
        expect(r.width, closeTo(want.pad, 0.01), reason: '$screen клавиша $d того размера, что считает правило');
        expect(r.width >= fingerSize, isTrue, reason: '$screen клавиша $d мельче пальца');
        expect(r.left >= 0 && r.right <= screen.width, isTrue, reason: '$screen клавиша $d за экраном: $r');
      }
      // 🔴 Ради чего правило переписывали: ТРИ в ряд, а не две.
      expect(rects[1].top, closeTo(rects[0].top, 0.5), reason: '$screen вторая клавиша в том же ряду');
      expect(rects[2].top, closeTo(rects[0].top, 0.5), reason: '$screen третья клавиша в том же ряду');
      expect(rects[3].top > rects[0].top, isTrue, reason: '$screen четвёртая ушла на второй ряд');
      // Легенда видна целиком, а не спрятана под шапку.
      final legend = tester.getRect(find.byKey(const Key('легенда')));
      expect(legend.top >= 0 && legend.bottom <= screen.height, isTrue,
          reason: '$screen легенда на экране: $legend');
    }
  });
}
