import 'dart:convert';

/// «Соедини точки» — данные уровня и правила хода.
///
/// Уровни НЕ генерируются в Dart: их выпускает нынешний генератор проекта
/// (frontend/src/games/dots-connect/core/generator.ts) и кладёт в
/// assets/levels/dots_connect.json вместе с эталонным решением. Тяжёлая часть —
/// построение и решатель — остаётся там, где она уже проверена; сюда переносятся
/// только правила хода и условие победы.
class Cell {
  const Cell(this.row, this.col);
  final int row;
  final int col;

  factory Cell.fromJson(Map<String, dynamic> j) => Cell(j['row'] as int, j['col'] as int);

  bool isNeighbour(Cell o) => (row - o.row).abs() + (col - o.col).abs() == 1;

  @override
  bool operator ==(Object other) => other is Cell && other.row == row && other.col == col;

  @override
  int get hashCode => Object.hash(row, col);

  @override
  String toString() => '($row,$col)';
}

class DotsPair {
  const DotsPair({required this.id, required this.color, required this.symbol, required this.ends});
  final String id;
  final String color;
  final String symbol;
  final List<Cell> ends;

  factory DotsPair.fromJson(Map<String, dynamic> j) => DotsPair(
        id: j['id'] as String,
        color: j['color'] as String,
        symbol: j['symbol'] as String,
        ends: (j['endpoints'] as List).map((e) => Cell.fromJson(e as Map<String, dynamic>)).toList(),
      );

  bool isEnd(Cell c) => ends.contains(c);
}

class DotsLevel {
  DotsLevel({
    required this.level,
    required this.size,
    required this.pairs,
    required this.walls,
    required this.gates,
    required this.solution,
  });

  final int level;
  final int size;
  final List<DotsPair> pairs;
  final Set<Cell> walls;

  /// Клетка, в которую ходит только названная пара.
  final Map<Cell, String> gates;

  /// Эталонное решение из генератора — для проб и для кнопки «Показать решение».
  final Map<String, List<Cell>> solution;

  factory DotsLevel.fromJson(Map<String, dynamic> j) => DotsLevel(
        level: j['level'] as int,
        size: j['size'] as int,
        pairs: (j['pairs'] as List).map((p) => DotsPair.fromJson(p as Map<String, dynamic>)).toList(),
        walls: ((j['walls'] as List?) ?? const [])
            .map((c) => Cell.fromJson(c as Map<String, dynamic>))
            .toSet(),
        gates: {
          for (final g in (j['gates'] as List?) ?? const [])
            Cell.fromJson((g as Map<String, dynamic>)['cell'] as Map<String, dynamic>):
                g['pairId'] as String,
        },
        solution: {
          for (final e in ((j['solution'] as Map?) ?? const {}).entries)
            e.key as String:
                (e.value as List).map((c) => Cell.fromJson(c as Map<String, dynamic>)).toList(),
        },
      );

  /// Клеток, которые надо занять: всё поле, кроме стен. Правило игры — «занять всю сетку».
  int get playableCells => size * size - walls.length;

  bool inside(Cell c) => c.row >= 0 && c.col >= 0 && c.row < size && c.col < size;
}

class DotsLevelSet {
  DotsLevelSet(this.training, this.levels);
  final DotsLevel training;
  final List<DotsLevel> levels;

  factory DotsLevelSet.fromJsonString(String s) {
    final j = jsonDecode(s) as Map<String, dynamic>;
    return DotsLevelSet(
      DotsLevel.fromJson(j['training'] as Map<String, dynamic>),
      (j['levels'] as List).map((l) => DotsLevel.fromJson(l as Map<String, dynamic>)).toList(),
    );
  }

  DotsLevel byLevel(int level) => levels[(level - 1).clamp(0, levels.length - 1)];
}

/// Партия: какие клетки заняты какой парой и что с этим можно делать.
class DotsGame {
  DotsGame(this.level);

  final DotsLevel level;

  /// Путь каждой пары: от её точки к её точке.
  final Map<String, List<Cell>> paths = {};

  /// Чья это клетка. Пустая клетка в карте отсутствует.
  final Map<Cell, String> owner = {};

  /// Можно ли вести путь пары `pairId` в клетку `c` из клетки `from`.
  ///
  /// Запрещено: выйти за поле, войти в стену, войти в чужие ворота, занять
  /// чужую клетку, встать на чужую точку. Ходим только по соседним клеткам.
  bool canExtend(String pairId, Cell from, Cell c) {
    if (!level.inside(c) || level.walls.contains(c)) return false;
    if (!from.isNeighbour(c)) return false;
    final gate = level.gates[c];
    if (gate != null && gate != pairId) return false;
    final who = owner[c];
    if (who != null && who != pairId) return false;
    for (final p in level.pairs) {
      if (p.id != pairId && p.isEnd(c)) return false;
    }
    return true;
  }

  /// Провести путь пары целиком. Возвращает false и не меняет партию, если путь
  /// нарушает правила: так проба ловит и ошибку экрана, и ошибку выгруженных данных.
  bool drawPath(String pairId, List<Cell> cells) {
    final pair = level.pairs.firstWhere((p) => p.id == pairId);
    if (cells.length < 2) return false;
    if (!pair.isEnd(cells.first) || !pair.isEnd(cells.last)) return false;
    if (cells.first == cells.last) return false;
    final taken = <Cell>{};
    for (var i = 0; i < cells.length; i++) {
      final c = cells[i];
      if (!taken.add(c)) return false; // путь не ходит по себе
      if (i == 0) {
        if (!level.inside(c) || level.walls.contains(c)) return false;
        continue;
      }
      if (!canExtend(pairId, cells[i - 1], c)) return false;
    }
    clearPath(pairId);
    paths[pairId] = List.of(cells);
    for (final c in cells) {
      owner[c] = pairId;
    }
    return true;
  }

  void clearPath(String pairId) {
    final old = paths.remove(pairId);
    if (old == null) return;
    for (final c in old) {
      if (owner[c] == pairId) owner.remove(c);
    }
  }

  int get filledCells => owner.length;

  /// Победа: все пары соединены И занято всё поле, кроме стен.
  bool get isWon =>
      paths.length == level.pairs.length && filledCells == level.playableCells;

  /// Проверка эталонного решения из данных: оно обязано выигрывать уровень.
  static bool solutionWins(DotsLevel level) {
    final g = DotsGame(level);
    for (final e in level.solution.entries) {
      if (!g.drawPath(e.key, e.value)) return false;
    }
    return g.isWon;
  }
}
