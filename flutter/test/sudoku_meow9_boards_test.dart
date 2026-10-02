import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/junior.dart';

/// 🔴 «МЯУ — ДРУЗЬЯ» 9×9 ДЛЯ ОСНОВНОЙ ЛЕСТНИЦЫ: КАЖДАЯ ДОСКА РЕШАЕТСЯ ЕДИНСТВЕННЫМ ОБРАЗОМ
/// ТОЛЬКО С ПРАВИЛОМ ДРУЗЕЙ.
///
/// Доски — выгрузка `flutter/tools/export_kids_boards.py --meow9` (генератор MindLab по зерну;
/// зёрна совпали с данными развилки лестницы 24/24, 02.10.2026). Здесь то же проверяется СВОИМ
/// перебором приложения, чтобы генератор и экран не разошлись молча: решение одно, оно
/// совпадает с записанным, в нём у каждого кота мышь рядом, а без правила решений больше одного
/// — иначе правило на доске ничего не решает.
///
/// Перебор 9×9 обрезает ветви сразу: кот проверяется, как только заполнены все его четыре
/// соседа (в порядке строк это момент, когда ставится клетка под ним), — иначе на досках с
/// 24 подсказками перебор обходил бы тысячи решений без правила.
void main() {
  KidsBoards data() => KidsBoards.parse(
      jsonDecode(File('assets/levels/sudoku-meow9-boards.json').readAsStringSync()) as Map<String, Object?>);

  /// Решения задания (до [limit]); [friends] — правило друзей с обрезкой по ходу.
  List<List<List<int>>> solutions(List<List<int>> puzzle, {bool friends = false, int limit = 2}) {
    const n = 9, b = 3;
    final g = [for (final row in puzzle) [...row]];
    final out = <List<List<int>>>[];
    bool ok(int r, int c, int v) {
      for (var i = 0; i < n; i++) {
        if (g[r][i] == v || g[i][c] == v) return false;
      }
      final r0 = r - r % b, c0 = c - c % b;
      for (var i = 0; i < b; i++) {
        for (var j = 0; j < b; j++) {
          if (g[r0 + i][c0 + j] == v) return false;
        }
      }
      return true;
    }

    bool catFed(int r, int c) =>
        g[r][c] != friendsCat ||
        [(r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)]
            .any((p) => p.$1 >= 0 && p.$2 >= 0 && p.$1 < n && p.$2 < n && g[p.$1][p.$2] == friendsMouse);

    void walk(int k) {
      if (out.length >= limit) return;
      if (k == n * n) {
        if (!friends || friendsHold(g)) out.add([for (final row in g) [...row]]);
        return;
      }
      final r = k ~/ n, c = k % n;
      bool fits() => !friends || r == 0 || catFed(r - 1, c);
      if (g[r][c] != 0) {
        if (fits()) walk(k + 1);
        return;
      }
      for (var v = 1; v <= n; v++) {
        if (!ok(r, c, v)) continue;
        g[r][c] = v;
        if (fits()) walk(k + 1);
        g[r][c] = 0;
      }
    }

    walk(0);
    return out;
  }

  test('🔴 четыре ступени 30 / 28 / 26 / 24 подсказок, по 6 досок; каждая — единственное решение только с правилом', () {
    final meow = data();
    expect([for (final s in meow.steps) '${s.track}:${s.n}:${s.br}×${s.bc}:${s.friends}:${s.givens}'], [
      'meow9:9:3×3:true:30', 'meow9:9:3×3:true:28', 'meow9:9:3×3:true:26', 'meow9:9:3×3:true:24',
    ], reason: 'ступени и подсказки — решение развилки лестницы (LEVELS_PLAN.md v4, уровни 129–132)');
    var checked = 0;
    for (var i = 0; i < meow.steps.length; i++) {
      final s = meow.steps[i];
      expect(s.boards.length, 6, reason: 'ступень ${i + 1}: по 6 досок');
      for (var j = 0; j < s.boards.length; j++) {
        final b = meow.board(i + 1, j), at = 'ступень ${i + 1}, доска $j';
        expect(b.variant, friendsVariant, reason: at);
        expect(b.puzzle.expand((r) => r).where((v) => v != 0).length, s.givens, reason: '$at: подсказок');
        for (var r = 0; r < 9; r++) {
          for (var c = 0; c < 9; c++) {
            if (b.puzzle[r][c] != 0) expect(b.puzzle[r][c], b.solution[r][c], reason: '$at: задание ≠ решению');
          }
        }
        expect(friendsHold(b.solution), isTrue, reason: '$at: в решении кот без мыши');
        final sols = solutions(b.puzzle, friends: true);
        expect(sols.length, 1, reason: '$at: с правилом друзей решение не единственно');
        expect(sols.single, b.solution, reason: '$at: перебор нашёл другое решение');
        expect(solutions(b.puzzle).length, 2, reason: '$at: без правила друзей решение и так единственно');
        checked++;
      }
    }
    expect(checked, 24);
  });
}
