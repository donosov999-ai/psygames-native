import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/monster_traits/model.dart';
import 'package:psygames_flutter/games/monster_traits/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «НАЙДИ ПРИЗНАК»: раздача, разбор ответа и экран до конца партии пальцем.
///
/// Раздачу проба повторяет тем же зерном, что отдаёт экрану, — так она знает, кого
/// отмечать, и проходит раунд нажатиями, как человек.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() {
    LessonUsed.reset();
    SessionReport.sink = null;
  });

  group('раздача', () {
    test('27 разных монстров: три цвета × три тела × 1–3 глаза', () {
      expect(allMonsters.length, 27);
      expect(allMonsters.toSet().length, 27);
    });

    test('на каждой ступени признак есть хотя бы у двух и нет хотя бы у двух', () {
      final rnd = Random(1);
      for (var level = 1; level <= 10; level++) {
        for (var k = 0; k < 30; k++) {
          final r = TraitRound.deal(level, rnd);
          expect(r.cards.length, traitCardsFor(level));
          expect(r.cards.toSet().length, r.cards.length, reason: 'двое одинаковых на поле');
          expect(r.target.length, inInclusiveRange(2, r.cards.length - 2));
        }
      }
    });

    test('разбор ответа: пропущенные и лишние считаются раздельно', () {
      final r = TraitRound(
        cards: const [Monster(0, 0, 1), Monster(0, 1, 2), Monster(1, 2, 3), Monster(2, 0, 1)],
        trait: Trait.color,
        value: 0,
      );
      final g = r.grade({1, 2});
      expect(g.missed, {0});
      expect(g.extras, {2});
    });
  });

  group('экран', () {
    late List<Map<String, dynamic>> reports;

    Future<SharedState> fresh() async {
      SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids'});
      reports = [];
      SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
      return SharedState.open();
    }

    Future<void> settle(WidgetTester tester) async {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    testWidgets('🔴 отметил ровно всех с признаком — победа, партия записана с разбором', (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(state: state, seed: 5)));
      await settle(tester);
      final round = TraitRound.deal(1, Random(5));
      expect(find.text(traitLabel(round.trait, round.value)), findsOneWidget, reason: 'признак не назван');
      for (final i in round.target) {
        await tester.tap(find.byKey(ValueKey('mt-card-$i')));
        await tester.pump();
      }
      await tester.tap(find.byKey(const ValueKey('mt-check')));
      await settle(tester);
      expect(find.byKey(const ValueKey('mt-next')), findsOneWidget);
      expect(find.textContaining('★★★'), findsOneWidget);
      expect(reports.length, 1);
      expect(reports.single['game_type'], 'monster_traits');
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(d['missed'], 0);
      expect(d['extras'], 0);
      expect(d['correct_count'], round.target.length);
    });

    testWidgets('отметил лишнего и пропустил своего — провал, и отказ назван числами', (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(state: state, seed: 5)));
      await settle(tester);
      final round = TraitRound.deal(1, Random(5));
      final wrong = [for (var i = 0; i < round.cards.length; i++) if (!round.target.contains(i)) i].first;
      await tester.tap(find.byKey(ValueKey('mt-card-$wrong')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('mt-check')));
      await settle(tester);
      expect(reports.length, 1, reason: 'проигрыш — тоже партия');
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(d['extras'], 1);
      expect(d['missed'], round.target.length);
      expect(find.textContaining('${L.t('mtMissed')}: ${round.target.length}'), findsOneWidget);
    });

    testWidgets('разбор называет приём — «смотри только на один признак»', (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(state: state, seed: 9)));
      await settle(tester);
      final round = TraitRound.deal(1, Random(9));
      await tester.tap(find.byKey(const Key('game-lesson')));
      await settle(tester);
      expect(find.byKey(const Key('lesson-counter')), findsOneWidget);
      expect(find.textContaining(L.f('teachTraitScan', {'trait': traitLabel(round.trait, round.value)})),
          findsOneWidget);
      expect(LessonUsed.inRound, isTrue);
    });
  });
}
