import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/dots_connect/board.dart';
import 'package:psygames_flutter/games/dots_connect/screen.dart';
import 'package:psygames_flutter/games/one_line/board.dart';
import 'package:psygames_flutter/games/one_line/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 УРОВЕНЬ ИЗ АДРЕСА ВАЖНЕЕ СОХРАНЁННОГО — «Соедини точки» и «Одна линия».
///
/// Веб: `const level = num('level', lvl.level)` (frontend/app/games/dots-connect.tsx,
/// one-line.tsx). Шаг зарядки шлёт `level` по правилу Дениса 13.09 «освоенный −20 %»
/// (`stepToParams`, frontend/src/services/warmup.ts), вызов дня — свой уровень. До 07.10
/// натив брал только сохранённую ступень лестницы, и шаг зарядки шёл на полном освоенном
/// уровне. Нашёл сторож параметров адреса #273 (строгий замер), задача 3e685a46.
Future<void> _boot(WidgetTester tester, Widget screen, Type board) async {
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: screen));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(board).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

void main() {
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('en');
  });
  tearDown(() => GamePreset.set(const {}));

  testWidgets('«Соедини точки»: шаг зарядки с level=7 открывает седьмой уровень', (tester) async {
    GamePreset.set(const {'wu': '1', 'level': '7'});
    await _boot(tester, DotsConnectScreen(state: state), DotsBoard);
    expect(tester.widget<DotsBoard>(find.byType(DotsBoard)).level.level, 7);
  });

  testWidgets('«Соедини точки»: без уровня в адресе — сохранённый (первый)', (tester) async {
    GamePreset.set(const {});
    await _boot(tester, DotsConnectScreen(state: state), DotsBoard);
    expect(tester.widget<DotsBoard>(find.byType(DotsBoard)).level.level, 1);
  });

  testWidgets('«Одна линия»: шаг зарядки с level=5 открывает пятый уровень', (tester) async {
    GamePreset.set(const {'wu': '1', 'level': '5'});
    await _boot(tester, OneLineScreen(state: state), OneLineBoard);
    expect(tester.widget<OneLineBoard>(find.byType(OneLineBoard)).level.level, 5);
  });

  testWidgets('«Одна линия»: без уровня в адресе — сохранённый (первый)', (tester) async {
    GamePreset.set(const {});
    await _boot(tester, OneLineScreen(state: state), OneLineBoard);
    expect(tester.widget<OneLineBoard>(find.byType(OneLineBoard)).level.level, 1);
  });
}
