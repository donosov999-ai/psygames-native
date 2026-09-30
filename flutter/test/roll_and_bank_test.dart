import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/roll_and_bank/model.dart';
import 'package:psygames_flutter/games/roll_and_bank/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «РИСКНИ И СОХРАНИ»: правила гонки на заданных бросках и экран до конца партии.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() {
    LessonUsed.reset();
    SessionReport.sink = null;
  });

  RollAndBank game({int goal = 20, int hold = 6}) => RollAndBank(goal: goal, botHold: hold, rnd: Random(1));

  group('правила', () {
    test('единица сжигает несохранённое и передаёт ход', () {
      final g = game();
      g.roll(5);
      g.roll(4);
      expect(g.position[0], 9);
      g.roll(1);
      expect(g.position[0], 0, reason: 'сохранено ничего — откат к нулю');
      expect(g.side, 1);
      expect(g.busts, 1);
    });

    test('сохранённое переживает единицу', () {
      final g = game();
      g.roll(6);
      g.bank();
      expect(g.banked[0], 6);
      expect(g.side, 1);
      g.roll(1); // бот сгорел, ход вернулся
      g.roll(3);
      g.roll(1);
      expect(g.position[0], 6, reason: 'откат к сохранённому, а не к нулю');
    });

    test('дошёл до финиша — победа, дальше ходить нельзя', () {
      final g = game(goal: 10);
      g.roll(6);
      g.roll(6);
      expect(g.winner, 0);
      expect(g.position[0], 10, reason: 'за финиш не заходят');
      expect(() => g.roll(3), throwsStateError);
    });

    test('бот сохраняет, как только несохранённого не меньше порога', () {
      final g = game(hold: 6);
      g.roll(2);
      g.bank();
      g.roll(3);
      expect(g.botWantsToBank, isFalse);
      g.roll(3);
      expect(g.botWantsToBank, isTrue);
    });

    test('лестница растит порог бота и не падает назад', () {
      var prev = 0;
      for (var level = 1; level <= 12; level++) {
        final s = rollAndBankStep(level);
        expect(s.botHold, greaterThanOrEqualTo(prev));
        prev = s.botHold;
      }
      expect(rollAndBankStep(1).botHold, lessThan(rollAndBankStep(8).botHold));
    });
  });

  group('экран', () {
    testWidgets('🔴 партия против бота доигрывается нажатиями и пишется одна, с мерой риска', (tester) async {
      SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids'});
      final reports = <Map<String, dynamic>>[];
      SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(
        home: RollAndBankScreen(state: state, seed: 4, botDelay: const Duration(milliseconds: 5)),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      // Стратегия пробы: бросать, пока несохранённого меньше 8, потом сохранять.
      for (var i = 0; i < 600 && find.byKey(const ValueKey('rb-next')).evaluate().isEmpty; i++) {
        final roll = tester.widget<FilledButton>(find.byKey(const ValueKey('rb-roll')));
        if (roll.onPressed == null) {
          await tester.pump(const Duration(milliseconds: 10)); // ходит бот
          continue;
        }
        final bank = tester.widget<OutlinedButton>(find.byKey(const ValueKey('rb-bank')));
        final text = (tester.widget<Text>(find.descendant(of: find.byKey(const ValueKey('rb-bank')), matching: find.byType(Text))).data ?? '');
        final unbanked = int.tryParse(text.split('+').last) ?? 0;
        await tester.tap(find.byKey(ValueKey(unbanked >= 8 && bank.onPressed != null ? 'rb-bank' : 'rb-roll')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(find.byKey(const ValueKey('rb-next')), findsOneWidget, reason: 'партия не закончилась за 600 шагов');
      expect(reports.length, 1);
      expect(reports.single['game_type'], 'roll_and_bank');
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(d['winner'], anyOf('player', 'bot'));
      expect(d['rolls'], greaterThan(0));
      expect(d.containsKey('busts'), isTrue);
    });

    testWidgets('разбор называет приём — ожидание броска против риска', (tester) async {
      SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids'});
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: RollAndBankScreen(state: state, seed: 4)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('lesson-counter')), findsOneWidget);
      expect(find.textContaining(L.t('teachBankAverage')), findsOneWidget);
      expect(LessonUsed.inRound, isTrue);
    });
  });
}
