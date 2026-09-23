import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hubs/hub_screen.dart';

/// 🔴 РАЗВИЛКА НЕ ИМЕЕТ ПРАВА БЫТЬ ТУПИКОМ.
///
/// У «Головоломок» перенесено НОЛЬ карточек из сорока: движок Тэтхэма ждёт нативной
/// сборки. Если бы развилка открывала только перенесённое, человек нажал бы «Мины» и не
/// попал никуда. Поэтому проверяется главное: карточка отдаёт СВОЙ маршрут наружу —
/// целиком, вместе с `?mode=…`, — а решение «нативно или в веб» принимает хост.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<List<String>> openHub(WidgetTester tester, String hub) async {
    final opened = <String>[];
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: HubScreen(hub: hub, onOpen: opened.add),
      ));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byType(InkWell).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    return opened;
  }

  testWidgets('🔴 развилка судоку: пять карточек и своё имя', (tester) async {
    final opened = await openHub(tester, '/games/sudoku-hub');
    expect(find.text('Судоку: три доски'), findsOneWidget, reason: 'имя развилки из словаря');
    for (final route in [
      '/games/sudoku',
      '/games/sudoku-samurai',
      '/games/sudoku-fractal',
      '/games/sudoku?mode=towers',
      '/games/sudoku?mode=unequal',
    ]) {
      expect(find.byKey(Key('card_$route')), findsOneWidget, reason: 'нет карточки $route');
    }
    expect(opened, isEmpty, reason: 'без тычка ничего не открывается');
  });

  testWidgets('🔴 тычок отдаёт маршрут ЦЕЛИКОМ, вместе с режимом', (tester) async {
    final opened = await openHub(tester, '/games/sudoku-hub');
    await tester.tap(find.byKey(const Key('card_/games/sudoku?mode=towers')));
    await tester.pump();
    expect(opened, ['/games/sudoku?mode=towers'],
        reason: 'обрезанный режим открыл бы не ту игру');
  });

  testWidgets('🔴 развилка головоломок: сорок карточек, и все ведут наружу', (tester) async {
    final opened = await openHub(tester, '/games/puzzles-hub');
    expect(find.text('Головоломки'), findsOneWidget);

    // Карточек сорок — проверяем, что список прокручивается и достаёт нижние.
    final last = find.byKey(const Key('card_/games/puzzles?mode=Filling'));
    await tester.scrollUntilVisible(last, 200);
    await tester.tap(last);
    await tester.pump();
    expect(opened, ['/games/puzzles?mode=Filling'],
        reason: 'нижние карточки обязаны быть достижимы');
  });

  testWidgets('🔴 незнакомый значок не оставляет карточку пустой', (tester) async {
    expect(iconFor('такого-значка-нет'), Icons.grid_view);
    expect(iconFor('bulb'), Icons.lightbulb_outline);
  });

  testWidgets('чужая развилка — пустой список, а не падение', (tester) async {
    await openHub(tester, '/games/чужая-развилка');
    expect(tester.takeException(), isNull);
  });
}
