/// ПРАВИЛА «КОШЕК» (Queens / Star Battle с одной фигурой).
///
/// Решение Дениса 24.09.2026 по кадру чужой игры: добавляем её карточкой в развилку
/// «Судоку». Правила с кадра дословно: «На каждый цвет — 1 Кошка» · «В каждой строке
/// и столбце — 1 Кошка» · «Кошки не могут соприкасаться» (и по диагонали).
///
/// 🔴 ЭТО НЕ НОВЫЙ ДВИЖОК, А ДВА НАШИХ ПРАВИЛА, СВЕДЁННЫЕ К ОДНОЙ ФИГУРЕ.
/// Замер 24.09: у Тэтхэма такой игры нет вовсе (проверены все 42 имени коллекции в
/// `assets/puzzles/modes.json`). Зато у нас уже работают оба куска:
///   · «по одной на строку, столбец и область» — это jigsaw-судоку: позиции ОДНОЙ
///     цифры в её решении дают ровно такую расстановку (`sudoku-core.ts:1059`);
///   · «не соприкасаются» — вариант antiking, обход соседства KING по равному
///     значению (`sudoku-core.ts:774`). При одной фигуре это буквально «не касаться».
///
/// ⚠️ ОДНА КОШКА НА СТРОКУ — НЕ ПРОСТО ПРАВИЛО, А СТРУКТУРА. Из него следует, что
/// соприкоснуться могут только кошки СОСЕДНИХ строк, и тогда это |Δстолбца| ≤ 1.
/// Решатель считает по строкам именно поэтому: перебор идёт по столбцу для каждой
/// строки, а не по всем 100 клеткам.
library;

/// Клетка поля — одним числом, как во всех наших сетках: `r * n + c`.
typedef CatCell = int;

/// Что сейчас в клетке у игрока.
///
/// ✕ — это пометка «сюда нельзя», бухгалтерия игрока, как карандаш в судоку: правила
/// она не нарушает и ошибкой не считается.
enum CatMark { empty, cross, cat }

/// Доска: карта областей и разгадка.
class CatsBoard {
  const CatsBoard({required this.n, required this.regions, required this.solution});

  /// Сторона поля.
  final int n;

  /// Номер области в каждой клетке, 0..n−1. Областей ровно столько же, сколько строк:
  /// иначе «по одной на цвет» и «по одной на строку» не могут выполниться разом.
  final List<List<int>> regions;

  /// Разгадка: `solution[r]` — столбец кошки в строке r.
  final List<int> solution;

  int regionAt(int r, int c) => regions[r][c];

  /// Клетки разгадки — для подсказки и для проб.
  Set<CatCell> get solutionCells => {for (var r = 0; r < n; r++) r * n + solution[r]};
}

/// Мешает ли новая кошка в (r, c) уже поставленным.
///
/// Возвращает `null`, когда всё законно, и ПРИЧИНУ, когда нет: экран показывает
/// человеку, какое правило он нарушил, а не просто красную клетку.
CatConflict? catConflict(CatsBoard board, Set<CatCell> cats, int r, int c) {
  final n = board.n;
  for (final cell in cats) {
    final cr = cell ~/ n, cc = cell % n;
    if (cr == r && cc == c) continue;
    if (cr == r) return CatConflict.row;
    if (cc == c) return CatConflict.column;
    if (board.regionAt(cr, cc) == board.regionAt(r, c)) return CatConflict.region;
    if ((cr - r).abs() <= 1 && (cc - c).abs() <= 1) return CatConflict.touch;
  }
  return null;
}

/// Нарушенное правило — по нему экран берёт объяснение.
enum CatConflict { row, column, region, touch }

/// Партия решена: кошек столько же, сколько строк, и ни одна не спорит с другой.
bool catsSolved(CatsBoard board, Set<CatCell> cats) {
  if (cats.length != board.n) return false;
  for (final cell in cats) {
    if (catConflict(board, cats, cell ~/ board.n, cell % board.n) != null) return false;
  }
  return true;
}

/// Сколько расстановок удовлетворяют карте областей.
///
/// 🔴 ЭТО И ЕСТЬ ЕДИНСТВЕННОСТЬ, И ОНА У КОШЕК СВОЯ, НЕ СУДОЧНАЯ. В судоку
/// единственность проверяется по цифрам в клетках; здесь — по расстановке целиком.
/// Карта с двумя решениями даёт задачу, которую честно решить нельзя: человек
/// доходит до развилки и вынужден гадать, а проигрыш выглядит как несправедливость.
///
/// [limit] обрывает перебор, как только решений стало больше, чем нужно знать:
/// чтобы отличить «одно» от «много», второе решение искать не надо.
int countCatSolutions(List<List<int>> regions, int n, {int limit = 2}) {
  final cols = List<bool>.filled(n, false);
  final regionTaken = List<bool>.filled(n, false);
  final placed = List<int>.filled(n, -1);
  var found = 0;

  void step(int row) {
    if (found >= limit) return;
    if (row == n) {
      found++;
      return;
    }
    for (var c = 0; c < n; c++) {
      if (cols[c]) continue;
      final reg = regions[row][c];
      if (regionTaken[reg]) continue;
      // Соприкоснуться можно только с соседней строкой — выше неё проверять нечего.
      if (row > 0 && (placed[row - 1] - c).abs() <= 1) continue;
      cols[c] = true;
      regionTaken[reg] = true;
      placed[row] = c;
      step(row + 1);
      cols[c] = false;
      regionTaken[reg] = false;
      placed[row] = -1;
      if (found >= limit) return;
    }
  }

  step(0);
  return found;
}

/// Решение, ОТЛИЧНОЕ от заданного, — или `null`, если другого нет.
///
/// Нужно генератору: чтобы сломать лишнее решение, его сперва надо увидеть целиком.
List<int>? findOtherSolution(List<List<int>> regions, int n, List<int> known) {
  final cols = List<bool>.filled(n, false);
  final regionTaken = List<bool>.filled(n, false);
  final placed = List<int>.filled(n, -1);
  List<int>? found;

  void step(int row) {
    if (found != null) return;
    if (row == n) {
      for (var r = 0; r < n; r++) {
        if (placed[r] != known[r]) {
          found = List<int>.of(placed);
          return;
        }
      }
      return;   // это и есть известное решение — не считается
    }
    for (var c = 0; c < n; c++) {
      if (cols[c]) continue;
      final reg = regions[row][c];
      if (regionTaken[reg]) continue;
      if (row > 0 && (placed[row - 1] - c).abs() <= 1) continue;
      cols[c] = true;
      regionTaken[reg] = true;
      placed[row] = c;
      step(row + 1);
      cols[c] = false;
      regionTaken[reg] = false;
      placed[row] = -1;
      if (found != null) return;
    }
  }

  step(0);
  return found;
}

/// Связна ли область по стороне (не распалась ли на два пятна).
///
/// ⚠️ ПРОВЕРЯТЬ ОБЯЗАТЕЛЬНО. Генератор перекрашивает отдельные клетки, чтобы сломать
/// лишнее решение; без этой проверки область однажды разорвётся надвое, и человек
/// увидит два пятна одного цвета в разных углах поля — правило «в цвете одна кошка»
/// станет выглядеть как ошибка рисования.
bool regionConnected(List<List<int>> regions, int n, int id) {
  final cells = <int>[];
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (regions[r][c] == id) cells.add(r * n + c);
    }
  }
  if (cells.isEmpty) return false;
  final seen = <int>{cells.first};
  final queue = <int>[cells.first];
  while (queue.isNotEmpty) {
    final cur = queue.removeLast();
    final r = cur ~/ n, c = cur % n;
    for (final (dr, dc) in const [(-1, 0), (1, 0), (0, -1), (0, 1)]) {
      final nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      if (regions[nr][nc] != id) continue;
      final cell = nr * n + nc;
      if (seen.add(cell)) queue.add(cell);
    }
  }
  return seen.length == cells.length;
}

/// Первое найденное решение карты — или `null`, если решений нет.
List<int>? solveCats(List<List<int>> regions, int n) {
  final cols = List<bool>.filled(n, false);
  final regionTaken = List<bool>.filled(n, false);
  final placed = List<int>.filled(n, -1);

  bool step(int row) {
    if (row == n) return true;
    for (var c = 0; c < n; c++) {
      if (cols[c]) continue;
      final reg = regions[row][c];
      if (regionTaken[reg]) continue;
      if (row > 0 && (placed[row - 1] - c).abs() <= 1) continue;
      cols[c] = true;
      regionTaken[reg] = true;
      placed[row] = c;
      if (step(row + 1)) return true;
      cols[c] = false;
      regionTaken[reg] = false;
      placed[row] = -1;
    }
    return false;
  }

  return step(0) ? List<int>.of(placed) : null;
}
