import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counter/screen.dart';
import 'package:psygames_flutter/games/number_bonds/screen.dart';
import 'package:psygames_flutter/games/sum_mixed/route.dart';
import 'package:psygames_flutter/games/sum_mixed/screen.dart';
import 'package:psygames_flutter/shell/hub_screen.dart' show HubCardTap, HubScreen;
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «СОБЕРИ СУММУ»: РЕЖИМ НАБОРА ВЫБИРАЕТСЯ С ЭКРАНА ПАРТИИ.
///
/// 📍 Решение Дениса 13.11.2026: «Считалка: счёт» и «Числовые пары: счёт» — одна игра, режимы внутри
/// (набор `suite_sum`, `frontend/src/constants/gameSuites.ts`). У обеих партия начинается сразу,
/// экрана настройки нет, поэтому плашкам набора негде встать: режим открывается пунктом «Режим»
/// (`SuiteModeAction`) в ряду значков. Проба гоняет настоящие экраны: пункт виден, лист показывает
/// оба режима, выбор другого закрывает экран с заменой маршрута (так оболочка открывает режим), а
/// выбор того же ничего не делает.
void main() {
  late SharedState state;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> boot({required List<String> open}) async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await state.set(
      HubScreen.visibleKey,
      jsonEncode({
        'profile': state.activeProfile,
        'suites': {'suite_sum': open},
      }),
    );
  }

  /// Экран открыт ИЗ развилки (push): результат закрытия попадает в [result].
  Future<void> pumpFrom(WidgetTester tester, Widget Function() screen, List<Object?> result) async {
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              key: const Key('open'),
              onPressed: () async => result.add(await Navigator.of(context).push<Object?>(MaterialPageRoute(builder: (_) => screen()))),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.byKey(const Key('open')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
  }

  const both = ['/games/counter', '/games/number-bonds'];

  final screens = <String, Widget Function()>{
    '/games/counter': () => CounterScreen(state: state),
    '/games/number-bonds': () => NumberBondsScreen(state: state),
  };

  for (final here in both) {
    final other = both.firstWhere((r) => r != here);

    testWidgets('🔴 $here: «Режим» в ряду значков, лист из двух режимов, выбор другого — замена маршрута', (tester) async {
      await boot(open: both);
      final result = <Object?>[];
      await pumpFrom(tester, screens[here]!, result);

      expect(find.byKey(const Key('suite-mode-action')), findsOneWidget, reason: 'пункта «Режим» нет у $here');
      await tester.tap(find.byKey(const Key('suite-mode-action')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('suite-mode-/games/counter')), findsOneWidget);
      expect(find.byKey(const Key('suite-mode-/games/number-bonds')), findsOneWidget);
      expect(find.byKey(Key('suite-mode-$sumMixedRoute')), findsOneWidget, reason: '«Вперемешку» нет в листе, хотя открыты оба правила');

      await tester.tap(find.byKey(Key('suite-mode-$other')));
      await tester.pumpAndSettle();
      expect(result, hasLength(1), reason: 'экран не закрылся после выбора режима');
      final tap = result.single as HubCardTap;
      expect(tap.route, other);
      expect(tap.replace, isTrue, reason: 'режим — замена маршрута, а не ещё один слой в истории');
    });

    testWidgets('$here: выбор ТОГО ЖЕ режима экран не закрывает', (tester) async {
      await boot(open: both);
      final result = <Object?>[];
      await pumpFrom(tester, screens[here]!, result);
      await tester.tap(find.byKey(const Key('suite-mode-action')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key('suite-mode-$here')));
      await tester.pumpAndSettle();
      expect(result, isEmpty);
      expect(find.byKey(const Key('suite-mode-action')), findsOneWidget, reason: 'экран партии пропал');
    });

    testWidgets('$here: открыт один режим — пункта «Режим» нет (переключать не из чего)', (tester) async {
      await boot(open: [here]);
      final result = <Object?>[];
      await pumpFrom(tester, screens[here]!, result);
      expect(find.byKey(const Key('suite-mode-action')), findsNothing);
    });
  }

  testWidgets('🔴 «Вперемешку» выбирается из листа любого режима и ведёт на свой маршрут', (tester) async {
    await boot(open: both);
    final result = <Object?>[];
    await pumpFrom(tester, screens['/games/counter']!, result);
    await tester.tap(find.byKey(const Key('suite-mode-action')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key('suite-mode-$sumMixedRoute')));
    await tester.pumpAndSettle();
    final tap = result.single as HubCardTap;
    expect(tap.route, sumMixedRoute);
    expect(tap.replace, isTrue);
  });

  testWidgets('«Вперемешку»: свой экран, в листе он отмечен, возврат в «На скорость» — замена маршрута', (tester) async {
    await boot(open: both);
    final result = <Object?>[];
    await pumpFrom(tester, () => SumMixedScreen(state: state), result);
    await tester.tap(find.byKey(const Key('suite-mode-action')));
    await tester.pumpAndSettle();
    final mixed = tester.widget<ListTile>(find.byKey(Key('suite-mode-$sumMixedRoute')));
    expect(mixed.selected, isTrue, reason: 'текущий режим в листе не отмечен');
    // выбор того же режима экран не закрывает
    await tester.tap(find.byKey(Key('suite-mode-$sumMixedRoute')));
    await tester.pumpAndSettle();
    expect(result, isEmpty);
    await tester.tap(find.byKey(const Key('suite-mode-action')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('suite-mode-/games/counter')));
    await tester.pumpAndSettle();
    final tap = result.single as HubCardTap;
    expect(tap.route, '/games/counter');
    expect(tap.replace, isTrue);
  });

  testWidgets('открыт один режим — «Вперемешку» нет нигде (он собран из обоих правил)', (tester) async {
    await boot(open: ['/games/counter']);
    final result = <Object?>[];
    await pumpFrom(tester, () => SumMixedScreen(state: state), result);
    expect(find.byKey(const Key('suite-mode-action')), findsNothing);
  });
}
