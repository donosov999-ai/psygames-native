import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hidden_character/model.dart';
import 'package:psygames_flutter/games/hidden_character/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «КТО СПРЯТАЛСЯ?»: эталон вопросов, раздача и экран до конца раунда пальцем.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() {
    LessonUsed.reset();
    SessionReport.sink = null;
  });

  int mask(List<Feature> fs) => fs.fold(0, (m, f) => m | (1 << f.index));

  group('эталон вопросов', () {
    test('все сочетания k признаков — ровно k вопросов, любой делит пополам', () {
      for (var k = 1; k <= 4; k++) {
        final fs = Feature.values.take(k).toList();
        final all = [for (var c = 0; c < (1 << k); c++) mask([for (var i = 0; i < k; i++) if (c & (1 << i) != 0) fs[i]])];
        expect(worstCaseQuestions(all, fs), k, reason: 'k=$k');
      }
    });

    test('🔴 неудачный вопрос дороже удачного: эталон выбирает делящий', () {
      // Четверо: у первого всё, у второго шляпа, у третьего очки, у четвёртого ничего.
      // «Шляпа?» и «Очки?» делят 2/2 — хватает двух вопросов; «Борода?» делит 1/3,
      // и после «нет» остаются трое — нужно ещё два, всего три.
      final fs = [Feature.hat, Feature.glasses, Feature.beard];
      final people = [
        mask([Feature.hat, Feature.glasses, Feature.beard]),
        mask([Feature.hat]),
        mask([Feature.glasses]),
        mask([]),
      ];
      expect(worstCaseQuestions(people, fs), 2);
      expect(bestQuestion(people, fs), anyOf(Feature.hat, Feature.glasses));
      final afterBeardNo = [for (final m in people) if (!hasFeature(m, Feature.beard)) m];
      expect(1 + worstCaseQuestions(afterBeardNo, fs), 3, reason: 'плохой первый вопрос стоит лишнего');
    });

    test('раздача: все разные, эталон не больше числа признаков', () {
      final rnd = Random(2);
      for (var level = 1; level <= 10; level++) {
        final r = HiddenRound.deal(level, rnd);
        final step = hiddenStep(level);
        expect(r.suspects.toSet().length, r.suspects.length);
        expect(r.features.length, step.features);
        expect(r.optimal, lessThanOrEqualTo(step.features));
        expect(r.optimal, greaterThanOrEqualTo((log(r.suspects.length) / ln2).ceil()));
      }
    });

    test('ответ отсекает несовпавших, выбор проверяется', () {
      final r = HiddenRound(
        features: const [Feature.hat, Feature.glasses],
        suspects: [mask([]), mask([Feature.hat]), mask([Feature.glasses]), mask([Feature.hat, Feature.glasses])],
        target: 3,
      );
      expect(r.ask(Feature.hat), isTrue);
      expect(r.remaining, {1, 3});
      expect(() => r.pick(0), throwsStateError, reason: 'исключённого назвать нельзя');
      expect(r.pick(3), isTrue);
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

    testWidgets('🔴 лучшие вопросы и верный выбор — победа за эталон, три звезды, партия записана',
        (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(home: HiddenCharacterScreen(state: state, seed: 21)));
      await settle(tester);
      final r = HiddenRound.deal(1, Random(21));
      // Та же раздача у пробы: задаём лучшие вопросы, отвечая за спрятавшегося.
      var left = [for (var i = 0; i < r.suspects.length; i++) i];
      final avail = List<Feature>.of(r.features);
      while (left.length > 1) {
        final q = bestQuestion([for (final i in left) r.suspects[i]], avail)!;
        avail.remove(q);
        await tester.tap(find.byKey(ValueKey('hc-ask-${q.name}')));
        await tester.pump();
        final yes = hasFeature(r.suspects[r.target], q);
        left = [for (final i in left) if (hasFeature(r.suspects[i], q) == yes) i];
      }
      expect(left, [r.target]);
      await tester.tap(find.byKey(ValueKey('hc-suspect-${r.target}')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('hc-confirm')));
      await settle(tester);
      expect(find.byKey(const ValueKey('hc-next')), findsOneWidget);
      expect(find.textContaining('★★★'), findsOneWidget);
      expect(reports.length, 1);
      expect(reports.single['game_type'], 'hidden_character');
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(d['won'], true);
      expect(d['questions_used'], lessThanOrEqualTo(d['optimal_questions'] as int));
    });

    testWidgets('назвал не того — провал, партия записана, спрятавшийся показан', (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(home: HiddenCharacterScreen(state: state, seed: 21)));
      await settle(tester);
      final r = HiddenRound.deal(1, Random(21));
      final wrong = (r.target + 1) % r.suspects.length;
      await tester.tap(find.byKey(ValueKey('hc-suspect-$wrong')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('hc-confirm')));
      await settle(tester);
      expect(reports.length, 1);
      expect((reports.single['details'] as Map<String, dynamic>)['won'], false);
      expect(find.text(L.t('hcWrong')), findsOneWidget);
    });

    testWidgets('разбор называет приём «дели пополам» с числами', (tester) async {
      final state = await fresh();
      await tester.pumpWidget(MaterialApp(home: HiddenCharacterScreen(state: state, seed: 21)));
      await settle(tester);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await settle(tester);
      expect(find.byKey(const Key('lesson-counter')), findsOneWidget);
      expect(find.textContaining('Шаг 1 из'), findsOneWidget);
      expect(LessonUsed.inRound, isTrue);
    });
  });
}
