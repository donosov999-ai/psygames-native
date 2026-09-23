import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/bart/model.dart';
import 'package:psygames_flutter/games/bart/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В BART ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба НЕ знает предела шара — как и человек. Она качает до заданного
/// числа и забирает, а если рвануло раньше, видит это по экрану.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_bart_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  int pumpsOnScreen() {
    final t = find.byKey(const Key('bart-pumps')).evaluate().first.widget as Text;
    return int.parse(t.data!);
  }

  bool popped() => find.byKey(const Key('bart-popped')).evaluate().isNotEmpty;
  bool cashed() => find.byKey(const Key('bart-cashed')).evaluate().isNotEmpty;

  /// Диаметр шара на экране. Размер — единственная подсказка о том, сколько
  /// накачано; про ПРЕДЕЛ он не говорит ничего.
  double balloonSize() {
    final c = find.byKey(const Key('bart-balloon')).evaluate().first.widget as Container;
    return c.constraints!.maxWidth;
  }

  testWidgets('🔴 шар растёт с каждым нажатием и предел НЕ показывается', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: BartScreen(key: const ValueKey('grow'), state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('bart-params')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(pumpsOnScreen(), 0);
    final first = balloonSize();

    await tester.tap(find.byKey(const Key('bart-pump')));
    await tester.pump();
    expect(pumpsOnScreen(), 1);
    expect(balloonSize(), greaterThan(first), reason: 'шар не вырос после нажатия');
    // ⚠️ На экране нет ни одного числа, равного пределу шара: узнать его можно
    // только взрывом. Сам предел лежит в модели и в кадр не попадает.
    expect(find.textContaining('${L.t('hud_atRisk')}'), findsWidgets);
  });

  testWidgets('🔴 взрыв обнуляет поставленное, обналичивание кладёт в банк', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: BartScreen(key: const ValueKey('play'), state: state, rnd: Random(7))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    var pops = 0, cashes = 0, bankExpected = 0;
    final total = BartLevel.of(1).balloons;
    for (var i = 1; i <= total; i++) {
      // Качаем до шести или до взрыва — что раньше.
      var n = 0;
      while (n < 6 && !popped()) {
        await tester.tap(find.byKey(const Key('bart-pump')));
        await tester.pump();
        n++;
      }
      if (popped()) {
        pops++;
        await tester.pump(const Duration(milliseconds: bartPopMs + 50));
      } else {
        final atRisk = pumpsOnScreen();
        await tester.tap(find.byKey(const Key('bart-cash')));
        await tester.pump();
        expect(cashed(), isTrue, reason: 'шар $i: обналичивание не показано');
        bankExpected += atRisk;
        cashes++;
        await tester.pump(const Duration(milliseconds: bartCashMs + 50));
      }
    }
    await tester.pumpAndSettle();
    expect(pops + cashes, total);
    expect(cashes, greaterThan(0), reason: 'ни одного успешного шара');
    expect(find.byKey(const Key('bart-verdict')), findsOneWidget);
    // Банк — ровно сумма забранного; взрывы не приносят ничего.
    expect(find.textContaining('${L.t('hud_bank')}: $bankExpected'), findsWidgets,
        reason: 'банк разошёлся с забранным ($bankExpected)');
  });

  testWidgets('🔴 после взрыва и после кэша нажатия по тому же шару не проходят', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: BartScreen(key: const ValueKey('lock'), state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Качаем до взрыва. ⚠️ Ограничитель обязателен: мутация, снимающая конец
    // шара, иначе вешает прогон вместо того, чтобы краснеть.
    var guard = 0;
    while (!popped()) {
      expect(guard++, lessThan(400), reason: 'шар не лопнул за 400 нажатий');
      await tester.tap(find.byKey(const Key('bart-pump')));
      await tester.pump();
    }
    final atPop = pumpsOnScreen();
    // ⚠️ Кнопки остаются нажимаемыми: гасить их значило бы подсказывать исход
    // раньше, чем он показан. Держит модель.
    await tester.tap(find.byKey(const Key('bart-pump')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('bart-cash')));
    await tester.pump();
    expect(pumpsOnScreen(), atPop, reason: 'лопнувший шар качался дальше');
    // Состояние шара осталось «лопнул»: обналичить его не удалось.
    final st = find.byKey(const Key('bart-state')).evaluate().first.widget as Text;
    expect(st.data, L.t('bartPopped'), reason: 'лопнувший шар объявлен обналиченным');
    expect(cashed(), isFalse);
  });

  testWidgets('🔴 на L15 предел у КАЖДОГО шара свой: одного числа не выучить', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '15'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: BartScreen(key: const ValueKey('spread'), state: state, rnd: Random(5))));
    await tester.pumpAndSettle();
    expect(BartLevel.of(15).burstSpread, 0.5, reason: 'замер разброса L15 протух');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Качаем КАЖДЫЙ шар до упора и смотрим, на каком нажатии рвануло.
    final bursts = <int>[];
    var guard = 0;
    for (var i = 0; i < BartLevel.of(15).balloons; i++) {
      while (!popped()) {
        expect(guard++, lessThan(4000), reason: 'шар ${i + 1} не лопнул — партия зациклилась');
        await tester.tap(find.byKey(const Key('bart-pump')));
        await tester.pump();
      }
      bursts.add(pumpsOnScreen());
      await tester.pump(const Duration(milliseconds: bartPopMs + 50));
    }
    await tester.pumpAndSettle();
    expect(bursts.length, 20);
    // Точка взрыва гуляет: одного безопасного числа не существует.
    expect(bursts.toSet().length, greaterThan(5), reason: 'точка взрыва почти не гуляет: $bursts');
    // Партия из одних взрывов уровень не берёт.
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: 'партия из одних взрывов засчитана');
    expect(state.get(_levelKey), '15', reason: 'лестница шагнула на одних взрывах');
  });

  testWidgets('🔴 в классике лестница не двигается ни в какую сторону', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '6'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: BartScreen(key: const ValueKey('cl'), state: state, classic: Difficulty.medium, rnd: Random(9))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // ⚠️ Играем ХОРОШО: партия, которая в уровневом режиме подняла бы ступень.
    // Плохая партия лестницу не двигает и без правила про классику.
    for (var i = 0; i < 15; i++) {
      var n = 0;
      while (n < 12 && !popped()) {
        await tester.tap(find.byKey(const Key('bart-pump')));
        await tester.pump();
        n++;
      }
      if (popped()) {
        await tester.pump(const Duration(milliseconds: bartPopMs + 50));
      } else {
        await tester.tap(find.byKey(const Key('bart-cash')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: bartCashMs + 50));
      }
    }
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('bart-verdict')), findsOneWidget);
    expect(state.get(_levelKey), '6', reason: 'классика подвинула лестницу');
  });
}
