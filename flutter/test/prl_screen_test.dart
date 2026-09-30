import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/prl/model.dart';
import 'package:psygames_flutter/games/prl/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В PRL ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба НЕ знает, какая карточка «хорошая», — как и человек. Она играет по
/// исходам: держится за выбор, пока награждают, и уходит после наказания.
/// Именно так и задумана сама методика.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_prl_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  int liveBank() {
    final t = find.byKey(const Key('prl-live-bank')).evaluate().first.widget as Text;
    return int.parse(t.data!.split(': ').last);
  }

  bool rewardShown() => find.byKey(const Key('prl-reward')).evaluate().isNotEmpty;

  testWidgets('🔴 правило названо ДО первой пробы, а не с какого-то уровня', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: PrlScreen(key: const ValueKey('r'), state: state, rnd: Random(2))));
    await tester.pumpAndSettle();
    // Отчёт 15.08.2026: «Как угадать???? Что за тупая игра». Игра, смысл
    // которой не назван, читается как издевательство.
    expect(find.byKey(const Key('prl-rule')), findsOneWidget, reason: 'правило не названо на первом уровне');
    expect(find.text(L.t('lr_prl_reversal_title')), findsOneWidget);
    expect(find.byKey(const Key('prl-params')), findsOneWidget);
  });

  testWidgets('🔴 партия играется по ИСХОДАМ и доходит до конца', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: PrlScreen(key: const ValueKey('p'), state: state, rnd: Random(5))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(liveBank(), 0);

    // Стратегия «win-stay / lose-shift»: держусь, пока награждают; ухожу после
    // наказания. Правило с экрана не читается вовсе.
    var pick = Choice.a;
    var rewards = 0, punishes = 0;
    final total = PrlLevel.of(1).trialsTotal;
    for (var i = 1; i <= total; i++) {
      await tester.tap(find.byKey(Key('prl-choice-${pick.name}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));
      expect(find.byKey(const Key('prl-waiting')), findsNothing, reason: 'проба $i: исход не показан');
      final good = rewardShown();
      if (good) {
        rewards++;
      } else {
        // ⚠️ Наказание обязано иметь СВОЙ значок. Пока проверялась только
        // награда, «рисовать всегда плюс» проходило: человек не отличал бы
        // выигрыш от проигрыша и играть не мог бы вовсе.
        expect(find.byKey(const Key('prl-punish')), findsOneWidget, reason: 'проба $i: наказание без своего значка');
        punishes++;
        pick = pick == Choice.a ? Choice.b : Choice.a;
      }
      await tester.pump(const Duration(milliseconds: prlFeedbackMs + 50));
    }
    // ⚠️ Срок ожидания задан явно. У pumpAndSettle он по умолчанию ДЕСЯТЬ МИНУТ,
    // и партия, которая не кончается, превращала прогон в зависание — мутация
    // «партия не кончается» стояла бы десять минут вместо секунды.
    await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(find.byKey(const Key('prl-verdict')), findsOneWidget);
    // ⚠️ Разворот обязан случиться хотя бы раз: без него мера адаптации
    // считается по общей точности, и проба ничего не проверяет.
    expect(find.textContaining('${L.t('hud_reversals')}: 0'), findsNothing,
        reason: 'ни одного разворота за партию');
    expect(rewards, greaterThan(0), reason: 'ни одной награды за партию');
    expect(punishes, greaterThan(0), reason: 'ни одного наказания за партию — значок не проверен');
  });

  testWidgets('🔴 на L15 исход приходит ЧЕРЕЗ 798 мс, и счёт всё это время стоит', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '15'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: PrlScreen(key: const ValueKey('slow'), state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    final delay = PrlLevel.of(15).feedbackDelayMs;
    expect(delay, 798, reason: 'замер задержки L15 протух');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    await tester.tap(find.byKey(const Key('prl-choice-a')));
    await tester.pump();
    await tester.pump(Duration(milliseconds: delay - 100));
    expect(find.byKey(const Key('prl-waiting')), findsOneWidget, reason: 'исход показан раньше срока');
    expect(liveBank(), 0, reason: 'счёт двинулся до обратной связи');
    await tester.pump(const Duration(milliseconds: 150));
    expect(find.byKey(const Key('prl-waiting')), findsNothing, reason: 'исход не пришёл в срок');
    expect(liveBank(), isNot(0), reason: 'счёт не двинулся вместе с исходом');
  });

  testWidgets('🔴 замок: нажатия во время задержки не берут новых проб', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '15'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: PrlScreen(key: const ValueKey('lock'), state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    await tester.tap(find.byKey(const Key('prl-choice-a')));
    await tester.pump();
    for (var i = 0; i < 5; i++) {
      await tester.tap(find.byKey(const Key('prl-choice-b')));
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 900));
    // Ровно одна проба: +10 или −5, но не сумма пяти.
    expect(liveBank().abs(), lessThanOrEqualTo(10), reason: 'за один ход взято больше одной пробы');
    expect(find.textContaining('1/${PrlLevel.of(15).trialsTotal}'), findsWidgets);
  });

  testWidgets('🔴 в классике лестница не двигается ни в какую сторону', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '4'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: PrlScreen(key: const ValueKey('cl'), state: state, classic: true, preset: 'easy', rnd: Random(6))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // ⚠️ Играем ХОРОШО: партия, которая в уровневом режиме подняла бы ступень.
    // Плохая партия лестницу не двигает и без правила про классику, поэтому
    // подмены она не видит.
    var pick = Choice.a;
    final total = prlClassicPresets['easy']!.trialsTotal;
    for (var i = 1; i <= total; i++) {
      await tester.tap(find.byKey(Key('prl-choice-${pick.name}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));
      if (find.byKey(const Key('prl-punish')).evaluate().isNotEmpty) {
        pick = pick == Choice.a ? Choice.b : Choice.a;
      }
      await tester.pump(const Duration(milliseconds: prlFeedbackMs + 60));
    }
    await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(find.byKey(const Key('prl-verdict')), findsOneWidget);
    // Уровень остался тем, что был: в классике его нет.
    expect(state.get(_levelKey), '4', reason: 'классика подвинула лестницу');
  });
}
