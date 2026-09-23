import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/number_bonds/model.dart';
import 'package:psygames_flutter/games/number_bonds/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ ПО ФИШКАМ. Числа проба читает С ЭКРАНА и сама ищет
/// решение перебором — как человек, а не подглядывая в генератор.
void main() {
  late SharedState state;
  var opens = 0;

  Future<void> open(WidgetTester tester, {int level = 1, Size? screen, String seed = 'проба'}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}number_bonds_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: NumberBondsScreen(key: ValueKey('открытие${opens += 1}'), state: state, rnd: createRng(seed)),
    ));
    await tester.pump();
    await tester.pump();
  }

  int targetOnScreen(WidgetTester tester) =>
      int.parse(tester.widget<Text>(find.byKey(const Key('цель'))).data!);

  List<int> chipsOnScreen(WidgetTester tester) {
    final out = <int>[];
    for (var i = 0; i < 20; i += 1) {
      final f = find.byKey(Key('фишка$i'));
      if (f.evaluate().isEmpty) break;
      out.add(int.parse(tester.widget<Text>(find.descendant(of: f, matching: find.byType(Text))).data!));
    }
    return out;
  }

  /// Ищет набор фишек, дающий цель, — перебором по прочитанному с экрана.
  List<int> solve(List<int> chips, int target) {
    for (var mask = 1; mask < (1 << chips.length); mask += 1) {
      var sum = 0;
      final idx = <int>[];
      for (var b = 0; b < chips.length; b += 1) {
        if (mask & (1 << b) != 0) {
          sum += chips[b];
          idx.add(b);
        }
      }
      if (idx.length >= bondsMinPicked && sum == target) return idx;
    }
    return const [];
  }

  testWidgets('🔴 раунд проходится нажатиями: решение принимается САМО, без кнопки', (tester) async {
    await open(tester);
    final cfg = levelParams(1);
    expect(find.text('Состав числа'), findsOneWidget);

    for (var i = 1; i <= cfg.trials; i += 1) {
      expect(find.text('$i/${cfg.trials}'), findsOneWidget, reason: 'задача $i');
      final chips = chipsOnScreen(tester);
      final target = targetOnScreen(tester);
      final pick = solve(chips, target);
      expect(pick, isNotEmpty, reason: 'задача $i решается: цель $target, фишки $chips');
      for (final idx in pick) {
        await tester.tap(find.byKey(Key('фишка$idx')));
        await tester.pump();
      }
      // Кнопку «Проверить» не трогаем — верное засчитывается само.
      await tester.pump(const Duration(milliseconds: 700));
    }
    expect(find.text('Следующий уровень'), findsOneWidget, reason: 'без ошибок — уровень взят');
  });

  testWidgets('🔴 «Проверить» с одной фишкой — ошибка, как в вебе', (tester) async {
    await open(tester, seed: 'одна');
    await tester.tap(find.byKey(const Key('фишка0')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('проверить')));
    await tester.pump();
    expect(find.text('1/$bondsErrorsAllowed'), findsOneWidget, reason: 'ошибка засчитана');
  });

  testWidgets('🔴 три ошибки уровень не берут — порог «не больше двух»', (tester) async {
    await open(tester, seed: 'ошибки');
    final cfg = levelParams(1);
    for (var i = 1; i <= cfg.trials; i += 1) {
      final chips = chipsOnScreen(tester);
      final target = targetOnScreen(tester);
      if (i <= 3) {
        // Сдаём заведомо неверный набор: две фишки, которые не дают цель.
        final pair = <int>[];
        for (var a = 0; a < chips.length && pair.isEmpty; a += 1) {
          for (var b = a + 1; b < chips.length; b += 1) {
            if (chips[a] + chips[b] != target) {
              pair.addAll([a, b]);
              break;
            }
          }
        }
        for (final idx in pair) {
          await tester.tap(find.byKey(Key('фишка$idx')));
          await tester.pump();
        }
        await tester.tap(find.byKey(const Key('проверить')));
      } else {
        for (final idx in solve(chips, target)) {
          await tester.tap(find.byKey(Key('фишка$idx')));
          await tester.pump();
        }
      }
      await tester.pump(const Duration(milliseconds: 700));
    }
    expect(find.text('Ещё раз'), findsOneWidget, reason: 'три ошибки — уровень не взят');
  });

  testWidgets('🔴 окно на задачу: просрочка засчитывается ошибкой, детские уровни без окна', (tester) async {
    expect(levelParams(1).windowMs, 0);
    await open(tester, level: 4, seed: 'окно');
    final cfg = levelParams(4);
    expect(cfg.windowMs, 40000);
    expect(find.text('40 с'), findsOneWidget, reason: 'окно показано');
    await tester.pump(const Duration(seconds: 41));
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.text('1/$bondsErrorsAllowed'), findsOneWidget, reason: 'просрочка — ошибка');
    expect(find.text('2/${cfg.trials}'), findsOneWidget, reason: 'и переход к следующей задаче');
  });

  testWidgets('🔴 РАСКЛАДКА: фишки не мельче пальца и все на экране — 360×640 и 390×844', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      await open(tester, level: 20, screen: screen, seed: 'раскладка');
      final field = tester.getRect(find.byKey(const Key('фишки')));
      final count = chipsOnScreen(tester).length;
      expect(count, levelParams(20).pool, reason: '$screen: фишек ${levelParams(20).pool}');
      for (var i = 0; i < count; i += 1) {
        final r = tester.getRect(find.byKey(Key('фишка$i')));
        expect(r.width >= 44, isTrue, reason: '$screen фишка $i мельче пальца: ${r.width}');
        expect(r.left >= 0 && r.right <= screen.width, isTrue, reason: '$screen фишка $i за экраном: $r');
        expect(r.bottom <= field.bottom + 0.5, isTrue, reason: '$screen фишка $i ниже поля фишек');
      }
    }
  });
}
