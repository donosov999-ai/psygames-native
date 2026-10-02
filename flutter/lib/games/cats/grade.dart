/// МЕРА ТРУДНОСТИ «КОШЕК»: самый сильный приём, без которого карту логикой не решить.
///
/// 🔴 ЗАЧЕМ (задача a7987915). Лестница «Кошек» растила размер поля: 6×6 → 10×10, по
/// ступени на три уровня. Размер — не трудность: 10×10 с ровными областями решается в
/// лоб, а 8×8 с длинной «змеёй» заставляет рассуждать. Ту же ошибку мы уже делали на
/// лестнице судоку (там тоже росло число дырок, а не нужный приём) и лечили мерой —
/// `gradePuzzle` в `frontend/src/services/sudoku-grade.ts`: tier / steps / cost. Здесь
/// та же форма.
///
/// Приёмы — ступени меры, от узкого к широкому, в том порядке, в каком их пробует
/// человек (и решатель: после каждого хода снова с первой ступени):
///   1 · одно место — в цвете, строке или столбце осталась одна клетка;
///   2 · запирание — все места цвета лежат в одной строке (столбце): остальная строка
///       пуста; и наоборот — все места строки в одном цвете: остальной цвет пуст;
///   3 · группа — k цветов заперты в k строках (столбцах): остальные клетки этих
///       строк пусты; так же k строк в k цветах и k строк в k столбцах;
///   4 · касание — кошка в клетке съела бы ВСЕ места какого-то цвета, строки или
///       столбца: значит, в этой клетке её нет;
///   5 · перебор — ни один приём не двигает. Это честная ступень, а не провал меры:
///       она говорит «здесь без проб не обойтись».
///
/// ⚠️ Перебор меряется, но не исполняется: ход «наугад» берётся из разгадки (как в
/// разборе, `lesson.dart`), иначе мера зависела бы от удачи догадки.
library;

import 'rules.dart';

/// Приём — ступень меры. Номер ступени = `index + 1`.
enum CatsStep { single, confine, group, touch, trial }

/// Итог меры.
class CatsGrade {
  const CatsGrade({required this.tier, required this.steps, required this.cost, required this.uses});

  /// Самый сильный понадобившийся приём, 1…5.
  final int tier;

  /// Сколько раз пришлось применить приём (ход или вычёркивание).
  final int steps;

  /// Сумма ступеней всех применений: при равной [tier] различает карты по объёму работы.
  final int cost;

  /// Сколько раз применён каждый приём.
  final Map<CatsStep, int> uses;

  /// Решается ли логикой без проб.
  bool get logical => tier < 5;
}

/// Измерить карту. Карта обязана иметь единственное решение — иначе логика встанет, и
/// мера честно скажет «перебор».
CatsGrade gradeCats(CatsBoard board) {
  final n = board.n;
  final cells = n * n;
  final cand = List<bool>.filled(cells, true);
  final cat = List<bool>.filled(cells, false);
  final uses = {for (final s in CatsStep.values) s: 0};
  var tier = 1, steps = 0, cost = 0, placed = 0;

  int rowOf(int i) => i ~/ n;
  int colOf(int i) => i % n;
  int regionOf(int i) => board.regionAt(i ~/ n, i % n);

  // Семьи единиц: в каждой строке, столбце и цвете ровно одна кошка.
  final rows = [for (var r = 0; r < n; r++) [for (var c = 0; c < n; c++) r * n + c]];
  final cols = [for (var c = 0; c < n; c++) [for (var r = 0; r < n; r++) r * n + c]];
  final regions = [for (var g = 0; g < n; g++) <int>[]];
  for (var i = 0; i < cells; i++) {
    regions[regionOf(i)].add(i);
  }
  final units = [...rows, ...cols, ...regions];

  bool done(List<int> unit) => unit.any((i) => cat[i]);
  List<int> live(List<int> unit) => [for (final i in unit) if (cand[i]) i];

  /// Кошка в [i] исключает [j]: та же строка, столбец, цвет или касание.
  bool kills(int i, int j) =>
      i != j &&
      (rowOf(i) == rowOf(j) ||
          colOf(i) == colOf(j) ||
          regionOf(i) == regionOf(j) ||
          ((rowOf(i) - rowOf(j)).abs() <= 1 && (colOf(i) - colOf(j)).abs() <= 1));

  void place(int i) {
    cat[i] = true;
    cand[i] = false;
    placed++;
    for (var j = 0; j < cells; j++) {
      if (cand[j] && kills(i, j)) cand[j] = false;
    }
  }

  void use(CatsStep s) {
    uses[s] = uses[s]! + 1;
    steps++;
    cost += s.index + 1;
    if (s.index + 1 > tier) tier = s.index + 1;
  }

  bool single() {
    for (final u in units) {
      if (done(u)) continue;
      final l = live(u);
      if (l.length == 1) {
        place(l.first);
        use(CatsStep.single);
        return true;
      }
    }
    return false;
  }

  /// Запирание (k = 1) и группы (k ≥ 2) для пары семей: k открытых единиц из [a] лежат
  /// местами ровно в k единицах из [b] — значит, эти k кошек и займут эти k единиц, и
  /// прочие места в них пусты.
  bool lockFamily(List<List<int>> a, int Function(int) bIndex, int k) {
    final open = [for (final u in a) if (!done(u) && live(u).isNotEmpty) u];
    if (k >= open.length) return false;   // все оставшиеся сразу — ничего не вычёркивает
    final picked = <int>[];
    bool walk(int from) {
      if (picked.length == k) {
        final inA = <int>{};
        final bs = <int>{};
        for (final ui in picked) {
          for (final i in live(open[ui])) {
            inA.add(i);
            bs.add(bIndex(i));
          }
        }
        if (bs.length != k) return false;
        var removed = false;
        for (var j = 0; j < cells; j++) {
          if (cand[j] && bs.contains(bIndex(j)) && !inA.contains(j)) {
            cand[j] = false;
            removed = true;
          }
        }
        return removed;
      }
      for (var ui = from; ui < open.length; ui++) {
        picked.add(ui);
        if (walk(ui + 1)) return true;
        picked.removeLast();
      }
      return false;
    }

    return walk(0);
  }

  bool lock(int k) {
    final families = <(List<List<int>>, int Function(int))>[
      (regions, rowOf), (regions, colOf),
      (rows, regionOf), (cols, regionOf),
      (rows, colOf), (cols, rowOf),
    ];
    for (final (a, b) in families) {
      if (lockFamily(a, b, k)) {
        use(k == 1 ? CatsStep.confine : CatsStep.group);
        return true;
      }
    }
    return false;
  }

  bool touch() {
    for (var i = 0; i < cells; i++) {
      if (!cand[i]) continue;
      for (final u in units) {
        if (done(u) || u.contains(i)) continue;
        final l = live(u);
        if (l.isNotEmpty && l.every((j) => kills(i, j))) {
          cand[i] = false;
          use(CatsStep.touch);
          return true;
        }
      }
    }
    return false;
  }

  void trial() {
    final cell = (board.solutionCells.where((i) => !cat[i]).toList()..sort()).first;
    place(cell);
    use(CatsStep.trial);
  }

  // Потолок итераций: каждый проход либо ставит кошку, либо вычёркивает клетку.
  for (var guard = 0; placed < n && guard < cells * 2 + n; guard++) {
    if (single()) continue;
    if (lock(1)) continue;
    var moved = false;
    for (var k = 2; k < n && !moved; k++) {
      moved = lock(k);
    }
    if (moved) continue;
    if (touch()) continue;
    trial();
  }
  assert(placed == n && board.solutionCells.every((i) => cat[i]), 'grade did not reach the solution');
  return CatsGrade(tier: tier, steps: steps, cost: cost, uses: uses);
}
