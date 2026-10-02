/// «ОБХОД КОНЁМ» — ПРАВИЛА И ПЕРЕБОР, БЕЗ ПИКСЕЛЕЙ.
///
/// Задача 39ad8924, режим 2 из 2. Доска R×C, старт, поля-препятствия, иногда
/// заданный финиш. Решено — конь побывал на каждом свободном поле ровно раз (и
/// закончил на финише, если он задан).
///
/// Ход коня — та же таблица прыжков, что в «Доске в уме» (`chess_blind/moves.dart`,
/// `_knight`), только на доске любого размера и с препятствиями.
///
/// 🔴 ПЕРЕБОР С ПОТОЛКОМ, И ПОТОЛОК ЧЕСТНЫЙ. Доказать, что из позиции 8×8 обхода
/// НЕТ, — значит пройти всё дерево; на телефоне это может быть дольше кадра. Поэтому
/// [TourSearch] возвращает три исхода: обход найден, обхода нет (дерево пройдено),
/// не знаю (потолок узлов). «Где ошибка?» на «не знаю» говорит «не нашёл», а не
/// угадывает ход.
library;

const List<(int, int)> knightJumps = [
  (1, 2),
  (2, 1),
  (2, -1),
  (1, -2),
  (-1, -2),
  (-2, -1),
  (-2, 1),
  (-1, 2),
];

class TourBoard {
  TourBoard(
    this.rows,
    this.cols, {
    required this.start,
    this.end,
    Set<int> blocked = const {},
  }) : blocked = Set.unmodifiable(blocked);

  /// Из записи генератора: «S» старт, «E» финиш, «#» препятствие, «.» свободно.
  factory TourBoard.parse(int rows, int cols, String code) {
    assert(code.length == rows * cols, 'board $code');
    return TourBoard(
      rows,
      cols,
      start: code.indexOf('S'),
      end: code.contains('E') ? code.indexOf('E') : null,
      blocked: {
        for (var i = 0; i < code.length; i++)
          if (code[i] == '#') i,
      },
    );
  }

  final int rows;
  final int cols;
  final int start;
  final int? end;
  final Set<int> blocked;

  int get free => rows * cols - blocked.length;

  /// Куда конь прыгает с клетки — препятствия не в счёт, занятость пути — тоже.
  List<int> jumps(int cell) {
    final r = cell ~/ cols, c = cell % cols;
    return [
      for (final (dr, dc) in knightJumps)
        if (r + dr >= 0 &&
            r + dr < rows &&
            c + dc >= 0 &&
            c + dc < cols &&
            !blocked.contains((r + dr) * cols + c + dc))
          (r + dr) * cols + c + dc,
    ];
  }

  /// Законные ходы из конца пути [path]: не бывал, и финиш — только последним.
  List<int> nextMoves(List<int> path) {
    final seen = path.toSet();
    final last = path.last;
    final lastStep = path.length == free - 1;
    return [
      for (final y in jumps(last))
        if (!seen.contains(y) && (end == null || lastStep || y != end)) y,
    ];
  }

  bool solved(List<int> path) =>
      path.length == free && (end == null || path.last == end);

  /// Сколько выходов будет у клетки [cell], если путь уже [seen].
  int exits(int cell, Set<int> seen) =>
      jumps(cell).where((y) => !seen.contains(y)).length;

  /// Проверить запись обхода: старт, прыжки коня, каждое свободное поле по разу,
  /// финиш. Нужна пробе корпуса — эталонный обход генератора обязан быть законным.
  bool isTour(List<int> path) {
    if (path.isEmpty || path.first != start) return false;
    if (path.toSet().length != path.length) return false;
    for (var i = 1; i < path.length; i++) {
      if (!jumps(path[i - 1]).contains(path[i])) return false;
    }
    return solved(path);
  }
}

enum TourOutcome { found, impossible, unknown }

/// Перебор с откатом, правило Варнсдорфа первым (туда, откуда меньше выходов).
class TourSearch {
  TourSearch(this.board, {this.budget = 200000});
  final TourBoard board;
  final int budget;

  TourOutcome outcome = TourOutcome.unknown;
  List<int> tour = const [];
  int _nodes = 0;

  /// Достроить обход от начала [prefix] (законного пути от старта).
  TourOutcome run(List<int> prefix) {
    _nodes = 0;
    final path = [...prefix];
    final seen = path.toSet();
    var exhausted = false;
    bool go() {
      if (++_nodes > budget) {
        exhausted = true;
        return false;
      }
      if (path.length == board.free) {
        return board.end == null || path.last == board.end;
      }
      final cand = board.nextMoves(path)
        ..sort((a, b) {
          final d = board.exits(a, seen) - board.exits(b, seen);
          return d != 0 ? d : a - b;
        });
      for (final y in cand) {
        path.add(y);
        seen.add(y);
        if (go()) return true;
        path.removeLast();
        seen.remove(y);
        if (exhausted) return false;
      }
      return false;
    }

    if (go()) {
      tour = List.unmodifiable(path);
      return outcome = TourOutcome.found;
    }
    return outcome = exhausted ? TourOutcome.unknown : TourOutcome.impossible;
  }
}

/// «ГДЕ ОШИБКА?» — номер хода (1 — первый прыжок), после которого обход стал
/// невозможен. `null` — путь ещё достраивается; `-1` — потолок перебора, честно
/// «не нашёл».
int? tourFirstMistake(TourBoard board, List<int> path, {int budget = 60000}) {
  final whole = TourSearch(board, budget: budget).run(path);
  if (whole == TourOutcome.found) return null;
  for (var k = 2; k <= path.length; k++) {
    final o = TourSearch(board, budget: budget).run(path.sublist(0, k));
    if (o == TourOutcome.impossible) return k - 1;
    if (o == TourOutcome.unknown) return -1;
  }
  return whole == TourOutcome.impossible ? path.length - 1 : -1;
}
