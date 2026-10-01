/// «ГО: ЗАХВАТ» — ПРАВИЛА ГО И РЕШАТЕЛЬ ЗАДАЧ «ВОЗЬМИ ГРУППУ ЗА N ХОДОВ», БЕЗ ПИКСЕЛЕЙ.
///
/// Задача 66dee70c (цепочка «Шахматы: семь новых игр», игра 6). Правила го — те, что
/// нужны задаче на захват: камень ставится на пустой пункт; группа без дамэ (свободных
/// соседних пунктов) снимается; самоубийство запрещено, если ход ничего не берёт; ко —
/// нельзя сразу отбить один камень назад (позиция не повторяет предыдущую).
///
/// Задача: человек — чёрные, бот — белые. Цель — снять отмеченную белую группу не
/// позже N своих ходов при лучшей защите белых. Решатель — перебор И/ИЛИ по ходам
/// около цели: дамэ цели и их соседи, дамэ чёрных камней, которые цель может взять.
/// Тот же решатель доказывает задачу в генераторе и судит ходы в игре.
library;

const int goEmpty = 0;
const int goBlack = 1;
const int goWhite = 2;

/// Позиция: размер доски, пункты (ряд 0 — верх), чей ход, позиция до последнего хода
/// (для ко).
class GoPosition {
  GoPosition(this.size, List<int> points, {this.toMove = goBlack, this.previous})
    : points = List.unmodifiable(points);

  final int size;
  final List<int> points;
  final int toMove;
  final List<int>? previous;

  int at(int p) => points[p];

  Iterable<int> neighbours(int p) sync* {
    final r = p ~/ size, c = p % size;
    if (r > 0) yield p - size;
    if (r < size - 1) yield p + size;
    if (c > 0) yield p - 1;
    if (c < size - 1) yield p + 1;
  }

  /// Группа камня на `p` и её дамэ.
  ({Set<int> stones, Set<int> liberties}) group(int p) {
    final colour = points[p];
    final stones = <int>{p};
    final liberties = <int>{};
    final stack = [p];
    while (stack.isNotEmpty) {
      final q = stack.removeLast();
      for (final n in neighbours(q)) {
        final v = points[n];
        if (v == goEmpty) {
          liberties.add(n);
        } else if (v == colour && stones.add(n)) {
          stack.add(n);
        }
      }
    }
    return (stones: stones, liberties: liberties);
  }

  static int opponent(int colour) => colour == goBlack ? goWhite : goBlack;

  /// Ход на пункт `p` стороной, чья очередь; `null` — ход незаконен. `p == -1` — пас.
  GoPosition? play(int p) {
    if (p == -1) {
      return GoPosition(size, points, toMove: opponent(toMove), previous: points);
    }
    if (points[p] != goEmpty) return null;
    final me = toMove, them = opponent(me);
    final next = List<int>.of(points);
    next[p] = me;
    final probe = GoPosition(size, next);
    var captured = false;
    for (final n in neighbours(p)) {
      if (next[n] != them) continue;
      final g = probe.group(n);
      if (g.liberties.isEmpty) {
        for (final s in g.stones) {
          next[s] = goEmpty;
        }
        captured = true;
      }
    }
    if (!captured && GoPosition(size, next).group(p).liberties.isEmpty) {
      return null; // самоубийство
    }
    // Ко: нельзя вернуть доску к позиции до хода соперника.
    final prev = previous;
    if (prev != null && _same(prev, next)) return null;
    return GoPosition(size, next, toMove: them, previous: points);
  }

  static bool _same(List<int> a, List<int> b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  List<int> legalMoves() => [
    for (var p = 0; p < points.length; p++)
      if (points[p] == goEmpty && play(p) != null) p,
  ];
}

/// Задача на захват: позиция (ход чёрных), пункт любого камня цели, число ходов.
class CaptureProblem {
  const CaptureProblem(this.start, this.target, this.moves);
  final GoPosition start;
  final int target;
  final int moves;
}

/// Ответ решателя: да / нет / не знаю (потолок узлов).
enum GoVerdict { yes, no, unknown }

/// Перебор И/ИЛИ: снимут ли чёрные группу, стоящую на `target`, не позже чем за
/// `blackMoves` своих ходов при лучшей защите белых.
class CaptureSolver {
  CaptureSolver({this.nodeLimit = 200000});
  final int nodeLimit;
  int _nodes = 0;
  final Map<String, bool> _memo = {};

  /// Ключ памяти: доска, чей ход, сколько ходов осталось, прошлая доска (для ко).
  String _key(GoPosition pos, int left) =>
      '${pos.points.join()}|${pos.toMove}|$left|${pos.previous?.join() ?? ''}';

  GoVerdict captures(GoPosition pos, int target, int blackMoves) {
    _nodes = 0;
    _memo.clear();
    final r = _attack(pos, target, blackMoves);
    if (r == null) return GoVerdict.unknown;
    return r ? GoVerdict.yes : GoVerdict.no;
  }

  /// После хода чёрных (ход белых) — вынужден ли ещё захват за `blackMovesLeft`
  /// оставшихся ходов чёрных при лучшей защите.
  GoVerdict holdsAfter(GoPosition pos, int target, int blackMovesLeft) {
    _nodes = 0;
    _memo.clear();
    final r = _defend(pos, target, blackMovesLeft);
    if (r == null) return GoVerdict.unknown;
    return r ? GoVerdict.yes : GoVerdict.no;
  }

  /// Ходы чёрных, которые доказывают захват (для ключа задачи и подсказки).
  List<int> winningMoves(GoPosition pos, int target, int blackMoves) {
    final out = <int>[];
    for (final m in candidates(pos, target)) {
      final next = pos.play(m);
      if (next == null) continue;
      _nodes = 0;
      _memo.clear();
      if (next.at(target) == goEmpty || _defend(next, target, blackMoves - 1) == true) {
        out.add(m);
      }
    }
    return out;
  }

  /// Пункты около цели: её дамэ и их соседи, дамэ чёрных групп рядом с целью.
  List<int> candidates(GoPosition pos, int target) {
    if (pos.at(target) == goEmpty) return const [];
    final g = pos.group(target);
    final out = <int>{...g.liberties};
    for (final l in g.liberties) {
      for (final n in pos.neighbours(l)) {
        if (pos.at(n) == goEmpty) out.add(n);
      }
    }
    for (final s in g.stones) {
      for (final n in pos.neighbours(s)) {
        if (pos.at(n) != goEmpty && pos.at(n) != pos.at(target)) {
          final b = pos.group(n);
          if (b.liberties.length <= 2) out.addAll(b.liberties);
        }
      }
    }
    final list = out.toList()..sort();
    return list;
  }

  /// Ход чёрных: есть ли ход, после которого захват неизбежен. null — потолок.
  bool? _attack(GoPosition pos, int target, int left) {
    if (pos.at(target) == goEmpty) return true;
    if (left <= 0) return false;
    // Цели с дамэ больше, чем ходов, — не снять (каждый ход отнимает не больше одного).
    if (pos.group(target).liberties.length > left) return false;
    final key = _key(pos, left);
    final known = _memo[key];
    if (known != null) return known;
    if (++_nodes > nodeLimit) return null;
    var unknown = false;
    for (final m in candidates(pos, target)) {
      final next = pos.play(m);
      if (next == null) continue;
      if (next.at(target) == goEmpty) return _memo[key] = true;
      final r = _defend(next, target, left - 1);
      if (r == true) return _memo[key] = true;
      if (r == null) unknown = true;
    }
    if (unknown) return null;
    return _memo[key] = false;
  }

  /// Ход белых: все ли ответы (и пас) ведут к захвату. null — потолок.
  bool? _defend(GoPosition pos, int target, int left) {
    if (pos.at(target) == goEmpty) return true;
    if (left <= 0) return false;
    final key = _key(pos, left);
    final known = _memo[key];
    if (known != null) return known;
    if (++_nodes > nodeLimit) return null;
    var unknown = false;
    for (final m in [...candidates(pos, target), -1]) {
      final next = pos.play(m);
      if (next == null) continue;
      final r = _attack(next, target, left);
      if (r == false) return _memo[key] = false;
      if (r == null) unknown = true;
    }
    if (unknown) return null;
    return _memo[key] = true;
  }

  /// Лучший ответ белых: ход, после которого чёрным труднее всего (сперва те, где
  /// захват за оставшиеся ходы уже не доказывается).
  int defenderReply(GoPosition pos, int target, int blackMovesLeft) {
    int? fallback;
    for (final m in [...candidates(pos, target), -1]) {
      final next = pos.play(m);
      if (next == null) continue;
      fallback ??= m;
      _nodes = 0;
      _memo.clear();
      if (_attack(next, target, blackMovesLeft) != true) return m;
    }
    // Все ответы проигрывают — тянуть дольше: больше всего дамэ у цели.
    var best = fallback ?? -1, bestLibs = -1;
    for (final m in candidates(pos, target)) {
      final next = pos.play(m);
      if (next == null || next.at(target) == goEmpty) continue;
      final libs = next.group(target).liberties.length;
      if (libs > bestLibs) {
        bestLibs = libs;
        best = m;
      }
    }
    return best;
  }
}
