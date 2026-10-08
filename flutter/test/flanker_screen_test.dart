import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/flanker/model.dart';
import 'package:psygames_flutter/games/flanker/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/boss_probe.dart';
import 'support/slow_write_state.dart';

/// ПАРТИЯ В «СТРЕЛКИ» ИГРАЕТСЯ НАЖАТИЯМИ, а не вызовом правил.
///
/// Проба нажимает настоящие кнопки ответа и читает то, что видно на экране:
/// центральную стрелку, отклик, счётчики каркаса. Правила через модель здесь НЕ
/// зовутся — иначе экран мог бы быть подключён к ним как угодно и проба осталась
/// бы зелёной.
///
/// 🔴 ВРЕМЯ РЕАКЦИИ — ГЛАВНОЕ ПРИ ПЕРЕЕЗДЕ. Часы подставные: между показом стимула
/// и нажатием проходит ровно заданное число миллисекунд. Между рождением пробы и
/// показом стоит подготовительный интервал 500–1100 мс, и если отсчёт начать с
/// рождения, среднее время вырастет на него — эта проба такое ловит.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    // Тексты экрана — из общего словаря, поэтому проба сверяет их через L.t():
    // так она заодно требует, чтобы assets/l10n/ru.json собрался и читался.
    await L.load('ru');
  });

  /// Куда смотрит ЦЕНТРАЛЬНАЯ стрелка — читаем с экрана, а не у модели.
  FlankerDirection centerOnScreen(WidgetTester tester) {
    final icon = tester.widget<Icon>(
      find.descendant(of: find.byKey(const Key('flanker-stimulus')), matching: find.byType(Icon)),
    );
    return icon.icon == Icons.arrow_back ? FlankerDirection.left : FlankerDirection.right;
  }

  Finder answerFor(FlankerDirection d) => find.byKey(Key('flanker-answer-${d.name}'));

  /// Подготовительный интервал не длиннее 1100 мс — переждать его хватает 1200.
  const preWait = Duration(milliseconds: 1200);

  testWidgets('🔴 партия проходится нажатиями, и в копилку времени идёт ровно то, что прошло', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: FlankerScreen(state: state, clock: () => clock, rnd: Random(7)),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    // Сразу после старта стимула ещё нет: идёт подготовительный интервал.
    expect(find.byKey(const Key('flanker-stimulus')), findsNothing,
        reason: 'стимул обязан появиться ПОСЛЕ подготовительного интервала, а не сразу');

    // Уровень 1: 20 проб, окно 3000 мс. Отвечаем верно через 450 мс после показа.
    for (var i = 0; i < 20; i++) {
      await tester.pump(preWait);
      expect(find.byKey(const Key('flanker-stimulus')), findsOneWidget, reason: 'проба ${i + 1}: нет стимула');
      clock += 450;
      await tester.tap(answerFor(centerOnScreen(tester)));
      await tester.pump();
      expect(find.byKey(const Key('flanker-hit')), findsOneWidget, reason: 'проба ${i + 1}: верный ответ не засчитан');
      await tester.pump(const Duration(milliseconds: 360));
    }
    await tester.pumpAndSettle();

    expect(find.textContaining(L.t('levelDone').split('{').first.trim()), findsOneWidget,
        reason: '20 верных из 20 — это проход');
    expect(find.textContaining('${L.t('hud_correct')}: 20/20'), findsOneWidget);
    // 🔴 Именно это число ловит сдвиг отсчёта: разность половин сдвиг сокращает, среднее — нет.
    expect(find.textContaining('${L.t('meanReaction')}: 450 ${L.t('msShort')}'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа стимула: ожидание 500–1100 мс в него попадать не должно');
    // Все пробы шли поровну, значит разность половин — ноль. Случайность задана
    // семенем, поэтому обе половины набираются в каждом прогоне, а не «обычно».
    expect(find.textContaining('${L.t('hud_interference')}: 0 ${L.t('msShort')}'), findsOneWidget);
  });

  testWidgets('🔴 нажатие ДО показа стимула не засчитывается — угадать вслепую нельзя', (tester) async {
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    await tester.tap(answerFor(FlankerDirection.left));
    await tester.pump();
    expect(find.byKey(const Key('flanker-hit')), findsNothing, reason: 'до стимула попадания быть не может');
    expect(find.byKey(const Key('flanker-wrong')), findsNothing, reason: 'и ошибкой это тоже не считается');

    // Стимул приходит своим чередом, партия продолжается.
    await tester.pump(preWait);
    expect(find.byKey(const Key('flanker-stimulus')), findsOneWidget);
  });

  testWidgets('🔴 просрочка окна — ошибка, и уровень не засчитан', (tester) async {
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Молчим всю партию: интервал ≤1100 мс, окно ответа на L1 — 3000 мс, отклик 350 мс.
    for (var i = 0; i < 20; i++) {
      await tester.pump(preWait);
      await tester.pump(const Duration(milliseconds: 3100));
      await tester.pump(const Duration(milliseconds: 360));
    }
    await tester.pumpAndSettle();
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget);
    expect(find.textContaining('${L.t('hud_correct')}: 0/20 · ${L.t('hud_errors')}: 20'), findsOneWidget,
        reason: 'каждая просрочка обязана считаться ошибкой, а не пропускаться молча');
    expect(find.textContaining('${L.t('meanReaction')}: —'), findsOneWidget);
    expect(find.textContaining('${L.t('hud_interference')}: —'), findsOneWidget,
        reason: 'без верных проб эффекта нет — ноль означал бы «конфликт не мешает»');
  });

  testWidgets('🔴 ответ не в ту сторону — ошибка, а не «мимо»', (tester) async {
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state, rnd: Random(5))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await tester.pump(preWait);

    final center = centerOnScreen(tester);
    final wrong = center == FlankerDirection.left ? FlankerDirection.right : FlankerDirection.left;
    await tester.tap(answerFor(wrong));
    await tester.pump();
    expect(find.byKey(const Key('flanker-wrong')), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 360));
    // Счётчик «Верно» каркаса остался нулём.
    expect(find.text('0'), findsWidgets);
  });

  testWidgets('🔴 шаг «Оценки»: партия в условиях шага и с метрикой домена в details', (tester) async {
    // «Оценка» читает метрику домена из details партии (assessment.ts, extractMetric): без неё
    // домен молча «средний». Условие — шага, как его собирает stepToParams (warmup.ts), а не
    // уровня: норма домена снята в нём.
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    GamePreset.set({'wu': '1', 'trials': '15'});
    addTearDown(() {
      SessionReport.sink = null;
      GamePreset.clear();
    });
    var clock = 0;
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state, clock: () => clock, rnd: Random(7))));
    final stim = find.byKey(const Key('flanker-stimulus'));
    var answered = 0;
    for (var i = 0; i < 800 && sent.isEmpty; i++) {
      if (stim.evaluate().isEmpty) {
        await tester.pump(const Duration(milliseconds: 50));
        continue;
      }
      clock += 450;
      await tester.tap(answerFor(centerOnScreen(tester)));
      answered++;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: flankerFeedbackMs + 30));
    }
    expect(answered, 15, reason: 'длина партии — шага (15), а не уровня (20)');
    final d = sent.single['details'] as Map<String, dynamic>;
    expect(d['flanker_effect_ms'], 0, reason: 'все ответы за 450 мс: помеха — ноль, и она в партии ($d)');
    expect(d['n_trials'], 15);
  });

  testWidgets('🔴 сданную партию не сдать второй раз: нажатие, пока пишется победа, уровень не двигает', (tester) async {
    // Запись лестницы растянута до 300 мс, как канал к платформе на телефоне
    // (support/slow_write_state.dart): партия сдана, а фаза ещё «игра» и последняя проба на экране.
    SharedPreferences.setMockInitialValues({});
    state = await SlowWriteState.open();
    var clock = 0;
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state, clock: () => clock, rnd: Random(7))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final stim = find.byKey(const Key('flanker-stimulus'));
    var last = FlankerDirection.left;
    for (var i = 0; i < FlankerLevel.of(1).trials; i++) {
      for (var k = 0; k < 40 && stim.evaluate().isEmpty; k++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      last = centerOnScreen(tester);
      clock += 450;
      await tester.tap(answerFor(last));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: flankerFeedbackMs + 30));
    }
    final done = find.textContaining(L.t('levelDone').split('}').last);
    // Партия сдана 30 мс назад, победа ещё пишется: щель открыта.
    expect(stim, findsOneWidget, reason: 'щель не воспроизведена: последней пробы на экране нет');
    expect(done, findsNothing, reason: 'итог уже на экране — щели нет, проба ничего не проверяет');
    await tester.tap(answerFor(last));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(done, findsOneWidget);
    expect(state.get('${SharedState.prefix}flanker_level_nzt48'), '2', reason: 'партия сдана дважды — уровень прыгнул через ступень');
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «жми / не жми», на 2-м — нет', (tester) async {
    // В вебе фланкер зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    // Признак взятого уровня — хвост строки «Уровень {n} пройден!»: номер у двух партий разный.
    final won = find.textContaining(L.t('levelDone').split('}').last);
    var opens = 0;
    var clock = 0;
    await expectBossAfterWin(tester, won: won, hudKey: 'bossHudGonogo', play: (level) async {
      SharedPreferences.setMockInitialValues({'${SharedState.prefix}flanker_level_nzt48': '$level'});
      state = await SharedState.open();
      // Свежее приложение на каждую партию: всплывшее после прошлой (карточка правила
      // нового уровня) иначе осталось бы поверх «Начать» следующей.
      await tester.pumpWidget(MaterialApp(
        key: ValueKey('app${opens += 1}'),
        home: FlankerScreen(state: state, clock: () => clock, rnd: Random(7)),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      for (var i = 0;
          i < 60 && won.evaluate().isEmpty && find.byKey(const Key('boss-round')).evaluate().isEmpty;
          i++) {
        await tester.pump(preWait);
        if (find.byKey(const Key('flanker-stimulus')).evaluate().isEmpty) continue;
        clock += 450;
        await tester.tap(answerFor(centerOnScreen(tester)));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 360));
      }
    });
  });
}
