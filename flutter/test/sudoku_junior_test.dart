import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/junior.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «СУДОКУ ДЛЯ МАЛЫШЕЙ»: доски 4×4 и звери (задача 01dc3ff0).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() => SessionReport.sink = null);

  /// Все полные решётки 4×4 — своим перебором.
  List<List<List<int>>> allGrids() {
    final out = <List<List<int>>>[];
    final g = List.generate(4, (_) => List<int>.filled(4, 0));
    bool ok(int r, int c, int v) {
      for (var i = 0; i < 4; i++) {
        if (g[r][i] == v || g[i][c] == v) return false;
      }
      final r0 = r - r % 2, c0 = c - c % 2;
      for (var i = 0; i < 2; i++) {
        for (var j = 0; j < 2; j++) {
          if (g[r0 + i][c0 + j] == v) return false;
        }
      }
      return true;
    }

    void walk(int k) {
      if (k == 16) {
        out.add([for (final row in g) [...row]]);
        return;
      }
      final r = k ~/ 4, c = k % 4;
      for (var v = 1; v <= 4; v++) {
        if (!ok(r, c, v)) continue;
        g[r][c] = v;
        walk(k + 1);
        g[r][c] = 0;
      }
    }

    walk(0);
    return out;
  }

  /// Решётка законна: каждая строка, столбец и блок 2×2 — перестановка 1…4.
  /// (`juniorSolutions` заполненные клетки на законность НЕ проверяет — он считает
  /// продолжения, — поэтому для решения нужна своя проверка.)
  bool legal(List<List<int>> g) {
    bool perm(Iterable<int> xs) => (xs.toList()..sort()).join() == '1234';
    for (var i = 0; i < 4; i++) {
      if (!perm(g[i]) || !perm([for (var r = 0; r < 4; r++) g[r][i]])) return false;
    }
    for (final r0 in [0, 2]) {
      for (final c0 in [0, 2]) {
        if (!perm([g[r0][c0], g[r0][c0 + 1], g[r0 + 1][c0], g[r0 + 1][c0 + 1]])) return false;
      }
    }
    return true;
  }

  test('🔴 граница доски проверена перебором: 288 решёток, трёх подсказок не хватает никогда', () {
    final grids = allGrids();
    expect(grids.length, 288);
    var uniqueWithThree = 0, uniqueWithFour = 0;
    for (final g in grids) {
      for (var a = 0; a < 16; a++) {
        for (var b = a + 1; b < 16; b++) {
          for (var c = b + 1; c < 16; c++) {
            final p = List.generate(4, (_) => List<int>.filled(4, 0));
            for (final i in [a, b, c]) {
              p[i ~/ 4][i % 4] = g[i ~/ 4][i % 4];
            }
            if (juniorSolutions(p) == 1) uniqueWithThree++;
          }
        }
      }
    }
    expect(uniqueWithThree, 0, reason: 'три подсказки дали единственное решение — значит, 12 пустых не граница');
    // А четырёх хватает: доска ступени 12 существует (её строит генератор ниже).
    final top = juniorBoard(juniorSteps, 7);
    if (top.puzzle.expand((r) => r).where((v) => v == 0).length == 12) uniqueWithFour++;
    expect(uniqueWithFour, 1);
  });

  test('🔴 каждая ступень: ровно её число пустых, решение единственно и сходится с задачей', () {
    for (var step = 1; step <= juniorSteps; step++) {
      final target = juniorBlanks[step - 1];
      for (var seed = 1; seed <= 25; seed++) {
        final b = juniorBoard(step, seed * 31 + step);
        final blanks = b.puzzle.expand((r) => r).where((v) => v == 0).length;
        expect(blanks, target, reason: 'ступень $step, зерно $seed');
        expect(juniorSolutions(b.puzzle), 1, reason: 'ступень $step, зерно $seed: решение не единственно');
        for (var r = 0; r < 4; r++) {
          for (var c = 0; c < 4; c++) {
            if (b.puzzle[r][c] != 0) expect(b.puzzle[r][c], b.solution[r][c]);
          }
        }
        expect(legal(b.solution), isTrue, reason: 'ступень $step, зерно $seed: решение нарушает правила');
      }
    }
    final a = juniorBoard(3, 42), c = juniorBoard(3, 42);
    expect(a.puzzle, c.puzzle, reason: 'одно зерно — одна доска');
  });

  testWidgets('🔴 экран малышей: звери по умолчанию, партия нажатиями двигает свою ступень, лестница не тронута',
      (tester) async {
    SharedPreferences.setMockInitialValues({'language': 'ru'});
    final reports = <Map<String, dynamic>>[];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    late SharedState state;
    await tester.runAsync(() async {
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state, junior: true)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

    expect(find.byKey(const Key('cell_3_3')), findsOneWidget, reason: 'поле 4×4');
    expect(find.byKey(const Key('cell_4_4')), findsNothing);
    expect(find.text('1/$juniorSteps'), findsOneWidget, reason: 'своя мини-лестница');
    final picks = animalPicks[4]!;
    for (var v = 1; v <= 4; v++) {
      final im = find.descendant(of: find.byKey(Key('digit$v')), matching: find.byType(Image));
      expect(((tester.widget<Image>(im.first)).image as AssetImage).assetName, animalImage(picks[v - 1]),
          reason: 'клавиша $v — зверь (по умолчанию у малышей)');
    }

    // Цифру клетки читаем с подписи картинки (для чтеца это сама цифра).
    final grid = List.generate(4, (_) => List<int>.filled(4, 0));
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        final im = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Image));
        if (im.evaluate().isNotEmpty) grid[r][c] = int.parse(tester.widget<Image>(im.first).semanticLabel!);
      }
    }
    // Своё решение: из всех 288 решёток — те, что совпадают с подсказками на экране.
    final fits = allGrids().where((g) {
      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 4; c++) {
          if (grid[r][c] != 0 && grid[r][c] != g[r][c]) return false;
        }
      }
      return true;
    }).toList();
    expect(fits.length, 1, reason: 'по подсказкам с экрана решение не единственно — прочитано не всё');
    final solution = fits.single;
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        if (grid[r][c] != 0) continue;
        await tester.tap(find.byKey(Key('cell_${r}_$c')));
        await tester.pump();
        await tester.tap(find.byKey(Key('digit${solution[r][c]}')));
        await tester.pump();
      }
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'доска сошлась');
    expect(state.get('psygames_sudoku_junior_step_${state.activeProfile}'), '2', reason: 'ступень малышей выросла');
    expect(state.get('psygames_sudoku_level_${state.activeProfile}'), isNull, reason: 'лестница на 92 ступени не тронута');
    expect(reports.single['mode'], 'junior-1');
    expect((reports.single['details'] as Map)['skin'], 'animals');
  });
}
