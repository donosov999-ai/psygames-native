// «Кого не хватает» — второй режим «Найди признак»: раздача и экран до конца ступени нажатиями.
//
// Раздачу проба повторяет тем же зерном, что отдаёт экрану: так она знает, кто убран, и
// отвечает нажатием, как человек. Время двигает pump — без runAsync.
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/monster_traits/missing_screen.dart';
import 'package:psygames_flutter/games/monster_traits/model.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

int shared(Monster a, Monster b) =>
    (a.color == b.color ? 1 : 0) + (a.body == b.body ? 1 : 0) + (a.eyes == b.eyes ? 1 : 0);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() {
    LessonUsed.reset();
    SessionReport.sink = null;
  });

  group('раздача', () {
    test('🔴 лестница: соседние ступени не повторяются до границы L19, оси — в свою сторону', () {
      for (var level = 2; level <= 19; level++) {
        final a = missingLevelFor(level - 1), b = missingLevelFor(level);
        expect(b.signature, isNot(a.signature), reason: 'L$level повторяет L${level - 1}');
        expect(b.hand, greaterThanOrEqualTo(a.hand), reason: 'L$level: руку уменьшили');
        expect(b.studyMs, lessThanOrEqualTo(a.studyMs), reason: 'L$level: показ удлинили');
        expect(b.options, greaterThanOrEqualTo(a.options));
      }
      expect(missingLevelFor(1).hand, 3);
      expect(missingLevelFor(3).similar, isFalse);
      expect(missingLevelFor(4).similar, isTrue);
      expect(missingLevelFor(14).studyMs, 1500, reason: 'показ не опускается ниже 1,5 с');
      expect(missingLevelFor(18).gone, 1);
      expect(missingLevelFor(19).gone, 2);
      expect(missingLevelFor(19).options, 8);
    });

    test('🔴 раздача 25 ступеней × 50 зёрен: помехи не из руки, убранные среди вариантов', () {
      for (var level = 1; level <= 25; level++) {
        final lv = missingLevelFor(level);
        final rnd = Random(level * 97);
        for (var k = 0; k < 50; k++) {
          final r = MissingRound.deal(level, rnd);
          final where = 'L$level/$k';
          expect(r.hand.toSet(), hasLength(lv.hand), reason: '$where: одинаковые в руке');
          expect(r.gone, hasLength(lv.gone), reason: where);
          expect(r.options.toSet(), hasLength(lv.options), reason: '$where: одинаковые варианты');
          expect(r.options.toSet().containsAll(r.goneMonsters), isTrue, reason: '$where: убранного нет среди вариантов');
          final distractors = r.options.where((m) => !r.goneMonsters.contains(m)).toList();
          for (final d in distractors) {
            expect(r.hand.contains(d), isFalse, reason: '$where: помеха была в руке — отсеивается глазом');
          }
          expect(r.shown, hasLength(lv.hand - lv.gone));
          for (final g in r.goneMonsters) {
            expect(r.shown.contains(g), isFalse, reason: '$where: убранный остался на столе');
          }
          if (lv.similar) {
            // Помехи — самые похожие из тех, кого в руке не было: ни одного невзятого,
            // который похож на убранного сильнее взятой помехи.
            int best(Monster m) => r.goneMonsters.map((g) => shared(m, g)).reduce(max);
            final worstTaken = distractors.map(best).reduce(min);
            final pool = [for (final m in allMonsters) if (!r.hand.contains(m) && !r.options.contains(m)) m];
            final bestLeft = pool.isEmpty ? 0 : pool.map(best).reduce(max);
            expect(worstTaken, greaterThanOrEqualTo(bestLeft), reason: '$where: взята помеха хуже оставшейся');
          }
        }
      }
    });

    test('ответ засчитывается только точным набором убранных', () {
      final r = MissingRound.deal(19, Random(3));
      final gone = r.goneMonsters;
      expect(r.check(gone), isTrue);
      expect(r.check({gone.first}), isFalse, reason: 'убраны двое — одного мало');
      final other = r.options.firstWhere((m) => !gone.contains(m));
      expect(r.check({gone.first, other}), isFalse);
    });
  });

  group('экран', () {
    late List<Map<String, dynamic>> reports;

    Future<SharedState> freshAt(int level) async {
      SharedPreferences.setMockInitialValues({
        if (level != 1) '${SharedState.prefix}${missingLadderKey}_level_nzt48': '$level',
      });
      reports = [];
      SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
      return SharedState.open();
    }

    Future<void> open(WidgetTester tester, {int level = 1, int seed = 5, Size? screen}) async {
      if (screen != null) {
        tester.view.devicePixelRatio = 1.0;
        tester.view.physicalSize = screen;
        addTearDown(tester.view.reset);
      }
      final state = await freshAt(level);
      await tester.pumpWidget(MaterialApp(home: MonsterMissingScreen(key: UniqueKey(), state: state, seed: seed)));
      await tester.pump();
      await tester.pump();
    }

    /// Одна проба: дождаться конца показа, выбрать [pick] среди вариантов, проверить.
    Future<void> answer(WidgetTester tester, MissingRound r, Iterable<Monster> pick, int level) async {
      await tester.pump(Duration(milliseconds: missingLevelFor(level).studyMs));
      await tester.pump();
      for (final m in pick) {
        await tester.tap(find.byKey(ValueKey('mm-option-${r.options.indexOf(m)}')));
        await tester.pump();
      }
      await tester.tap(find.byKey(const ValueKey('mm-check')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1100));
      await tester.pump();
    }

    testWidgets('🔴 три верных ответа нажатиями — ступень взята, партия записана с осями', (tester) async {
      await open(tester, level: 5, seed: 8);
      final rnd = Random(8);
      for (var t = 0; t < missingTrials; t++) {
        final r = MissingRound.deal(5, rnd);
        await answer(tester, r, r.goneMonsters, 5);
      }
      expect(find.byKey(const ValueKey('mm-next')), findsOneWidget, reason: 'ступень не закончилась');
      expect(find.textContaining(L.t('nextLabel')), findsOneWidget, reason: 'три из трёх — ступень взята');
      expect(reports, hasLength(1));
      expect(reports.single['game_type'], 'monster_traits');
      expect(reports.single['mode'], 'missing');
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(d['correct'], 3);
      expect(d['hand'], missingLevelFor(5).hand);
      expect(d['similar'], isTrue);
    });

    testWidgets('🔴 две ошибки из трёх — ступень не взята (угадать один раз из четырёх — мало)', (tester) async {
      await open(tester, level: 2, seed: 4);
      final rnd = Random(4);
      for (var t = 0; t < missingTrials; t++) {
        final r = MissingRound.deal(2, rnd);
        final wrong = r.options.firstWhere((m) => !r.goneMonsters.contains(m));
        await answer(tester, r, t == 0 ? r.goneMonsters : [wrong], 2);
      }
      expect(find.textContaining(L.t('retry')), findsOneWidget, reason: 'одна из трёх — ступень взята');
      expect((reports.single['details'] as Map)['correct'], 1);
    });

    testWidgets('🔴 показ длится ровно столько, сколько велит ступень; потом рука без убранного', (tester) async {
      await open(tester, level: 7, seed: 3);
      final r = MissingRound.deal(7, Random(3));
      final ms = missingLevelFor(7).studyMs;
      expect(find.byKey(const ValueKey('mm-hand')), findsOneWidget);
      expect(find.byKey(const ValueKey('mm-option-0')), findsNothing, reason: 'варианты видны во время показа');
      await tester.pump(Duration(milliseconds: ms - 100));
      expect(find.byKey(const ValueKey('mm-hand')), findsOneWidget, reason: 'показ кончился раньше срока');
      await tester.pump(const Duration(milliseconds: 150));
      expect(find.byKey(const ValueKey('mm-shown')), findsOneWidget);
      for (var i = 0; i < r.hand.length; i++) {
        final onTable = find.byKey(ValueKey('mm-table-$i')).evaluate().isNotEmpty;
        expect(onTable, i < r.shown.length, reason: 'на столе не рука без убранного');
      }
      expect(find.byKey(ValueKey('mm-option-${r.options.length - 1}')), findsOneWidget);
    });

    testWidgets('два убранных (L19): проверить можно, только выбрав двоих', (tester) async {
      await open(tester, level: 19, seed: 6);
      final r = MissingRound.deal(19, Random(6));
      expect(tester.widget<Text>(find.byKey(const ValueKey('mm-ask'))).data, L.t('mtRemember'));
      await tester.pump(Duration(milliseconds: missingLevelFor(19).studyMs));
      await tester.pump();
      expect(tester.widget<Text>(find.byKey(const ValueKey('mm-ask'))).data, L.t('mtMissingAsk2'));
      final gone = r.goneMonsters.toList();
      await tester.tap(find.byKey(ValueKey('mm-option-${r.options.indexOf(gone.first)}')));
      await tester.pump();
      final check = tester.widget<FilledButton>(find.byKey(const ValueKey('mm-check')));
      expect(check.onPressed, isNull, reason: 'проверка открыта при одном выбранном из двух');
    });

    testWidgets('разбор называет приём — «называй каждого тремя признаками»', (tester) async {
      await open(tester, level: 3, seed: 2);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pumpAndSettle();
      expect(find.textContaining(L.t('teachMissingName').substring(0, 30)), findsWidgets);
      expect(LessonUsed.inRound, isTrue);
    });

    // ⚠️ Ограничение клетки вариантов по ВЫСОТЕ здесь не включается: на 320×568 восемь
    // вариантов в два ряда встают по ширине (≈143 из ≈156 точек). Мутация «без высоты»
    // поэтому выживает законно — это страховка для экранов ниже поддерживаемого минимума.
    testWidgets('🔴 раскладка: 8 монстров и 8 вариантов на 320×568 — всё внутри поля, не мельче пальца',
        (tester) async {
      await open(tester, level: 19, seed: 1, screen: const Size(320, 568));
      final r = MissingRound.deal(19, Random(1));
      final field = tester.getRect(find.byKey(const Key('game-field')));
      for (var i = 0; i < r.hand.length; i++) {
        final rect = tester.getRect(find.byKey(ValueKey('mm-table-$i')));
        expect(rect.top >= field.top - 0.5 && rect.bottom <= field.bottom + 0.5, isTrue, reason: 'монстр $i вне поля: $rect');
      }
      await tester.pump(Duration(milliseconds: missingLevelFor(19).studyMs));
      await tester.pump();
      for (var i = 0; i < r.options.length; i++) {
        final rect = tester.getRect(find.byKey(ValueKey('mm-option-$i')));
        expect(rect.top >= field.top - 0.5 && rect.bottom <= field.bottom + 0.5, isTrue, reason: 'вариант $i вне поля: $rect');
        expect(rect.width >= 48 && rect.height >= 48, isTrue, reason: 'вариант $i мельче пальца: $rect');
      }
    });
  });
}
