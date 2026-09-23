import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ ТЫЧКАМИ ПО КЛЕТКАМ, а не вызовом правил: проба читает с
/// экрана, что искать, и жмёт ровно ту клетку, на которой это написано.
void main() {
  late SharedState state;

  Future<SharedState> boot({int level = 1}) async {
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}schulte_table_level_nzt48': '$level',
      '${SharedState.prefix}language': 'ru',
    });
    return SharedState.open();
  }

  Future<void> open(WidgetTester tester, {int level = 1}) async {
    state = await boot(level: level);
    await tester.pumpWidget(MaterialApp(home: SchulteScreen(state: state)));
    await tester.pump();
    await tester.pump();
  }

  /// Что сейчас велено искать — из строки над полем.
  String target(WidgetTester tester) {
    final text = tester.widget<Text>(find.byKey(const Key('цель'))).data ?? '';
    return text.replaceFirst('Ищи: ', '');
  }

  /// Клетка, на которой написано это значение.
  Finder cellWith(WidgetTester tester, String value) {
    for (var i = 0; i < 100; i += 1) {
      final key = Key('клетка$i');
      final f = find.byKey(key);
      if (f.evaluate().isEmpty) continue;
      final texts = find.descendant(of: f, matching: find.byType(Text));
      if (texts.evaluate().isEmpty) continue;
      if (tester.widget<Text>(texts.first).data == value) return f;
    }
    throw StateError('на поле нет клетки «$value»');
  }

  testWidgets('🔴 уровень проходится тычками: 25 клеток по порядку — победа', (tester) async {
    await open(tester);
    expect(find.text('Таблица Шульте'), findsOneWidget);
    await tester.tap(find.text('Начать'));
    await tester.pump();

    for (var step = 0; step < 25; step += 1) {
      await tester.tap(cellWith(tester, target(tester)));
      await tester.pump();
    }

    expect(find.text('Следующий уровень'), findsOneWidget,
        reason: 'вся таблица собрана по порядку — уровень взят');
  });

  testWidgets('🔴 чужая клетка считается ошибкой, а цель не двигается', (tester) async {
    await open(tester);
    await tester.tap(find.text('Начать'));
    await tester.pump();

    final before = target(tester);
    // Жмём клетку, на которой НЕ то, что велено искать.
    final other = before == '7' ? '8' : '7';
    await tester.tap(cellWith(tester, other));
    await tester.pump();

    expect(target(tester), before, reason: 'ошибка не двигает цель');
    expect(find.text('1'), findsWidgets, reason: 'счётчик ошибок вырос до 1');
  });

  testWidgets('🔴 пока правило не объявлено, нажатия не считаются', (tester) async {
    await open(tester, level: 16);   // ось 9: правило объявляется через 1,5 с
    await tester.tap(find.text('Начать'));
    await tester.pump();

    expect(target(tester), '?', reason: 'до объявления цель скрыта');
    await tester.tap(find.byKey(const Key('клетка0')));
    await tester.pump();
    expect(target(tester), '?', reason: 'нажатие до объявления не считается');

    await tester.pump(const Duration(milliseconds: 1600));
    expect(target(tester), isNot('?'), reason: 'через полторы секунды правило объявлено');
  });

  testWidgets('уход с экрана гасит таймеры', (tester) async {
    await open(tester, level: 16);
    await tester.tap(find.text('Начать'));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump(const Duration(seconds: 5));
  });
}
