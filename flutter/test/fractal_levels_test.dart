import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/levels.dart';
import 'package:psygames_flutter/games/fractal/rules.dart';

/// 🔴 У КАЖДОЙ СТУПЕНИ ЕСТЬ ПАРТИИ, И КАЖДАЯ ПАРТИЯ СОБРАНА ПРАВИЛЬНО.
///
/// Проверяются ВСЕ 90 партий, а не выборка. Фрактал держится на связях, которых в
/// обычной судоку нет, и каждая из них — место, где данные могут разойтись молча:
/// кормящая клетка должна смотреть в свой блок корня, порог — быть достижимым, портал —
/// называть одну и ту же цифру в обеих сетках, корень — не закрываться без низа.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FractalLevels levels;

  setUpAll(() async {
    levels = await FractalLevels.load();
  });

  test('🔴 у каждой из 30 ступеней есть партии', () {
    final empty = <int>[];
    for (var lv = 1; lv <= fractalMaxLevel; lv++) {
      if (levels.gamesFor(lv) == 0) empty.add(lv);
    }
    expect(empty, isEmpty, reason: 'ступени без партий: ${empty.join(', ')}');
  });

  test('🔴 каждая партия целая: решения законны, связи сходятся', () {
    final broken = <String>[];
    var checked = 0;

    bool legal(List<List<int>> g) {
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          final v = g[r][c];
          if (v == 0) return false;
          g[r][c] = 0;
          final ok = !conflictsInChild(g, r, c, v);
          g[r][c] = v;
          if (!ok) return false;
        }
      }
      return true;
    }

    for (var lv = 1; lv <= fractalMaxLevel && broken.length < 8; lv++) {
      for (var i = 0; i < levels.gamesFor(lv) && broken.length < 8; i++) {
        final f = levels.gameAt(lv, i)!;
        checked++;
        final tag = 'L$lv#$i';

        if (!legal([for (final row in f.rootSolution) [...row]])) broken.add('$tag: решение корня незаконно');
        if (!f.needsChildren) broken.add('$tag: корень закрывается без дочерних — девять сеток декорация');
        if (f.children.length != 9) broken.add('$tag: дочерних ${f.children.length}');

        for (var k = 0; k < f.children.length; k++) {
          final ch = f.children[k];
          if (!legal([for (final row in ch.solution) [...row]])) {
            broken.add('$tag: решение дочерней $k незаконно');
            break;
          }
          // Подсказки задания совпадают с решением.
          for (var r = 0; r < 9; r++) {
            for (var c = 0; c < 9; c++) {
              if (ch.puzzle[r][c] != 0 && ch.puzzle[r][c] != ch.solution[r][c]) {
                broken.add('$tag: дочерняя $k, подсказка ($r,$c) мимо решения');
                break;
              }
            }
          }
          // Кормящая клетка — середина своего блока корня.
          final want = rootCellForChild(k);
          if (ch.feedsCell[0] != want[0] || ch.feedsCell[1] != want[1]) {
            broken.add('$tag: дочерняя $k кормит ${ch.feedsCell}, а должна $want');
          }
          // Порог достижим: его нельзя взять больше, чем в сетке дырок.
          if (ch.unlockCells > ch.blanks) {
            broken.add('$tag: дочерняя $k — порог ${ch.unlockCells} при ${ch.blanks} дырках');
          }
          if (ch.unlockCells <= 0) broken.add('$tag: дочерняя $k — порог ${ch.unlockCells}');
          // Кормящая клетка корня выколота: цифру туда приносят снизу.
          if (f.rootPuzzle[want[0]][want[1]] != 0) {
            broken.add('$tag: кормящая клетка $want напечатана в задании корня');
          }
          // И цифра, которую она принесёт, совпадает с решением корня.
          final fed = ch.solution[feedCell[0]][feedCell[1]];
          if (f.rootSolution[want[0]][want[1]] != fed) {
            broken.add('$tag: дочерняя $k принесёт $fed, а в решении корня '
                '${f.rootSolution[want[0]][want[1]]}');
          }
        }

        // Портал: одна клетка на два пазла — цифра обязана совпасть в обоих решениях,
        // и обе стороны выколоты (иначе вывод «между досками» просто напечатан).
        for (final p in f.portals) {
          final a = f.children[p.from], b = f.children[p.to];
          final av = a.solution[p.fromCell[0]][p.fromCell[1]];
          final bv = b.solution[p.toCell[0]][p.toCell[1]];
          if (av != bv || av != p.digit) {
            broken.add('$tag: портал ${p.from}->${p.to} — у сеток $av и $bv, объявлено ${p.digit}');
          }
          if (a.puzzle[p.fromCell[0]][p.fromCell[1]] != 0 ||
              b.puzzle[p.toCell[0]][p.toCell[1]] != 0) {
            broken.add('$tag: портал ${p.from}->${p.to} напечатан в задании');
          }
        }
      }
    }

    expect(broken, isEmpty, reason: broken.take(8).join(' · '));
    expect(checked, 90, reason: 'проверено партий: $checked');
  });

  /// ⚠️ ЗАМЕР, А НЕ ПОЖЕЛАНИЕ: чем ступени отличаются друг от друга — числом.
  test('лестница растёт: порталы и порог поднимаются с уровнем', () {
    int portalsAt(int lv) => levels.gameAt(lv, 0)!.portals.length;
    double unlockAt(int lv) {
      final f = levels.gameAt(lv, 0)!;
      return f.children.map((c) => c.unlockCells).reduce((a, b) => a + b) / 9;
    }

    expect(portalsAt(1), 0, reason: 'на первой ступени порталов нет: новую механику не сваливают сразу');
    expect(portalsAt(30), greaterThan(portalsAt(6)),
        reason: 'порталов L6 ${portalsAt(6)}, L30 ${portalsAt(30)}');
    expect(unlockAt(30), greaterThan(unlockAt(1)),
        reason: 'порог L1 ${unlockAt(1)}, L30 ${unlockAt(30)}');
  });
}
