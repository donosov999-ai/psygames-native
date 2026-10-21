import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/board.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЦЕЛЬ «ХАНОЙСКОЙ БАШНИ» ВИДНА НА ПОЛЕ, БЕЗ ПРАВИЛ.
///
/// 📍 Отзыв af75de31 (14.10.2026, английский): «what i had to do». На старте три
/// стержня выглядели одинаково, и куда нести башню, говорили только правила за
/// «?». Проба — на английском, основном языке: строка цели над доской и флажок
/// над стержнем, где башню ждут (последний — так победу проверяет модель).
Future<void> _boot(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size * 2;
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final state = await SharedState.open();
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: HanoiScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(HanoiBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

void main() {
  setUpAll(() async => L.load('en'));

  for (final size in const [Size(390, 844), Size(360, 640)]) {
    testWidgets('🔴 цель читается с поля: строка над доской и флажок над целью · ${size.width.toInt()}×${size.height.toInt()}',
        (tester) async {
      await _boot(tester, size);
      final pegs = tester.widget<HanoiBoard>(find.byType(HanoiBoard)).state.pegs.length;
      final last = pegs - 1;

      final goal = find.byKey(const ValueKey('hanoi-goal'));
      expect(goal, findsOneWidget);
      expect(tester.widget<Text>(goal).data, 'Move all discs to the right peg');
      expect(tester.getRect(goal).bottom, lessThanOrEqualTo(size.height), reason: 'строка цели за краем экрана');

      final flag = find.byKey(const ValueKey('hanoi-goal-flag'));
      expect(flag, findsOneWidget, reason: 'флажок цели один');
      expect(find.descendant(of: find.byKey(ValueKey('peg-$last')), matching: flag), findsOneWidget,
          reason: 'флажок обязан стоять над последним стержнем — туда башню и ждут');
      for (var i = 0; i < last; i++) {
        expect(find.descendant(of: find.byKey(ValueKey('peg-$i')), matching: flag), findsNothing);
      }
      // Флажок внутри стержня, а не поверх соседа или за краем поля.
      final peg = tester.getRect(find.byKey(ValueKey('peg-$last')));
      final f = tester.getRect(flag);
      expect(peg.contains(f.center), isTrue, reason: 'флажок вылез за свой стержень: $f против $peg');
    });
  }
}
