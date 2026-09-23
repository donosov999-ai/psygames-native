import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counting_hub/screen.dart';
import 'package:psygames_flutter/games/search_hub/screen.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБЫ ДВУХ РАЗВИЛОК РАЗДЕЛА — «Поиск глазами» и «Счёт».
///
/// Развилка существует ради трёх вещей: показать ВЕСЬ состав раздела, показать
/// рядом УРОВЕНЬ из общей с вебом памяти и вернуть маршрут наверх — открывать
/// игру должна оболочка. Их и меряем.
Future<void> boot(WidgetTester tester, Widget hub) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: hub));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(Card).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

Future<void> seeAll(WidgetTester tester, List<String> names) async {
  for (final name in names) {
    await tester.scrollUntilVisible(find.text(name), 120, scrollable: find.byType(Scrollable).first);
    expect(find.text(name), findsOneWidget, reason: 'карточка «$name»');
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({
      // Уровни пишет веб-половина ТЕМИ ЖЕ ключами: psygames_<игра>_level_<профиль>.
      'psygames_schulte_table_level_nzt48': '9',
      'psygames_counter_level_nzt48': '14',
    });
  });

  testWidgets('«Поиск глазами» показывает все восемь упражнений раздела', (tester) async {
    final state = await SharedState.open();
    await boot(tester, SearchHubScreen(state: state, isNative: (r) => true));
    expect(find.text('Поиск глазами'), findsWidgets, reason: 'заголовок развилки');
    // ⚠️ Список ПРОКРУЧИВАЕТСЯ: нижние карточки не построены, пока не показаны, —
    // проверка без прокрутки врала бы про «нет такой карточки».
    await seeAll(tester, [
      'Визуальный поиск', 'Найди отличия', 'Маджонг', 'Шульте: внимание',
      'Быстрый счёт', 'Трекер объектов', 'SDMT: символ→цифра', 'SET: тройки признаков',
    ]);
  });

  testWidgets('«Счёт» показывает все семь упражнений раздела', (tester) async {
    final state = await SharedState.open();
    await boot(tester, CountingHubScreen(state: state, isNative: (r) => true));
    expect(find.text('Счёт'), findsWidgets, reason: 'заголовок развилки');
    await seeAll(tester, [
      'Считалка: счёт', 'Математическая шкала', 'Числовой забег', 'Математический спринт',
      'Числовые пары: счёт', 'OSpan: счёт+память', 'Паттерны: мышление',
    ]);
  });

  testWidgets('🔴 на карточке стоит уровень ИЗ ОБЩЕЙ ПАМЯТИ, а не единица', (tester) async {
    final state = await SharedState.open();
    await boot(tester, SearchHubScreen(state: state, isNative: (r) => true));
    await tester.scrollUntilVisible(find.text('Шульте: внимание'), 120, scrollable: find.byType(Scrollable).first);
    expect(find.text('ур. 9'), findsOneWidget, reason: 'уровень Шульте из общей памяти');
    expect(find.text('ур. 1'), findsWidgets, reason: 'у нетронутых игр — первый');

    await boot(tester, CountingHubScreen(state: state, isNative: (r) => true));
    await tester.scrollUntilVisible(find.text('Считалка: счёт'), 120, scrollable: find.byType(Scrollable).first);
    expect(find.text('ур. 14'), findsOneWidget, reason: 'уровень «Считалки» из общей памяти');
  });

  testWidgets('🔴 нажатие ВОЗВРАЩАЕТ МАРШРУТ наверх, а не открывает игру само', (tester) async {
    // Половина карточек «Счёта» ведёт туда, куда переезд ещё не дошёл: развилка
    // не знает, что перенесено, и отдаёт маршрут оболочке — иначе она стала бы
    // второй оболочкой, а неперенесённая игра — тупиком.
    final state = await SharedState.open();
    Object? popped;
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () async {
              popped = await Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => CountingHubScreen(state: state, isNative: (r) => false),
              ));
            },
            child: const Text('открыть развилку'),
          ),
        ),
      ));
      await tester.pump();
      await tester.tap(find.text('открыть развилку'));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(Card).evaluate().isNotEmpty) break;
      }
      // ⚠️ Нажатие и ожидание — ВНУТРИ runAsync: продолжение await push живёт в
      // настоящем асинхронном мире, выйди раньше — и оно не выполнится никогда.
      await tester.tap(find.byKey(const ValueKey('hub-card-/games/number-run')));
      for (var i = 0; i < 20 && popped == null; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    });
    await tester.pumpAndSettle();
    expect(popped, isA<HubCardTap>());
    expect((popped! as HubCardTap).route, '/games/number-run',
        reason: 'маршрут обязан уходить ЦЕЛИКОМ — срежь его, и карточки откроют не то');
  });
}
