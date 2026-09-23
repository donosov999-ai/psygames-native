/// ПРАВИЛА ФРАКТАЛЬНОЙ СУДОКУ — перенос `services/fractal-sudoku.ts` (игровая половина).
///
/// 🔴 ЗДЕСЬ ПРАВИЛО — НЕ «МОЖНО ЛИ ЦИФРУ», А ЧТО ХОД ТЯНЕТ ЗА СОБОЙ. Десять сеток 9×9:
/// корень и девять дочерних. Дочерняя, добранная до ПОРОГА верных клеток, открывается и
/// отправляет свою центральную цифру в клетку корня — только так корень и закрывается.
/// Ход в клетку-ПОРТАЛ ложится сразу в две сетки (это одна клетка, видная из двух пазлов)
/// и может открыть обе разом. Отмена обязана снять всё это вместе: клетку, открытость и
/// цифру, ушедшую наверх, — иначе в корне остаётся цифра, которую нечем подтвердить.
///
/// ⚠️ ПОЭТОМУ СВЕРЯЕТСЯ ПОВЕДЕНИЕ, А НЕ ФУНКЦИЯ. Эталон — ЛЕНТА ХОДОВ живого TS
/// (`test/fixtures/fractal-reference.json`, 38 шагов): после каждого хода записаны корень,
/// все девять дочерних, признаки открытия, зеркало портала и откат.
///
/// Генератор НЕ переносится: он быстр и детерминирован, партии выгружены данными
/// (`assets/levels/fractal-boards.json`, 90 партий по 3 на каждую из 30 ступеней).
library;

const fractalN = 9;

/// Клетка, цифра которой уходит наверх: центр дочерней сетки.
const feedCell = [4, 4];

/// Клетка корня, которую кормит дочерняя `i`: середина её блока 3×3.
List<int> rootCellForChild(int i) => [(i ~/ 3) * 3 + 1, (i % 3) * 3 + 1];

/// Девять кормящих клеток корня — по одной на дочернюю.
List<List<int>> feedCells() => [for (var i = 0; i < 9; i++) rootCellForChild(i)];

/// Одна дочерняя сетка партии.
class FractalChild {
  const FractalChild({
    required this.puzzle,
    required this.solution,
    required this.feedsCell,
    required this.blanks,
    required this.unlockCells,
    required this.tier,
  });

  final List<List<int>> puzzle;
  final List<List<int>> solution;

  /// Клетка КОРНЯ, которую эта сетка открывает.
  final List<int> feedsCell;
  final int blanks;

  /// Порог открытия именно этой сетки: считается от реального числа дырок.
  final int unlockCells;
  final int tier;
}

/// Портал — одна клетка, живущая в двух пазлах сразу.
class FractalPortal {
  const FractalPortal({
    required this.from,
    required this.to,
    required this.fromCell,
    required this.toCell,
    required this.digit,
  });

  final int from;
  final int to;
  final List<int> fromCell;
  final List<int> toCell;

  /// Цифра, общая для обеих клеток: держится ради подсветки и гейтов.
  final int digit;
}

/// Задание партии: корень, девять дочерних и порталы.
class FractalPuzzle {
  const FractalPuzzle({
    required this.level,
    required this.rootPuzzle,
    required this.rootSolution,
    required this.rootBlanks,
    required this.rootTier,
    required this.needsChildren,
    required this.children,
    required this.portals,
  });

  final int level;
  final List<List<int>> rootPuzzle;
  final List<List<int>> rootSolution;
  final int rootBlanks;
  final int rootTier;

  /// Правда ли корень нельзя добить без цифр снизу. Иначе девять дочерних — декорация.
  final bool needsChildren;
  final List<FractalChild> children;
  final List<FractalPortal> portals;
}

/// Живое состояние партии: то, что человек наиграл.
class FractalPlayState {
  FractalPlayState({required this.rootGrid, required this.children});

  final List<List<int>> rootGrid;
  final List<({List<List<int>> grid, bool done})> children;

  FractalPlayState clone() => FractalPlayState(
        rootGrid: [for (final row in rootGrid) [...row]],
        children: [
          for (final c in children)
            (grid: [for (final row in c.grid) [...row]], done: c.done),
        ],
      );
}

/// Один ход и всё, что он потянул: без этого его не отменить.
class FractalMove {
  const FractalMove({
    required this.child,
    required this.r,
    required this.c,
    required this.from,
    required this.to,
    required this.unlocked,
    this.mirror,
  });

  /// Номер дочерней либо `null` для корня.
  final int? child;
  final int r;
  final int c;
  final int from;
  final int to;

  /// Ход открыл дочернюю и отправил цифру наверх.
  final bool unlocked;

  /// Зеркало портала: та же цифра легла в клетку-близнеца ДРУГОЙ сетки.
  final ({int child, int r, int c, int from, bool unlocked})? mirror;
}

/// Начальное состояние: задание, к которому ещё не притрагивались.
FractalPlayState startPlayState(FractalPuzzle f) => FractalPlayState(
      rootGrid: [for (final row in f.rootPuzzle) [...row]],
      children: [
        for (final ch in f.children) (grid: [for (final row in ch.puzzle) [...row]], done: false),
      ],
    );

/// Подсказки задания: их не редактируют.
List<List<bool>> givenOf(List<List<int>> puzzle) =>
    [for (final row in puzzle) [for (final v in row) v != 0]];

/// Сколько клеток дочерней уже решено.
///
/// ⚠️ СЧИТАЮТСЯ СОВПАДЕНИЯ С РЕШЕНИЕМ, А НЕ ЗАПОЛНЕННОСТЬ: неверная цифра — не прогресс.
/// И `given` обязателен: без него считаются подсказки задания, которые с решением
/// совпадают по определению, порог берётся до первого хода и все девять сеток
/// открываются сразу (поймано на первом запуске экрана 12.08 — плитки «17/17»).
int solvedCount(List<List<int>> current, List<List<int>> solution, [List<List<bool>>? given]) {
  var n = 0;
  for (var r = 0; r < fractalN; r++) {
    for (var c = 0; c < fractalN; c++) {
      if (given != null && given[r][c]) continue;
      if (current[r][c] != 0 && current[r][c] == solution[r][c]) n++;
    }
  }
  return n;
}

/// Открыта ли родительская клетка этой дочерней.
bool isUnlocked(
  List<List<int>> current,
  List<List<int>> solution,
  List<List<bool>>? given,
  int threshold,
) =>
    solvedCount(current, solution, given) >= threshold;

/// Может ли человек поставить цифру в эту клетку корня: не подсказка и не кормящая.
bool rootEditable(List<List<int>> rootPuzzle, int r, int c) {
  if (rootPuzzle[r][c] != 0) return false;
  for (var i = 0; i < 9; i++) {
    final cell = rootCellForChild(i);
    if (cell[0] == r && cell[1] == c) return false;
  }
  return true;
}

/// Сошёлся ли корень целиком — это и есть победа в партии.
bool rootSolved(List<List<int>> rootGrid, List<List<int>> solution) {
  for (var r = 0; r < fractalN; r++) {
    for (var c = 0; c < fractalN; c++) {
      if (rootGrid[r][c] != solution[r][c]) return false;
    }
  }
  return true;
}

/// Портал этой дочерней: где он у неё, с кем сшивает и какой цифрой.
({List<int> at, int other, List<int> otherAt, int digit})? portalOf(
  List<FractalPortal> portals,
  int child,
) {
  for (final p in portals) {
    if (p.from == child) return (at: p.fromCell, other: p.to, otherAt: p.toCell, digit: p.digit);
    if (p.to == child) return (at: p.toCell, other: p.from, otherAt: p.fromCell, digit: p.digit);
  }
  return null;
}

bool isPortalCell(List<FractalPortal> portals, int child, int r, int c) {
  final p = portalOf(portals, child);
  return p != null && p.at[0] == r && p.at[1] == c;
}

/// Спорит ли цифра с соседями внутри дочерней (обычное правило судоку 9×9).
bool conflictsInChild(List<List<int>> grid, int r, int c, int n) {
  for (var i = 0; i < fractalN; i++) {
    if (i != c && grid[r][i] == n) return true;
    if (i != r && grid[i][c] == n) return true;
  }
  final br = (r ~/ 3) * 3, bc = (c ~/ 3) * 3;
  for (var i = br; i < br + 3; i++) {
    for (var j = bc; j < bc + 3; j++) {
      if ((i != r || j != c) && grid[i][j] == n) return true;
    }
  }
  return false;
}

/// Поставить цифру (0 — стереть). `null` — ход невозможен ИЛИ ничего не меняет.
///
/// Ничего не меняющий ход отдаётся как несостоявшийся нарочно: иначе повторное нажатие
/// той же цифры оставляло бы в ленте пустой ход, отмена которого выглядит как
/// «кнопка не работает».
({FractalPlayState next, FractalMove move})? playDigit(
  FractalPlayState state,
  FractalPuzzle f,
  ({int? child, int r, int c}) target,
  int n,
) {
  final child = target.child, r = target.r, c = target.c;

  if (child == null) {
    if (!rootEditable(f.rootPuzzle, r, c)) return null;
    final from = state.rootGrid[r][c];
    if (from == n) return null;
    final next = state.clone();
    next.rootGrid[r][c] = n;
    return (next: next, move: FractalMove(child: null, r: r, c: c, from: from, to: n, unlocked: false));
  }

  if (child < 0 || child >= f.children.length) return null;
  final ch = f.children[child];
  if (ch.puzzle[r][c] != 0) return null;                  // подсказка задания
  final from = state.children[child].grid[r][c];
  if (from == n) return null;

  final next = state.clone();
  next.children[child].grid[r][c] = n;

  /// Открыть дочернюю, если ход добрал её до порога, и отправить цифру наверх.
  bool tryUnlock(int i) {
    final t = f.children[i];
    if (state.children[i].done || next.children[i].done) return false;
    if (!isUnlocked(next.children[i].grid, t.solution, givenOf(t.puzzle), t.unlockCells)) {
      return false;
    }
    next.children[i] = (grid: next.children[i].grid, done: true);
    next.rootGrid[t.feedsCell[0]][t.feedsCell[1]] = t.solution[feedCell[0]][feedCell[1]];
    return true;
  }

  // ПОРТАЛ: клетка-близнец — ТА ЖЕ клетка, поэтому цифра ложится в обе разом, и
  // стирание тоже. Зеркало считается ДО своей сетки: один ход способен открыть две.
  ({int child, int r, int c, int from, bool unlocked})? mirror;
  final p = portalOf(f.portals, child);
  if (p != null && p.at[0] == r && p.at[1] == c) {
    final mr = p.otherAt[0], mc = p.otherAt[1];
    final was = state.children[p.other].grid[mr][mc];
    next.children[p.other].grid[mr][mc] = n;
    mirror = (child: p.other, r: mr, c: mc, from: was, unlocked: tryUnlock(p.other));
  }

  final unlocked = tryUnlock(child);
  return (
    next: next,
    move: FractalMove(child: child, r: r, c: c, from: from, to: n, unlocked: unlocked, mirror: mirror),
  );
}

/// Отменить ход — вместе со всем, что он потянул.
FractalPlayState revertMove(FractalPlayState state, FractalPuzzle f, FractalMove move) {
  final next = state.clone();
  if (move.child == null) {
    next.rootGrid[move.r][move.c] = move.from;
    return next;
  }

  /// Закрыть дочернюю обратно и забрать цифру из корня: её принесли снизу — туда и уходит.
  void shut(int i) {
    next.children[i] = (grid: next.children[i].grid, done: false);
    final cell = f.children[i].feedsCell;
    next.rootGrid[cell[0]][cell[1]] = 0;
  }

  next.children[move.child!].grid[move.r][move.c] = move.from;
  if (move.unlocked) shut(move.child!);
  final m = move.mirror;
  if (m != null) {
    next.children[m.child].grid[m.r][m.c] = m.from;
    if (m.unlocked) shut(m.child);
  }
  return next;
}

/// Доска 9×9 из строки в 81 цифру.
List<List<int>> parse81(String s) => [
      for (var r = 0; r < fractalN; r++)
        [for (var c = 0; c < fractalN; c++) int.parse(s[r * fractalN + c])],
    ];

/// Обратно в строку — для слепков в пробах.
String encode81(List<List<int>> b) => b.map((row) => row.join()).join();
