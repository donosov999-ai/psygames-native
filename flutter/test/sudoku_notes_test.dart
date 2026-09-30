import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОМЕТКИ И ЗАКРАСКА — ПРОВЕРЯЮТСЯ НАЖАТИЯМИ НА ЖИВОМ ЭКРАНЕ.
///
/// Нативный экран 23.09 уехал к людям без карандаша и цвета: в ряду стояли только
/// отмена, «заново» и подсказка. Денис, кадр 24.09 — «где интерфейс прежний, с
/// которым мы так долго возились», «кнопки для заметок, закраски и прочего».
/// Ни одна из 759 проб этого не заметила, потому что все они проверяли ХОД, а не
/// состав органов управления. Здесь закрывается ровно эта дыра.
///
/// ⚠️ ПРОБА ЧИТАЕТ ТО, ЧТО ВИДНО В КЛЕТКЕ, а не поля состояния: пометка, которая
/// поставлена в память и не нарисована, для человека не существует.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_sudoku_level_nzt48': '5',   // классика 9×9 из банка, доска данными
    });
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  /// Пустая клетка доски: в чужую подсказку ни писать, ни помечать нельзя.
  /// [skip] пропускает первые N пустых — нужно, когда красить надо НЕ выбранную.
  ({int r, int c}) emptyCell(WidgetTester tester, {int skip = 0}) {
    var left = skip;
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        final cell = find.byKey(Key('cell_${r}_$c'));
        if (cell.evaluate().isEmpty) continue;
        final texts = find.descendant(of: cell, matching: find.byType(Text));
        if (texts.evaluate().isEmpty) return (r: r, c: c);
        final s = tester.widget<Text>(texts.first).data ?? '';
        if (s.isEmpty) {
          if (left > 0) {
            left -= 1;
            continue;
          }
          return (r: r, c: c);
        }
      }
    }
    fail('на доске не нашлось ни одной пустой клетки');
  }

  /// Какие цифры ВИДНЫ карандашом в клетке.
  List<String> marksAt(WidgetTester tester, int r, int c) {
    final layer = find.byKey(Key('marks_${r}_$c'));
    if (layer.evaluate().isEmpty) return const [];
    return find
        .descendant(of: layer, matching: find.byType(Text))
        .evaluate()
        .map((e) => (e.widget as Text).data ?? '')
        .where((s) => s.isNotEmpty)
        .toList();
  }

  /// Цвет фона клетки — им же видно закраску.
  Color? paintAt(WidgetTester tester, int r, int c) {
    final cell = find.byKey(Key('cell_${r}_$c'));
    final material = find.ancestor(of: cell, matching: find.byType(Material));
    if (material.evaluate().isEmpty) return null;
    return tester.widget<Material>(material.first).color;
  }

  testWidgets('🔴 в ряду под полем есть карандаш и цвет, а не только отмена и подсказка',
      (tester) async {
    await boot(tester);
    expect(find.byKey(const Key('pencil')), findsOneWidget, reason: 'кнопка пометок');
    expect(find.byKey(const Key('paint')), findsOneWidget, reason: 'кнопка закраски');
  });

  testWidgets('🔴 карандаш пишет ПОМЕТКУ, а не цифру: ошибка не засчитывается', (tester) async {
    await boot(tester);
    final cell = emptyCell(tester);
    await tester.tap(find.byKey(Key('cell_${cell.r}_${cell.c}')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pencil')));
    await tester.pump();

    // Ставим ТРИ пометки: одна могла бы совпасть с решением случайно, три — нет.
    for (final d in [1, 2, 3]) {
      await tester.tap(find.byKey(Key('digit$d')));
      await tester.pump();
    }

    expect(marksAt(tester, cell.r, cell.c), ['1', '2', '3'],
        reason: 'в клетке видны три карандашные цифры');
    expect(find.text('0/3'), findsOneWidget,
        reason: 'пометка — не ход: счётчик ошибок стоит на месте');
  });

  testWidgets('🔴 отмена возвращает ПОМЕТКУ и ЦВЕТ, а не только цифру', (tester) async {
    await boot(tester);
    final cell = emptyCell(tester);
    await tester.tap(find.byKey(Key('cell_${cell.r}_${cell.c}')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pencil')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('digit5')));
    await tester.pump();
    expect(marksAt(tester, cell.r, cell.c), ['5']);

    await tester.tap(find.byTooltip('Отменить'));
    await tester.pump();
    expect(marksAt(tester, cell.r, cell.c), isEmpty,
        reason: 'отмена сняла пометку — ровно то, чего экран не умел');

    // Теперь цвет.
    //
    // ⚠️ КРАСИМ ДРУГУЮ КЛЕТКУ, НЕ ВЫБРАННУЮ. Первая редакция пробы красила ту же и
    // покраснела правильно: выбранная клетка показывает ВЫБОР поверх краски (иначе
    // в режиме цифр теряется, куда сейчас пишешь), и цвет под ним не виден.
    final other = emptyCell(tester, skip: 1);
    await tester.tap(find.byKey(const Key('pencil')));   // выключаем карандаш
    await tester.pump();
    final plain = paintAt(tester, other.r, other.c);
    await tester.tap(find.byKey(const Key('paint')));
    await tester.pump();
    await tester.tap(find.byKey(Key('cell_${other.r}_${other.c}')));
    await tester.pump();
    expect(paintAt(tester, other.r, other.c), isNot(plain),
        reason: 'касание в режиме цвета красит клетку');

    await tester.tap(find.byTooltip('Отменить'));
    await tester.pump();
    expect(paintAt(tester, other.r, other.c), plain, reason: 'отмена сняла цвет');
  });

  testWidgets('🔴 в режиме цвета палитра СТОИТ НА МЕСТЕ клавиш, а не рядом с ними',
      (tester) async {
    await boot(tester);
    expect(find.byKey(const Key('digit1')), findsOneWidget);
    expect(find.byKey(const Key('swatch0')), findsNothing);

    await tester.tap(find.byKey(const Key('paint')));
    await tester.pump();

    expect(find.byKey(const Key('digit1')), findsNothing,
        reason: 'в режиме цвета цифры не вводятся — иначе два ответа на одно действие');
    for (var i = 0; i < sudokuColorCount; i++) {
      expect(find.byKey(Key('swatch$i')), findsOneWidget, reason: 'цвет $i в палитре');
    }
  });

  testWidgets('🔴 карандаш и цвет выключают друг друга', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const Key('pencil')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('paint')));
    await tester.pump();

    // Цвет включён — значит клавиш нет; карандаш при этом обязан был выключиться,
    // иначе после выхода из цвета цифры молча уходили бы в пометки.
    expect(find.byKey(const Key('swatch0')), findsOneWidget);
    await tester.tap(find.byKey(const Key('paint')));
    await tester.pump();

    final cell = emptyCell(tester);
    await tester.tap(find.byKey(Key('cell_${cell.r}_${cell.c}')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('digit1')));
    await tester.pump();
    expect(marksAt(tester, cell.r, cell.c), isEmpty,
        reason: 'после цвета цифра ставится цифрой, а не пометкой');
  });

  testWidgets('🔴 ластик в карандаше чистит клетку ЦЕЛИКОМ, а не по одной', (tester) async {
    await boot(tester);
    final cell = emptyCell(tester);
    await tester.tap(find.byKey(Key('cell_${cell.r}_${cell.c}')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pencil')));
    await tester.pump();
    for (final d in [2, 4, 6, 8]) {
      await tester.tap(find.byKey(Key('digit$d')));
      await tester.pump();
    }
    expect(marksAt(tester, cell.r, cell.c).length, 4);

    await tester.tap(find.byKey(const Key('erase')));
    await tester.pump();
    expect(marksAt(tester, cell.r, cell.c), isEmpty,
        reason: 'одно движение вместо четырёх нажатий');
  });

  /// ⚠️ ГЕОМЕТРИЯ СЛОТА — ТА ЖЕ ЛОВУШКА, ЧТО В ВЕБЕ. Три слота по `cell / 3` шире
  /// внутреннего бокса клетки на толщину рамки, и третья цифра переносится вниз:
  /// снаружи это выглядит как «пометки не работают» (отчёт faecbd12).
  test('🔴 три слота пометок влезают в клетку по ширине', () {
    for (final cell in [28.0, 36.0, 48.0, 64.0]) {
      final slot = pencilSlotSize(cell);
      expect(slot * 3, lessThanOrEqualTo(cell - pencilCellBorder),
          reason: 'клетка $cell: три слота по $slot');
      expect(pencilFontSize(slot), greaterThanOrEqualTo(6.0));
    }
  });
}
