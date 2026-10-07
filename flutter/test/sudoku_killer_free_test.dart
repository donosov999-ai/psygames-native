import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «КИЛЛЕР» И «СВОБОДНО» ВЕРНУЛИСЬ В ПРИЛОЖЕНИЕ (задача 55b97845, 01.10.2026).
///
/// На веб-экране это два из пяти режимов переключателя. Нативный экран перехватил
/// `/games/sudoku`, и до них стало не дойти — пробы молчали, потому что проверяли то, что
/// перенесено, а не то, что было в вебе. Здесь: доски режимов лежат данными и целы; экран
/// «Киллера» рисует суммы и двигает свою ступень; «Свободно» выбирает размер и сложность в
/// меню паузы и прогресса не пишет; у режимов в шапке — их имя, а не «Разбор по шагам».
///
/// Решение для ходов проба считает СВОИМ перебором (классика): у обоих режимов доска
/// единственна без сумм — так их строит веб (суммы киллера нарезаются поверх).
void main() {
  setUpAll(() async => L.load('ru'));
  late SharedState state;

  Future<void> open(WidgetTester tester, SideMode mode, Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues({'language': 'ru', ...prefs});
    state = await SharedState.open();
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state, mode: mode)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  int sideOf(WidgetTester tester) {
    var n = 0;
    while (find.byKey(Key('cell_${n}_$n')).evaluate().isNotEmpty) {
      n++;
    }
    return n;
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
    for (final e in text.evaluate()) {
      final v = int.tryParse((e.widget as Text).data ?? '');
      if (v != null && (e.widget as Text).key == null) return v;   // сумма группы — с ключом cage-sum
    }
    return 0;
  }

  /// Свой перебор: классика n×n (блок 2×3 у 6×6, 3×3 у 9×9).
  bool solve(List<List<int>> g, int n) {
    final br = n == 6 ? 2 : 3, bc = 3;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (g[r][c] != 0) continue;
        for (var v = 1; v <= n; v++) {
          var ok = true;
          for (var i = 0; i < n && ok; i++) {
            if (g[r][i] == v || g[i][c] == v) ok = false;
          }
          final r0 = r ~/ br * br, c0 = c ~/ bc * bc;
          for (var i = 0; i < br && ok; i++) {
            for (var j = 0; j < bc && ok; j++) {
              if (g[r0 + i][c0 + j] == v) ok = false;
            }
          }
          if (!ok) continue;
          g[r][c] = v;
          if (solve(g, n)) return true;
          g[r][c] = 0;
        }
        return false;
      }
    }
    return true;
  }

  Future<void> playToWin(WidgetTester tester) async {
    final n = sideOf(tester);
    final grid = [for (var r = 0; r < n; r++) [for (var c = 0; c < n; c++) digitAt(tester, r, c)]];
    final solution = [for (final row in grid) [...row]];
    expect(solve(solution, n), isTrue, reason: 'доска режима решается классикой');
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (grid[r][c] != 0) continue;
        await tester.tap(find.byKey(Key('cell_${r}_$c')));
        await tester.pump();
        await tester.tap(find.byKey(Key('digit${solution[r][c]}')));
        await tester.pump();
      }
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'доска сошлась');
  }

  test('🔴 доски «Киллера» и «Свободно» лежат данными: 6 ступеней × 6 досок, суммы сходятся с решением', () async {
    final modes = await SideModes.load();
    for (var step = 1; step <= 6; step++) {
      expect(modes.boardsFor(SideMode.killer, step), 6, reason: 'киллер, ступень $step');
      expect(modes.boardsFor(SideMode.free, step), 6, reason: 'свободно, пресет $step');
      for (var i = 0; i < 6; i++) {
        final k = modes.boardAt(SideMode.killer, step, i)!;
        expect(k.n, 9);
        final cages = k.geometry.cages;
        expect(cages, isNotNull, reason: 'у доски киллера есть суммы');
        for (var id = 0; id < cages!.sum.length; id++) {
          if (cages.cells[id].isEmpty) continue;
          final s = cages.cells[id].fold<int>(0, (a, cell) => a + k.solution[cell[0]][cell[1]]);
          expect(s, cages.sum[id], reason: 'киллер $step/$i: сумма группы $id');
        }
        final f = modes.boardAt(SideMode.free, step, i)!;
        expect(f.n, freePreset(step).size, reason: 'свободно $step: размер пресета');
        for (var r = 0; r < f.n; r++) {
          for (var c = 0; c < f.n; c++) {
            if (f.puzzle[r][c] != 0) expect(f.puzzle[r][c], f.solution[r][c]);
          }
        }
      }
    }
  });

  testWidgets('🔴 «Киллер»: имя в шапке, суммы на поле, победа двигает ступень 2 → 3', (tester) async {
    await open(tester, SideMode.killer, {'psygames_sudoku_killer_step_nzt48': '2'});
    expect(find.text('Киллер'), findsWidgets, reason: 'имя режима в шапке');
    expect(find.text('Разбор по шагам'), findsNothing, reason: 'не заголовок разбора');
    expect(find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('cage-sum-')),
        findsWidgets, reason: 'суммы групп нарисованы');
    await playToWin(tester);
    expect(state.get('psygames_sudoku_killer_step_nzt48'), '3', reason: 'ступень киллера выросла — ключ веба');
    expect(state.get('psygames_sudoku_level_nzt48'), isNull, reason: 'основная лестница не тронута');
  });

  testWidgets('🔴 «Свободно»: 6×6 по умолчанию, 9×9 · Средне из меню паузы, победа выбор не меняет', (tester) async {
    await open(tester, SideMode.free, {});
    expect(find.text('Свободно'), findsWidgets, reason: 'имя режима в шапке');
    expect(sideOf(tester), 6, reason: 'первый пресет — 6×6');

    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('9×9 · Средне'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('9×9 · Средне'));
    await tester.pumpAndSettle();
    expect(sideOf(tester), 9, reason: 'выбран 9×9');
    expect(state.get('psygames_sudoku_free_step_nzt48'), '5', reason: 'выбор сохранён');

    await playToWin(tester);
    expect(state.get('psygames_sudoku_free_step_nzt48'), '5', reason: 'у «Свободно» прогресса нет — выбор человека');
  });

  testWidgets('🔴 «Небоскрёбы» и «Неравенства»: в шапке имя режима, а не «Разбор по шагам»', (tester) async {
    await open(tester, SideMode.towers, {});
    expect(find.text('Небоскрёбы'), findsWidgets);
    expect(find.text('Разбор по шагам'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await open(tester, SideMode.unequal, {});
    expect(find.text('Неравенства'), findsWidgets);
    expect(find.text('Разбор по шагам'), findsNothing);
  });
}
