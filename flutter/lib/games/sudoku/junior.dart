/// «СУДОКУ ДЛЯ МАЛЫШЕЙ»: доски 4×4 с единственным решением (задача 01dc3ff0, часть 2).
///
/// Происхождение — «Судоку с животными» MindLab (звери 4×4 и 9×9), решение Дениса 30.09:
/// тематический режим нашего судоку, а не отдельная игра. Самая малая ступень обычной
/// лестницы — 6×6; ребёнку четырёх-пяти лет нужна доска, где держится в голове вся строка.
///
/// 🔴 ДОСКИ СТРОЯТСЯ ЗДЕСЬ, А НЕ ВОЗЯТСЯ ДАННЫМИ. У 4×4 всего 288 полных решёток, а проверка
/// единственности — перебор по 16 клеткам: доля миллисекунды. Тащить для этого выгрузку из TS
/// (как у вариантных досок 9×9) — лишний слой без выгоды.
///
/// ЛЕСТНИЦА — ЧИСЛО ПУСТЫХ КЛЕТОК, 4 → 12. ⚠️ 12 — ГРАНИЦА САМОЙ ДОСКИ, А НЕ ПОТОЛОК ЛЕСТНИЦЫ:
/// у судоку 4×4 меньше четырёх подсказок с единственным решением не бывает (известный
/// результат перебором всех 288 решёток), то есть пустых не больше двенадцати. Дальше рост —
/// следующей осью: поле 6×6 со зверями (обычная лестница, ступени 1–4).
library;

import 'dart:math';

import '../../shell/shared_state.dart';
import 'levels.dart';
import 'rules.dart';

/// Пустых клеток на ступени.
const juniorBlanks = [4, 6, 8, 9, 10, 11, 12];

int get juniorSteps => juniorBlanks.length;

/// Сколько решений у доски 4×4 (до [limit]).
int juniorSolutions(List<List<int>> grid, {int limit = 2}) {
  final g = [for (final row in grid) [...row]];
  var count = 0;
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

  bool walk(int k) {
    if (k == 16) return ++count >= limit;
    final r = k ~/ 4, c = k % 4;
    if (g[r][c] != 0) return walk(k + 1);
    for (var v = 1; v <= 4; v++) {
      if (!ok(r, c, v)) continue;
      g[r][c] = v;
      if (walk(k + 1)) return true;
      g[r][c] = 0;
    }
    return false;
  }

  walk(0);
  return count;
}

/// Случайная полная решётка 4×4: образец + перестановки, сохраняющие правила (цифры,
/// строки внутри полос, полосы, столбцы внутри стопок, стопки, поворот).
List<List<int>> _fullGrid(Random rnd) {
  var g = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1],
  ];
  final digits = [1, 2, 3, 4]..shuffle(rnd);
  g = [for (final row in g) [for (final v in row) digits[v - 1]]];
  List<int> order() {
    final bands = [0, 1]..shuffle(rnd);
    return [for (final b in bands) ...([0, 1]..shuffle(rnd)).map((i) => b * 2 + i)];
  }

  final rows = order(), cols = order();
  g = [for (final r in rows) [for (final c in cols) g[r][c]]];
  if (rnd.nextBool()) g = [for (var c = 0; c < 4; c++) [for (var r = 0; r < 4; r++) g[r][c]]];
  return g;
}

/// Доска ступени [step] (1…[juniorSteps]): ровно столько пустых, сколько велит ступень,
/// и единственное решение. Одно зерно — одна доска.
SudokuBoard juniorBoard(int step, int seed) {
  final target = juniorBlanks[(step - 1).clamp(0, juniorBlanks.length - 1)];
  final rnd = Random(seed);
  List<List<int>>? bestPuzzle, bestSolution;
  var bestBlanks = -1;
  // Выкапывание может застрять раньше цели (на 12 — чаще всего): тогда новая решётка.
  for (var attempt = 0; attempt < 400; attempt++) {
    final solution = _fullGrid(rnd);
    final puzzle = [for (final row in solution) [...row]];
    final cells = [for (var i = 0; i < 16; i++) i]..shuffle(rnd);
    var blanks = 0;
    for (final i in cells) {
      if (blanks == target) break;
      final r = i ~/ 4, c = i % 4, v = puzzle[r][c];
      puzzle[r][c] = 0;
      if (juniorSolutions(puzzle) == 1) {
        blanks++;
      } else {
        puzzle[r][c] = v;
      }
    }
    if (blanks > bestBlanks) {
      bestBlanks = blanks;
      bestPuzzle = puzzle;
      bestSolution = solution;
    }
    if (blanks == target) break;
  }
  return SudokuBoard(
    level: step,
    n: 4,
    br: 2,
    bc: 2,
    variant: 'none',
    puzzle: bestPuzzle!,
    solution: bestSolution!,
    geometry: const BoardGeometry(),
  );
}

/// Ступень малышей — свой счётчик: обычная лестница на 92 ступени не трогается.
class JuniorProgress {
  JuniorProgress(this.state);
  final SharedState state;

  String get key => '${SharedState.prefix}sudoku_junior_step_${state.activeProfile}';

  int get step => (int.tryParse(state.get(key) ?? '') ?? 1).clamp(1, juniorSteps);

  void win() => state.set(key, '${(step + 1).clamp(1, juniorSteps)}');
}
