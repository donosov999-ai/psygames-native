import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/games/dots_connect/board.dart';
import 'package:psygames_flutter/games/dots_connect/screen.dart';

/// Замер стоимости одного шага пальца: событие → пересчёт пути → перерисовка.
/// Это стенд, а не кадры на телефоне: числа сравниваются с таким же замером
/// веб-версии (те же 60 шагов), а не с паспортными 60 кадрами в секунду.
void main() {
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  testWidgets('стоимость шага перетаскивания', (tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: DotsConnectScreen(state: state)));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(DotsBoard).evaluate().isNotEmpty) break;
      }
      final box = tester.getRect(find.byType(DotsBoard));
      final start = Offset(box.left + box.width * 0.2, box.top + box.height * 0.3);
      final g = await tester.startGesture(start);
      final sw = Stopwatch()..start();
      const steps = 60;
      for (var i = 0; i < steps; i++) {
        await g.moveBy(const Offset(6, 0));
        await tester.pump();
      }
      sw.stop();
      await g.up();
      debugPrint('шаг перетаскивания: ${(sw.elapsedMicroseconds / steps / 1000).toStringAsFixed(2)} мс '
          '(всего ${sw.elapsedMilliseconds} мс на $steps шагов)');
    });
    expect(find.byType(DotsBoard), findsOneWidget);
  });
}
