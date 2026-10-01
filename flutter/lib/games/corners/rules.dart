/// «УГОЛКИ» — ПРАВИЛА ХОДА И РЕШАТЕЛЬ, БЕЗ ПИКСЕЛЕЙ.
///
/// Задача 30b5a5aa (цепочка «Шахматы: семь новых игр», игра 5). Правила сверены с
/// источниками на четырёх языках 02.10.2026 (ru/en Википедия «Уголки», описания
/// приложений): фишка ходит на соседнюю клетку ПО ВЕРТИКАЛИ ИЛИ ГОРИЗОНТАЛИ или
/// прыгает по прямой через соседнюю фишку — свою или чужую — на свободную клетку за
/// ней; прыжки можно продолжать цепочкой, но не обязательно; через кого прыгнули —
/// остаётся на доске.
///
/// Тренажёр — задача для одного: свои фишки перевести на клетки цели (угол) за N
/// ходов. «Камни» — неподвижные фишки соперника: через них прыгают, встать на них
/// нельзя. Минимум ходов доказывает перебор — генератор (`tools/corners_corpus.dart`)
/// и этот же решатель на экране («Где ошибка?»).
library;

/// Доска задачи: размер, камни, клетки цели. Клетка — `ряд * size + столбец`,
/// ряд 0 — верхний.
class CornersBoard {
  CornersBoard({
    required this.size,
    required Set<int> stones,
    required Set<int> target,
  }) : stones = Set.unmodifiable(stones),
       target = Set.unmodifiable(target),
       stoneMask = _mask(stones),
       targetMask = _mask(target);

  final int size;
  final Set<int> stones;
  final Set<int> target;
  final int stoneMask;
  final int targetMask;

  static int _mask(Iterable<int> cells) {
    var m = 0;
    for (final c in cells) {
      m |= 1 << c;
    }
    return m;
  }

  int get cells => size * size;

  /// Соседи по вертикали и горизонтали.
  Iterable<(int, int)> _dirs(int cell) sync* {
    final r = cell ~/ size, c = cell % size;
    if (r > 0) yield (-size, cell - size);
    if (r < size - 1) yield (size, cell + size);
    if (c > 0) yield (-1, cell - 1);
    if (c < size - 1) yield (1, cell + 1);
  }

  /// Клетка за `over` по направлению `delta` — или -1, если за краем.
  int _beyond(int over, int delta) {
    final r = over ~/ size, c = over % size;
    switch (delta) {
      case 1:
        return c + 1 < size ? over + 1 : -1;
      case -1:
        return c > 0 ? over - 1 : -1;
      default:
        final nr = r + (delta > 0 ? 1 : -1);
        return nr >= 0 && nr < size ? over + delta : -1;
    }
  }

  /// Куда фишка с клетки `from` может прийти одним ходом при своих фишках `pieces`:
  /// соседние пустые клетки и все концы цепочек прыжков.
  Set<int> targetsFrom(int pieces, int from) {
    final occupied = (pieces & ~(1 << from)) | stoneMask;
    final out = <int>{};
    for (final (_, n) in _dirs(from)) {
      if (occupied >> n & 1 == 0) out.add(n);
    }
    // Прыжки: обход в ширину по клеткам приземления, без возврата туда, где были.
    final seen = <int>{from};
    final queue = <int>[from];
    while (queue.isNotEmpty) {
      final at = queue.removeLast();
      for (final (delta, over) in _dirs(at)) {
        if (occupied >> over & 1 == 0) continue;
        final land = _beyond(over, delta);
        if (land < 0 || occupied >> land & 1 == 1 || !seen.add(land)) continue;
        out.add(land);
        queue.add(land);
      }
    }
    out.remove(from);
    return out;
  }

  /// Все ходы: пары (откуда, куда).
  List<(int, int)> moves(int pieces) {
    final out = <(int, int)>[];
    var rest = pieces;
    while (rest != 0) {
      final low = rest & -rest;
      final from = low.bitLength - 1;
      rest ^= low;
      for (final to in targetsFrom(pieces, from)) {
        out.add((from, to));
      }
    }
    return out;
  }

  static int apply(int pieces, (int, int) move) =>
      (pieces & ~(1 << move.$1)) | (1 << move.$2);

  bool solved(int pieces) => pieces == targetMask;

  /// Честная нижняя оценка: каждая фишка вне цели требует хотя бы одного хода.
  int lowerBound(int pieces) => _popcount(pieces & ~targetMask);

  static int _popcount(int x) {
    var n = 0;
    while (x != 0) {
      x &= x - 1;
      n++;
    }
    return n;
  }
}

/// Точный минимум ходов перебором в ширину (для генератора). `null` — цель не
/// достигается за `limit` ходов или перебор упёрся в потолок позиций.
int? cornersMinMoves(
  CornersBoard board,
  int start, {
  int limit = 40,
  int maxStates = 4000000,
}) {
  if (board.solved(start)) return 0;
  final seen = <int>{start};
  var frontier = <int>[start];
  for (var depth = 1; depth <= limit; depth++) {
    final next = <int>[];
    for (final s in frontier) {
      for (final m in board.moves(s)) {
        final t = CornersBoard.apply(s, m);
        if (!seen.add(t)) continue;
        if (board.solved(t)) return depth;
        next.add(t);
      }
    }
    if (next.isEmpty || seen.length > maxStates) return null;
    frontier = next;
  }
  return null;
}

/// Ответ решателя за конечное время: да / нет / не знаю (потолок узлов).
enum CornersVerdict { yes, no, unknown }

/// Достижима ли цель из `pieces` не больше чем за `budget` ходов. IDA*-шаг с
/// таблицей «из этой позиции уже доказано, что за столько-то не дойти».
class CornersSearch {
  CornersSearch(this.board, {this.nodeLimit = 400000});
  final CornersBoard board;
  final int nodeLimit;
  final Map<int, int> _failedWith = {};
  int _nodes = 0;
  List<(int, int)> line = const [];

  CornersVerdict reachable(int pieces, int budget) {
    _nodes = 0;
    _failedWith.clear();
    final path = <(int, int)>[];
    final ok = _go(pieces, budget, path);
    if (ok == true) {
      line = List.unmodifiable(path);
      return CornersVerdict.yes;
    }
    return ok == false ? CornersVerdict.no : CornersVerdict.unknown;
  }

  /// true — дошли; false — доказано, что нет; null — потолок.
  bool? _go(int pieces, int budget, List<(int, int)> path) {
    if (board.solved(pieces)) return true;
    if (board.lowerBound(pieces) > budget) return false;
    final known = _failedWith[pieces];
    if (known != null && known >= budget) return false;
    if (++_nodes > nodeLimit) return null;
    var unknown = false;
    // Сначала ходы, что заводят фишку в цель, — короткие линии находятся быстрее.
    final moves = board.moves(pieces)
      ..sort((a, b) {
        final ia = board.targetMask >> a.$2 & 1, ib = board.targetMask >> b.$2 & 1;
        return ib - ia;
      });
    for (final m in moves) {
      path.add(m);
      final r = _go(CornersBoard.apply(pieces, m), budget - 1, path);
      if (r == true) return true;
      path.removeLast();
      if (r == null) unknown = true;
    }
    if (unknown) return null;
    _failedWith[pieces] = budget;
    return false;
  }
}
