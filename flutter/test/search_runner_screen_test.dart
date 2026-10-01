// Раннер «Поиска» играется НАЖАТИЯМИ: тап по половине дороги — соседняя полоса.
//
// Верную полосу проба берёт из той же раздачи, что у экрана (одно зерно — один уровень),
// а жмёт экран так же, как человек. Время двигает pump — без runAsync: таймеры и тикер
// в пробах про время обязаны жить в поддельном времени.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/search_runner/level.dart';
import 'package:psygames_flutter/games/search_runner/screen.dart';
import 'package:psygames_flutter/shell/boss_round.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedState state;
  var opens = 0;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester, {int level = 1, int seed = 7, Size? screen}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}search_runner_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: SearchRunnerScreen(key: ValueKey('open${opens += 1}'), state: state, seed: seed),
    ));
    await tester.pump();
    await tester.pump();
  }

  Future<void> tapLane(WidgetTester tester, int d) async {
    final r = tester.getRect(find.byKey(const Key('runner-road')));
    await tester.tapAt(Offset(d < 0 ? r.left + r.width * 0.2 : r.right - r.width * 0.2, r.center.dy));
    await tester.pump();
  }

  /// Проезжает уровень: перед каждым рядом ставит машину в полосу [pick] (−1/0/1).
  Future<void> drive(WidgetTester tester, SearchLevel lv, int Function(int row) pick) async {
    await tester.tap(find.byKey(const Key('runner-start')));
    await tester.pump();
    var lane = 0;
    var t = 0.0;
    for (var i = 0; i < lv.rows.length; i += 1) {
      final want = pick(i);
      while (lane != want) {
        final d = want > lane ? 1 : -1;
        await tapLane(tester, d);
        lane += d;
      }
      // До пересечения ряда — шагами по 50 мс (кадр короче догона, не «долгий»).
      final cross = lv.course.rows[i].z / searchSpeed + 0.05;
      while (t < cross) {
        await tester.pump(const Duration(milliseconds: 50));
        t += 0.05;
      }
    }
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('🔴 уровень проезжается нажатиями: все звёзды — уровень взят', (tester) async {
    await open(tester);
    final lv = makeSearchLevel(1, 7);
    await drive(tester, lv, (i) => lv.rows[i].answer - 1);
    expect(find.byKey(const Key('runner-result')), findsOneWidget, reason: 'уровень не закончился');
    expect(find.textContaining(L.t('nextLabel')), findsWidgets, reason: 'все ряды верно — уровень взят');
    expect(tester.widget<Text>(find.byKey(const Key('runner-result'))).data,
        contains('${lv.rows.length}/${lv.rows.length}'), reason: 'в итоге не «найдено все»');
    expect(tester.widget<Text>(find.byKey(const Key('runner-result'))).data, contains('${L.t('goalLabel')} ${lv.needed}'),
        reason: 'в итоге не названа цель — порог');
  });

  testWidgets('🔴 стоящий на средней полосе уровень не берёт — порог 70 %', (tester) async {
    await open(tester, seed: 11);
    final lv = makeSearchLevel(1, 11);
    await drive(tester, lv, (_) => 0);
    expect(find.byKey(const Key('runner-result')), findsOneWidget);
    expect(find.textContaining(L.t('retry')), findsWidgets, reason: 'стоящий на месте прошёл уровень');
  });

  testWidgets('🔴 ответ — полоса на пересечении: машина едет вбок не мгновенно', (tester) async {
    // Смена полосы за 0,1 с до ряда не успевает: машина в средней полосе на пересечении.
    await open(tester, seed: 3);
    final lv = makeSearchLevel(1, 3);
    final first = lv.rows.first.answer - 1;
    await tester.tap(find.byKey(const Key('runner-start')));
    await tester.pump();
    final cross = lv.course.rows.first.z / searchSpeed;
    var t = 0.0;
    while (t < cross - 0.1) {
      await tester.pump(const Duration(milliseconds: 50));
      t += 0.05;
    }
    if (first != 0) await tapLane(tester, first);
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
    final arch = find.byKey(Key('arch-0-${first != 0 ? 1 : 0}'));
    final box = tester.widget<Container>(find.descendant(of: arch, matching: find.byType(Container)).first);
    final border = (box.decoration as BoxDecoration).border as Border;
    expect(border.top.width, 3, reason: 'проезд первого ряда не отмечен на арке средней полосы');
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «найди», на 2-м — нет', (tester) async {
    await open(tester, level: 3, seed: 5);
    final lv3 = makeSearchLevel(3, 5);
    await drive(tester, lv3, (i) => lv3.rows[i].answer - 1);
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const Key('boss-round')), findsOneWidget, reason: 'после победы на 3-м уровне боя нет');
    await tester.pump(BossRound.introTime);
    expect(tester.widget<Text>(find.byKey(const Key('boss-hud'))).data, '⚔️ ${L.t('bossHudGonogo')}');
    await tester.pump(const Duration(seconds: BossRound.roundSeconds + 1));
    await tester.pump(BossRound.doneTime);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('boss-outcome')), findsOneWidget);

    await open(tester, level: 2, seed: 5);
    final lv2 = makeSearchLevel(2, 5);
    await drive(tester, lv2, (i) => lv2.rows[i].answer - 1);
    await tester.pump(const Duration(seconds: 3));
    expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'бой после 2-го уровня');
    expect(find.textContaining(L.t('nextLabel')), findsWidgets);
  });

  testWidgets('станции на месте: ворота (L4), окна (L7), трекер со стартом и кольцами (L10)', (tester) async {
    for (final (level, kind) in [(4, GatesRow), (7, WindowsRow), (10, TrackerRow)]) {
      await open(tester, level: level, seed: 2);
      final lv = makeSearchLevel(level, 2);
      final first = lv.rows.indexWhere((r) => r.runtimeType == kind);
      expect(first, greaterThan(0), reason: 'L$level: станции нет');
      await tester.tap(find.byKey(const Key('runner-start')));
      await tester.pump();
      // Доезжаем до ряда перед станцией (для трекера — до старта слежения).
      final row = lv.rows[first];
      final stopZ = row is TrackerRow ? row.startZ + searchSpeed * 0.5 : lv.course.rows[first - 1].z + 2;
      var t = 0.0;
      while (t < stopZ / searchSpeed) {
        await tester.pump(const Duration(milliseconds: 50));
        t += 0.05;
      }
      if (row is TrackerRow) {
        expect(find.byKey(const Key('runner-tracker')), findsOneWidget, reason: 'слежение не началось');
        // Движение и остановка: кольца появляются после показа и движения.
        final end = (row.startZ / searchSpeed) + (trackerFlashMs + row.round.durationMs) / 1000 + 0.1;
        while (t < end) {
          await tester.pump(const Duration(milliseconds: 50));
          t += 0.05;
        }
        expect(find.byKey(Key('arch-$first-0')), findsOneWidget, reason: 'арки ответа не видны после слежения');
      } else {
        expect(find.byKey(const Key('runner-ask')), findsOneWidget, reason: 'L$level: вопроса станции нет');
        expect(find.byKey(Key('arch-$first-0')), findsOneWidget, reason: 'L$level: арки станции не подъехали');
      }
    }
  });

  testWidgets('🔴 раскладка: вывеска и дорога внутри поля — 360×640 и 390×844', (tester) async {
    for (final screen in const [Size(360, 640), Size(390, 844)]) {
      for (final level in [1, 7, 10]) {
        await open(tester, level: level, seed: 4, screen: screen);
        await tester.tap(find.byKey(const Key('runner-start')));
        await tester.pump();
        await tester.pump(const Duration(seconds: 3));
        final field = tester.getRect(find.byKey(const Key('game-field')));
        for (final key in ['runner-sign', 'runner-road', 'runner-car']) {
          final r = tester.getRect(find.byKey(Key(key)));
          expect(r.top >= field.top - 0.5 && r.bottom <= field.bottom + 0.5, isTrue,
              reason: '$key вылез из поля на $screen L$level: $r при поле $field');
        }
        // Арка не меньше пальца и не шире своей полосы.
        final road = tester.getRect(find.byKey(const Key('runner-road')));
        for (final e in find.byWidgetPredicate((w) => w.key is ValueKey<String> &&
            (w.key as ValueKey<String>).value.startsWith('arch-')).evaluate()) {
          final r = tester.getRect(find.byWidget(e.widget));
          expect(r.width >= 48 && r.height >= 48, isTrue, reason: 'арка мельче пальца: $r');
          expect(r.left >= road.left - 0.5 && r.right <= road.right + 0.5, isTrue, reason: 'арка шире дороги: $r');
        }
      }
    }
  });

  testWidgets('разбор: правило игры и приём каждой станции на её же вывеске и арках', (tester) async {
    await open(tester, level: 1, seed: 9);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.textContaining(L.t('searchRunnerDesc').substring(0, 30)), findsWidgets,
        reason: 'первый шаг разбора — не правило игры');
    expect(L.t('teachRunnerGates'), isNot('teachRunnerGates'), reason: 'приём ворот не собран в словарь');
    expect(L.t('teachRunnerWindows'), isNot('teachRunnerWindows'), reason: 'приём окон не собран в словарь');
  });
}
