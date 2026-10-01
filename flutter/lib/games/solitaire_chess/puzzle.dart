/// «ШАХМАТНЫЙ ПАСЬЯНС» — ПРАВИЛА И ПЕРЕБОР, БЕЗ ПИКСЕЛЕЙ.
///
/// Задача 66b3d2ac, игра 2 из семи новых в развилке «Шахматы». Правила — как у
/// настольного Solitaire Chess (ThinkFun): фигуры ходят по-шахматному, но ТОЛЬКО со
/// взятием; цвета нет, бить можно любую фигуру; шаха нет, короля тоже берут; пешка
/// бьёт на клетку по диагонали ВВЕРХ и не превращается. Решено — одна фигура.
///
/// 🔴 ЭТО ПЕРЕНОС ГЕНЕРАТОРА `tools/solitaire_chess_corpus.py`, НЕ ВТОРАЯ ВЕРСИЯ ПРАВИЛ.
/// Проба `solitaire_chess_test.dart` прогоняет все 720 досок корпуса и требует, чтобы
/// число решений и вероятность P совпали с записанными генератором: разойдутся правила —
/// краснеет каждая доска, где разница сказывается.
library;

/// Буквы фигур: K Q R B N P. Клетка — `ряд * dim + столбец`, ряд 0 — верхний.
class SolitaireBoard {
  SolitaireBoard(this.dim, Map<int, String> cells)
    : cells = Map.unmodifiable(cells);

  /// Из записи генератора: `dim*dim` знаков сверху вниз, «.» — пусто.
  factory SolitaireBoard.parse(String s, {int dim = 4}) {
    assert(s.length == dim * dim, 'доска $s');
    return SolitaireBoard(dim, {
      for (var i = 0; i < s.length; i++)
        if (s[i] != '.') i: s[i],
    });
  }

  final int dim;
  final Map<int, String> cells;

  int get count => cells.length;
  bool get solved => cells.length == 1;

  String get code =>
      [for (var i = 0; i < dim * dim; i++) cells[i] ?? '.'].join();

  static const _rook = [(1, 0), (-1, 0), (0, 1), (0, -1)];
  static const _bishop = [(1, 1), (1, -1), (-1, 1), (-1, -1)];
  static const _knight = [
    (1, 2),
    (2, 1),
    (-1, 2),
    (-2, 1),
    (1, -2),
    (2, -1),
    (-1, -2),
    (-2, -1),
  ];

  bool _on(int r, int c) => r >= 0 && r < dim && c >= 0 && c < dim;

  /// Куда фигура с клетки [from] может взять — в порядке генератора.
  List<int> capturesFrom(int from) {
    final p = cells[from];
    if (p == null) return const [];
    final r = from ~/ dim, c = from % dim;
    final out = <int>[];
    void slide(List<(int, int)> dirs) {
      for (final (dr, dc) in dirs) {
        var rr = r + dr, cc = c + dc;
        while (_on(rr, cc)) {
          if (cells.containsKey(rr * dim + cc)) {
            out.add(rr * dim + cc);
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
    }

    void jump(List<(int, int)> dirs) {
      for (final (dr, dc) in dirs) {
        final rr = r + dr, cc = c + dc;
        if (_on(rr, cc) && cells.containsKey(rr * dim + cc)) {
          out.add(rr * dim + cc);
        }
      }
    }

    switch (p) {
      case 'R':
        slide(_rook);
      case 'B':
        slide(_bishop);
      case 'Q':
        slide([..._rook, ..._bishop]);
      case 'N':
        jump(_knight);
      case 'K':
        jump([..._rook, ..._bishop]);
      case 'P':
        jump(const [(-1, -1), (-1, 1)]);
    }
    return out;
  }

  /// Все взятия на доске: (откуда, куда).
  List<(int, int)> get captures => [
    for (final from in cells.keys.toList()..sort())
      for (final to in capturesFrom(from)) (from, to),
  ];

  /// Тупик: фигур больше одной, а брать нечего.
  bool get stuck => !solved && captures.isEmpty;

  SolitaireBoard play(int from, int to) {
    final next = Map<int, String>.of(cells);
    next[to] = next.remove(from)!;
    return SolitaireBoard(dim, next);
  }
}

/// Число решений и вероятность расчистить доску случайными взятиями — тем же
/// перебором с памятью, что у генератора.
class SolitaireAnalysis {
  SolitaireAnalysis._(this.solutions, this.randomSuccess);
  final int solutions;
  final double randomSuccess;

  static SolitaireAnalysis of(SolitaireBoard b) {
    final memo = <String, (int, double)>{};
    (int, double) go(SolitaireBoard x) {
      if (x.solved) return (1, 1.0);
      final k = x.code;
      final hit = memo[k];
      if (hit != null) return hit;
      final cs = x.captures;
      var sols = 0;
      var p = 0.0;
      for (final (f, t) in cs) {
        final (s, q) = go(x.play(f, t));
        sols += s;
        p += q;
      }
      final r = (sols, cs.isEmpty ? 0.0 : p / cs.length);
      memo[k] = r;
      return r;
    }

    final (s, p) = go(b);
    return SolitaireAnalysis._(s, p);
  }
}

/// Взятия, после которых доска ещё решается. Пусто — позиция уже проиграна
/// (даже если брать ещё есть что).
List<(int, int)> solitaireSafeCaptures(SolitaireBoard b) {
  final memo = <String, bool>{};
  bool solvable(SolitaireBoard x) {
    if (x.solved) return true;
    return memo[x.code] ??= x.captures.any((m) => solvable(x.play(m.$1, m.$2)));
  }

  return [
    for (final m in b.captures)
      if (solvable(b.play(m.$1, m.$2))) m,
  ];
}

/// Одно решение от позиции [b] (первое в порядке генератора) или пусто.
List<(int, int)> solitaireSolution(SolitaireBoard b) {
  if (b.solved) return const [];
  for (final m in solitaireSafeCaptures(b)) {
    return [m, ...solitaireSolution(b.play(m.$1, m.$2))];
  }
  return const [];
}
