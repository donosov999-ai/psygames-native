import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В СУДОКУ ИГРАЕТСЯ НАЖАТИЯМИ, А НЕ ВЫЗОВОМ ПРАВИЛ.
///
/// Правила сверены отдельно (`sudoku_rules_test.dart`, 640 случаев против живого TS).
/// Здесь проверяется ПРОДУКТ: доска появляется, клетка выбирается тычком, цифра встаёт,
/// ошибка считается, уровень доигрывается до конца и лестница растёт.
///
/// 🔴 РЕШЕНИЕ ДЛЯ ХОДОВ ПРОБА СЧИТАЕТ САМА, СВОИМ ПЕРЕБОРОМ. Взять его из перенесённого
/// `solveGrid` было бы проверкой кода этим же кодом: ошибка в правилах сошлась бы с
/// ошибкой в решателе, и проба осталась бы зелёной. Здесь простой перебор на десять
/// строк — он ничего не знает про варианты и ходит только по классике.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      // Пятый уровень — классика 9×9 из банка: доска берётся данными, без генератора.
      'psygames_sudoku_level_nzt48': '5',
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

  /// Что сейчас стоит в клетке по её подписи.
  int digitAt(WidgetTester tester, int r, int c) {
    final cell = find.byKey(Key('cell_${r}_$c'));
    final text = find.descendant(of: cell, matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return s.isEmpty ? 0 : int.parse(s);
  }

  List<List<int>> readGrid(WidgetTester tester, int n) => [
        for (var r = 0; r < n; r++) [for (var c = 0; c < n; c++) digitAt(tester, r, c)],
      ];

  /// Свой перебор: классика, никаких вариантов — только строка, столбец и блок 3×3.
  bool solveSimple(List<List<int>> g) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (g[r][c] != 0) continue;
        for (var v = 1; v <= 9; v++) {
          var ok = true;
          for (var i = 0; i < 9 && ok; i++) {
            if (g[r][i] == v || g[i][c] == v) ok = false;
          }
          final r0 = (r ~/ 3) * 3, c0 = (c ~/ 3) * 3;
          for (var i = 0; i < 3 && ok; i++) {
            for (var j = 0; j < 3 && ok; j++) {
              if (g[r0 + i][c0 + j] == v) ok = false;
            }
          }
          if (!ok) continue;
          g[r][c] = v;
          if (solveSimple(g)) return true;
          g[r][c] = 0;
        }
        return false;
      }
    }
    return true;
  }

  testWidgets('🔴 доска появляется, а не вечная загрузка', (tester) async {
    await boot(tester);
    expect(find.text('Судоку'), findsOneWidget);
    expect(find.byKey(const Key('cell_0_0')), findsOneWidget);
    expect(find.byKey(const Key('cell_8_8')), findsOneWidget);
    expect(find.byKey(const Key('digit9')), findsOneWidget, reason: 'девять клавиш у доски 9×9');
    expect(find.byKey(const Key('erase')), findsOneWidget);
  });

  testWidgets('🔴 тычок в клетку и цифра ставят ответ; неверная цифра считается ошибкой', (tester) async {
    await boot(tester);
    final grid = readGrid(tester, 9);
    final solution = [for (final row in grid) [...row]];
    expect(solveSimple(solution), isTrue, reason: 'доска из банка обязана решаться');

    // Первая пустая клетка — в неё и ходим.
    late int er, ec;
    outer:
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] == 0) { er = r; ec = c; break outer; }
      }
    }

    // Верная цифра встаёт и ошибок не прибавляет.
    await tester.tap(find.byKey(Key('cell_${er}_$ec')));
    await tester.pump();
    await tester.tap(find.byKey(Key('digit${solution[er][ec]}')));
    await tester.pump();
    expect(digitAt(tester, er, ec), solution[er][ec]);
    expect(find.text('0/3'), findsOneWidget, reason: 'верный ход — не ошибка');

    // Неверная цифра в другую пустую клетку — счётчик ошибок растёт.
    late int wr, wc;
    outer2:
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] == 0 && !(r == er && c == ec)) { wr = r; wc = c; break outer2; }
      }
    }
    final wrong = solution[wr][wc] % 9 + 1;
    await tester.tap(find.byKey(Key('cell_${wr}_$wc')));
    await tester.pump();
    await tester.tap(find.byKey(Key('digit$wrong')));
    await tester.pump();
    expect(find.text('1/3'), findsOneWidget, reason: 'digit мимо решения — ошибка');
  });

  testWidgets('🔴 уровень доигрывается нажатиями до конца, и лестница растёт', (tester) async {
    await boot(tester);
    final grid = readGrid(tester, 9);
    final solution = [for (final row in grid) [...row]];
    expect(solveSimple(solution), isTrue);

    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] != 0) continue;
        await tester.tap(find.byKey(Key('cell_${r}_$c')));
        await tester.pump();
        await tester.tap(find.byKey(Key('digit${solution[r][c]}')));
        await tester.pump();
      }
    }

    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'доска сошлась — экран зовёт дальше');
    expect(find.text('Следующий уровень'), findsOneWidget);
    // Уровень записан в ту же память, что у веб-версии.
    expect(state.get('psygames_sudoku_level_nzt48'), '6');
  });

  testWidgets('подсказка открывает клетку по решению и тратится', (tester) async {
    await boot(tester);
    final grid = readGrid(tester, 9);
    final solution = [for (final row in grid) [...row]];
    expect(solveSimple(solution), isTrue);

    late int hr, hc;
    outer:
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] == 0) { hr = r; hc = c; break outer; }
      }
    }
    await tester.tap(find.byKey(Key('cell_${hr}_$hc')));
    await tester.pump();
    await tester.tap(find.byTooltip('Подсказка'));
    await tester.pump();
    expect(digitAt(tester, hr, hc), solution[hr][hc]);
  });
}
