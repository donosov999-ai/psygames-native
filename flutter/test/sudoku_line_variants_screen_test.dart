import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/variant_decor.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЛИНЕЙНЫЕ ВАРИАНТЫ ИГРАЮТСЯ НАЖАТИЯМИ ПО ТОМУ, ЧТО ВИДНО НА ЭКРАНЕ — «немецкий шёпот»
/// (93–96, задача 5b0b7ca2) и «ренбан» (97–100, задача 031a7684).
///
/// Доски этих ступеней без линий не единственны (замер 01.10: логикой без линий не решается
/// ни одна). Поэтому проба решает доску СВОИМ перебором по тому, что видит человек: цифрам
/// клеток и линиям, нарисованным на поле (`CellDecor.whisper` / `.renban`). Нарисуй экран
/// линию не там или не нарисуй вовсе — решение пробы разойдётся с доской, и партия не сойдётся.
/// Перебор и обход линии свои, а не `solveGrid`/`lineCells`: проверять перенос тем же
/// переносом нельзя. И ещё одно: стартовая ступень — предпоследняя у варианта, победа обязана
/// двигать лестницу (так 01.10 нашёлся потолок `maxLevel: 92`, зашитый в экран).
void main() {
  // Пробы ищут русские подписи — словарь грузится явно (без него L.t вернёт ключ).
  setUpAll(() async => L.load('ru'));
  late SharedState state;


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
  ThermoLink? lineAt(WidgetTester tester, int r, int c, String variant) {
    final f = find.byKey(Key('decor_${r}_$c'));
    if (f.evaluate().isEmpty) return null;
    final d = (tester.widget<CustomPaint>(f).painter! as CellDecorPainter).decor;
    return switch (variant) {
      'renban' => d.renban,
      'regionsum' => d.regionsum,
      'palindrome' => d.palindrome,
      'between' => d.between,
      'lockout' => d.lockout,
      _ => d.whisper,
    };
  }

  /// Своя прогулка по линии: все клетки линии через (r, c).
  List<List<int>> walkLine(List<List<ThermoLink?>> lines, int r, int c) {
    var cur = [r, c];
    while (lines[cur[0]][cur[1]]?.prev != null) {
      cur = lines[cur[0]][cur[1]]!.prev!;
    }
    final out = <List<int>>[cur];
    while (lines[cur[0]][cur[1]]?.next != null) {
      cur = lines[cur[0]][cur[1]]!.next!;
      out.add(cur);
    }
    return out;
  }

  /// Свой перебор: классика 9×9 + правило линии. Клетка с наименьшим числом кандидатов —
  /// первой; считает до двух решений.
  int solve(List<List<int>> g, List<List<ThermoLink?>> lines, List<List<int>> out, String variant) {
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
      if (l == null) return true;
      if (variant == 'whisper') {
        for (final nb in [l.prev, l.next]) {
          if (nb == null) continue;
          final o = g[nb[0]][nb[1]];
          if (o != 0 && (o - v).abs() < 5) return false;
        }
        return true;
      }
      final cells = walkLine(lines, r, c);
      if (variant == 'lockout') {
        // Lockout: известные концы отличаются на ≥ 4, средние вне отрезка; при одном конце —
        // средние ему не равны.
        int at(List<int> cell) => cell[0] == r && cell[1] == c ? v : g[cell[0]][cell[1]];
        final a = at(cells.first), b = at(cells.last);
        final mids = [for (final cell in cells.sublist(1, cells.length - 1)) at(cell)].where((x) => x != 0).toList();
        if (a != 0 && b != 0) {
          if ((a - b).abs() < 4) return false;
          return mids.every((x) => x < (a < b ? a : b) || x > (a < b ? b : a));
        }
        final end = a != 0 ? a : b;
        return end == 0 || mids.every((x) => x != end);
      }
      if (variant == 'between') {
        // «Между концами»: известные средние строго между известными концами; при одном конце —
        // по одну сторону от него.
        int at(List<int> cell) => cell[0] == r && cell[1] == c ? v : g[cell[0]][cell[1]];
        final a = at(cells.first), b = at(cells.last);
        final mids = [for (final cell in cells.sublist(1, cells.length - 1)) at(cell)].where((x) => x != 0).toList();
        if (a != 0 && b != 0) {
          if (a == b) return false;
          return mids.every((x) => x > (a < b ? a : b) && x < (a < b ? b : a));
        }
        final end = a != 0 ? a : b;
        return end == 0 || mids.every((x) => x > end) || mids.every((x) => x < end);
      }
      if (variant == 'palindrome') {
        // Палиндром: зеркальная клетка линии, если заполнена, равна этой.
        final i = cells.indexWhere((cell) => cell[0] == r && cell[1] == c);
        final m = cells[cells.length - 1 - i];
        final o = g[m[0]][m[1]];
        return (m[0] == r && m[1] == c) || o == 0 || o == v;
      }
      if (variant == 'regionsum') {
        // Равные суммы: у ПОЛНОСТЬЮ заполненных блоков линии сумма одна (проверка — на полной линии).
        final sums = <int, int>{};
        var full = true;
        for (final cell in cells) {
          final o = cell[0] == r && cell[1] == c ? v : g[cell[0]][cell[1]];
          if (o == 0) { full = false; break; }
          final box = cell[0] ~/ 3 * 3 + cell[1] ~/ 3;
          sums[box] = (sums[box] ?? 0) + o;
        }
        return !full || sums.values.toSet().length == 1;
      }
      // Ренбан: на линии без повторов, разброс не шире длины линии.
      final vals = <int>[v];
      for (final cell in cells) {
        if (cell[0] == r && cell[1] == c) continue;
        final o = g[cell[0]][cell[1]];
        if (o == 0) continue;
        if (vals.contains(o)) return false;
        vals.add(o);
      }
      vals.sort();
      return vals.last - vals.first <= cells.length - 1;
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

  for (final v in const [
    (variant: 'whisper', start: 95, name: 'шёпот'),
    (variant: 'renban', start: 99, name: 'ренбан'),
    (variant: 'regionsum', start: 103, name: 'равные суммы'),
    (variant: 'palindrome', start: 107, name: 'палиндром'),
    (variant: 'between', start: 111, name: 'между концами'),
    (variant: 'lockout', start: 115, name: 'замок'),
  ]) {
    testWidgets('🔴 «${v.name}», ступень ${v.start}: правило в шапке, линии на поле, доска доигрывается нажатиями',
        (tester) async {
      SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '${v.start}'});
      state = await SharedState.open();
      await boot(tester);
      expect(find.textContaining(v.name), findsWidgets, reason: 'имя правила видно игроку');

      final grid = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) digitAt(tester, r, c)]];
      final lines = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) lineAt(tester, r, c, v.variant)]];
      final onLine = lines.expand((row) => row).where((l) => l != null).length;
      expect(onLine, greaterThanOrEqualTo(6), reason: 'на поле нарисованы линии «${v.name}»');

      // Без линий доска не единственна — иначе проба не доказывает, что линии нужны.
      final none = List.generate(9, (_) => List<ThermoLink?>.filled(9, null));
      final scratch = List.generate(9, (_) => List.filled(9, 0));
      expect(solve([for (final row in grid) [...row]], none, scratch, v.variant), 2, reason: 'без линий решений больше одного');

      final solution = List.generate(9, (_) => List.filled(9, 0));
      expect(solve([for (final row in grid) [...row]], lines, solution, v.variant), 1,
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
      expect(state.get('psygames_sudoku_level_nzt48'), '${v.start + 1}', reason: 'победа двигает лестницу');
      await tester.pumpWidget(const SizedBox());
    });
  }
}
