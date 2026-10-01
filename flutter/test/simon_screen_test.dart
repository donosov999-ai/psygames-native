import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/simon/model.dart';
import 'package:psygames_flutter/games/simon/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';
import 'support/slow_write_state.dart';

/// ПАРТИЯ В «ЦВЕТ ПРОТИВ ПОЗИЦИИ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// Проба читает с экрана ЦВЕТ квадрата и сторону, где он вспыхнул, и жмёт кнопку
/// по правилу цвета. Правила через модель не зовутся.
///
/// 🔴 Часы подставные: между показом стимула и нажатием проходит ровно заданное
/// число миллисекунд. Между рождением пробы и показом стоит пауза 500–1100 мс на
/// L1 — если отсчёт начать с рождения, среднее время вырастет на неё.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    // Тексты экрана — из общего словаря, поэтому проба сверяет их через L.t():
    // так она заодно требует, чтобы assets/l10n/ru.json собрался и читался.
    await L.load('ru');
  });

  /// Квадрат стимула на экране: его цвет и сторона.
  ({SimonColor color, SimonSide side}) stimulus(WidgetTester tester) {
    final box = tester.widgetList<Container>(find.byWidgetPredicate(
      (w) => w is Container && w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('simon-stimulus-'),
    )).single;
    final side = (box.key! as ValueKey<String>).value.endsWith('left') ? SimonSide.left : SimonSide.right;
    final color = (box.decoration! as BoxDecoration).color!;
    final blue = Color(int.parse(simonBlueHex.substring(1), radix: 16) | 0xFF000000);
    return (color: color == blue ? SimonColor.blue : SimonColor.red, side: side);
  }

  Finder answerFor(SimonSide s) => find.byKey(Key('simon-answer-${s.name}'));
  bool stimulusVisible() => find
      .byWidgetPredicate((w) =>
          w is Container && w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('simon-stimulus-'))
      .evaluate()
      .isNotEmpty;

  /// Пауза перед стимулом на L1 — не длиннее 1100 мс.
  const preWait = Duration(milliseconds: 1200);

  testWidgets('🔴 партия проходится нажатиями по ЦВЕТУ, а сторона вспышки на ответ не влияет', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(home: SimonScreen(state: state, clock: () => clock, rnd: Random(7))));
    await tester.pumpAndSettle();

    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(stimulusVisible(), isFalse, reason: 'стимул обязан появиться ПОСЛЕ паузы, а не сразу');

    var conflicts = 0;
    for (var i = 0; i < 16; i++) {
      await tester.pump(preWait);
      expect(stimulusVisible(), isTrue, reason: 'проба ${i + 1}: нет стимула');
      final s = stimulus(tester);
      if (s.side != correctSide(s.color)) conflicts += 1;
      clock += 430;
      // Жмём по ЦВЕТУ. Если экран подключён к стороне вспышки, конфликтные пробы покраснеют.
      await tester.tap(answerFor(correctSide(s.color)));
      await tester.pump();
      expect(find.byKey(const Key('simon-hit')), findsOneWidget, reason: 'проба ${i + 1}: верный ответ не засчитан');
      await tester.pump(const Duration(milliseconds: 360));
    }
    await tester.pumpAndSettle();

    expect(conflicts > 0, isTrue, reason: 'без конфликтных проб партия ничего не мерила бы');
    expect(find.textContaining(L.t('levelDone').split('{').first.trim()), findsOneWidget);
    expect(find.textContaining('${L.t('hud_correct')}: 16/16'), findsOneWidget);
    expect(find.textContaining('${L.t('meanReaction')}: 430 ${L.t('msShort')}'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа стимула');
    expect(find.textContaining('${L.t('hud_interference')}: 0 ${L.t('msShort')}'), findsOneWidget,
        reason: 'все пробы шли поровну — разность половин ноль');
  });

  testWidgets('🔴 ответ по СТОРОНЕ вспышки, а не по цвету — ошибка', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SimonScreen(state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Идём по пробам, пока не встретим конфликтную, и жмём сторону вспышки.
    for (var i = 0; i < 16; i++) {
      await tester.pump(preWait);
      final s = stimulus(tester);
      if (s.side != correctSide(s.color)) {
        await tester.tap(answerFor(s.side));
        await tester.pump();
        expect(find.byKey(const Key('simon-wrong')), findsOneWidget,
            reason: 'сторона вспышки — помеха, а не ответ');
        return;
      }
      await tester.tap(answerFor(correctSide(s.color)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 360));
    }
    fail('за 16 проб не встретилось ни одной конфликтной — проверять было нечего');
  });

  testWidgets('🔴 просрочка окна — ошибка, и уровень не засчитан', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SimonScreen(state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Молчим всю партию: пауза ≤1100 мс, окно на L1 — 2600 мс, отклик 350 мс.
    for (var i = 0; i < 16; i++) {
      await tester.pump(preWait);
      await tester.pump(const Duration(milliseconds: 2700));
      await tester.pump(const Duration(milliseconds: 360));
    }
    await tester.pumpAndSettle();
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget);
    expect(find.textContaining('${L.t('hud_correct')}: 0/16 · ${L.t('hud_errors')}: 16'), findsOneWidget);
    expect(find.textContaining('${L.t('meanReaction')}: —'), findsOneWidget);
  });

  testWidgets('🔴 сданную партию не сдать второй раз: нажатие, пока пишется победа, уровень не двигает', (tester) async {
    // Запись лестницы растянута до 300 мс, как канал к платформе на телефоне
    // (support/slow_write_state.dart): партия сдана, а фаза ещё «игра» и последняя проба на экране.
    SharedPreferences.setMockInitialValues({});
    state = await SlowWriteState.open();
    var clock = 0;
    await tester.pumpWidget(MaterialApp(home: SimonScreen(state: state, clock: () => clock, rnd: Random(7))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    var last = SimonSide.left;
    for (var i = 0; i < SimonLevel.of(1).trials; i++) {
      for (var k = 0; k < 40 && !stimulusVisible(); k++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      last = correctSide(stimulus(tester).color);
      clock += 430;
      await tester.tap(answerFor(last));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: simonFeedbackMs + 30));
    }
    final done = find.textContaining(L.t('levelDone').split('}').last);
    // Партия сдана 30 мс назад, победа ещё пишется: щель открыта.
    expect(stimulusVisible(), isTrue, reason: 'щель не воспроизведена: последней пробы на экране нет');
    expect(done, findsNothing, reason: 'итог уже на экране — щели нет, проба ничего не проверяет');
    await tester.tap(answerFor(last));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(done, findsOneWidget);
    expect(state.get('${SharedState.prefix}simon_level_nzt48'), '2', reason: 'партия сдана дважды — уровень прыгнул через ступень');
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «жми / не жми», на 2-м — нет', (tester) async {
    // В вебе Саймон зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    // Признак взятого уровня — хвост строки «Уровень {n} пройден!»: номер у двух партий разный.
    final won = find.textContaining(L.t('levelDone').split('}').last);
    var opens = 0;
    var clock = 0;
    await expectBossAfterWin(tester, won: won, hudKey: 'bossHudGonogo', play: (level) async {
      SharedPreferences.setMockInitialValues({'${SharedState.prefix}simon_level_nzt48': '$level'});
      state = await SharedState.open();
      // Свежее приложение на каждую партию: всплывшее после прошлой (карточка правила
      // нового уровня) иначе осталось бы поверх «Начать» следующей.
      await tester.pumpWidget(MaterialApp(
        key: ValueKey('app${opens += 1}'),
        home: SimonScreen(state: state, clock: () => clock, rnd: Random(7)),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      for (var i = 0;
          i < 600 && won.evaluate().isEmpty && find.byKey(const Key('boss-round')).evaluate().isEmpty;
          i++) {
        if (!stimulusVisible()) {
          await tester.pump(const Duration(milliseconds: 100));
          continue;
        }
        clock += 430;
        await tester.tap(answerFor(correctSide(stimulus(tester).color)));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 360));
      }
    });
  });
}
