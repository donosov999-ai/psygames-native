import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/junior.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «СУДОКУ ДЛЯ МАЛЫШЕЙ»: звери 4×4 → «Мяу — друзья» 4×4 → звери 6×6 (задачи 01dc3ff0, fa0d6f9c).
///
/// Доски приходят выгрузкой (`tools/export_kids_boards.py`, генератор MindLab). Здесь они
/// проверяются СВОИМ перебором, чтобы генератор и приложение не разошлись молча, а экран —
/// нажатиями: доска проходится, на «Мяу» доска, законная по классике, но с котом без мыши,
/// не засчитывается, поле 6×6 — со зверями.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() => SessionReport.sink = null);

  // Лимит ошибок экрана (`_SudokuScreenState.errorLimit`, правило веб-версии).
  const errorLimit = 3;

  KidsBoards data() =>
      KidsBoards.parse(jsonDecode(File('assets/levels/sudoku-kids-boards.json').readAsStringSync()) as Map<String, Object?>);

  /// Все решения задания (до [limit]) своим перебором: строки, столбцы, блоки [br]×[bc] и,
  /// если [friends], правило друзей на полной решётке.
  List<List<List<int>>> solutions(List<List<int>> puzzle, int br, int bc, {bool friends = false, int limit = 2}) {
    final n = puzzle.length;
    final g = [for (final row in puzzle) [...row]];
    final out = <List<List<int>>>[];
    bool ok(int r, int c, int v) {
      for (var i = 0; i < n; i++) {
        if (g[r][i] == v || g[i][c] == v) return false;
      }
      final r0 = r - r % br, c0 = c - c % bc;
      for (var i = 0; i < br; i++) {
        for (var j = 0; j < bc; j++) {
          if (g[r0 + i][c0 + j] == v) return false;
        }
      }
      return true;
    }

    void walk(int k) {
      if (out.length >= limit) return;
      if (k == n * n) {
        if (!friends || friendsHold(g)) out.add([for (final row in g) [...row]]);
        return;
      }
      final r = k ~/ n, c = k % n;
      if (g[r][c] != 0) return walk(k + 1);
      for (var v = 1; v <= n; v++) {
        if (!ok(r, c, v)) continue;
        g[r][c] = v;
        walk(k + 1);
        g[r][c] = 0;
      }
    }

    walk(0);
    return out;
  }

  test('🔴 дорожка: девять ступеней плана v3, каждая доска — единственное решение своим перебором', () {
    final kids = data();
    expect([for (final s in kids.steps) '${s.track}:${s.n}:${s.givens}'], [
      'animals4:4:10', 'animals4:4:8', 'animals4:4:6',
      'meow4:4:7', 'meow4:4:6', 'meow4:4:5',
      'animals6:6:20', 'animals6:6:16', 'animals6:6:13',
    ], reason: 'ступени и подсказки — решение развилки лестницы (LEVELS_PLAN.md)');
    var checked = 0;
    for (var i = 0; i < kids.steps.length; i++) {
      final s = kids.steps[i];
      expect(s.boards.length, 12, reason: '${s.track}: по 12 досок на ступень');
      for (var j = 0; j < s.boards.length; j++) {
        final b = kids.board(i + 1, j), at = '${s.track} ступень ${i + 1}, доска $j';
        expect(b.variant, s.friends ? friendsVariant : 'none', reason: at);
        expect(b.puzzle.expand((r) => r).where((v) => v != 0).length, s.givens, reason: '$at: подсказок');
        for (var r = 0; r < s.n; r++) {
          for (var c = 0; c < s.n; c++) {
            if (b.puzzle[r][c] != 0) expect(b.puzzle[r][c], b.solution[r][c], reason: '$at: задание ≠ решению');
          }
        }
        final sols = solutions(b.puzzle, s.br, s.bc, friends: s.friends);
        expect(sols.length, 1, reason: '$at: решение не единственно');
        expect(sols.single, b.solution, reason: '$at: перебор нашёл другое решение');
        if (s.friends) {
          expect(friendsHold(b.solution), isTrue, reason: '$at: в решении кот без мыши');
          expect(solutions(b.puzzle, s.br, s.bc).length, 2, reason: '$at: без правила друзей решение и так единственно');
        }
        checked++;
      }
    }
    expect(checked, 108);
  });

  test('правило друзей: мышь сбоку, сверху или снизу — да; только наискосок — нет', () {
    expect(friendsHold([[1, 2], [0, 0]]), isTrue);
    expect(friendsHold([[1, 0], [2, 0]]), isTrue);
    expect(friendsHold([[1, 0], [0, 2]]), isFalse, reason: 'наискосок — не рядом');
    expect(friendsHold([[0, 0], [0, 0]]), isTrue, reason: 'кота нет — правилу не о чем судить');
  });

  test('🔴 значки «Мяу» на любом поле: 1 — кот, 2 — мышь, все разные (4×4 малышей и 9×9 лестницы)', () {
    for (final n in [4, 9]) {
      final s = symbolsFor(skin: SudokuSkin.digits,
          variant: friendsVariant, solution: List.generate(n, (_) => List.filled(n, 1)), language: 'ru', seed: 1);
      expect(s.glyph(friendsCat), '🐱', reason: '$n×$n: 1 не кот');
      expect(s.glyph(friendsMouse), '🐭', reason: '$n×$n: 2 не мышь');
      expect({for (var v = 1; v <= n; v++) s.glyph(v)}.length, n, reason: '$n×$n: два значения с одним зверем');
    }
  });

  Future<SharedState> open(WidgetTester tester, {int step = 1, List<Map<String, dynamic>>? reports}) async {
    SharedPreferences.setMockInitialValues({'language': 'ru'});
    if (reports != null) SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    late SharedState state;
    await tester.runAsync(() async {
      state = await SharedState.open();
      if (step > 1) await state.set('psygames_sudoku_junior_level_${state.activeProfile}', '$step');
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state, junior: true)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    return state;
  }

  /// Задание с экрана: значение клетки — с подписи картинки (для чтеца это сама цифра), у мыши
  /// «Мяу» картинки пока нет — её глиф 🐭.
  List<List<int>> readGrid(WidgetTester tester, int n) => [
        for (var r = 0; r < n; r++)
          [
            for (var c = 0; c < n; c++)
              () {
                final cell = find.byKey(Key('cell_${r}_$c'));
                final im = find.descendant(of: cell, matching: find.byType(Image));
                if (im.evaluate().isNotEmpty) return int.parse(tester.widget<Image>(im.first).semanticLabel!);
                return find.descendant(of: cell, matching: find.text('🐭')).evaluate().isNotEmpty ? friendsMouse : 0;
              }(),
          ],
      ];

  Future<void> put(WidgetTester tester, int r, int c, int v) async {
    await tester.tap(find.byKey(Key('cell_${r}_$c')));
    await tester.pump();
    await tester.tap(find.byKey(Key('digit$v')));
    await tester.pump();
  }

  String? keyImage(WidgetTester tester, int v) {
    final im = find.descendant(of: find.byKey(Key('digit$v')), matching: find.byType(Image));
    return im.evaluate().isEmpty ? null : ((tester.widget<Image>(im.first)).image as AssetImage).assetName;
  }

  testWidgets('🔴 ступень 1, звери 4×4: партия нажатиями двигает свою ступень, лестница не тронута', (tester) async {
    final reports = <Map<String, dynamic>>[];
    final state = await open(tester, reports: reports);
    expect(find.byKey(const Key('cell_3_3')), findsOneWidget, reason: 'поле 4×4');
    expect(find.byKey(const Key('cell_4_4')), findsNothing);
    expect(find.text('1/9'), findsOneWidget, reason: 'своя мини-лестница: девять ступеней дорожки');
    for (var v = 1; v <= 4; v++) {
      expect(keyImage(tester, v), animalImage(animalPicks[4]![v - 1]), reason: 'клавиша $v — зверь (по умолчанию у малышей)');
    }
    final grid = readGrid(tester, 4);
    final sols = solutions(grid, 2, 2);
    expect(sols.length, 1, reason: 'по подсказкам с экрана решение не единственно — прочитано не всё');
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        if (grid[r][c] == 0) await put(tester, r, c, sols.single[r][c]);
      }
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(reports.single['details']['completed'], isTrue, reason: 'доска сошлась');
    expect(state.get('psygames_sudoku_junior_level_${state.activeProfile}'), '2', reason: 'ступень малышей выросла');
    expect(juniorLadderId, 'sudoku_junior', reason: 'карточка развилки читает ступень этим ключом');
    expect(state.get('psygames_sudoku_level_${state.activeProfile}'), isNull, reason: 'обычная лестница не тронута');
    expect(reports.single['mode'], 'junior-1');
    expect((reports.single['details'] as Map)['skin'], 'animals');
  });

  testWidgets('🔴 «Мяу» (ступень 4): кот и мышь, доска с котом без мыши НЕ засчитывается', (tester) async {
    final reports = <Map<String, dynamic>>[];
    final state = await open(tester, step: 4, reports: reports);
    expect(find.text('4/9'), findsOneWidget);
    expect(find.text(L.t('sdkRule_friends')), findsOneWidget, reason: 'правило названо в полосе счётчиков');
    expect(keyImage(tester, friendsCat), animalImage(0), reason: 'клавиша 1 — кот');
    expect(keyImage(tester, friendsMouse), isNull, reason: 'картинки мыши пока нет');
    expect(find.descendant(of: find.byKey(const Key('digit$friendsMouse')), matching: find.text('🐭')), findsOneWidget,
        reason: 'клавиша 2 — мышь');

    final grid = readGrid(tester, 4);
    final ruled = solutions(grid, 2, 2, friends: true);
    expect(ruled.length, 1, reason: 'с правилом друзей решение единственно');
    // Другая доска, законная по классике: у неё обязан найтись кот без мыши.
    final alt = solutions(grid, 2, 2, limit: 50).firstWhere((g) => !friendsHold(g));
    var wrong = 0;
    for (var r = 0; r < 4 && wrong < errorLimit; r++) {
      for (var c = 0; c < 4 && wrong < errorLimit; c++) {
        if (grid[r][c] != 0) continue;
        await put(tester, r, c, alt[r][c]);
        if (alt[r][c] != ruled.single[r][c]) wrong++;
      }
    }
    expect(wrong, greaterThan(0));
    expect(reports.where((x) => x['details']['completed'] == true), isEmpty,
        reason: 'доска без соседства кота и мыши засчитана как решение');
    expect(state.get('psygames_sudoku_junior_level_${state.activeProfile}'), '4', reason: 'ступень не выросла');

    // Довести до поражения: отчёт — ступенью малышей, а не уровнем обычной лестницы.
    final miss = [for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (grid[r][c] == 0) (r, c)].first;
    final bad = [for (var v = 1; v <= 4; v++) v].where((v) => v != ruled.single[miss.$1][miss.$2]).toList();
    for (var i = 0; reports.isEmpty && i < 6; i++) {
      await put(tester, miss.$1, miss.$2, bad[i % bad.length]);
    }
    expect(reports.single['mode'], 'junior-4');
    expect(reports.single['details']['failed_out'], isTrue);
    expect(reports.single['details']['level'], 4);
  });

  testWidgets('🔴 ступень 7: поле 6×6 со зверями', (tester) async {
    await open(tester, step: 7);
    expect(find.text('7/9'), findsOneWidget);
    expect(find.byKey(const Key('cell_5_5')), findsOneWidget, reason: 'поле 6×6');
    expect(find.byKey(const Key('cell_6_6')), findsNothing);
    for (var v = 1; v <= 6; v++) {
      expect(keyImage(tester, v), animalImage(animalPicks[6]![v - 1]), reason: 'клавиша $v — зверь');
    }
    final grid = readGrid(tester, 6);
    expect(grid.expand((r) => r).where((v) => v != 0).length, 20, reason: 'подсказок ступени 7');
    expect(solutions(grid, 2, 3).length, 1, reason: 'блоки 2×3: решение единственно');
  });
}
