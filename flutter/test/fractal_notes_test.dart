import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ФРАКТАЛ «КАК В КЛАССИЧЕСКОЙ СУДОКУ» — отзыв Дениса 4b95bced (18.09.2026, iPhone):
/// «Почему тут не как в судоку классический интерфейс?»; решение 30.09 — «Делать».
///
/// Веб-фрактал имел карандаш и цвет (`tool: digit | pencil | paint`), нативный перенос
/// увёз только цифры. Здесь меряется то же, что у классики в `sudoku_notes_test.dart`,
/// плюс своё у фрактала: у корня и у каждой дочерней — СВОИ пометки, как в вебе
/// (`marks.root` / `marks.children[i]`). Партия играется нажатиями.
void main() {
  // Пробы ищут русские подписи — словарь грузится явно (без него L.t вернёт ключ).
  setUpAll(() async => L.load('ru'));
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_fractal_level_nzt48': '6'});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byKey(const Key('tile0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  bool hasText(WidgetTester tester, Finder cell) =>
      find.descendant(of: cell, matching: find.byType(Text)).evaluate().any(
          (e) => ((e.widget as Text).data ?? '').isNotEmpty);

  /// Первая пустая клетка сетки с этим префиксом ключа.
  ({int r, int c}) firstEmpty(WidgetTester tester, String prefix) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        final cell = find.byKey(Key('$prefix${r}_$c'));
        if (cell.evaluate().isNotEmpty && !hasText(tester, cell)) return (r: r, c: c);
      }
    }
    fail('в сетке $prefix нет пустой клетки');
  }

  testWidgets('🔴 в ряду под полем карандаш и цвет — на карте и внутри сетки', (tester) async {
    await boot(tester);
    expect(find.byKey(const Key('pencil')), findsOneWidget, reason: 'карта: карандаш');
    expect(find.byKey(const Key('paint')), findsOneWidget, reason: 'карта: цвет');
    await tap(tester, find.byKey(const Key('tile0')));
    expect(find.byKey(const Key('pencil')), findsOneWidget, reason: 'сетка: карандаш');
    expect(find.byKey(const Key('paint')), findsOneWidget, reason: 'сетка: цвет');
  });

  testWidgets('🔴 карандаш пишет ПОМЕТКУ в своей сетке, а у корня пометок нет', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    final e = firstEmpty(tester, 'cell_');
    await tap(tester, find.byKey(Key('cell_${e.r}_${e.c}')));
    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit3')));
    await tap(tester, find.byKey(const Key('digit7')));
    expect(find.byKey(Key('marks_cell_${e.r}_${e.c}')), findsOneWidget,
        reason: 'пометки встали в клетку дочерней');

    // На карту: у корня своя раскладка — пометок дочерней там нет.
    await tap(tester, find.byTooltip('На карту'));
    expect(find.byKey(Key('marks_root_${e.r}_${e.c}')), findsNothing,
        reason: 'пометки дочерней не протекают в корень');
    // И обратно: пометки дочерней на месте.
    await tap(tester, find.byKey(const Key('tile0')));
    expect(find.byKey(Key('marks_cell_${e.r}_${e.c}')), findsOneWidget,
        reason: 'пометки пережили подъём на карту');
    // А у соседней дочерней — чисто.
    await tap(tester, find.byTooltip('На карту'));
    await tap(tester, find.byKey(const Key('tile1')));
    expect(find.byKey(Key('marks_cell_${e.r}_${e.c}')), findsNothing,
        reason: 'у каждой дочерней свои пометки, как в вебе');
  });

  testWidgets('🔴 отмена возвращает ПОМЕТКУ и ЦВЕТ, а не только цифру', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    final e = firstEmpty(tester, 'cell_');
    final cell = find.byKey(Key('cell_${e.r}_${e.c}'));
    await tap(tester, cell);
    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit4')));
    expect(find.byKey(Key('marks_cell_${e.r}_${e.c}')), findsOneWidget);

    await tap(tester, find.byKey(const Key('paint')));
    expect(find.byKey(const Key('swatch0')), findsOneWidget, reason: 'палитра на месте клавиш');
    expect(find.byKey(const Key('digit1')), findsNothing, reason: 'клавиш под палитрой нет');
    // Красим НЕ выбранную клетку: у выбранной выбор виден поверх краски (как в
    // классике), и проба мерила бы цвет выбора, а не краску.
    final other = find.byKey(Key(e.r == 8 && e.c == 8 ? 'cell_0_0' : 'cell_8_8'));
    Color? bg() => (tester.widget<Material>(
            find.ancestor(of: other, matching: find.byType(Material)).first))
        .color;
    final before = bg();
    await tap(tester, find.byKey(const Key('swatch2')));
    await tap(tester, other);
    expect(bg(), isNot(before), reason: 'касание в цвете красит клетку');

    await tap(tester, find.byTooltip('Отменить'));
    expect(bg(), before, reason: 'отмена сняла цвет');
    await tap(tester, find.byTooltip('Отменить'));
    expect(find.byKey(Key('marks_cell_${e.r}_${e.c}')), findsNothing, reason: 'отмена сняла пометку');
  });

  testWidgets('🔴 карандаш и цвет выключают друг друга; ластик в карандаше чистит клетку',
      (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    final e = firstEmpty(tester, 'cell_');
    await tap(tester, find.byKey(Key('cell_${e.r}_${e.c}')));
    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit1')));
    await tap(tester, find.byKey(const Key('digit2')));
    await tap(tester, find.byKey(const Key('erase')));
    expect(find.byKey(Key('marks_cell_${e.r}_${e.c}')), findsNothing,
        reason: 'ластик в карандаше чистит все пометки клетки разом');

    await tap(tester, find.byKey(const Key('paint')));
    await tap(tester, find.byKey(const Key('paint')));   // цвет выключили — клавиши вернулись
    await tap(tester, find.byKey(const Key('digit5')));
    expect(find.byKey(Key('marks_cell_${e.r}_${e.c}')), findsNothing,
        reason: 'включение цвета выключило карандаш: цифра ушла в клетку, не в пометку');
  });
}
