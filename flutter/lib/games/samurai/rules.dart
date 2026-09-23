/// ПРАВИЛА САМУРАЯ — перенос `app/games/sudoku-samurai.tsx` (геометрия, `isValid`,
/// `samuraiCellWrong`) и лестницы ступеней.
///
/// 🔴 УСТРОЙСТВО. Пять сеток 9×9 лежат на поле 21×21 углами: четыре по углам и одна в
/// центре, каждая угловая делит с центром ровно один блок 3×3. Клетка перекрытия — ОДНА
/// клетка поля, поэтому одно правило согласует обе сетки сразу; клетки вне всех пяти
/// сеток не существуют (их 441 − 369 = 72).
///
/// ⚠️ ДВА РАЗНЫХ ВОПРОСА, И ИХ НЕЛЬЗЯ ПУТАТЬ — в вебе на этом потеряли 42–44 % неверных
/// цифр: счётчик ошибок тикал, а клетка не краснела.
///   · `isValid` — МОЖНО ЛИ поставить цифру (правило судоку в каждой сетке клетки);
///   · `cellWrong` — ОШИБОЧНА ЛИ уже стоящая цифра: дубль в своей сетке ИЛИ расхождение
///     с решением. Красит экран именно это, и счётчик ошибок считает его же.
///
/// Сверка — `test/samurai_rules_test.dart` против эталонов живого TS (400 случаев хода
/// и 57 размеченных ошибочных клеток).
library;

/// Сторона поля: пять сеток 9×9 углами.
const samuraiSize = 21;

/// Левые верхние углы пяти сеток: четыре угловые и центральная.
const gridOrigins = <List<int>>[
  [0, 0], [0, 12], [12, 0], [12, 12], [6, 6],
];

/// Сетки, которым принадлежит клетка. Пусто — клетка вне доски.
List<List<int>> gridsOf(int r, int c) {
  final out = <List<int>>[];
  for (final g in gridOrigins) {
    if (r >= g[0] && r < g[0] + 9 && c >= g[1] && c < g[1] + 9) out.add(g);
  }
  return out;
}

/// Существует ли клетка: часть хотя бы одной сетки.
bool isSamuraiCell(int r, int c) => gridsOf(r, c).isNotEmpty;

/// Все клетки доски по порядку — 369 из 441.
final List<List<int>> samuraiCells = [
  for (var r = 0; r < samuraiSize; r++)
    for (var c = 0; c < samuraiSize; c++)
      if (isSamuraiCell(r, c)) [r, c],
];

/// Законен ли ход: правило судоку проверяется в КАЖДОЙ сетке этой клетки.
bool isValid(List<List<int>> grid, int r, int c, int val) {
  for (final g in gridsOf(r, c)) {
    final r0 = g[0], c0 = g[1];
    for (var cc = c0; cc < c0 + 9; cc++) {
      if (grid[r][cc] == val) return false;
    }
    for (var rr = r0; rr < r0 + 9; rr++) {
      if (grid[rr][c] == val) return false;
    }
    final br = r0 + ((r - r0) ~/ 3) * 3, bc = c0 + ((c - c0) ~/ 3) * 3;
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        if (grid[br + i][bc + j] == val) return false;
      }
    }
  }
  return true;
}

/// Ошибочна ли стоящая цифра: `duplicate` — повтор в своей сетке, `wrongValue` — не то,
/// что в решении. Экран красит `error`, счётчик ошибок считает его же.
({bool duplicate, bool wrongValue, bool error}) cellWrong(
  List<List<int>> grid,
  List<List<int>> solution,
  int r,
  int c,
) {
  final v = grid[r][c];
  if (v == 0) return (duplicate: false, wrongValue: false, error: false);

  var duplicate = false;
  for (final g in gridsOf(r, c)) {
    final r0 = g[0], c0 = g[1];
    for (var cc = c0; cc < c0 + 9; cc++) {
      if (cc != c && grid[r][cc] == v) duplicate = true;
    }
    for (var rr = r0; rr < r0 + 9; rr++) {
      if (rr != r && grid[rr][c] == v) duplicate = true;
    }
    final br = r0 + ((r - r0) ~/ 3) * 3, bc = c0 + ((c - c0) ~/ 3) * 3;
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        final rr = br + i, cc = bc + j;
        if ((rr != r || cc != c) && grid[rr][cc] == v) duplicate = true;
      }
    }
  }
  // ⚠️ Решение бывает ещё не загружено — тогда судить не по чему.
  final known = solution[r][c] != 0;
  final wrongValue = known && solution[r][c] != v;
  return (duplicate: duplicate, wrongValue: wrongValue, error: duplicate || wrongValue);
}

/// Вся доска сошлась: каждая клетка заполнена и совпадает с решением.
bool isSolved(List<List<int>> grid, List<List<int>> solution) {
  for (final cell in samuraiCells) {
    if (grid[cell[0]][cell[1]] != solution[cell[0]][cell[1]]) return false;
  }
  return true;
}

/// Ступень лестницы самурая: сколько ошибок прощается и сколько подсказок даётся.
///
/// Таблица перенесена из экрана (`LEVEL_ERRORS`, `LEVEL_HINTS`, `levelParams`) и сверена
/// с эталоном живого TS в пробе: разойдутся — проба краснеет.
class SamuraiLevelParams {
  const SamuraiLevelParams({required this.maxErrors, required this.hintMax});
  final int maxErrors;
  final int hintMax;
}

const samuraiMaxLevel = 12;
const _levelErrors = <int>[10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 4];
const _levelHints = <int>[4, 4, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1];

SamuraiLevelParams samuraiLevelParams(int level) {
  final i = level.clamp(1, samuraiMaxLevel) - 1;
  return SamuraiLevelParams(maxErrors: _levelErrors[i], hintMax: _levelHints[i]);
}

/// Поле из строки выгрузки: цифра, `0` — пусто, точка — клетка вне сеток.
List<List<int>> parseSamurai(String s) => [
      for (var r = 0; r < samuraiSize; r++)
        [
          for (var c = 0; c < samuraiSize; c++)
            s[r * samuraiSize + c] == '.' ? 0 : int.parse(s[r * samuraiSize + c]),
        ],
    ];
