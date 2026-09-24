/// ГЕНЕРАТОР «КОШЕК»: карта областей, у которой ровно одно решение.
///
/// 🔴 ПОРЯДОК ОБРАТНЫЙ ПРИВЫЧНОМУ: сперва расстановка, потом области. Если сначала
/// нарисовать цветные области, а потом искать по ним кошек, решения может не быть
/// вовсе — и генератор будет выбрасывать почти все карты. Здесь наоборот: берём
/// законную расстановку, сажаем по кошке в семя каждой области и растим области
/// вокруг них. Решение существует ПО ПОСТРОЕНИЮ, проверять остаётся только его
/// единственность.
///
/// ⚠️ ОБЛАСТИ РАЗНОГО РАЗМЕРА — ЭТО НЕ НЕБРЕЖНОСТЬ, А СУТЬ. Наш `generateRegions`
/// для jigsaw-судоку растит области РОВНО по N клеток: там иначе нельзя, цифр в
/// области должно быть столько же, сколько в строке. У кошек фигура в области одна,
/// и размер свободен — в кадре Дениса одна область на пол-поля, а рядом область из
/// двух клеток. Ровные области решаются в лоб, рваные заставляют рассуждать.
library;

import '../deep/rng.dart';
import 'rules.dart';

/// Готовая задача: карта областей и её единственная разгадка.
class CatsPuzzle {
  const CatsPuzzle({required this.board, required this.attempts});

  final CatsBoard board;

  /// Сколько карт пришлось вырастить до единственной — замер качества генератора,
  /// а не украшение: вырастет число — значит подход перестал работать.
  final int attempts;
}

/// Соседство по стороне — по нему растут области.
const _ortho = [(-1, 0), (1, 0), (0, -1), (0, 1)];

/// Законная расстановка: по кошке в строке, столбцы не повторяются, соседние строки
/// не ставят кошек вплотную (иначе они коснулись бы углами).
///
/// Перебор со случайным порядком столбцов: для n = 10 находит расстановку с первого
/// захода, а не «пробуем перестановку и выбрасываем».
List<int>? randomPlacement(int n, Rng rng) {
  final cols = List<bool>.filled(n, false);
  final placed = List<int>.filled(n, -1);

  List<int> shuffled() {
    final order = [for (var i = 0; i < n; i++) i];
    for (var i = order.length - 1; i > 0; i--) {
      final j = rng.nextInt(i + 1);
      final t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    return order;
  }

  bool step(int row) {
    if (row == n) return true;
    for (final c in shuffled()) {
      if (cols[c]) continue;
      if (row > 0 && (placed[row - 1] - c).abs() <= 1) continue;
      cols[c] = true;
      placed[row] = c;
      if (step(row + 1)) return true;
      cols[c] = false;
      placed[row] = -1;
    }
    return false;
  }

  return step(0) ? List<int>.of(placed) : null;
}

/// Вырастить области из семян-кошек до полного покрытия поля.
///
/// ⚠️ АНТИ-КАРМАН: следующей берётся самая «угловая» незанятая клетка — та, у которой
/// меньше всего свободных соседей. Иначе в поле остаются дырки, окружённые уже
/// занятыми клетками, и карта не достраивается. Приём взят у нашего же
/// `generateRegions` (`sudoku-core.ts:74`), где он написан по тем же граблям.
List<List<int>> growRegions(int n, List<int> seeds, Rng rng, {double balance = 0.5}) {
  final regions = [for (var r = 0; r < n; r++) List<int>.filled(n, -1)];
  final sizes = List<int>.filled(n, 1);
  for (var r = 0; r < n; r++) {
    regions[r][seeds[r]] = r;
  }
  var filled = n;

  while (filled < n * n) {
    var bestCell = -1, bestFree = 99;
    final bestRegions = <int>[];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (regions[r][c] != -1) continue;
        var free = 0;
        final adj = <int>[];
        for (final (dr, dc) in _ortho) {
          final nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          final v = regions[nr][nc];
          if (v == -1) {
            free++;
          } else if (!adj.contains(v)) {
            adj.add(v);
          }
        }
        if (adj.isEmpty) continue;
        if (free < bestFree) {
          bestFree = free;
          bestCell = r * n + c;
          bestRegions
            ..clear()
            ..addAll(adj);
        }
      }
    }
    if (bestCell < 0) break;   // дальше расти некуда — карта отдаётся как есть

    // 🔴 КЛЕТКА УХОДИТ САМОЙ МАЛЕНЬКОЙ ИЗ СОСЕДНИХ ОБЛАСТЕЙ, а не случайной.
    // 📍 Замер первой редакции (случайный сосед): одна область разрасталась до 56
    // клеток из 81, остальные оставались по одной — и такая карта почти ничего не
    // ограничивает, поэтому решений у неё много. Единственность находилась за 24
    // захода на 9×9, а на 20 задачах собиралось только 12. С выбором наименьшей
    // области карта становится тесной, и единственность попадается сразу.
    // Приём взят у нашего же `generateRegions` (sudoku-core.ts:79), где он написан
    // по тем же граблям.
    int pick;
    if (rng.next() < balance) {
      var small = bestRegions.first;
      for (final r in bestRegions) {
        if (sizes[r] < sizes[small]) small = r;
      }
      final tied = [for (final r in bestRegions) if (sizes[r] == sizes[small]) r];
      pick = tied[rng.nextInt(tied.length)];
    } else {
      pick = bestRegions[rng.nextInt(bestRegions.length)];
    }

    regions[bestCell ~/ n][bestCell % n] = pick;
    sizes[pick]++;
    filled++;
  }
  return regions;
}

/// Сломать ЛИШНЕЕ решение, перекрасив одну клетку.
///
/// 🔴 ПОЧЕМУ ЧИНИМ, А НЕ ВЫБРАСЫВАЕМ. Первая редакция выращивала карту заново, пока
/// не попадётся единственная. Замер 24.09 на 20 задачах: 9×9 собиралось 18 раз из 20
/// за 26 заходов в среднем, 10×10 — 9 раз из 20. То есть половина больших полей не
/// рождалась вовсе, а ждать приходилось десятки карт. Здесь карта не выбрасывается:
/// у лишнего решения отбирается опора.
///
/// КАК. У чужого решения берётся строка, где его кошка стоит НЕ там, где наша, и эта
/// клетка отдаётся СОСЕДНЕЙ области — лучше той, в которой у чужого решения уже есть
/// кошка: тогда в одной области их окажется две, и решение умирает. Наша расстановка
/// при этом цела: перекрашивается клетка, в которой нашей кошки нет.
///
/// ⚠️ СВЯЗНОСТЬ ПРОВЕРЯЕТСЯ ПОСЛЕ КАЖДОГО ХОДА: область, из которой забрали клетку,
/// не имеет права распасться на два пятна.
bool breakOtherSolution(
  List<List<int>> regions,
  int n,
  List<int> solution,
  List<int> alt,
  Rng rng,
) {
  final rows = [for (var r = 0; r < n; r++) if (alt[r] != solution[r]) r];
  for (var i = rows.length - 1; i > 0; i--) {
    final j = rng.nextInt(i + 1);
    final t = rows[i];
    rows[i] = rows[j];
    rows[j] = t;
  }

  // Области, в которых стоят кошки ЧУЖОГО решения: отдать клетку такой — значит
  // убить решение одним ходом.
  final altRegions = {for (var r = 0; r < n; r++) regions[r][alt[r]]};

  for (final r in rows) {
    final c = alt[r];
    final cur = regions[r][c];
    final neighbours = <int>{};
    for (final (dr, dc) in _ortho) {
      final nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      if (regions[nr][nc] != cur) neighbours.add(regions[nr][nc]);
    }
    if (neighbours.isEmpty) continue;

    final preferred = [for (final g in neighbours) if (altRegions.contains(g)) g];
    final pool = preferred.isNotEmpty ? preferred : neighbours.toList();
    final target = pool[rng.nextInt(pool.length)];

    regions[r][c] = target;
    if (regionConnected(regions, n, cur)) return true;
    regions[r][c] = cur;   // распалась — ход отменяется, пробуем другую строку
  }
  return false;
}

/// Задача с ЕДИНСТВЕННЫМ решением. `null` — за отведённые заходы не нашлось.
///
/// Зерно строкой, как у остальных наших игр: одна строка — одна и та же доска,
/// и партию можно воспроизвести по её номеру.
CatsPuzzle? generateCats(int n, String seed, {int tries = 12, double balance = 0.0, int repairs = 200}) {
  final rng = Rng(seed);
  for (var attempt = 1; attempt <= tries; attempt++) {
    final placement = randomPlacement(n, rng);
    if (placement == null) return null;   // при n < 4 законной расстановки не бывает
    final regions = growRegions(n, placement, rng, balance: balance);

    // Карта достроилась не до конца — такую не отдаём: клетка без области не имеет
    // цвета, и человек увидит дырку в поле.
    var complete = true;
    for (final row in regions) {
      if (row.contains(-1)) complete = false;
    }
    if (!complete) continue;

    var stuck = false;
    for (var fix = 0; fix < repairs; fix++) {
      final alt = findOtherSolution(regions, n, placement);
      if (alt == null) {
        return CatsPuzzle(
          board: CatsBoard(n: n, regions: regions, solution: placement),
          attempts: attempt,
        );
      }
      if (!breakOtherSolution(regions, n, placement, alt, rng)) {
        stuck = true;
        break;
      }
    }
    if (stuck) continue;
  }
  return null;
}
