import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/variant_decor.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «НЕМЕЦКИЙ ШЁПОТ» ИГРАЕТСЯ НАЖАТИЯМИ ПО ТОМУ, ЧТО ВИДНО НА ЭКРАНЕ (задача 5b0b7ca2).
///
/// Доски 93–96 без линий не единственны: замер 01.10 — логикой без линий не решается
/// 30 из 30. Поэтому проба решает доску СВОИМ перебором по тому, что видит человек: цифрам
/// клеток и линиям, нарисованным на поле (`CellDecor.whisper`). Нарисуй экран линию не там
/// или не нарисуй вовсе — решение пробы разойдётся с доской, и партия не сойдётся.
/// Перебор свой, а не `solveGrid`: проверять перенос тем же переносом нельзя.
void main() {
  // Пробы ищут русские подписи — словарь грузится явно (без него L.t вернёт ключ).
  setUpAll(() async => L.load('ru'));
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '95'});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return int.tryParse(s) ?? 0;
  }

  /// Линии — с поля: звено, нарисованное в клетке.
  ThermoLink? lineAt(WidgetTester tester, int r, int c) {
    final f = find.byKey(Key('decor_${r}_$c'));
    if (f.evaluate().isEmpty) return null;
    return (tester.widget<CustomPaint>(f).painter! as CellDecorPainter).decor.whisper;
  }

  /// Свой перебор: классика 9×9 + соседи по линии отличаются минимум на 5. Клетка с
  /// наименьшим числом кандидатов — первой; считает до двух решений.
  int solve(List<List<int>> g, List<List<ThermoLink?>> lines, List<List<int>> out) {
    bool ok(int r, int c, int v) {
      for (var i = 0; i < 9; i++) {
        if (g[r][i] == v || g[i][c] == v) return false;
      }
      final r0 = r ~/ 3 * 3, c0 = c ~/ 3 * 3;
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          if (g[r0 + i][c0 + j] == v) return false;
        }
      }
      final l = lines[r][c];
      for (final nb in [l?.prev, l?.next]) {
        if (nb == null) continue;
        final o = g[nb[0]][nb[1]];
        if (o != 0 && (o - v).abs() < 5) return false;
      }
      return true;
    }

    var found = 0;
    void walk() {
      if (found > 1) return;
      var br = -1, bc = -1;
      List<int>? best;
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          if (g[r][c] != 0) continue;
          final cands = [for (var v = 1; v <= 9; v++) if (ok(r, c, v)) v];
          if (best == null || cands.length < best.length) {
            best = cands;
            br = r;
            bc = c;
          }
        }
      }
      if (best == null) {
        found++;
        for (var r = 0; r < 9; r++) {
          out[r] = [...g[r]];
        }
        return;
      }
      for (final v in best) {
        g[br][bc] = v;
        walk();
        g[br][bc] = 0;
      }
    }

    walk();
    return found;
  }

  testWidgets('🔴 ступень 95: правило «шёпот» в шапке, линии на поле, доска доигрывается нажатиями', (tester) async {
    await boot(tester);
    expect(find.textContaining('шёпот'), findsWidgets, reason: 'имя правила видно игроку');

    final grid = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) digitAt(tester, r, c)]];
    final lines = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) lineAt(tester, r, c)]];
    final onLine = lines.expand((row) => row).where((l) => l != null).length;
    expect(onLine, greaterThanOrEqualTo(6), reason: 'на поле нарисованы линии шёпота');

    // Без линий доска не единственна — иначе проба не доказывает, что линии нужны.
    final none = List.generate(9, (_) => List<ThermoLink?>.filled(9, null));
    final scratch = List.generate(9, (_) => List.filled(9, 0));
    expect(solve([for (final row in grid) [...row]], none, scratch), 2, reason: 'без линий решений больше одного');

    final solution = List.generate(9, (_) => List.filled(9, 0));
    expect(solve([for (final row in grid) [...row]], lines, solution), 1,
        reason: 'по видимым линиям решение единственно');

    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] != 0) continue;
        await tester.tap(find.byKey(Key('cell_${r}_$c')));
        await tester.pump();
        await tester.tap(find.byKey(Key('digit${solution[r][c]}')));
        await tester.pump();
      }
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'доска сошлась по решению из видимых линий');
    expect(state.get('psygames_sudoku_level_nzt48'), '96');
  });
}
