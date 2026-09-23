import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_span/model.dart';
import 'package:psygames_flutter/games/spatial_span/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ ТЫЧКАМИ — И ПРОБА СМОТРИТ НА ВСПЫШКИ, КАК ЧЕЛОВЕК.
///
/// Ряд проба не знает заранее: она собирает его с экрана, шагая по кадрам показа, и отвечает
/// В ОБРАТНОМ ПОРЯДКЕ. Поэтому она ловит обе половины правила сразу — и то, что вспыхивают
/// именно клетки ряда, и то, что ответ принимается задом наперёд.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, {Random? random, Size size = const Size(390, 844)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(home: SpatialSpanScreen(state: state, random: random)),
    );
    await tester.pump();
    await tester.pump();
  }

  /// Какая клетка горит сейчас: та, что залита основным цветом темы.
  int? litCell(WidgetTester tester, int cells) {
    for (var i = 0; i < cells; i++) {
      final f = find.byKey(Key('клетка$i'));
      if (f.evaluate().isEmpty) continue;
      final m = tester.widget<Material>(f);
      if (m.color == Theme.of(tester.element(f)).colorScheme.primary) return i;
    }
    return null;
  }

  bool recallOpen(WidgetTester tester) {
    final f = find.byKey(const Key('подсказка'));
    if (f.evaluate().isEmpty) return false;
    return (tester.widget<Text>(f).data ?? '').startsWith('Повтори');
  }

  /// Пройти показ и вернуть ряд в порядке вспышек.
  Future<List<int>> watchFlashes(WidgetTester tester, int cells) async {
    final seen = <int>[];
    for (var step = 0; step < 80; step++) {
      await tester.pump(const Duration(milliseconds: 100));
      final lit = litCell(tester, cells);
      if (lit != null && (seen.isEmpty || seen.last != lit)) seen.add(lit);
      if (recallOpen(tester)) break;
    }
    return seen;
  }

  testWidgets('🔴 ряд вспыхивает, ответ задом наперёд растит длину', (tester) async {
    await boot(tester, random: Random(42));
    expect(find.text('Пространственный ряд'), findsOneWidget);
    await tester.tap(find.byKey(const Key('показать-ряд')));
    await tester.pump();

    final first = await watchFlashes(tester, 16);
    expect(recallOpen(tester), isTrue, reason: 'после показа открывается ввод');
    expect(first.length, 2, reason: 'на первом уровне ряд из двух клеток');

    // Тот же ряд, что и у правил: экран не рисует «что-то своё».
    final model = SpatialSpanGame(level: 1, random: Random(42))..deal(2);
    expect(first, model.sequence, reason: 'вспыхивают ровно клетки ряда, в его порядке');

    for (final c in first.reversed) {
      await tester.tap(find.byKey(Key('клетка$c')));
      await tester.pump();
    }
    expect(find.text('2'), findsWidgets, reason: 'спан стал равен двум');

    // Длина выросла — следующий ряд из трёх.
    await tester.pump(const Duration(milliseconds: 700));
    final second = await watchFlashes(tester, 16);
    expect(second.length, 3, reason: 'пройденный ряд удлиняется на клетку');
    await tester.pumpAndSettle(const Duration(seconds: 3));
  });

  testWidgets('🔴 прямой порядок — ошибка, две ошибки на длине кончают партию', (tester) async {
    await boot(tester, random: Random(7));
    await tester.tap(find.byKey(const Key('показать-ряд')));
    await tester.pump();

    final row = await watchFlashes(tester, 16);
    expect(row.length, 2);
    // Прямой порядок: первая клетка ряда — заведомо не та, что ждут первой.
    await tester.tap(find.byKey(Key('клетка${row.first}')));
    await tester.pump();
    expect(find.text('Ошибка. Тот же ряд ещё раз'), findsOneWidget,
        reason: 'вердикт виден сразу, а не после следующего показа');

    // Тот же ряд ещё раз — и вторая ошибка на той же длине заканчивает партию.
    await tester.pump(const Duration(milliseconds: 800));
    final again = await watchFlashes(tester, 16);
    await tester.tap(find.byKey(Key('клетка${again.first}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
    expect(find.byKey(const Key('ещё-раз')), findsOneWidget,
        reason: 'две ошибки на одной длине — конец партии');
    expect(find.textContaining('планка ступени'), findsOneWidget);
  });

  testWidgets('🔴 доска берёт сторону у поля: на 360×640 сетка целиком в кадре', (tester) async {
    await boot(tester, random: Random(3), size: const Size(360, 640));
    expect(tester.takeException(), isNull);
    final first = tester.getRect(find.byKey(const Key('клетка0')));
    final last = tester.getRect(find.byKey(const Key('клетка15')));
    expect(first.top, greaterThanOrEqualTo(0));
    expect(last.bottom, lessThanOrEqualTo(640), reason: 'нижний ряд клеток не уходит за экран');
    expect(last.right, lessThanOrEqualTo(360));
  });

  testWidgets('🔴 уход с экрана гасит показ', (tester) async {
    await boot(tester, random: Random(1));
    await tester.tap(find.byKey(const Key('показать-ряд')));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump(const Duration(seconds: 5));
    expect(tester.takeException(), isNull);
  });
}
