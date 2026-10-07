/// ПОРТАЛЫ «БЕЗДНЫ» — ПЕРЕНОС `deepPortalsFor` / `portalOfLeaf` ИЗ `fractal-deep.ts` БИТ В БИТ.
///
/// 🔴 ЗАЧЕМ (сверка «веб против натива» 138f7818, «Бездна» строки 6 и 33). Портал — стык
/// двух ЛИСТЬЕВ-сиблингов: на каждой стороне снята одна подсказка банковской доски, каждая
/// порознь неоднозначна, а общая цифра портальной клетки даёт вывод, которого нет ни в одной
/// доске по отдельности. В вебе порталы включены ВСЕГДА; в нативе их не было — лист имел на
/// одну подсказку больше и другой порог, и снимок веба, продолженный здесь, ставил руку на
/// клетку, которая у натива — подсказка.
///
/// 🔴 ЧЕСТНОСТЬ ПАРЫ — КРИТЕРИЙ, НЕ ДОПУЩЕНИЕ: порознь решений ≥ 2 у обеих сторон, вместе
/// Σ_v sol(A|a=v)·sol(B|b=v) == 1. План = f(зерно, путь родителя, настройка): тот же жребий
/// (`Rng`, mulberry32 + FNV-1a), та же материализация, тот же порядок проб — сверка с живым
/// TS по `test/fixtures/deep-portals-reference.json` (выгрузка `tools/export-deep-portals.cjs`).
///
/// ⚠️ Бюджет проб — тихая деградация, как в вебе: не нашлась честная пара — у пары порталов нет.
library;

import 'dart:math' as math;

import 'rng.dart';
import 'tree.dart';

/// Портал: два листа-сиблинга, портальные клетки (общая цифра), снятые подсказки.
class DeepPortal {
  const DeepPortal({
    required this.aPath,
    required this.bPath,
    required this.aCell,
    required this.bCell,
    required this.aDrop,
    required this.bDrop,
    required this.digit,
  });

  final String aPath, bPath;
  final List<int> aCell, bCell, aDrop, bDrop;
  final int digit;
}

const _portalPairsPerParent = 2;
const _portalTryBudget = 36;   // проб (дроп×клетка) на пару — как PORTAL_TRY_BUDGET веба

const _all = (1 << deepN) - 1;

int _boxOf(int i) => ((i ~/ deepN) ~/ deepBr) * deepBr + (i % deepN) ~/ deepBc;

int _popcount(int m) {
  var n = 0;
  for (var x = m; x != 0; x &= x - 1) {
    n++;
  }
  return n;
}

/// Число решений доски 9×9 (плоский список, 0 — пусто), не больше `limit`. Перенос
/// `countSolutionsFast` (`fractal-sudoku.ts`): обход с выбором самой тесной клетки. Ответ
/// с пределом от порядка обхода не зависит — план порталов сходится с вебом и так.
int countSolutionsFast(List<int> flat, {int limit = 2}) {
  const cells = deepN * deepN;
  final grid = List<int>.of(flat);
  final rows = List<int>.filled(deepN, 0), cols = List<int>.filled(deepN, 0), box = List<int>.filled(deepN, 0);
  for (var i = 0; i < cells; i++) {
    final v = grid[i];
    if (v == 0) continue;
    final m = 1 << (v - 1), r = i ~/ deepN, c = i % deepN, b = _boxOf(i);
    if ((rows[r] | cols[c] | box[b]) & m != 0) return 0;   // уже противоречие
    rows[r] |= m;
    cols[c] |= m;
    box[b] |= m;
  }
  var count = 0;
  bool walk() {   // true — хватит, дошли до предела
    var bi = -1, bm = 0, bn = deepN + 1;
    for (var i = 0; i < cells; i++) {
      if (grid[i] != 0) continue;
      final m = _all & ~(rows[i ~/ deepN] | cols[i % deepN] | box[_boxOf(i)]);
      if (m == 0) return false;
      final n = _popcount(m);
      if (n < bn) {
        bn = n;
        bi = i;
        bm = m;
        if (n == 1) break;
      }
    }
    if (bi < 0) return ++count >= limit;
    final r = bi ~/ deepN, c = bi % deepN, b = _boxOf(bi);
    var m = bm;
    while (m != 0) {
      final t = m & -m;
      m ^= t;
      grid[bi] = t.bitLength;
      rows[r] |= t;
      cols[c] |= t;
      box[b] |= t;
      final stop = walk();
      grid[bi] = 0;
      rows[r] ^= t;
      cols[c] ^= t;
      box[b] ^= t;
      if (stop) return true;
    }
    return false;
  }

  walk();
  return count;
}

List<int> _flatOf(List<List<int>> g, [List<int>? drop]) {
  final f = [for (final row in g) ...row];
  if (drop != null) f[drop[0] * deepN + drop[1]] = 0;
  return f;
}

int _solutionsWith(List<int> flat, List<int> cell, int v) {
  final f = List<int>.of(flat);
  f[cell[0] * deepN + cell[1]] = v;
  return countSolutionsFast(f);
}

/// План порталов родителя предпоследнего слоя: пары — из его кормимых детей (там листья).
/// Пусто — не тот слой, детей меньше двух или бюджет проб кончился.
List<DeepPortal> deepPortalsFor(
  DeepBank bank,
  String seed,
  String parentPath,
  DeepCfg cfg,
  List<List<int>> parentSolution,
) {
  if (depthOf(parentPath) != cfg.depth - 2) return const [];   // порталы живут только на листьях
  final parent = materializePick(bank, seed, parentPath, cfg);
  final feeds = parent.feedCells;
  if (feeds.length < 2) return const [];
  final rng = Rng('fractal-deep-portal|${normalizeSeed(seed)}|$parentPath');
  List<T> shuffled<T>(List<T> src) {
    final a = [...src];
    for (var i = a.length - 1; i > 0; i--) {
      final j = rng.nextInt(i + 1);
      final t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  final order = shuffled(feeds);
  List<List<int>> cellsWhere(List<List<int>> puzzle, bool given) => [
        for (var r = 0; r < deepN; r++)
          for (var c = 0; c < deepN; c++)
            if ((puzzle[r][c] != 0) == given) [r, c],
      ];

  final portals = <DeepPortal>[];
  final used = <String>{};
  for (var k = 0; k + 1 < order.length && portals.length < _portalPairsPerParent; k += 2) {
    final a = order[k], b = order[k + 1];
    final aPath = childPath(parentPath, a[0], a[1]);
    final bPath = childPath(parentPath, b[0], b[1]);
    if (used.contains(aPath) || used.contains(bPath)) continue;
    final nodeA = materializeNode(bank, seed, aPath, cfg, parentSolution[a[0]][a[1]]);
    final nodeB = materializeNode(bank, seed, bPath, cfg, parentSolution[b[0]][b[1]]);

    // Порядок тасовок — как у веба: дропы A, дропы B, дырки A, дырки B (один жребий).
    final aDrops = shuffled(cellsWhere(nodeA.puzzle, true));
    final bDrops = shuffled(cellsWhere(nodeB.puzzle, true));
    final aHoles = shuffled(cellsWhere(nodeA.puzzle, false));
    final bHoles = shuffled(cellsWhere(nodeB.puzzle, false));

    DeepPortal? found;
    var tries = 0;
    outer:
    for (final aDrop in aDrops) {
      final aFlat = _flatOf(nodeA.puzzle, aDrop);
      if (countSolutionsFast(aFlat) < 2) continue;   // дроп не раскрыл доску — дальше
      for (final bDrop in bDrops) {
        if (++tries > _portalTryBudget) break outer;
        final bFlat = _flatOf(nodeB.puzzle, bDrop);
        if (countSolutionsFast(bFlat) < 2) continue;
        // Портальные клетки: общая цифра решений, и пересечение обязано дать ровно 1.
        for (final aCell in aHoles.take(8)) {
          final digit = nodeA.solution[aCell[0]][aCell[1]];
          List<int>? bCell;
          for (final h in bHoles) {
            if (nodeB.solution[h[0]][h[1]] == digit && !(h[0] == bDrop[0] && h[1] == bDrop[1])) {
              bCell = h;
              break;
            }
          }
          if (bCell == null) continue;
          if (aCell[0] == aDrop[0] && aCell[1] == aDrop[1]) continue;
          var joint = 0;
          for (var v = 1; v <= deepN && joint <= 1; v++) {
            final na = _solutionsWith(aFlat, aCell, v);
            if (na == 0) continue;
            final nb = _solutionsWith(bFlat, bCell, v);
            joint += math.min(2, na) * math.min(2, nb);
          }
          if (joint == 1) {
            found = DeepPortal(
              aPath: aPath, bPath: bPath, aCell: aCell, bCell: bCell,
              aDrop: aDrop, bDrop: bDrop, digit: digit,
            );
            break outer;
          }
        }
      }
    }
    if (found != null) {
      portals.add(found);
      used
        ..add(aPath)
        ..add(bPath);
    }
  }
  return portals;
}

/// Сторона портала у листа (своя клетка и снятая подсказка — первыми) или null.
DeepPortalSide? portalOfLeaf(List<DeepPortal> portals, String leaf) {
  for (final p in portals) {
    if (p.aPath == leaf) {
      return (cell: p.aCell, drop: p.aDrop, partnerPath: p.bPath, partnerCell: p.bCell, digit: p.digit);
    }
    if (p.bPath == leaf) {
      return (cell: p.bCell, drop: p.bDrop, partnerPath: p.aPath, partnerCell: p.aCell, digit: p.digit);
    }
  }
  return null;
}

/// Лист со своей стороной портала — как `nodeAt` экрана веба: подсказка снята, дырок на одну
/// больше, порог пересчитан. Вся остальная арифметика дерева видит уже снятую доску.
DeepNode withPortalSide(DeepNode node, DeepPortalSide side, DeepCfg cfg) {
  final puzzle = [for (final row in node.puzzle) [...row]];
  puzzle[side.drop[0]][side.drop[1]] = 0;
  final blanks = node.blanks + 1;
  return DeepNode(
    path: node.path,
    puzzle: puzzle,
    blanks: blanks,
    unlockCells: math.max(1, math.min(blanks, (blanks * cfg.unlockShare).ceil())),
    feedCells: node.feedCells,
    rating: node.rating,
    solution: node.solution,
    portal: side,
  );
}
