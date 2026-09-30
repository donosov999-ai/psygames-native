import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/samurai/layout.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В САМУРАЯ ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// Правила сверены отдельно (`samurai_rules_test.dart`). Здесь проверяется ПРОДУКТ:
/// доска появляется, два масштаба переключаются, цифра встаёт, ошибка считается по
/// лестнице, доска доигрывается до конца и ступень растёт.
///
/// 🔴 РЕШЕНИЕ ПРОБА СЧИТАЕТ САМА, СВОИМ ПЕРЕБОРОМ. Взять его из перенесённых правил
/// было бы проверкой кода этим же кодом: одна и та же ошибка сошлась бы сама с собой.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      // Первая ступень: дырок меньше всего (155), партия проходится нажатиями за раз.
      'psygames_sudoku_samurai_level_nzt48': '1',
    });
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SamuraiScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final cell = find.byKey(Key('cell_${r}_$c'));
    if (cell.evaluate().isEmpty) return -1;
    final text = find.descendant(of: cell, matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return s.isEmpty ? 0 : int.parse(s);
  }

  /// Своя раскладка пяти сеток — переписана заново, не взята из `rules.dart`.
  const origins = [
    [0, 0], [0, 12], [12, 0], [12, 12], [6, 6],
  ];
  List<List<int>> gridsAt(int r, int c) => [
        for (final g in origins)
          if (r >= g[0] && r < g[0] + 9 && c >= g[1] && c < g[1] + 9) g,
      ];
  final cells = [
    for (var r = 0; r < 21; r++)
      for (var c = 0; c < 21; c++)
        if (gridsAt(r, c).isNotEmpty) [r, c],
  ];

  bool fits(List<List<int>> g, int r, int c, int v) {
    for (final o in gridsAt(r, c)) {
      final r0 = o[0], c0 = o[1];
      for (var i = 0; i < 9; i++) {
        if (g[r][c0 + i] == v) return false;
        if (g[r0 + i][c] == v) return false;
      }
      final br = r0 + ((r - r0) ~/ 3) * 3, bc = c0 + ((c - c0) ~/ 3) * 3;
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          if (g[br + i][bc + j] == v) return false;
        }
      }
    }
    return true;
  }

  /// Перебор от самой ограниченной клетки — иначе пять связанных сеток считаются долго.
  bool solve(List<List<int>> g) {
    var bestR = -1, bestC = -1;
    List<int>? best;
    for (final cell in cells) {
      final r = cell[0], c = cell[1];
      if (g[r][c] != 0) continue;
      final cands = [for (var v = 1; v <= 9; v++) if (fits(g, r, c, v)) v];
      if (best == null || cands.length < best.length) {
        best = cands;
        bestR = r;
        bestC = c;
        if (cands.isEmpty) return false;
      }
    }
    if (best == null) return true;
    for (final v in best) {
      g[bestR][bestC] = v;
      if (solve(g)) return true;
      g[bestR][bestC] = 0;
    }
    return false;
  }

  List<List<int>> readGrid(WidgetTester tester) => [
        for (var r = 0; r < 21; r++)
          [for (var c = 0; c < 21; c++) digitAt(tester, r, c).clamp(0, 9)],
      ];

  Future<void> tapCell(WidgetTester tester, int r, int c) async {
    final f = find.byKey(Key('cell_${r}_$c'));
    await tester.ensureVisible(f);
    await tester.pump();
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  testWidgets('🔴 доска появляется: 369 клеток, дырок между сетками нет', (tester) async {
    await boot(tester);
    expect(find.text('Самурай'), findsOneWidget);
    expect(find.byKey(const Key('cell_0_0')), findsOneWidget);
    expect(find.byKey(const Key('cell_20_20')), findsOneWidget);
    expect(find.byKey(const Key('cell_6_6')), findsOneWidget, reason: 'cell_ перекрытия');
    // Клетки между сетками не существует — и в разметке её тоже нет.
    expect(find.byKey(const Key('cell_0_10')), findsNothing);
    expect(find.byKey(const Key('digit9')), findsOneWidget);
    expect(find.byKey(const Key('erase')), findsOneWidget);
  });

  /// 🔴 ЖАЛОБА «ПОЛЕ НЕ ВЛЕЗАЕТ» — ЭТО ПРО ЭТУ АРИФМЕТИКУ.
  /// Считается вызовом, а не чтением разметки: разметка может показывать что угодно,
  /// а в палец попадает именно этот размер.
  test('🔴 рабочий масштаб даёт клетку не меньше пальца, карта влезает целиком', () {
    for (final width in [320.0, 360.0, 390.0, 430.0]) {
      expect(cellSizeFor(width, SamuraiZoom.work), greaterThanOrEqualTo(touchCell),
          reason: 'ширина $width: клетка ${cellSizeFor(width, SamuraiZoom.work)}');
    }
    // Карта на обычном телефоне помещается в обе стороны целиком — ради этого она и есть.
    expect(mapFits(360, 300), isTrue);
    // А в тесном поле каркаса — НЕ помещается, и врать об этом нельзя: 21 ряд по 12
    // точек = 252 > 179 (замер веб-версии 17.09). Экран тогда обязан листать карту —
    // это проверяет проба «карта листается» ниже.
    expect(mapFits(390, 179), isFalse);
    // Клетка не вырождается: 12 точек — нижняя граница.
    expect(cellSizeFor(390, SamuraiZoom.map, heightRoom: 60), 12);
  });

  testWidgets('🔴 тычок с карты переводит в рабочий масштаб: играть с клетки в 16 точек нельзя',
      (tester) async {
    await boot(tester);
    expect(find.byTooltip('Крупнее'), findsOneWidget, reason: 'старт — карта');

    final before = tester.getSize(find.byKey(const Key('cell_0_0'))).width;
    await tapCell(tester, 0, 0);
    final after = tester.getSize(find.byKey(const Key('cell_0_0'))).width;

    expect(find.byTooltip('Вся фигура'), findsOneWidget, reason: 'после тычка — рабочий масштаб');
    expect(after, greaterThanOrEqualTo(touchCell));
    expect(after, greaterThan(before), reason: 'было $before, стало $after');
  });

  /// 🔴 ЖАЛОБА «ПОЛЕ НЕ ВЛЕЗАЕТ» ВТОРОЙ ПОЛОВИНОЙ: когда карта не помещается, нижние
  /// сетки обязаны ДОСТАВАТЬСЯ, а не пропадать под кнопками.
  testWidgets('🔴 тесное поле: карта листается, нижняя сетка достаётся', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 520));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await boot(tester);

    final last = find.byKey(const Key('cell_20_20'));
    expect(last, findsOneWidget);
    await tester.ensureVisible(last);
    await tester.pump();
    final rect = tester.getRect(last);
    expect(rect.top, greaterThanOrEqualTo(0.0), reason: 'cell_ уехала за верх: $rect');
    expect(rect.bottom, lessThanOrEqualTo(520.0), reason: 'cell_ уехала за низ: $rect');
  });

  testWidgets('🔴 цифра встаёт, а мимо решения — считается ошибкой по лестнице', (tester) async {
    await boot(tester);
    final grid = readGrid(tester);
    final solution = [for (final row in grid) [...row]];
    expect(solve(solution), isTrue, reason: 'выгруженная доска обязана решаться');

    final empty = [for (final cell in cells) if (grid[cell[0]][cell[1]] == 0) cell];
    expect(empty.length, greaterThan(100), reason: 'пустых клеток: ${empty.length}');

    final a = empty.first;
    await tapCell(tester, a[0], a[1]);
    await tester.tap(find.byKey(Key('digit${solution[a[0]][a[1]]}')));
    await tester.pump();
    expect(digitAt(tester, a[0], a[1]), solution[a[0]][a[1]]);
    expect(find.text('0/10'), findsOneWidget, reason: 'верный ход — не ошибка; на 1-й ступени прощается 10');

    final b = empty[1];
    await tapCell(tester, b[0], b[1]);
    await tester.tap(find.byKey(Key('digit${solution[b[0]][b[1]] % 9 + 1}')));
    await tester.pump();
    expect(find.text('1/10'), findsOneWidget, reason: 'digit мимо решения — ошибка');
  });

  testWidgets('🔴 доска доигрывается нажатиями, и ступень растёт', (tester) async {
    await boot(tester);
    final grid = readGrid(tester);
    final solution = [for (final row in grid) [...row]];
    expect(solve(solution), isTrue);

    for (final cell in cells) {
      final r = cell[0], c = cell[1];
      if (grid[r][c] != 0) continue;
      await tapCell(tester, r, c);
      await tester.tap(find.byKey(Key('digit${solution[r][c]}')));
      await tester.pump();
    }

    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'доска сошлась — экран зовёт дальше');
    expect(find.text('Следующая ступень'), findsOneWidget);
    // Ступень записана в тот же ключ, что у веб-версии.
    expect(state.get('psygames_sudoku_samurai_level_nzt48'), '2');
  });
}
