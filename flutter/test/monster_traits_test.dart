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

import 'support/game_clock_fake.dart';

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

    test('🔴 лестница: оси по ступеням, соседние ступени не повторяются, граница времени 8 с', () {
      String? prev;
      for (var level = 1; level <= 60; level++) {
        final lv = traitLevelFor(level);
        expect(lv.signature, isNot(prev), reason: 'L$level повторяет L${level - 1}');
        prev = lv.signature;
        expect(lv.pair, level >= traitPairFrom, reason: 'L$level: два признака');
        expect(lv.negate, level >= traitNegateFrom && level.isEven, reason: 'L$level: «но не»');
        expect(lv.seconds == null, level < traitTimedFrom, reason: 'L$level: время');
        if (level > 1) {
          expect(lv.cards, greaterThanOrEqualTo(traitLevelFor(level - 1).cards), reason: 'L$level: карточек меньше');
          final a = traitLevelFor(level - 1).seconds, b = lv.seconds;
          if (a != null && b != null) expect(b, lessThanOrEqualTo(a), reason: 'L$level: времени стало больше');
        }
        if (lv.seconds != null) expect(lv.seconds, greaterThanOrEqualTo(8), reason: 'L$level: ниже границы');
      }
      expect(traitLevelFor(36).seconds, 8);
      expect(traitLevelFor(11).cards, 18);
    });

    test('раздача 40 ступеней × 30 зёрен: условию отвечают от двух до «всех, кроме двух»', () {
      for (var level = 1; level <= 40; level++) {
        final rnd = Random(level * 31);
        final lv = traitLevelFor(level);
        for (var k = 0; k < 30; k++) {
          final r = TraitRound.deal(level, rnd);
          expect(r.cards.length, lv.cards);
          expect(r.isPair, lv.pair, reason: 'L$level: не то число признаков');
          expect(r.negate2, lv.negate, reason: 'L$level: не то «но не»');
          if (r.isPair) expect(r.trait2, isNot(r.trait), reason: 'L$level: второй признак = первый');
          expect(r.target.length, inInclusiveRange(2, r.cards.length - 2), reason: 'L$level');
          for (var i = 0; i < r.cards.length; i++) {
            final m = r.cards[i];
            final want = m.valueOf(r.trait) == r.value &&
                (!r.isPair || (r.negate2 ? m.valueOf(r.trait2!) != r.value2 : m.valueOf(r.trait2!) == r.value2));
            expect(r.target.contains(i), want, reason: 'L$level: карточка $i');
          }
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
      useFakeGameClock(tester);
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
      useFakeGameClock(tester);
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

    Future<SharedState> freshAt(int level) async {
      SharedPreferences.setMockInitialValues({
        'psygames_active_profile': 'kids',
        '${SharedState.prefix}monster_traits_level_kids': '$level',
      });
      reports = [];
      SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
      return SharedState.open();
    }

    testWidgets('🔴 время вышло — раунд сдаётся сам тем, что успел отметить (L12: 40 с)', (tester) async {
      final state = await freshAt(12);
      useFakeGameClock(tester);
      await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(state: state, seed: 3)));
      await settle(tester);
      expect(find.text('40'), findsOneWidget, reason: 'на табло нет 40 секунд');
      await tester.pump(const Duration(seconds: 39));
      expect(reports, isEmpty, reason: 'раунд кончился раньше 40 с');
      await tester.pump(const Duration(seconds: 1));
      await settle(tester);
      expect(reports.length, 1, reason: 'по концу времени партия не записана');
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(d['time_up'], isTrue);
      expect(d['seconds'], 40);
      expect(d['selected_count'], 0);
      expect(find.byKey(const ValueKey('mt-next')), findsOneWidget);
    });

    testWidgets('без времени до L12: минута ожидания ничего не сдаёт', (tester) async {
      final state = await freshAt(11);
      useFakeGameClock(tester);
      await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(state: state, seed: 3)));
      await settle(tester);
      await tester.pump(const Duration(seconds: 60));
      expect(reports, isEmpty);
      expect(find.byKey(const ValueKey('mt-check')), findsOneWidget);
    });

    testWidgets('🔴 два признака (L8) и «но не» (L16): вывеска называет оба, победа — точным набором', (tester) async {
      for (final (level, joint) in [(8, 'mtAnd'), (16, 'mtButNot')]) {
        final state = await freshAt(level);
        useFakeGameClock(tester);
        await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(key: UniqueKey(), state: state, seed: 7)));
        await settle(tester);
        final round = TraitRound.deal(level, Random(7));
        expect(tester.widget<Text>(find.byKey(const ValueKey('mt-joint'))).data, L.t(joint), reason: 'L$level');
        expect(find.text(traitLabel(round.trait2!, round.value2!)), findsOneWidget, reason: 'L$level: второй признак не назван');
        for (final i in round.target) {
          await tester.tap(find.byKey(ValueKey('mt-card-$i')));
          await tester.pump();
        }
        await tester.tap(find.byKey(const ValueKey('mt-check')));
        await settle(tester);
        expect(find.textContaining('★★★'), findsOneWidget, reason: 'L$level: точный набор не засчитан');
        final d = reports.last['details'] as Map<String, dynamic>;
        expect(d['trait2'], round.trait2!.name);
        expect(d['negate2'] == true, level == 16);
      }
    });

    testWidgets('разбор пары называет ПРИЁМ пары: «сперва первый, среди найденных второй» / «отбрось»', (tester) async {
      for (final (level, key) in [(8, 'teachTraitPair'), (16, 'teachTraitNot')]) {
        final state = await freshAt(level);
        useFakeGameClock(tester);
        await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(key: UniqueKey(), state: state, seed: 11)));
        await settle(tester);
        final r = TraitRound.deal(level, Random(11));
        await tester.tap(find.byKey(const Key('game-lesson')));
        await settle(tester);
        // Шаги идут сами: первый — «смотри на один признак», второй — приём пары.
        final text = L.f(key, {'trait': traitLabel(r.trait, r.value), 'trait2': traitLabel(r.trait2!, r.value2!)});
        expect(text, isNot(contains(key)), reason: '$key не собран в словарь');
        var seen = false;
        for (var k = 0; k < 40 && !seen; k++) {
          seen = find.textContaining(text.substring(0, 25)).evaluate().isNotEmpty;
          if (!seen) await tester.pump(const Duration(milliseconds: 500));
        }
        expect(seen, isTrue, reason: 'L$level: шаг «$key» не показан');
        tester.state<NavigatorState>(find.byType(Navigator)).pop();
        await tester.pumpAndSettle();
      }
    });

    testWidgets('🔴 раскладка: 18 карточек и вывеска «но не» на 320×568 — всё внутри поля', (tester) async {
      // Правило «клетка — по высоте поля» включается только на низком экране: на 360×640
      // и 390×844 восемнадцать карточек влезают и по ширине (мутация «клетка без высоты»
      // там выживала). Поэтому замер — на 320×568, где оно действует.
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = const Size(320, 568);
      addTearDown(tester.view.reset);
      final state = await freshAt(16);
      useFakeGameClock(tester);
      await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(state: state, seed: 2)));
      await settle(tester);
      final field = tester.getRect(find.byKey(const Key('game-field')));
      final prompt = tester.getRect(find.byKey(const ValueKey('mt-prompt')));
      expect(prompt.top >= field.top - 0.5, isTrue);
      for (var i = 0; i < traitCardsFor(16); i++) {
        final r = tester.getRect(find.byKey(ValueKey('mt-card-$i')));
        expect(r.bottom <= field.bottom + 0.5 && r.top >= prompt.bottom - 0.5, isTrue,
            reason: 'карточка $i вне поля: $r, поле $field, вывеска $prompt');
        expect(r.width >= 40 && r.height >= 40, isTrue, reason: 'карточка $i мельче пальца: $r');
      }
    });

    testWidgets('разбор называет приём — «смотри только на один признак»', (tester) async {
      final state = await fresh();
      useFakeGameClock(tester);
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
