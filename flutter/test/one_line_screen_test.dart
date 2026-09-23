import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/games/one_line/board.dart';
import 'package:psygames_flutter/games/one_line/model.dart';
import 'package:psygames_flutter/games/one_line/screen.dart';

/// Пробы второго экрана пилота.
///
/// Первая — та же, что у «Соедини точки»: экран обязан дойти до доски, а не
/// вечно крутить загрузку (ассет объявлен, данные читаются, разбор не падает).
///
/// Вторая — уровень действительно проходится ПАЛЬЦЕМ по доске, а не только по
/// правилам. Правила сверены отдельно (`one_line_test.dart`), но зелёные правила
/// при неработающей доске уже давали «правила ок, продукт не работает».
Future<void> _boot(WidgetTester tester, SharedState state) async {
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: OneLineScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(OneLineBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

void main() {
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  testWidgets('экран доходит до доски, а не висит на загрузке', (tester) async {
    await _boot(tester, state);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(OneLineBoard), findsOneWidget);
    expect(find.text('Одна линия'), findsOneWidget);
  });

  testWidgets('первый уровень проходится пальцем по доске', (tester) async {
    late OneLineLevel level;
    await tester.runAsync(() async {
      final raw = await rootBundle.loadString('assets/levels/one_line.json');
      level = OneLineLevelSet.fromJsonString(raw).byLevel(1);
    });
    await _boot(tester, state);

    // Та же геометрия, что и у доски: сторона от меньшей стороны поля,
    // координаты вершин — доли от 0 до 1.
    final rect = tester.getRect(find.byType(OneLineBoard));
    final side = math.min(rect.height, rect.width) - 40;
    final origin = rect.topLeft +
        Offset((rect.width - side) / 2, (rect.height - side) / 2);
    Offset at(String id) {
      final v = level.vertexById(id);
      return origin + Offset(v.x * side, v.y * side);
    }

    expect(level.solutionVertexIds, isNotEmpty);
    for (final id in level.solutionVertexIds) {
      await tester.tapAt(at(id));
      await tester.pump();
    }

    expect(find.text('Следующий уровень'), findsOneWidget,
        reason: 'маршрут пройден по доске — экран обязан предложить следующий уровень');
    expect(find.text('${level.totalPasses}/${level.totalPasses}'), findsOneWidget);
  });
}
