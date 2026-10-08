import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/choice_rt/model.dart';
import 'package:psygames_flutter/games/choice_rt/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';
import 'support/slow_write_state.dart';

/// ПАРТИЯ В «ВЫБОР-РЕАКЦИЮ» ИГРАЕТСЯ НАЖАТИЯМИ ПО КРЕСТОВИНЕ.
///
/// 🔴 Главное свойство экрана, которое проба обязана стеречь: крестовина держит
/// ВСЕ ЧЕТЫРЕ позиции всегда, неактивные — пустыми. Сломается это — в наклон Хика
/// влезет закон Фиттса, и мера перестанет быть мерой.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  bool shown(String name) => find.byKey(Key('choicert-stim-$name')).evaluate().isNotEmpty;
  bool neutralShown() => find.byKey(const Key('choicert-neutral')).evaluate().isNotEmpty;

  /// Ждём событие на экране, а не отсчитываем миллисекунды: подготовительный
  /// интервал случайный (600–1800 мс).
  Future<void> waitStimulus(WidgetTester tester) async {
    for (var i = 0; i < 80; i++) {
      if (neutralShown() || ChoiceDirection.values.any((d) => shown(d.name))) return;
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Ждём ОТКЛИК на экране. ⚠️ Стимул после закрытия пробы остаётся видимым до
  /// следующей пробы, поэтому «исчез стимул» здесь не признак конца — признак
  /// это сам значок отклика.
  Future<bool> waitFlash(WidgetTester tester, String key) async {
    for (var i = 0; i < 140; i++) {
      if (find.byKey(Key(key)).evaluate().isNotEmpty) return true;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return false;
  }

  Future<void> waitTrialEnd(WidgetTester tester) async {
    for (var i = 0; i < 120; i++) {
      if (!neutralShown() && !ChoiceDirection.values.any((d) => shown(d.name))) return;
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('🔴 крестовина держит все четыре позиции: неактивные — пустыми', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: ChoiceRtScreen(state: state, rnd: Random(5)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await waitStimulus(tester);

    // L1: живых направления два (влево-вправо), значит две кнопки и два пустых места.
    expect(find.byKey(const Key('choicert-answer-left')), findsOneWidget);
    expect(find.byKey(const Key('choicert-answer-right')), findsOneWidget);
    expect(find.byKey(const Key('choicert-answer-up')), findsNothing);
    expect(find.byKey(const Key('choicert-empty')), findsNWidgets(2),
        reason: 'неактивные направления обязаны занимать место, иначе расстояние до живых кнопок поедет');

    // Расстояние от центра поля до каждой живой кнопки одинаково — это и есть
    // то самое свойство, ради которого пустые места стоят на своих местах.
    final left = tester.getCenter(find.byKey(const Key('choicert-answer-left')));
    final right = tester.getCenter(find.byKey(const Key('choicert-answer-right')));
    expect((left.dy - right.dy).abs() < 1, isTrue, reason: 'живые кнопки стоят на одной линии');
  });

  testWidgets('🔴 партия проходится нажатиями, время реакции — ровно то, что прошло', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: ChoiceRtScreen(state: state, clock: () => clock, rnd: Random(9)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    var neutrals = 0;
    var answered = 0;
    for (var i = 0; i < 12; i++) {
      await waitStimulus(tester);
      final dir = ChoiceDirection.values.where((d) => shown(d.name)).toList();
      if (dir.isEmpty) {
        // Нейтраль: правило запрещает жать — молчим и ждём конца окна.
        expect(neutralShown(), isTrue, reason: 'проба ${i + 1}: на экране нет ни знака, ни нейтрали');
        neutrals += 1;
        expect(await waitFlash(tester, 'choicert-held'), isTrue,
            reason: 'молчание на нейтрали — верный ответ');
        await tester.pump(const Duration(milliseconds: 400));
        continue;
      }
      clock += 460;
      await tester.tap(find.byKey(Key('choicert-answer-${dir.first.name}')));
      await tester.pump();
      expect(find.byKey(const Key('choicert-hit')), findsOneWidget, reason: 'проба ${i + 1}: не засчитано');
      answered += 1;
      await tester.pump(const Duration(milliseconds: 400));
    }
    for (var i = 0; i < 80; i++) {
      if (find.textContaining(L.t('meanReaction')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(answered > 0, isTrue, reason: 'без направлений партия ничего не мерила бы');
    expect(find.textContaining(L.t('levelDone').split('{').first.trim()), findsOneWidget,
        reason: 'ни одной ошибки — это проход');
    expect(find.textContaining('${L.t('meanReaction')}: 460 ${L.t('msShort')}'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа знака, а не от рождения пробы');
    expect(neutrals >= 0, isTrue);
  });

  testWidgets('🔴 нажатие на нейтраль — ложная тревога', (tester) async {
    await tester.pumpWidget(MaterialApp(home: ChoiceRtScreen(state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 0; i < 12; i++) {
      await waitStimulus(tester);
      if (neutralShown()) {
        await tester.tap(find.byKey(const Key('choicert-answer-left')));
        await tester.pump();
        expect(find.byKey(const Key('choicert-false-alarm')), findsOneWidget,
            reason: 'жать на нейтрали запрещено правилом');
        return;
      }
      await waitTrialEnd(tester);
      await tester.pump(const Duration(milliseconds: 400));
    }
    fail('за 12 проб нейтраль не выпала — проверять было нечего');
  });

  testWidgets('🔴 сданную партию не сдать второй раз: нажатие, пока пишется победа, уровень не двигает', (tester) async {
    // Запись лестницы растянута до 300 мс, как канал к платформе на телефоне
    // (support/slow_write_state.dart): партия сдана, а фаза ещё «игра» и последняя проба на экране.
    SharedPreferences.setMockInitialValues({});
    state = await SlowWriteState.open();
    var clock = 0;
    await tester.pumpWidget(MaterialApp(home: ChoiceRtScreen(state: state, clock: () => clock, rnd: Random(9))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    for (var i = 0; i < ChoiceRtLevel.of(1).trials; i++) {
      await waitStimulus(tester);
      final dir = ChoiceDirection.values.where((d) => shown(d.name)).toList();
      if (dir.isEmpty) {
        // Нейтраль: молчим до отклика «удержал» — окно вышло, проба закрыта.
        for (var k = 0; k < 600 && find.byKey(const Key('choicert-held')).evaluate().isEmpty; k++) {
          await tester.pump(const Duration(milliseconds: 10));
        }
      } else {
        clock += 460;
        await tester.tap(find.byKey(Key('choicert-answer-${dir.first.name}')));
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: choiceRtFeedbackMs + 30));
    }
    final done = find.textContaining(L.t('levelDone').split('}').last);
    // Партия сдана 30 мс назад, победа ещё пишется: щель открыта.
    expect(neutralShown() || ChoiceDirection.values.any((d) => shown(d.name)), isTrue, reason: 'щель не воспроизведена: последней пробы на экране нет');
    expect(done, findsNothing, reason: 'итог уже на экране — щели нет, проба ничего не проверяет');
    await tester.tap(find.byKey(const Key('choicert-answer-left')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(done, findsOneWidget);
    expect(state.get('${SharedState.prefix}choice_rt_level_nzt48'), '2', reason: 'партия сдана дважды — уровень прыгнул через ступень');
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «жми / не жми», на 2-м — нет', (tester) async {
    // В вебе выбор-реакция зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    // Признак взятого уровня — хвост строки «Уровень {n} пройден!»: номер у двух партий разный.
    final won = find.textContaining(L.t('levelDone').split('}').last);
    bool bossOpen() => find.byKey(const Key('boss-round')).evaluate().isNotEmpty;
    List<ChoiceDirection> signs() => ChoiceDirection.values.where((d) => shown(d.name)).toList();
    var opens = 0;
    var clock = 0;
    await expectBossAfterWin(tester, won: won, hudKey: 'bossHudGonogo', play: (level) async {
      SharedPreferences.setMockInitialValues({'${SharedState.prefix}choice_rt_level_nzt48': '$level'});
      state = await SharedState.open();
      // Свежее приложение на каждую партию: всплывшее после прошлой (карточка правила
      // нового уровня) иначе осталось бы поверх «Начать» следующей.
      await tester.pumpWidget(MaterialApp(
        key: ValueKey('app${opens += 1}'),
        home: ChoiceRtScreen(state: state, clock: () => clock, rnd: Random(9)),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      for (var i = 0; i < 1500 && won.evaluate().isEmpty && !bossOpen(); i++) {
        final dir = signs();
        if (dir.isEmpty) {
          // Подготовка или нейтраль: молчать — верный ответ, ждём следующую пробу.
          await tester.pump(const Duration(milliseconds: 50));
          continue;
        }
        clock += 460;
        await tester.tap(find.byKey(Key('choicert-answer-${dir.first.name}')));
        await tester.pump();
        // ⚠️ Знак остаётся на экране до рождения следующей пробы — ждём, пока он уйдёт.
        for (var k = 0; k < 120 && signs().isNotEmpty && !bossOpen() && won.evaluate().isEmpty; k++) {
          await tester.pump(const Duration(milliseconds: 50));
        }
      }
    });
  });
}
