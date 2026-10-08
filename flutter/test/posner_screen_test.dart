import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/posner/model.dart';
import 'package:psygames_flutter/games/posner/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/boss_probe.dart';
import 'support/slow_write_state.dart';

/// ПАРТИЯ В «ПОЗИЦИЮ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба читает с экрана, в какой рамке появилась МИШЕНЬ, и жмёт ту сторону.
/// Подсказка при этом может показывать в другую — если экран начнёт принимать
/// ответ «по подсказке», партия покраснеет на обманных пробах.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  PosnerSide? targetOnScreen() {
    for (final s in PosnerSide.values) {
      if (find.byKey(Key('posner-target-${s.name}')).evaluate().isNotEmpty) return s;
    }
    return null;
  }

  /// Ждём событие на экране: паузы (до подсказки и SOA) случайные.
  Future<void> waitTarget(WidgetTester tester) async {
    for (var i = 0; i < 80; i++) {
      if (targetOnScreen() != null) return;
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<bool> waitFlash(WidgetTester tester, String key) async {
    for (var i = 0; i < 120; i++) {
      if (find.byKey(Key(key)).evaluate().isNotEmpty) return true;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return false;
  }

  testWidgets('🔴 партия проходится нажатиями ПО МИШЕНИ, а не по подсказке', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: PosnerScreen(state: state, clock: () => clock, rnd: Random(7)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(targetOnScreen(), isNull, reason: 'мишень обязана появиться ПОСЛЕ подсказки и паузы');

    for (var i = 0; i < 24; i++) {
      await waitTarget(tester);
      final side = targetOnScreen();
      expect(side, isNotNull, reason: 'проба ${i + 1}: мишени нет');
      clock += 420;
      await tester.tap(find.byKey(Key('posner-answer-${side!.name}')));
      await tester.pump();
      expect(find.byKey(const Key('posner-hit')), findsOneWidget, reason: 'проба ${i + 1}: не засчитано');
      await tester.pump(const Duration(milliseconds: 400));
    }
    for (var i = 0; i < 80; i++) {
      if (find.textContaining(L.t('meanReaction')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(find.textContaining(L.t('levelDone').split('{').first.trim()), findsOneWidget,
        reason: '24 верных из 24 — это проход');
    expect(find.textContaining('${L.t('meanReaction')}: 420 ${L.t('msShort')}'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа мишени');
    // Все пробы шли поровну, поэтому разность половин — ноль, а не прочерк:
    // при случайности с семенем в 24 пробах встречаются и валидные, и обманные.
    expect(find.textContaining('${L.t('hud_cueGain')}: 0 ${L.t('msShort')}'), findsOneWidget);
  });

  testWidgets('🔴 ответ в сторону ПОДСКАЗКИ на обманной пробе — ошибка', (tester) async {
    await tester.pumpWidget(MaterialApp(home: PosnerScreen(state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 0; i < 24; i++) {
      await waitTarget(tester);
      final side = targetOnScreen()!;
      final other = side == PosnerSide.left ? PosnerSide.right : PosnerSide.left;
      // Жмём НЕ туда, где мишень: ровно то, что делает человек, доверившийся обману.
      if (i == 0) {
        await tester.tap(find.byKey(Key('posner-answer-${other.name}')));
        await tester.pump();
        expect(await waitFlash(tester, 'posner-wrong'), isTrue);
        return;
      }
    }
    fail('мишень ни разу не появилась — проверять было нечего');
  });

  testWidgets('🔴 молчание всю партию: пропуски считаются, уровень не засчитан', (tester) async {
    await tester.pumpWidget(MaterialApp(home: PosnerScreen(state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    for (var i = 0; i < 24; i++) {
      await waitTarget(tester);
      await tester.pump(const Duration(milliseconds: 2300));
      await tester.pump(const Duration(milliseconds: 400));
    }
    for (var i = 0; i < 80; i++) {
      if (find.textContaining(L.t('meanReaction')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget);
    expect(find.textContaining('${L.t('hud_correct')}: 0/24'), findsOneWidget);
    expect(find.textContaining('${L.t('meanReaction')}: —'), findsOneWidget);
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
    await tester.pumpWidget(MaterialApp(home: PosnerScreen(state: state, clock: () => clock, rnd: Random(7))));
    var answered = 0;
    for (var i = 0; i < 1600 && sent.isEmpty; i++) {
      final side = targetOnScreen();
      if (side == null) {
        await tester.pump(const Duration(milliseconds: 50));
        continue;
      }
      clock += 420;
      await tester.tap(find.byKey(Key('posner-answer-${side.name}')));
      answered++;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: posnerFeedbackMs + 30));
    }
    expect(answered, 15, reason: 'длина партии — шага (15), а не уровня (24)');
    final d = sent.single['details'] as Map<String, dynamic>;
    expect(d['validity_effect_ms'], 0, reason: 'все ответы за 420 мс: выигрыш подсказки — ноль, и он в партии ($d)');
    expect(d['n_trials'], 15);
  });

  testWidgets('🔴 сданную партию не сдать второй раз: нажатие, пока пишется победа, уровень не двигает', (tester) async {
    // Запись лестницы растянута до 300 мс, как канал к платформе на телефоне
    // (support/slow_write_state.dart): партия сдана, а фаза ещё «игра» и последняя проба на экране.
    SharedPreferences.setMockInitialValues({});
    state = await SlowWriteState.open();
    var clock = 0;
    await tester.pumpWidget(MaterialApp(home: PosnerScreen(state: state, clock: () => clock, rnd: Random(7))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    var last = PosnerSide.left;
    for (var i = 0; i < PosnerLevel.of(1).trials; i++) {
      await waitTarget(tester);
      last = targetOnScreen()!;
      clock += 420;
      await tester.tap(find.byKey(Key('posner-answer-${last.name}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: posnerFeedbackMs + 30));
    }
    final done = find.textContaining(L.t('levelDone').split('}').last);
    // Партия сдана 30 мс назад, победа ещё пишется: щель открыта.
    expect(targetOnScreen(), isNotNull, reason: 'щель не воспроизведена: последней пробы на экране нет');
    expect(done, findsNothing, reason: 'итог уже на экране — щели нет, проба ничего не проверяет');
    await tester.tap(find.byKey(Key('posner-answer-${last.name}')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(done, findsOneWidget);
    expect(state.get('${SharedState.prefix}posner_level_nzt48'), '2', reason: 'партия сдана дважды — уровень прыгнул через ступень');
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «жми / не жми», на 2-м — нет', (tester) async {
    // В вебе Позиция зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    // Признак взятого уровня — хвост строки «Уровень {n} пройден!»: номер у двух партий разный.
    final won = find.textContaining(L.t('levelDone').split('}').last);
    var opens = 0;
    var clock = 0;
    await expectBossAfterWin(tester, won: won, hudKey: 'bossHudGonogo', play: (level) async {
      SharedPreferences.setMockInitialValues({'${SharedState.prefix}posner_level_nzt48': '$level'});
      state = await SharedState.open();
      // Свежее приложение на каждую партию: всплывшее после прошлой (карточка правила
      // нового уровня) иначе осталось бы поверх «Начать» следующей.
      await tester.pumpWidget(MaterialApp(
        key: ValueKey('app${opens += 1}'),
        home: PosnerScreen(state: state, clock: () => clock, rnd: Random(7)),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      for (var i = 0;
          i < 1200 && won.evaluate().isEmpty && find.byKey(const Key('boss-round')).evaluate().isEmpty;
          i++) {
        final side = targetOnScreen();
        if (side == null) {
          await tester.pump(const Duration(milliseconds: 50));
          continue;
        }
        clock += 420;
        await tester.tap(find.byKey(Key('posner-answer-${side.name}')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
      }
    });
  });
}
