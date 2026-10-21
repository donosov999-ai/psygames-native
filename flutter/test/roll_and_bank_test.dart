import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/roll_and_bank/model.dart';
import 'package:psygames_flutter/games/roll_and_bank/screen.dart';
import 'package:psygames_flutter/games/roll_and_bank/solver.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «РИСКНИ И СОХРАНИ»: правила гонки на заданных бросках и экран до конца партии.
/// ТОЧНАЯ вероятность победы человека против бота ступени — без выборки.
///
/// Стратегии обоих зафиксированы: сохраняет, когда несохранённого не меньше порога
/// (`null` — не сохраняет никогда). Человек ходит первым, у бота [headStart]. Считается
/// итерацией по значениям до сходимости: при фиксированных стратегиях это просто
/// вероятность исхода цепи, и выборочного шума, из-за которого ступени соседних
/// уровней путаются местами, здесь нет.
double winChance({required int goal, required int? humanHold, required int? botHold, int headStart = 0}) =>
    winTable(goal: goal, humanHold: humanHold, botHold: botHold)[headStart * goal];

/// Вся таблица разом: элемент `[s * goal]` — шанс человека при форе бота s (у человека 0,
/// у бота s сохранено, ход человека). [botPolicy] — бот по решению игры вместо порога.
Float64List winTable({required int goal, required int? humanHold, int? botHold, RollAndBankPolicy? botPolicy}) {
  final g = goal;
  int ix(int a, int b, int k) => (a * g + b) * g + k;
  final hu = Float64List(g * g * g)..fillRange(0, g * g * g, 0.5);
  final bo = Float64List(g * g * g)..fillRange(0, g * g * g, 0.5);
  bool banks(int? hold, int k) => hold != null && k > 0 && k >= hold;
  while (true) {
    var delta = 0.0;
    for (var a = 0; a < g; a++) {
      for (var b = 0; b < g; b++) {
        for (var k = 0; k < g - a; k++) {
          var v = 0.0;
          if (banks(humanHold, k)) {
            v = bo[ix(a + k, b, 0)];
          } else {
            for (var f = 1; f <= 6; f++) {
              if (f == 1) {
                v += bo[ix(a, b, 0)] / 6;
              } else if (a + k + f >= g) {
                v += 1 / 6;
              } else {
                v += hu[ix(a, b, k + f)] / 6;
              }
            }
          }
          final d = (v - hu[ix(a, b, k)]).abs();
          if (d > delta) delta = d;
          hu[ix(a, b, k)] = v;
        }
        for (var k = 0; k < g - b; k++) {
          var v = 0.0;
          if (botPolicy != null ? botPolicy.bank(b, a, k) : banks(botHold, k)) {
            v = hu[ix(a, b + k, 0)];
          } else {
            for (var f = 1; f <= 6; f++) {
              if (f == 1) {
                v += hu[ix(a, b, 0)] / 6;
              } else if (b + k + f < g) {
                v += bo[ix(a, b, k + f)] / 6;
              }
            }
          }
          final d = (v - bo[ix(a, b, k)]).abs();
          if (d > delta) delta = d;
          bo[ix(a, b, k)] = v;
        }
      }
    }
    if (delta < 1e-12) return hu;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await L.load('ru');
    // Бот с L9 играет по таблице решения; изолят в пробе не досчитает — считаем заранее.
    RollAndBankPolicy.solved(60);
  });
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

    test('мера риска: броски до «сохранить» — только по ходам, закрытым сохранением', () {
      final g = RollAndBank(goal: 60, botHold: 50, rnd: Random(1));
      g.roll(3);
      g.roll(4);
      g.bank(); // ход 1: два броска, сохранено 7
      g.roll(1); // бот сгорел
      g.roll(5);
      g.roll(1); // ход 2: сгорел — в «до сохранения» не идёт
      g.roll(1); // бот сгорел
      g.roll(6);
      g.bank(); // ход 3: один бросок, сохранено 6
      expect(g.turns, 3);
      expect(g.bankedTurns, 2);
      expect(g.meanRollsToBank, 1.5, reason: '(2 + 1) / 2 — броски сгоревшего хода не считаются');
      expect(g.bustRate, closeTo(1 / 3, 1e-12), reason: 'один сгоревший ход из трёх');
      expect(g.meanBankTotal, 6.5, reason: 'порог человека: (7 + 6) / 2');
    });

    test('пустое плечо — null, а не ноль: «не сохранял» ≠ «сохранял сразу»', () {
      final g = game();
      expect(g.meanRollsToBank, isNull);
      expect(g.bustRate, isNull);
      expect(g.meanBankTotal, isNull);
      g.roll(1);
      expect(g.bustRate, 1.0);
      expect(g.meanRollsToBank, isNull, reason: 'сохранений не было');
    });

    test('ход до финиша — ход, но не «до сохранения»: длину ему оборвала трасса', () {
      final g = RollAndBank(goal: 10, botHold: 50, rnd: Random(1));
      g.roll(3);
      g.bank();
      g.roll(1); // бот сгорел
      g.roll(6);
      g.roll(6); // финиш
      expect(g.winner, 0);
      expect(g.turns, 2);
      expect(g.bankedTurns, 1);
      expect(g.meanRollsToBank, 1.0);
    });

    test('фора: бот стартует впереди с СОХРАНЁННЫМ, и единица её не отнимает', () {
      final g = RollAndBank(goal: 30, headStart: 8, rnd: Random(1));
      expect(g.banked[1], 8);
      expect(g.position[1], 8);
      g.roll(2);
      g.bank();
      g.roll(5);
      expect(g.position[1], 13);
      g.roll(1);
      expect(g.position[1], 8, reason: 'сгорело только набранное в ходу');
      expect(() => RollAndBank(goal: 30, headStart: 30, rnd: Random(1)), throwsArgumentError);
    });

    test('бот без порога не сохраняет никогда', () {
      final g = RollAndBank(goal: 60, rnd: Random(1));
      g.roll(2);
      g.bank();
      for (final v in [6, 6, 6, 6, 6]) {
        expect(g.botWantsToBank, isFalse);
        g.roll(v);
      }
      expect(g.botWantsToBank, isFalse, reason: '30 несохранённого — и всё равно бросает');
    });
  });

  group('решение игры', () {
    Map<String, dynamic> fixture(int goal) => jsonDecode(File(
          '${Directory.current.path}/test/fixtures/roll-and-bank-optimal${goal == 30 ? '' : '-$goal'}.json',
        ).readAsStringSync()) as Map<String, dynamic>;

    for (final goal in [30, 50, 60]) {
      test('решатель на Dart совпадает с эталоном Python решение в решение: трасса $goal', () {
        final f = fixture(goal);
        final pol = RollAndBankPolicy.solved(goal);
        expect(f['ties'], 0, reason: 'ничья в эталоне — решение не однозначно');
        final want = f['policy'] as String;
        final got = pol.encoded;
        expect(got.length, want.length);
        final diff = [for (var n = 0; n < want.length; n++) if (want[n] != got[n]) n];
        expect(diff, isEmpty, reason: 'расходятся позиции ${diff.take(10)}');
        final best = (f['best_by_head_start'] as Map<String, dynamic>);
        for (final e in best.entries) {
          expect(pol.winChance(0, int.parse(e.key), 0), closeTo((e.value as num).toDouble(), 1e-9),
              reason: 'фора ${e.key}');
        }
      });
    }

    test('«сохранить» существует только на длинной трассе: 0 % → 6,7 % → 15,8 %, порог 21 при 0:0', () {
      double share(int goal) {
        final e = RollAndBankPolicy.solved(goal).encoded;
        return '0'.allMatches(e).length / e.length;
      }

      expect(share(30), 0);
      expect(share(50), closeTo(0.067, 0.001));
      expect(share(60), closeTo(0.158, 0.001));
      for (final goal in [50, 60]) {
        final pol = RollAndBankPolicy.solved(goal);
        expect(pol.bank(0, 0, 20), isFalse, reason: 'трасса $goal: при 0:0 на 20 ещё бросают');
        expect(pol.bank(0, 0, 21), isTrue, reason: 'трасса $goal: при 0:0 с 21 сохраняют');
      }
    });

    test('бот по решению сохраняет по таблице, а не по порогу', () {
      final pol = RollAndBankPolicy.solved(60);
      final g = RollAndBank(goal: 60, policy: pol, rnd: Random(1));
      g.roll(2); // человек
      g.bank();
      for (final f in [6, 6, 6, 3]) {
        g.roll(f);
      }
      expect(g.unbanked(1), 21);
      expect(g.botWantsToBank, pol.bank(0, 2, 21));
      expect(g.botWantsToBank, isTrue, reason: 'при 0:2 с 21 в ходу решение — сохранить');
    });
  });

  group('лестница', () {
    // Образцовые игроки: сохраняют с порога h; null — не сохраняет никогда; лучший — по решению.
    const refs = <int?>[8, 10, 12, 15, 20, 25, null];
    String name(int? h) => h == null ? 'не сохраняющий' : 'порог $h';
    final tables = <String, Float64List>{};
    double chance(int level, int? h) {
      final s = rollAndBankStep(level);
      final t = tables['${s.goal}/${s.botHold}/${s.solved}/$h'] ??= winTable(
        goal: s.goal,
        humanHold: h,
        botHold: s.botHold,
        botPolicy: s.solved ? RollAndBankPolicy.solved(s.goal) : null,
      );
      return t[s.headStart * s.goal];
    }

    // Лучший игрок против бота по решению — само решение; против бота с порогом не считается.
    double? bestChance(int level) {
      final s = rollAndBankStep(level);
      if (s.botHold != null) return null;
      return RollAndBankPolicy.solved(s.goal).winChance(0, s.headStart, 0);
    }

    test('L8 — трасса 30 без сохранений: её решение «не сохранять никогда»', () {
      final s = rollAndBankStep(8);
      expect((s.goal, s.botHold, s.headStart, s.solved), (30, null, 0, false));
      expect('0'.allMatches(RollAndBankPolicy.solved(30).encoded), isEmpty);
    });

    test('L9 и выше — трасса 60, где «сохранить» существует, и бот играет по решению', () {
      for (var level = 9; level <= 30; level++) {
        final s = rollAndBankStep(level);
        expect(s.goal, 60, reason: 'L$level');
        expect(s.solved, isTrue, reason: 'L$level: бот обязан играть по решению игры');
      }
    });

    test('🔴 лестница не легчает ни на одной ступени — у каждого образцового игрока, точно', () {
      final eased = <String>[];
      for (final h in refs) {
        var prev = chance(1, h);
        for (var level = 2; level <= 31; level++) {
          final now = chance(level, h);
          if (now > prev + 1e-12) {
            eased.add('${name(h)}: L${level - 1} ${(100 * prev).toStringAsFixed(2)} % → L$level ${(100 * now).toStringAsFixed(2)} %');
          }
          prev = now;
        }
      }
      double? prevBest;
      for (var level = 8; level <= 31; level++) {
        final now = bestChance(level)!;
        if (prevBest != null && now > prevBest + 1e-12) eased.add('лучший: L${level - 1} → L$level');
        prevBest = now;
      }
      expect(eased, isEmpty, reason: 'на этих ступенях выиграть стало легче');
    });

    test('шаг лучшего игрока на трассе 60 — не больше 3 п.п., верх не легче прежнего', () {
      for (var level = 10; level <= 30; level++) {
        final drop = bestChance(level - 1)! - bestChance(level)!;
        expect(drop, inInclusiveRange(0, 0.03), reason: 'L${level - 1} → L$level: ${100 * drop} п.п.');
      }
      // Прежний верх — трасса 30, фора 28: лучший 27,39 %.
      expect(bestChance(30)!, lessThan(0.28));
    });

    test('🔴 L8 труднее L7 для каждого — прежний порог 20 был слабее порога 15', () {
      final bad = [
        for (final h in refs)
          if (chance(8, h) >= chance(7, h)) '${name(h)}: L7 ${chance(7, h)} → L8 ${chance(8, h)}',
      ];
      expect(bad, isEmpty);
    });

    test('выше L30 ступень та же — граница подписана замером', () {
      expect(rollAndBankStep(9).headStart, 4);
      expect(rollAndBankStep(30).headStart, 27);
      expect(rollAndBankStep(31), rollAndBankStep(30));
      expect(rollAndBankStep(99), rollAndBankStep(30));
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
      // Условие уровня — в партии: L1 профиля kids.
      expect([d['goal'], d['bot'], d['bot_hold'], d['head_start']], [20, 'threshold', 3, 0]);
      // Мера риска — по ходам.
      expect(d['turns'], greaterThan(0));
      expect(d['bust_rate'], closeTo((d['busts'] as int) / (d['turns'] as int), 1e-12));
      if ((d['banks'] as int) > 0) {
        expect(d['mean_rolls_to_bank'], greaterThanOrEqualTo(1));
        // 🔴 Проба сохраняет, только набрав 8 и больше: записанный порог человека
        // обязан это показать — иначе мера меряет не игрока.
        expect(d['mean_bank_total'], greaterThanOrEqualTo(8));
      } else {
        expect(d['mean_rolls_to_bank'], isNull);
      }
    });

    testWidgets('🔴 фора бота видна на его дорожке и доезжает в партию', (tester) async {
      SharedPreferences.setMockInitialValues(
          {'psygames_active_profile': 'kids', 'psygames_roll_and_bank_level_kids': '12'});
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: RollAndBankScreen(state: state, seed: 4)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      expect(rollAndBankStep(12).headStart, 7);
      expect(find.textContaining(L.f('rbHeadStart', {'n': '7'})), findsOneWidget,
          reason: 'без подписи бот, стоящий впереди с первого хода, выглядит ошибкой');
    });

    testWidgets('🔴 верх лестницы: трасса 60, бот по таблице решения доигрывает партию', (tester) async {
      // Изолят в пробе до ответа не доживёт — решение считаем заранее, как его отдал бы изолят.
      RollAndBankPolicy.solved(60);
      SharedPreferences.setMockInitialValues(
          {'psygames_active_profile': 'kids', 'psygames_roll_and_bank_level_kids': '20'});
      final reports = <Map<String, dynamic>>[];
      SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(
        home: RollAndBankScreen(state: state, seed: 7, botDelay: const Duration(milliseconds: 5)),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      for (var i = 0; i < 3000 && find.byKey(const ValueKey('rb-next')).evaluate().isEmpty; i++) {
        final roll = tester.widget<FilledButton>(find.byKey(const ValueKey('rb-roll')));
        if (roll.onPressed == null) {
          await tester.pump(const Duration(milliseconds: 10));
          continue;
        }
        final bank = tester.widget<OutlinedButton>(find.byKey(const ValueKey('rb-bank')));
        final text = (tester.widget<Text>(find.descendant(of: find.byKey(const ValueKey('rb-bank')), matching: find.byType(Text))).data ?? '');
        final unbanked = int.tryParse(text.split('+').last) ?? 0;
        await tester.tap(find.byKey(ValueKey(unbanked >= 20 && bank.onPressed != null ? 'rb-bank' : 'rb-roll')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(find.byKey(const ValueKey('rb-next')), findsOneWidget, reason: 'партия не закончилась');
      final d = reports.single['details'] as Map<String, dynamic>;
      final s = rollAndBankStep(20);
      expect([d['goal'], d['bot'], d['head_start']], [60, 'solved', s.headStart]);
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

    for (final (level, key) in [(1, 'teachBankShort'), (8, 'teachBankShort'), (20, 'teachBankRule')]) {
      testWidgets('разбор L$level: второй шаг — $key (сохранять выгодно только на длинной трассе)', (tester) async {
        SharedPreferences.setMockInitialValues(
            {'psygames_active_profile': 'kids', 'psygames_roll_and_bank_level_kids': '$level'});
        final state = await SharedState.open();
        await tester.pumpWidget(MaterialApp(home: RollAndBankScreen(state: state, seed: 4)));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 20));
        await tester.tap(find.byKey(const Key('game-lesson')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        final player = tester.widget<LessonPlayerScreen>(find.byType(LessonPlayerScreen));
        expect(player.steps[1].techniqueKey, key);
        expect(player.steps[1].text, L.t(key));
      });
    }
  });
}
