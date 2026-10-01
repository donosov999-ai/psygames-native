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
  const ArrowLink({required this.circle, required this.arrows, required this.isCircle, this.prev, this.next});
  final List<int> circle;
  final List<List<int>> arrows;
  final bool isCircle;

  /// Соседи по стрелке — для отрисовки линии (как у веба: `prev`/`next` клетки).
  final List<int>? prev;
  final List<int>? next;

  static ArrowLink? fromJson(Object? v) {
    if (v is! Map) return null;
    return ArrowLink(
      circle: (v['circle'] as List).cast<num>().map((x) => x.toInt()).toList(),
      arrows: (v['arrows'] as List)
          .map((a) => (a as List).cast<num>().map((x) => x.toInt()).toList())
          .toList(),
      isCircle: v['isCircle'] == true,
      prev: v['prev'] is List ? (v['prev'] as List).cast<num>().map((x) => x.toInt()).toList() : null,
      next: v['next'] is List ? (v['next'] as List).cast<num>().map((x) => x.toInt()).toList() : null,
    );
  }
}

/// Клетки-суммы: какая группа у клетки, сумма группы и её состав.
class CageMap {
  const CageMap({required this.cageOf, required this.sum, required this.cells, this.anchor = const []});
  final List<List<int>> cageOf;
  final List<int> sum;
  final List<List<List<int>>> cells;

  /// Клетка, в углу которой пишется сумма группы: номер `r * n + c` (−1 — нет).
  final List<int> anchor;

  static CageMap? fromJson(Object? v) {
    if (v is! Map) return null;
    // ⚠️ В таблице бывают ДЫРЫ: у снятой группы TS оставляет пустое место, и в JSON это
    // приходит как `null` (замер выгрузки: у killer 4 пустых номера из 30). `cageOf`
    // на такие номера не показывает, но разбирать их всё равно надо — иначе падение.
    return CageMap(
      cageOf: _grid(v['cageOf']),
      sum: (v['sum'] as List).map((x) => x is num ? x.toInt() : 0).toList(),
      anchor: v['anchor'] is List ? (v['anchor'] as List).map((x) => x is num ? x.toInt() : -1).toList() : const [],
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

/// Точки Кропки на гранях: `h` — между клеткой и правой, `v` — и нижней.
/// 1 — белая (разница 1), 2 — чёрная (вдвое), 0 — точки НЕ показано (ничего не утверждает).
class KropkiMap {
  const KropkiMap({required this.h, required this.v});
  final List<List<int>> h;
  final List<List<int>> v;

  static KropkiMap? fromJson(Object? x) {
    if (x is! Map) return null;
    return KropkiMap(h: _grid(x['h']), v: _grid(x['v']));
  }
}

/// Суммы сэндвича у краёв: сумма цифр МЕЖДУ 1 и 9 строки (`rows`) и столбца (`cols`).
/// −1 — сумма спрятана прореживанием (не подсказка).
class SandwichClues {
  const SandwichClues({required this.rows, required this.cols});
  final List<int> rows;
  final List<int> cols;

  static SandwichClues? fromJson(Object? x) {
    if (x is! Map) return null;
    List<int> line(String k) => (x[k] as List).cast<num>().map((e) => e.toInt()).toList();
    return SandwichClues(rows: line('rows'), cols: line('cols'));
  }
}

/// Геометрия доски: то, что у варианта сверх строки, столбца и блока.
///
/// 🔴 01.10.2026 (задача 450c0211): до этого дня здесь НЕ разбирались `parity`, `kropki` и
/// `sandwich` — выгрузка их несла, а разбор молча выбрасывал. Доски чёт-нечета, Кропки и
/// сэндвича единственны только С ЭТИМИ подсказками, значит у человека на экране было
/// несколько решений, а сверка шла с одним. Теперь поля разбираются, проверяются в
/// [isValid] (как `overlayOk` веба) и рисуются (`variant_decor.dart`).
class BoardGeometry {
  const BoardGeometry({
    this.regions,
    this.thermo,
    this.arrow,
    this.cages,
    this.unequal,
    this.towers,
    this.parity,
    this.kropki,
    this.sandwich,
    this.whisper,
    this.renban,
    this.regionsum,
    this.palindrome,
    this.between,
    this.lockout,
    this.xv,
  });
  final List<List<int>>? regions;
  final List<List<ThermoLink?>>? thermo;
  final List<List<ArrowLink?>>? arrow;
  final CageMap? cages;
  final UnequalMap? unequal;
  final TowersMap? towers;

  /// Метки чётности: 1 — чётная, 2 — нечётная, 0 — метки нет.
  final List<List<int>>? parity;
  final KropkiMap? kropki;
  final SandwichClues? sandwich;

  /// Зелёные линии «немецкого шёпота»: соседи по линии отличаются минимум на [whisperGap].
  /// Тот же вид prev/next, что у термометра (`whisperFromSolution` веба).
  final List<List<ThermoLink?>>? whisper;

  /// Фиолетовые линии ренбана: цифры на линии разные и идут подряд в любом порядке.
  final List<List<ThermoLink?>>? renban;

  /// Синие линии равных сумм: в каждом блоке, через который идёт линия, сумма её цифр одна.
  final List<List<ThermoLink?>>? regionsum;

  /// Серая линия читается одинаково с обоих концов: цифры на равном расстоянии от концов совпадают.
  final List<List<ThermoLink?>>? palindrome;

  /// Цифры на линии лежат строго между цифрами в кружках на её концах.
  final List<List<ThermoLink?>>? between;

  /// Цифры в ромбах на концах линии отличаются минимум на 4, а цифры линии лежат вне промежутка между ними.
  final List<List<ThermoLink?>>? lockout;

  /// XV: знаки на гранях (1 = V, сумма 5; 2 = X, сумма 10), показаны ВСЕ — та же форма h/v,
  /// что у точек Кропки.
  final KropkiMap? xv;

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
        parity: v['parity'] == null ? null : _grid(v['parity']),
        kropki: KropkiMap.fromJson(v['kropki']),
        sandwich: SandwichClues.fromJson(v['sandwich']),
        xv: KropkiMap.fromJson(v['xv']),
        whisper: v['whisper'] == null
            ? null
            : (v['whisper'] as List)
                .map((row) => (row as List).map(ThermoLink.fromJson).toList())
                .toList(),
        renban: v['renban'] == null
            ? null
            : (v['renban'] as List)
                .map((row) => (row as List).map(ThermoLink.fromJson).toList())
                .toList(),
        regionsum: v['regionsum'] == null
            ? null
            : (v['regionsum'] as List)
                .map((row) => (row as List).map(ThermoLink.fromJson).toList())
                .toList(),
        palindrome: v['palindrome'] == null
            ? null
            : (v['palindrome'] as List)
                .map((row) => (row as List).map(ThermoLink.fromJson).toList())
                .toList(),
        between: v['between'] == null
            ? null
            : (v['between'] as List)
                .map((row) => (row as List).map(ThermoLink.fromJson).toList())
                .toList(),
        lockout: v['lockout'] == null
            ? null
            : (v['lockout'] as List)
                .map((row) => (row as List).map(ThermoLink.fromJson).toList())
                .toList(),
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
///
/// 🔴 Нижняя граница — по началу ряда до первой пустой (+1, если самого высокого там нет),
/// а не «видно среди заполненных»: пустая клетка впереди закрывает видимые. `[_,2,4,1,6,3]`
/// при подсказке 2 законен (`[5,…]`). Перенос починки `towersLineOk` веба (задача 2ab36958).
bool towersLineOk(List<int> line, int clue) {
  if (clue == 0) return true;
  if (!line.any((v) => v == 0)) return visibleCount(line) == clue;
  var seen = 0, tallest = 0, blanks = 0;
  for (final v in line) {
    if (v == 0) { blanks++; continue; }
    if (v > tallest) { seen++; tallest = v; }
  }
  var head = 0, headTop = 0;
  for (final v in line) {
    if (v == 0) break;
    if (v > headTop) { head++; headTop = v; }
  }
  final low = head + (headTop == line.length ? 0 : 1);
  return clue >= low && clue <= seen + blanks;
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

  // Показанные подсказки — чётность, точки, суммы сэндвича (перенос `overlayOk` веба).
  if (!overlayOk(grid, r, c, val, n, g)) return false;

  return true;
}

/// Наименьшая разница соседей по линии шёпота — `WHISPER_GAP` веба.
const whisperGap = 5;

/// Все клетки линии (prev/next), на которой стоит (r, c); пусто — клетка не на линии.
/// Перенос `lineCells` веба.
List<List<int>> lineCells(List<List<ThermoLink?>> pn, int r, int c) {
  if (pn[r][c] == null) return const [];
  var cur = [r, c];
  for (var guard = 0; guard < 81; guard++) {
    final prev = pn[cur[0]][cur[1]]!.prev;
    if (prev == null) break;
    cur = prev;
  }
  final out = <List<int>>[];
  for (var guard = 0; guard < 81; guard++) {
    out.add(cur);
    final next = pn[cur[0]][cur[1]]!.next;
    if (next == null) break;
    cur = next;
  }
  return out;
}

/// Линия равных сумм не нарушена цифрой [val] в (r, c): у каждого блока линии коридор
/// возможных сумм (заполненное + наименьшее/наибольшее добивание разными цифрами), и все
/// коридоры пересекаются. Перенос `regionSumOk` веба; блоки — 3×3 у 9×9, 2×3 у 6×6.
bool regionSumOk(List<List<int>> grid, int r, int c, int val, List<List<ThermoLink?>> pn, int n) {
  final cells = lineCells(pn, r, c);
  if (cells.isEmpty) return true;
  final br = n == 6 ? 2 : 3, bc = 3;
  final sums = <int, int>{}, empties = <int, int>{};
  for (final cell in cells) {
    final box = cell[0] ~/ br * (n ~/ bc) + cell[1] ~/ bc;
    final v = cell[0] == r && cell[1] == c ? val : grid[cell[0]][cell[1]];
    sums[box] = (sums[box] ?? 0) + v;
    if (v == 0) empties[box] = (empties[box] ?? 0) + 1;
  }
  var lo = -1 << 30, hi = 1 << 30;
  for (final box in sums.keys) {
    final k = empties[box] ?? 0, sum = sums[box]!;
    final low = sum + k * (k + 1) ~/ 2, high = sum + k * n - k * (k - 1) ~/ 2;
    if (low > lo) lo = low;
    if (high < hi) hi = high;
  }
  return lo <= hi;
}

/// Цифра [val] в (r, c) не спорит с зеркальной клеткой линии-палиндрома. Перенос
/// `palindromeOk` веба.
bool palindromeOk(List<List<int>> grid, int r, int c, int val, List<List<ThermoLink?>> pn) {
  final cells = lineCells(pn, r, c);
  if (cells.isEmpty) return true;
  final i = cells.indexWhere((cell) => cell[0] == r && cell[1] == c);
  final m = cells[cells.length - 1 - i];
  if (m[0] == r && m[1] == c) return true;   // середина нечётной линии
  final o = grid[m[0]][m[1]];
  return o == 0 || o == val;
}

/// Цифра [val] в (r, c) не ломает линию «между концами»: при обоих известных концах средние
/// строго между ними; при одном — все средние по одну сторону от него. Перенос `betweenOk` веба.
bool betweenOk(List<List<int>> grid, int r, int c, int val, List<List<ThermoLink?>> pn) {
  final cells = lineCells(pn, r, c);
  if (cells.isEmpty) return true;
  int at(List<int> cell) => cell[0] == r && cell[1] == c ? val : grid[cell[0]][cell[1]];
  final a = at(cells.first), b = at(cells.last);
  final mids = [for (final cell in cells.sublist(1, cells.length - 1)) at(cell)].where((v) => v != 0).toList();
  if (a != 0 && b != 0) {
    if (a == b) return false;
    final lo = a < b ? a : b, hi = a < b ? b : a;
    return mids.every((v) => v > lo && v < hi);
  }
  final end = a != 0 ? a : b;
  if (end == 0 || mids.isEmpty) return true;
  return mids.every((v) => v > end) || mids.every((v) => v < end);
}

/// Цифра [val] в (r, c) не ломает lockout-линию: при обоих известных концах они отличаются
/// минимум на 4, а средние вне отрезка между ними; при одном — средние ему не равны. Перенос
/// `lockoutOk` веба.
bool lockoutOk(List<List<int>> grid, int r, int c, int val, List<List<ThermoLink?>> pn) {
  final cells = lineCells(pn, r, c);
  if (cells.isEmpty) return true;
  int at(List<int> cell) => cell[0] == r && cell[1] == c ? val : grid[cell[0]][cell[1]];
  final a = at(cells.first), b = at(cells.last);
  final mids = [for (final cell in cells.sublist(1, cells.length - 1)) at(cell)].where((v) => v != 0).toList();
  if (a != 0 && b != 0) {
    if ((a - b).abs() < 4) return false;
    final lo = a < b ? a : b, hi = a < b ? b : a;
    return mids.every((v) => v < lo || v > hi);
  }
  final end = a != 0 ? a : b;
  return end == 0 || mids.every((v) => v != end);
}

/// Линия ренбана не нарушена цифрой [val] в (r, c): на линии нет повторов, и разброс
/// известных цифр не шире её длины. Перенос `renbanOk` веба.
bool renbanOk(List<List<int>> grid, int r, int c, int val, List<List<ThermoLink?>> pn) {
  final cells = lineCells(pn, r, c);
  if (cells.isEmpty) return true;
  final vals = <int>[];
  for (final cell in cells) {
    final v = cell[0] == r && cell[1] == c ? val : grid[cell[0]][cell[1]];
    if (v == 0) continue;
    if (vals.contains(v)) return false;
    vals.add(v);
  }
  var lo = vals.first, hi = vals.first;
  for (final v in vals) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo <= cells.length - 1;
}

/// Не нарушает ли цифра [val] в клетке (r, c) ПОКАЗАННЫЕ подсказки — перенос `overlayOk`
/// из `frontend/src/services/sudoku-core.ts`: метки чётности, точки Кропки, суммы сэндвича,
/// линии шёпота, ренбана и равных сумм.
bool overlayOk(List<List<int>> grid, int r, int c, int val, int n, BoardGeometry g) {
  final parity = g.parity;
  if (parity != null) {
    final m = parity[r][c];
    if (m == 1 && val.isOdd) return false;
    if (m == 2 && val.isEven) return false;
  }
  final kropki = g.kropki;
  if (kropki != null) {
    bool rel(int d, int a, int b) => d == 2 ? (a == 2 * b || b == 2 * a) : (a - b).abs() == 1;
    final edges = <(int, int, int)>[
      if (c < n - 1) (kropki.h[r][c], r, c + 1),
      if (c > 0) (kropki.h[r][c - 1], r, c - 1),
      if (r < n - 1) (kropki.v[r][c], r + 1, c),
      if (r > 0) (kropki.v[r - 1][c], r - 1, c),
    ];
    for (final (d, nr, nc) in edges) {
      if (d == 0) continue;   // точки НЕ показано — ничего не утверждаем
      final nb = grid[nr][nc];
      if (nb != 0 && !rel(d, val, nb)) return false;
    }
  }
  final whisper = g.whisper;
  if (whisper != null) {
    final link = whisper[r][c];
    if (link != null) {
      for (final nb in [link.prev, link.next]) {
        if (nb == null) continue;
        final o = grid[nb[0]][nb[1]];
        if (o != 0 && (val - o).abs() < whisperGap) return false;
      }
    }
  }
  final renban = g.renban;
  if (renban != null && !renbanOk(grid, r, c, val, renban)) return false;
  final regionsum = g.regionsum;
  if (regionsum != null && !regionSumOk(grid, r, c, val, regionsum, n)) return false;
  final sandwich = g.sandwich;
  if (sandwich != null) {
    bool check(List<int> line, int want) {
      if (want < 0) return true;   // сумма спрятана — не подсказка
      final i1 = line.indexOf(1), i9 = line.indexOf(9);
      if (i1 < 0 || i9 < 0) return true;
      final a = i1 < i9 ? i1 : i9, b = i1 < i9 ? i9 : i1;
      var t = 0;
      for (var k = a + 1; k < b; k++) {
        if (line[k] == 0) return true;
        t += line[k];
      }
      return t == want;
    }

    final row = [...grid[r]]..[c] = val;
    if (!check(row, sandwich.rows[r])) return false;
    final col = [for (var i = 0; i < n; i++) grid[i][c]]..[r] = val;
    if (!check(col, sandwich.cols[c])) return false;
  }
  final palindrome = g.palindrome;
  if (palindrome != null && !palindromeOk(grid, r, c, val, palindrome)) return false;
  final between = g.between;
  if (between != null && !betweenOk(grid, r, c, val, between)) return false;
  final lockout = g.lockout;
  if (lockout != null && !lockoutOk(grid, r, c, val, lockout)) return false;
  final xv = g.xv;
  if (xv != null) {
    // XV с отрицательным условием (перенос `xvOk` веба): X → сумма 10, V → 5, без знака — ни то, ни другое.
    final edges = <(int, int, int)>[
      if (c < n - 1) (xv.h[r][c], r, c + 1),
      if (c > 0) (xv.h[r][c - 1], r, c - 1),
      if (r < n - 1) (xv.v[r][c], r + 1, c),
      if (r > 0) (xv.v[r - 1][c], r - 1, c),
    ];
    for (final (d, nr, nc) in edges) {
      final o = grid[nr][nc];
      if (o == 0) continue;
      final sum = val + o;
      if (d == 2 ? sum != 10 : d == 1 ? sum != 5 : sum == 5 || sum == 10) return false;
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
