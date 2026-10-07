/// «ВОСЕМЬ ФЕРЗЕЙ» — ПРАВИЛА И ПЕРЕБОР, БЕЗ ПИКСЕЛЕЙ.
///
/// Задача 39ad8924, игра 3 из семи новых в развилке «Шахматы», режим 1 из 2. Доска
/// N×N, «заданные» ферзи стоят с начала и не снимаются, на «дыры» ставить нельзя.
/// Решено — на доске N ферзей и никто никого не бьёт.
///
/// 🔴 ЭТО ПЕРЕНОС ГЕНЕРАТОРА `tools/knights_queens_corpus.py` (`queens_analyse`), НЕ
/// ВТОРАЯ ВЕРСИЯ ПРАВИЛ. Проба `knights_queens_test.dart` прогоняет все 480 задач
/// корпуса и требует, чтобы число решений и P совпали с записанными генератором.
library;

/// Клетка — `ряд * n + столбец`, ряд 0 — верхний.
class QueensBoard {
  QueensBoard(
    this.n, {
    required Set<int> givens,
    required Set<int> holes,
    List<int> placed = const [],
  }) : givens = Set.unmodifiable(givens),
       holes = Set.unmodifiable(holes),
       placed = List.unmodifiable(placed);

  /// Из записи генератора: `n*n` знаков сверху вниз, «Q» — заданный, «#» — дыра.
  factory QueensBoard.parse(int n, String code) {
    assert(code.length == n * n, 'board $code');
    return QueensBoard(
      n,
      givens: {
        for (var i = 0; i < code.length; i++)
          if (code[i] == 'Q') i,
      },
      holes: {
        for (var i = 0; i < code.length; i++)
          if (code[i] == '#') i,
      },
    );
  }

  final int n;
  final Set<int> givens;
  final Set<int> holes;

  /// Поставленные человеком — В ПОРЯДКЕ постановки: по нему ищется «где ошибка».
  final List<int> placed;

  Set<int> get queens => {...givens, ...placed};

  static bool attacks(int a, int b, int n) {
    final r1 = a ~/ n, c1 = a % n, r2 = b ~/ n, c2 = b % n;
    return r1 == r2 || c1 == c2 || (r1 - r2).abs() == (c1 - c2).abs();
  }

  /// Бьёт ли поле [cell] хоть один ферзь доски (кроме стоящего на нём самом).
  bool attacked(int cell) =>
      queens.any((q) => q != cell && attacks(q, cell, n));

  /// Ферзи, которых бьёт другой ферзь.
  Set<int> get conflicts => {
    for (final q in queens)
      if (queens.any((o) => o != q && attacks(o, q, n))) q,
  };

  bool get solved => queens.length == n && conflicts.isEmpty;

  /// Можно ли трогать клетку: заданного ферзя и дыру — нельзя.
  bool canToggle(int cell) => !givens.contains(cell) && !holes.contains(cell);

  /// Поставить ферзя или снять поставленного.
  QueensBoard toggle(int cell) {
    if (!canToggle(cell)) return this;
    final next = placed.contains(cell)
        ? [
            for (final q in placed)
              if (q != cell) q,
          ]
        : [...placed, cell];
    return QueensBoard(n, givens: givens, holes: holes, placed: next);
  }

  QueensBoard get reset => QueensBoard(n, givens: givens, holes: holes);

  String get code => [
    for (var i = 0; i < n * n; i++)
      givens.contains(i)
          ? 'Q'
          : holes.contains(i)
          ? '#'
          : '.',
  ].join();

  /// Все решения задачи (без учёта поставленных человеком) — как наборы клеток.
  List<Set<int>> get solutions {
    final givenRow = {for (final g in givens) g ~/ n: g};
    final out = <Set<int>>[];
    void go(int row, List<int> chosen) {
      if (row == n) {
        out.add(chosen.toSet());
        return;
      }
      final g = givenRow[row];
      if (g != null) {
        if (chosen.every((q) => !attacks(q, g, n))) go(row + 1, [...chosen, g]);
        return;
      }
      for (var c = 0; c < n; c++) {
        final cell = row * n + c;
        if (holes.contains(cell)) continue;
        if (chosen.any((q) => attacks(q, cell, n))) continue;
        if (givens.any((q) => attacks(q, cell, n))) continue;
        go(row + 1, [...chosen, cell]);
      }
    }

    go(0, const []);
    return out;
  }

  /// «ГДЕ ОШИБКА?» — первый по порядку постановки ферзь, после которого ни одно
  /// решение задачи уже не содержит всех поставленных. `null` — ошибки нет.
  int? firstMistake() {
    final sols = solutions;
    for (var k = 1; k <= placed.length; k++) {
      final prefix = placed.sublist(0, k);
      if (!sols.any((s) => prefix.every(s.contains))) return placed[k - 1];
    }
    return null;
  }
}

/// Число решений и P — тем же перебором по рядам, что у генератора: в каждом
/// свободном ряду ферзь встаёт равновероятно на любое поле, которое не дыра и не
/// бито стоящими ферзями (заданные бьют с самого начала).
(int, double) queensAnalyse(QueensBoard b) {
  final n = b.n;
  for (final a in b.givens) {
    for (final o in b.givens) {
      if (a < o && QueensBoard.attacks(a, o, n)) return (0, 0.0);
    }
  }
  final givenRows = {for (final g in b.givens) g ~/ n};
  (int, double) go(int row, List<int> placed) {
    if (row == n) return (1, 1.0);
    if (givenRows.contains(row)) return go(row + 1, placed);
    final safe = [
      for (var c = 0; c < n; c++)
        if (!b.holes.contains(row * n + c) &&
            placed.every((q) => !QueensBoard.attacks(row * n + c, q, n)))
          row * n + c,
    ];
    if (safe.isEmpty) return (0, 0.0);
    var sols = 0;
    var p = 0.0;
    for (final cell in safe) {
      final (s, q) = go(row + 1, [...placed, cell]);
      sols += s;
      p += q;
    }
    return (sols, p / safe.length);
  }

  return go(0, b.givens.toList());
}
