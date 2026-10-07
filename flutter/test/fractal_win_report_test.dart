import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ФРАКТАЛ ДОИГРЫВАЕТСЯ НАЖАТИЯМИ ДО ПОБЕДЫ — И ПОБЕДА ЗАПИСАНА ОТЧЁТОМ, КАК У ВЕБА.
///
/// Сверка «веб против натива» 138f7818 (02.10.2026): натив звал `win()` без аргументов —
/// победа уходила без счёта и времени. Здесь партия первой ступени (без порталов) играется
/// целиком: каждая дочерняя решается СВОИМ перебором по видимым цифрам до порога (экран сам
/// возвращается на карту), затем корень — уже с цифрами, пришедшими снизу.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_fractal_level_nzt48': '1'});
    state = await SharedState.open();
  });

  tearDown(() => SessionReport.sink = null);

  int digitAt(WidgetTester tester, String prefix, int r, int c) {
    final cell = find.byKey(Key('$prefix${r}_$c'));
    if (cell.evaluate().isEmpty) return -1;
    final text = find.descendant(of: cell, matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return int.tryParse(s) ?? 0;
  }

  List<List<int>> read(WidgetTester tester, String prefix) =>
      [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) digitAt(tester, prefix, r, c)]];

  /// Классическая 9×9 своим перебором; null — решения нет.
  List<List<int>>? solve(List<List<int>> grid) {
    final g = [for (final row in grid) [...row]];
    bool ok(int r, int c, int v) {
      for (var i = 0; i < 9; i++) {
        if (g[r][i] == v || g[i][c] == v) return false;
      }
      final r0 = r - r % 3, c0 = c - c % 3;
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          if (g[r0 + i][c0 + j] == v) return false;
        }
      }
      return true;
    }

    bool walk(int k) {
      if (k == 81) return true;
      final r = k ~/ 9, c = k % 9;
      if (g[r][c] != 0) return walk(k + 1);
      for (var v = 1; v <= 9; v++) {
        if (!ok(r, c, v)) continue;
        g[r][c] = v;
        if (walk(k + 1)) return true;
        g[r][c] = 0;
      }
      return false;
    }

    return walk(0) ? g : null;
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  testWidgets('🔴 победа во фрактале — отчёт с режимом, ступенью, временем и счётом не ниже пола', (tester) async {
    final reports = <Map<String, dynamic>>[];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        if (find.byKey(const Key('tile0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

    // Девять дочерних — каждая до порога: экран сам возвращается на карту.
    for (var k = 0; k < 9; k++) {
      await tap(tester, find.byKey(Key('tile$k')));
      expect(find.byKey(const Key('cell_0_0')), findsOneWidget, reason: 'сетка $k не открылась');
      if (k == 0) {
        // Одна доказуемая ошибка (повтор в строке) и ластик — ошибка остаётся в счёте.
        final g = read(tester, 'cell_');
        final r = [for (var i = 0; i < 9; i++) i].firstWhere((i) => g[i].contains(0) && g[i].any((v) => v != 0));
        await tap(tester, find.byKey(Key('cell_${r}_${g[r].indexOf(0)}')));
        await tap(tester, find.byKey(Key('digit${g[r].firstWhere((v) => v != 0)}')));
        await tap(tester, find.byKey(const Key('erase')));
      }
      final grid = read(tester, 'cell_');
      final sol = solve(grid);
      expect(sol, isNotNull, reason: 'дочерняя $k не решается по видимым цифрам');
      outer:
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          if (grid[r][c] != 0) continue;
          await tap(tester, find.byKey(Key('cell_${r}_$c')));
          await tap(tester, find.byKey(Key('digit${sol![r][c]}')));
          if (find.byKey(const Key('cell_0_0')).evaluate().isEmpty) break outer;   // порог взят
        }
      }
      expect(find.byKey(const Key('root_0_0')), findsOneWidget, reason: 'после сетки $k экран не вернулся на карту');
    }

    // Корень: цифры снизу уже стоят — доска однозначна.
    final root = read(tester, 'root_');
    final rootSol = solve(root);
    expect(rootSol, isNotNull, reason: 'корень с цифрами снизу не решается');
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (root[r][c] != 0) continue;
        await tap(tester, find.byKey(Key('root_${r}_$c')));
        await tap(tester, find.byKey(Key('digit${rootSol![r][c]}')));
      }
    }
    await tester.pump(const Duration(milliseconds: 100));

    expect(reports, hasLength(1), reason: 'победа не записана отчётом');
    final rep = reports.single;
    expect(rep['game_type'], 'sudoku_fractal');
    expect(rep['mode'], 'fractal');
    expect(rep['difficulty'], 'lvl1');
    expect(rep['score'] as int, greaterThanOrEqualTo(fractalWinFloor), reason: 'у победы есть пол');
    expect(rep['errors'], 1, reason: 'ошибка партии дошла до отчёта');
    expect(rep['score'] as int, lessThanOrEqualTo(4000 - 60), reason: 'штраф веба: 60 очков за ошибку');
    expect((rep['details'] as Map)['level'], 1);
    expect(state.get('psygames_sudoku_fractal_level_nzt48'), '2', reason: 'ступень выросла');
    expect(state.get('psygames_sudoku_fractal_stars_nzt48'), '{"1":2}', reason: 'одна ошибка — две звезды (формула веба)');
    expect(state.get('psygames_resume_sudoku_fractal_nzt48'), isNull, reason: 'выигранная партия не поднимается — снимок стёрт');
  });
}
