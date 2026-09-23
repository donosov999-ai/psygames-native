/// ПРАВИЛА СУДОКУ — перенос `frontend/src/services/sudoku-core.ts` (`isValid`).
///
/// 🔴 ПЕРЕНОС, А НЕ ПЕРЕПИСЫВАНИЕ. Каждая ветка повторяет ветку живого TS один в один,
/// включая порядок проверок: он важен, потому что у комбо-вариантов правил ДВА разом.
/// Сверка — `flutter/test/sudoku_rules_test.dart` против эталонов, выгруженных прогоном
/// живого TS (`flutter/test/fixtures/sudoku-rules-reference.json`, 640 случаев).
///
/// ⚠️ ГРАБЛЯ, ПЕРЕНЕСЁННАЯ ВМЕСТЕ С КОДОМ: клетки-суммы проверяются ОТДЕЛЬНОЙ ветвью, а
/// не очередным `else if`. У `thermocage` на доске два правила сразу — цепочка термометра
/// и сумма группы; встань сумма в цепочку `else if`, половина ограничений молча отпала бы.
library;

/// Ходы коня: анти-конь запрещает равные цифры на расстоянии хода коня.
const knightMoves = <List<int>>[
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
];

/// Диагональные соседи: анти-король (ортогональных и так хватает строке со столбцом).
const kingMoves = <List<int>>[[-1, -1], [-1, 1], [1, -1], [1, 1]];

/// Ортогональные соседи: правило «не подряд».
const orthoMoves = <List<int>>[[-1, 0], [1, 0], [0, -1], [0, 1]];

/// Четыре дополнительные зоны 3×3 у «гипера» (Windoku).
const hyperBoxes = <List<int>>[[1, 1], [1, 5], [5, 1], [5, 5]];

/// В какой из дополнительных зон лежит клетка; `null` — ни в одной.
List<int>? inHyper(int r, int c) {
  for (final box in hyperBoxes) {
    final hr = box[0], hc = box[1];
    if (r >= hr && r < hr + 3 && c >= hc && c < hc + 3) return [hr, hc];
  }
  return null;
}

/// Звено термометра: соседи по цепочке. Цифры вдоль термометра строго растут от колбы.
class ThermoLink {
  const ThermoLink({this.prev, this.next});
  final List<int>? prev;
  final List<int>? next;

  static ThermoLink? fromJson(Object? v) {
    if (v is! Map) return null;
    final p = v['prev'], n = v['next'];
    return ThermoLink(
      prev: p is List ? p.cast<num>().map((x) => x.toInt()).toList() : null,
      next: n is List ? n.cast<num>().map((x) => x.toInt()).toList() : null,
    );
  }
}

/// Клетка стрелки: кружок — сумма цифр вдоль своей стрелки.
class ArrowLink {
  const ArrowLink({required this.circle, required this.arrows, required this.isCircle});
  final List<int> circle;
  final List<List<int>> arrows;
  final bool isCircle;

  static ArrowLink? fromJson(Object? v) {
    if (v is! Map) return null;
    return ArrowLink(
      circle: (v['circle'] as List).cast<num>().map((x) => x.toInt()).toList(),
      arrows: (v['arrows'] as List)
          .map((a) => (a as List).cast<num>().map((x) => x.toInt()).toList())
          .toList(),
      isCircle: v['isCircle'] == true,
    );
  }
}

/// Клетки-суммы: какая группа у клетки, сумма группы и её состав.
class CageMap {
  const CageMap({required this.cageOf, required this.sum, required this.cells});
  final List<List<int>> cageOf;
  final List<int> sum;
  final List<List<List<int>>> cells;

  static CageMap? fromJson(Object? v) {
    if (v is! Map) return null;
    // ⚠️ В таблице бывают ДЫРЫ: у снятой группы TS оставляет пустое место, и в JSON это
    // приходит как `null` (замер выгрузки: у killer 4 пустых номера из 30). `cageOf`
    // на такие номера не показывает, но разбирать их всё равно надо — иначе падение.
    return CageMap(
      cageOf: _grid(v['cageOf']),
      sum: (v['sum'] as List).map((x) => x is num ? x.toInt() : 0).toList(),
      cells: (v['cells'] as List)
          .map((cage) => cage is List
              ? cage.map((p) => (p as List).cast<num>().map((x) => x.toInt()).toList()).toList()
              : <List<int>>[])
          .toList(),
    );
  }
}

/// Знаки неравенств между соседями: `h` — вправо, `v` — вниз; 1 «меньше», −1 «больше».
class UnequalMap {
  const UnequalMap({required this.h, required this.v});
  final List<List<int>> h;
  final List<List<int>> v;

  static UnequalMap? fromJson(Object? v) {
    if (v is! Map) return null;
    return UnequalMap(h: _grid(v['h']), v: _grid(v['v']));
  }
}

/// Подсказки небоскрёбов по четырём сторонам: сколько зданий видно с этой стороны.
class TowersMap {
  const TowersMap({required this.top, required this.bottom, required this.left, required this.right});
  final List<int> top;
  final List<int> bottom;
  final List<int> left;
  final List<int> right;

  static TowersMap? fromJson(Object? v) {
    if (v is! Map) return null;
    List<int> side(String k) => (v[k] as List).cast<num>().map((x) => x.toInt()).toList();
    return TowersMap(top: side('top'), bottom: side('bottom'), left: side('left'), right: side('right'));
  }
}

List<List<int>> _grid(Object? v) => (v as List)
    .map((row) => (row as List).cast<num>().map((x) => x.toInt()).toList())
    .toList();

/// Геометрия доски: то, что у варианта сверх строки, столбца и блока.
class BoardGeometry {
  const BoardGeometry({this.regions, this.thermo, this.arrow, this.cages, this.unequal, this.towers});
  final List<List<int>>? regions;
  final List<List<ThermoLink?>>? thermo;
  final List<List<ArrowLink?>>? arrow;
  final CageMap? cages;
  final UnequalMap? unequal;
  final TowersMap? towers;

  static BoardGeometry fromJson(Map<String, Object?> v) => BoardGeometry(
        regions: v['regions'] == null ? null : _grid(v['regions']),
        thermo: v['thermo'] == null
            ? null
            : (v['thermo'] as List)
                .map((row) => (row as List).map(ThermoLink.fromJson).toList())
                .toList(),
        arrow: v['arrow'] == null
            ? null
            : (v['arrow'] as List)
                .map((row) => (row as List).map(ArrowLink.fromJson).toList())
                .toList(),
        cages: CageMap.fromJson(v['cages']),
        unequal: UnequalMap.fromJson(v['unequal']),
        towers: TowersMap.fromJson(v['towers']),
      );
}

/// Сколько небоскрёбов видно из ряда: здание видно, если выше всех предыдущих.
int visibleCount(List<int> line) {
  var seen = 0, tallest = 0;
  for (final v in line) {
    if (v > tallest) { seen++; tallest = v; }
  }
  return seen;
}

/// Нарушает ли ряд свою подсказку. Ряд может быть НЕПОЛНЫМ (нули — пусто), поэтому
/// у неполного проверяются границы: сколько видно минимум и максимум при любом добивании.
/// Оценка сверху намеренно грубая — она не отбросит верную доску, а неверную поймает
/// проверка полного ряда.
bool towersLineOk(List<int> line, int clue) {
  if (clue == 0) return true;
  if (!line.any((v) => v == 0)) return visibleCount(line) == clue;
  var seen = 0, tallest = 0, blanks = 0;
  for (final v in line) {
    if (v == 0) { blanks++; continue; }
    if (v > tallest) { seen++; tallest = v; }
  }
  return clue >= seen && clue <= seen + blanks;
}

/// Законен ли ход: поставить `val` в клетку (`r`, `c`) на доске `grid`.
///
/// Порядок веток повторяет живой TS. `variant` — имя варианта строкой, как в лестнице
/// (`levelConfig(...).variant`), чтобы лестница и правила говорили на одном языке.
bool isValid(
  List<List<int>> grid,
  int r,
  int c,
  int val,
  int n,
  int br,
  int bc, {
  String variant = 'none',
  BoardGeometry? geometry,
}) {
  final g = geometry ?? const BoardGeometry();

  // Строка и столбец — у всех вариантов.
  for (var i = 0; i < n; i++) {
    if (grid[r][i] == val || grid[i][c] == val) return false;
  }

  // Блок или регион кривых блоков.
  final regions = g.regions;
  if (variant == 'jigsaw' && regions != null) {
    final reg = regions[r][c];
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (regions[i][j] == reg && grid[i][j] == val) return false;
      }
    }
  } else {
    final r0 = (r ~/ br) * br, c0 = (c ~/ bc) * bc;
    for (var i = 0; i < br; i++) {
      for (var j = 0; j < bc; j++) {
        if (grid[r0 + i][c0 + j] == val) return false;
      }
    }
  }

  if (variant == 'diagonal' || variant == 'killerdiag') {
    if (r == c) {
      for (var i = 0; i < n; i++) {
        if (grid[i][i] == val) return false;
      }
    }
    if (r + c == n - 1) {
      for (var i = 0; i < n; i++) {
        if (grid[i][n - 1 - i] == val) return false;
      }
    }
  } else if (variant == 'antiknight') {
    if (_knightHit(grid, r, c, val, n)) return false;
  } else if (variant == 'thermoknight') {
    // Комбо: ход коня И термометр разом — ветка самодостаточна, иначе одно правило
    // из двух забрало бы ход себе (та же грабля, что у thermocage).
    if (_knightHit(grid, r, c, val, n)) return false;
    if (!_thermoOk(grid, r, c, val, g.thermo)) return false;
  } else if (variant == 'hyper') {
    final h = inHyper(r, c);
    if (h != null) {
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          if (grid[h[0] + i][h[1] + j] == val) return false;
        }
      }
    }
  } else if (variant == 'nonconsec') {
    for (final m in orthoMoves) {
      final nr = r + m[0], nc = c + m[1];
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      final v = grid[nr][nc];
      if (v != 0 && (v - val).abs() == 1) return false;
    }
  } else if (variant == 'unequal' && g.unequal != null) {
    final u = g.unequal!;
    bool cmp(int mine, int other, int sign) => sign == 1 ? mine < other : mine > other;
    if (c < n - 1 && u.h[r][c] != 0) {
      final o = grid[r][c + 1];
      if (o != 0 && !cmp(val, o, u.h[r][c])) return false;
    }
    if (c > 0 && u.h[r][c - 1] != 0) {
      final o = grid[r][c - 1];
      if (o != 0 && !cmp(o, val, u.h[r][c - 1])) return false;
    }
    if (r < n - 1 && u.v[r][c] != 0) {
      final o = grid[r + 1][c];
      if (o != 0 && !cmp(val, o, u.v[r][c])) return false;
    }
    if (r > 0 && u.v[r - 1][c] != 0) {
      final o = grid[r - 1][c];
      if (o != 0 && !cmp(o, val, u.v[r - 1][c])) return false;
    }
  } else if (variant == 'towers' && g.towers != null) {
    final t = g.towers!;
    final row = [...grid[r]]..[c] = val;
    final col = [for (var i = 0; i < n; i++) grid[i][c]]..[r] = val;
    if (!towersLineOk(row, t.left[r])) return false;
    if (!towersLineOk(row.reversed.toList(), t.right[r])) return false;
    if (!towersLineOk(col, t.top[c])) return false;
    if (!towersLineOk(col.reversed.toList(), t.bottom[c])) return false;
  } else if (variant == 'antiking') {
    for (final m in kingMoves) {
      final nr = r + m[0], nc = c + m[1];
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc] == val) return false;
    }
  } else if ((variant == 'thermo' || variant == 'thermocage') && g.thermo != null) {
    if (!_thermoOk(grid, r, c, val, g.thermo)) return false;
  } else if (variant == 'arrow' && g.arrow != null) {
    final m = g.arrow![r][c];
    if (m != null) {
      final cv = m.isCircle ? val : grid[m.circle[0]][m.circle[1]];
      var sum = 0, empty = 0;
      for (final a in m.arrows) {
        final v = (a[0] == r && a[1] == c) ? val : grid[a[0]][a[1]];
        if (v == 0) { empty++; } else { sum += v; }
      }
      if (empty == 0) {
        if (cv != 0 && cv != sum) return false;   // стрелка заполнена → кружок равен сумме
      } else {
        if (sum + empty > n) return false;                 // прун: минимальная сумма не больше N
        if (cv != 0 && sum + empty > cv) return false;     // и не больше кружка
      }
    }
  }

  // ⚠️ Клетки-суммы — ОТДЕЛЬНОЙ ветвью, см. шапку файла.
  final cages = g.cages;
  if (cages != null) {
    final id = cages.cageOf[r][c];
    if (id >= 0) {
      var filled = 0, empty = 0;
      for (final cell in cages.cells[id]) {
        if (cell[0] == r && cell[1] == c) continue;
        final v = grid[cell[0]][cell[1]];
        if (v == 0) { empty++; continue; }
        if (v == val) return false;   // цифры внутри группы не повторяются
        filled += v;
      }
      final rest = cages.sum[id] - filled - val;
      // Остаток обязан набираться РАЗНЫМИ цифрами: минимум 1+2+…, максимум N+(N−1)+…
      if (rest < (empty * (empty + 1)) ~/ 2) return false;
      if (rest > empty * n - (empty * (empty - 1)) ~/ 2) return false;
    }
  }

  return true;
}

bool _knightHit(List<List<int>> grid, int r, int c, int val, int n) {
  for (final m in knightMoves) {
    final nr = r + m[0], nc = c + m[1];
    if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc] == val) return true;
  }
  return false;
}

bool _thermoOk(List<List<int>> grid, int r, int c, int val, List<List<ThermoLink?>>? thermo) {
  if (thermo == null) return true;
  final link = thermo[r][c];
  if (link == null) return true;
  final prev = link.prev;
  if (prev != null) {
    final pv = grid[prev[0]][prev[1]];
    if (pv != 0 && val <= pv) return false;   // строго больше предыдущего на термометре
  }
  final next = link.next;
  if (next != null) {
    final nv = grid[next[0]][next[1]];
    if (nv != 0 && val >= nv) return false;   // строго меньше следующего
  }
  return true;
}
