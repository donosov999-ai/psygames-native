import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/switching_task/model.dart';
import 'package:psygames_flutter/games/switching_task/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/boss_probe.dart';
import 'support/slow_write_state.dart';

/// ПАРТИЯ В «ПЕРЕКЛЮЧЕНИЕ ЗАДАЧ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба читает с экрана ДВЕ вещи — плашку «ОЦЕНИ» и стимул — и отвечает по
/// ним. Поставь экрану плашку не от той задачи, и партия покраснеет: ответ,
/// верный по показанному правилу, окажется неверным по правилу пробы.
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_switching_task_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  String? textOf(Key key) {
    final e = find.byKey(key).evaluate();
    if (e.isEmpty) return null;
    return (e.first.widget as Text).data;
  }

  /// Что сейчас на экране: правило и стимул. Пусто — стимул ещё не показан.
  ({int idx, String stim})? onScreen(StimMode mode) {
    final cue = textOf(const Key('switching-cue'));
    final stim = textOf(const Key('switching-stimulus'));
    if (cue == null || stim == null || stim.isEmpty) return null;
    for (final idx in [0, 1]) {
      if (cue == '${L.t('judgeCue')}: ${taskMeta(mode, idx).cue}') return (idx: idx, stim: stim);
    }
    return null;
  }

  Future<({int idx, String stim})?> waitStim(WidgetTester tester, StimMode mode) async {
    for (var i = 0; i < 60; i++) {
      final s = onScreen(mode);
      if (s != null) return s;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return null;
  }

  /// Верный ответ по ТОМУ, ЧТО ВИДНО: правило с плашки, стимул из коробки.
  bool correctLeft(StimMode mode, int idx, String stim) {
    switch (mode) {
      case StimMode.mix:
        return judgeLeft(mode, idx, int.parse(stim[0]), stim[1]);
      case StimMode.num2:
      case StimMode.num3:
        return judgeLeft(mode, idx, int.parse(stim), '');
      case StimMode.letters:
        return judgeLeft(mode, idx, 0, stim);
    }
  }

  testWidgets('🔴 партия L1 проходится по плашке и стимулу, уровень растёт', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
    await tester.pumpAndSettle();
    expect(state.get(_levelKey), isNull, reason: 'партия начинается с первого уровня');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Стимула ещё нет: 500 мс коробка пуста, и это не «экран не загрузился».
    expect(onScreen(StimMode.mix), isNull, reason: 'стимул показан раньше паузы 500 мс');

    var switches = 0;
    for (var i = 1; i <= SwitchLevel.of(1).trials; i++) {
      final s = await waitStim(tester, StimMode.mix);
      expect(s, isNotNull, reason: 'проба $i: стимула нет');
      if (find.byKey(const Key('switching-switch-mark')).evaluate().isNotEmpty) switches++;
      final left = correctLeft(StimMode.mix, s!.idx, s.stim);
      await tester.tap(find.byKey(Key('switching-answer-${left ? 'left' : 'right'}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.pumpAndSettle();

    // Двенадцать верных из двенадцати — уровень взят.
    expect(find.textContaining('${L.t('hud_correct')}: 12/12'), findsOneWidget);
    expect(state.get(_levelKey), '2', reason: 'лестница не шагнула');
    // ⚠️ Доля переключений 0,5 — случайная, а не «через одну»: на двенадцати
    // пробах точного числа нет, есть диапазон. Ноль и двенадцать означали бы,
    // что доля не работает вовсе.
    expect(switches, greaterThan(0), reason: 'ни одной смены задачи на 12 пробах');
    expect(switches, lessThan(12), reason: 'смена в КАЖДОЙ пробе — это не 0,5');
    // Оба плеча набраны, значит цена переключения посчитана числом, а не прочерком.
    expect(textOf(const Key('switching-cost')), isNot('↻ —'));
  });

  testWidgets('🔴 просрочка окна — ошибка, и уровень не берётся', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 1; i <= SwitchLevel.of(1).trials; i++) {
      expect(await waitStim(tester, StimMode.mix), isNotNull, reason: 'проба $i: стимула нет');
      // Не жмём ничего: окно L1 — 3400 мс.
      await tester.pump(const Duration(milliseconds: 3500));
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.pumpAndSettle();
    expect(find.textContaining('${L.t('hud_correct')}: 0/12'), findsOneWidget);
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget);
    expect(state.get(_levelKey) ?? '1', '1', reason: 'уровень вырос на нуле верных');
    // Ни одного верного ответа — плеч нет, цена прочерк, а не ноль.
    expect(textOf(const Key('switching-cost')), '↻ —');
  });

  testWidgets('🔴 8 верных из 12 — уровень НЕ берётся: порог 80 %, а не «больше половины»', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // ⚠️ Расклад задан числом: 8/12 = 0,67 лежит МЕЖДУ 0,5 и 0,8. Партия «всё
    // верно» и партия «всё мимо» обе проходят при любом пороге из этой пары и
    // потому подмену порога не видят.
    for (var i = 1; i <= 12; i++) {
      final s = await waitStim(tester, StimMode.mix);
      expect(s, isNotNull, reason: 'проба $i: стимула нет');
      final left = correctLeft(StimMode.mix, s!.idx, s.stim);
      final answerLeft = i <= 8 ? left : !left;
      await tester.tap(find.byKey(Key('switching-answer-${answerLeft ? 'left' : 'right'}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.pumpAndSettle();
    expect(find.textContaining('${L.t('hud_correct')}: 8/12'), findsOneWidget);
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: '0,67 засчитано как проход');
    expect(state.get(_levelKey) ?? '1', '1', reason: 'лестница шагнула на 0,67');
  });

  testWidgets('🔴 нажатие до показа стимула не засчитывается', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 100));
    expect(onScreen(StimMode.mix), isNull);
    // Кнопки уже на экране: в веб-версии они тоже видны всю пробу.
    await tester.tap(find.byKey(const Key('switching-answer-left')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('switching-answer-right')));
    await tester.pump();
    final s = await waitStim(tester, StimMode.mix);
    expect(s, isNotNull);
    // Проба не съедена: счётчик раунда всё ещё 1/12.
    expect(find.text('1/12'), findsOneWidget, reason: 'тычок до стимула сжёг пробу');
  });

  testWidgets('🔴 режим меняет материал, а не правило: num3 судит по порогу 500', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state, mode: StimMode.num3)));
    await tester.pumpAndSettle();
    // Порог второй задачи назван числом ещё до начала — и он у num3 СВОЙ.
    // ⚠️ Проверяется именно 500: с порогом 50 строка тоже нашлась бы подстрокой,
    // поэтому ниже стоит и отрицание.
    final rules = textOf(const Key('switching-rules'))!;
    expect(rules.contains('< 500'), isTrue, reason: 'порог num3 не назван');
    expect(rules.contains('< 50/'), isFalse, reason: 'показан порог двузначного режима');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 1; i <= 4; i++) {
      final s = await waitStim(tester, StimMode.num3);
      expect(s, isNotNull, reason: 'проба $i: стимула нет');
      expect(s!.stim.length, 3, reason: 'num3 обязан показывать трёхзначное');
      final left = correctLeft(StimMode.num3, s.idx, s.stim);
      await tester.tap(find.byKey(Key('switching-answer-${left ? 'left' : 'right'}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }
    expect(find.text('5/12'), findsOneWidget, reason: 'четыре верные пробы прошли');
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
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state, clock: () => clock)));
    var answered = 0;
    for (var i = 0; i < 1600 && sent.isEmpty; i++) {
      final s = onScreen(StimMode.mix);
      if (s == null) {
        await tester.pump(const Duration(milliseconds: 50));
        continue;
      }
      clock += 500;
      await tester.tap(find.byKey(Key('switching-answer-${correctLeft(StimMode.mix, s.idx, s.stim) ? 'left' : 'right'}')));
      answered++;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
    }
    expect(answered, 15, reason: 'длина партии — шага (15), а не уровня (12)');
    final d = sent.single['details'] as Map<String, dynamic>;
    expect(d['switch_cost_ms'], 0, reason: 'все ответы за 500 мс: цена переключения — ноль, и она в партии ($d)');
    expect(d['n_trials'], 15);
  });

  testWidgets('🔴 сданную партию не сдать второй раз: нажатие, пока пишется победа, уровень не двигает', (tester) async {
    // Запись лестницы растянута до 300 мс, как канал к платформе на телефоне
    // (support/slow_write_state.dart): партия сдана, а фаза ещё «игра» и последняя проба на экране.
    SharedPreferences.setMockInitialValues({});
    state = await SlowWriteState.open();
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    late String last;
    for (var i = 0; i < SwitchLevel.of(1).trials; i++) {
      final s = (await waitStim(tester, StimMode.mix))!;
      last = 'switching-answer-${correctLeft(StimMode.mix, s.idx, s.stim) ? 'left' : 'right'}';
      await tester.tap(find.byKey(Key(last)));
      await tester.pump();
      // Отклик — 220 мс (`_after`), дальше следующая проба или сдача партии.
      await tester.pump(const Duration(milliseconds: 250));
    }
    final done = find.textContaining(L.t('levelDone').split('}').last);
    // Партия сдана 30 мс назад, победа ещё пишется: щель открыта.
    expect(onScreen(StimMode.mix), isNotNull, reason: 'щель не воспроизведена: последней пробы на экране нет');
    expect(done, findsNothing, reason: 'итог уже на экране — щели нет, проба ничего не проверяет');
    await tester.tap(find.byKey(Key(last)));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(done, findsOneWidget);
    expect(state.get(_levelKey), '2', reason: 'партия сдана дважды — уровень прыгнул через ступень');
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «впиши пропуск», на 2-м — нет', (tester) async {
    // В вебе переключение зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    // Признак взятого уровня — хвост строки «Уровень {n} пройден!»: номер у двух партий разный.
    final won = find.textContaining(L.t('levelDone').split('}').last);
    var opens = 0;
    await expectBossAfterWin(tester, won: won, hudKey: 'bossHudLightning', play: (level) async {
      SharedPreferences.setMockInitialValues({_levelKey: '$level'});
      state = await SharedState.open();
      // Свежее приложение на каждую партию: всплывшее после прошлой (карточка правила
      // нового уровня) иначе осталось бы поверх «Начать» следующей.
      await tester.pumpWidget(MaterialApp(
        key: ValueKey('app${opens += 1}'),home: SwitchingTaskScreen(state: state)));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      for (var i = 0;
          i < 1200 && won.evaluate().isEmpty && find.byKey(const Key('boss-round')).evaluate().isEmpty;
          i++) {
        final s = onScreen(StimMode.mix);
        if (s == null) {
          await tester.pump(const Duration(milliseconds: 50));
          continue;
        }
        final left = correctLeft(StimMode.mix, s.idx, s.stim);
        await tester.tap(find.byKey(Key('switching-answer-${left ? 'left' : 'right'}')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
      }
    });
  });
}
