import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/games/dots_connect/board.dart';
import 'package:psygames_flutter/games/dots_connect/screen.dart';

/// 🔴 ПРОБА НА ОШИБКУ, КОТОРАЯ УЖЕ СЛУЧИЛАСЬ (23.09.2026).
/// Уровни лежали на диске и проверялись пробами правил — но НЕ были объявлены
/// в pubspec.yaml как ассет. Приложение запускалось и вечно крутило загрузку:
/// «Unable to load asset». Правила были зелёные, продукт не работал.
/// Проба поднимает экран целиком и требует, чтобы он дошёл до доски.
///
/// ⚠️ Чтение ассета — настоящий ввод-вывод, а в пробе время поддельное: без
/// `runAsync` загрузка не двигается вовсе, и проба врёт про «висит».
void main() {
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  testWidgets('экран доходит до доски, а не висит на загрузке', (tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: DotsConnectScreen(state: state)));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(DotsBoard).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(DotsBoard), findsOneWidget);
    expect(find.text('Соедини точки'), findsOneWidget);
  });
}
