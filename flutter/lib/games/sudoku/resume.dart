/// НЕЗАКОНЧЕННАЯ ПАРТИЯ «СУДОКУ» НА ЛЕСТНИЦЕ — СНИМОК В ФОРМАТЕ ВЕБА.
///
/// Сверка «веб против натива» 138f7818, задача b5df5096 п.3 (строка 114): двадцатиминутная доска
/// терялась при «назад» или выгрузке свёрнутого приложения. Веб хранит её (`app/games/sudoku.tsx`,
/// `SudokuResume`, RESUME_V 4). Ключ и конверт — каркаса (`ResumeStore`:
/// `psygames_resume_sudoku_<профиль>`), поля — веба:
///   mode · level · road · difficulty · size · variant · dims {N, BR, BC} · puzzle · solution · grid
///   · given · cellColors · marks · regions · cages · cageSums · cageAnchors · parityMarks · kropki
///   · sandwich · thermo · arrow · whisper · renban · regionsum · palindrome · between · lockout · xv
///   · unequal · towers · errors · hintUses · hintMax · backtrackCount · elapsed · history.
///
/// 🔴 ГЕОМЕТРИЯ ВАРИАНТА В ДВУХ ФОРМАХ. Натив получает её выгрузкой (поля генератора TS:
/// `parity`, `cages {cageOf, sum, anchor, cells}`), веб в снимке держит своё состояние экрана
/// (`parityMarks`, `cages` = только cageOf, `cageSums`, `cageAnchors`). Здесь — перевод в обе
/// стороны; `cells` клеток-сумм восстанавливаются из `cageOf`. Без геометрии доска варианта
/// поднялась бы, а проверять ходы было бы нечем.
///
/// Лестница (`mode: 'levels'`) и четыре режима (`towers`, `unequal`, `killer`, `free`; в `level`
/// — ступень режима, как у веба). ⚠️ Слот у режима СВОЙ (`psygames_resume_sudoku_<режим>_<профиль>`),
/// а не общий, как у веба: в общем слоте ход в «Небоскрёбах» стирал бы недорешённую доску
/// лестницы. Пилот генератора и малыши не сохраняются.
library;

/// Версия снимка — та же, что у веба (`SUDOKU_RESUME_V`).
const sudokuResumeVersion = 4;

/// Имя игры в ключе — как у веба и у лестницы.
const sudokuGameId = 'sudoku';

/// Поля геометрии, которые веб держит в снимке под теми же именами, что и выгрузка.
const _sameNamed = ['regions', 'kropki', 'sandwich', 'thermo', 'arrow', 'whisper', 'renban', 'regionsum', 'palindrome', 'between', 'lockout', 'xv', 'littlekiller', 'xsums', 'cipher'];

/// Геометрия выгрузки (`SudokuBoard.geometryJson`) → поля снимка веба.
Map<String, Object?> webGeometry(Map<String, Object?> g) {
  final cages = g['cages'];
  return {
    for (final k in _sameNamed) k: g[k],
    'cages': cages is Map ? cages['cageOf'] : null,
    'cageSums': cages is Map ? (cages['sum'] ?? const <int>[]) : const <int>[],
    'cageAnchors': cages is Map ? (cages['anchor'] ?? const <int>[]) : const <int>[],
    'parityMarks': g['parity'],
    'unequal': g['unequal'],
    'towers': g['towers'],
  };
}

/// Поля снимка веба → геометрия в форме выгрузки (для `BoardGeometry.fromJson`).
Map<String, Object?> exportGeometry(Map<String, Object?> s) {
  final out = <String, Object?>{
    for (final k in _sameNamed)
      if (s[k] != null) k: s[k],
    if (s['parityMarks'] != null) 'parity': s['parityMarks'],
    if (s['unequal'] != null) 'unequal': s['unequal'],
    if (s['towers'] != null) 'towers': s['towers'],
  };
  final cageOf = s['cages'];
  if (cageOf is List) {
    final sums = (s['cageSums'] as List?) ?? const [];
    final cells = [for (var i = 0; i < sums.length; i++) <List<int>>[]];
    for (var r = 0; r < cageOf.length; r++) {
      final row = cageOf[r];
      if (row is! List) continue;
      for (var c = 0; c < row.length; c++) {
        final id = row[c];
        if (id is num && id >= 0 && id < cells.length) cells[id.toInt()].add([r, c]);
      }
    }
    out['cages'] = {'cageOf': cageOf, 'sum': sums, 'anchor': (s['cageAnchors'] as List?) ?? const [], 'cells': cells};
  }
  return out;
}

/// Ход ленты: цифра, пометка или цвет — что было в клетке и что стало.
typedef SudokuResumeMove = ({String kind, int r, int c, int from, int to});

/// Снимок в форме `SudokuResume` веба.
Map<String, Object?> sudokuSnapshot({
  String mode = 'levels',
  required int level,
  required String road,
  required String variant,
  required int n,
  required int br,
  required int bc,
  required List<List<int>> puzzle,
  required List<List<int>> solution,
  required List<List<int>> grid,
  required List<List<bool>> given,
  required List<List<int>> colors,
  required List<List<int>> marks,
  required Map<String, Object?> geometry,
  required int errors,
  required int hintUses,
  required int hintMax,
  required int backtracks,
  required int elapsed,
  required List<SudokuResumeMove> moves,
  bool answersRevealed = false,
}) =>
    {
      'mode': mode,
      'level': level,
      'road': road,
      'difficulty': 'medium',
      'size': n,
      'variant': variant,
      'dims': {'N': n, 'BR': br, 'BC': bc},
      'puzzle': puzzle,
      'solution': solution,
      'grid': grid,
      'given': given,
      'cellColors': colors,
      'marks': marks,
      ...webGeometry(geometry),
      'errors': errors,
      'hintUses': hintUses,
      'answersRevealed': answersRevealed,
      'hintMax': hintMax,
      'backtrackCount': backtracks,
      'elapsed': elapsed,
      'history': {
        'past': [
          for (final m in moves) {if (m.kind != 'digit') 'kind': m.kind, 'r': m.r, 'c': m.c, 'from': m.from, 'to': m.to},
        ],
        'future': const <Object>[],
      },
    };

/// Поднятая партия лестницы.
class SudokuResumed {
  SudokuResumed({
    required this.level,
    required this.road,
    required this.variant,
    required this.n,
    required this.br,
    required this.bc,
    required this.puzzle,
    required this.solution,
    required this.grid,
    required this.given,
    required this.colors,
    required this.marks,
    required this.geometry,
    required this.errors,
    required this.hintUses,
    required this.backtracks,
    required this.elapsed,
    required this.moves,
    this.answersRevealed = false,
  });

  final int level;
  final String road;
  final String variant;
  final int n, br, bc;
  final List<List<int>> puzzle, solution, grid, colors, marks;
  final List<List<bool>> given;
  final Map<String, Object?> geometry;
  final int errors, hintUses, backtracks, elapsed;
  final List<SudokuResumeMove> moves;
  final bool answersRevealed;
}

List<List<int>>? _ints(Object? v, int n) {
  if (v is! List || v.length != n) return null;
  final out = <List<int>>[];
  for (final row in v) {
    if (row is! List || row.length != n) return null;
    out.add([for (final x in row) x is num ? x.toInt() : 0]);
  }
  return out;
}

int? _int(Object? v) => v is num ? v.toInt() : null;

/// Разобрать снимок; `null` — партия другого режима или форма не та (экран раздаст свою доску).
SudokuResumed? sudokuFromSnapshot(Map<String, Object?> s, {String mode = 'levels'}) {
  if (s['mode'] != mode) return null;
  final dims = s['dims'];
  final level = _int(s['level']);
  final variant = s['variant'];
  if (dims is! Map || level == null || variant is! String) return null;
  final n = _int(dims['N']), br = _int(dims['BR']), bc = _int(dims['BC']);
  if (n == null || br == null || bc == null || n < 4 || n > 9 || br * bc != n) return null;
  final puzzle = _ints(s['puzzle'], n), solution = _ints(s['solution'], n), grid = _ints(s['grid'], n);
  final givenRaw = s['given'];
  if (puzzle == null || solution == null || grid == null || givenRaw is! List || givenRaw.length != n) return null;
  final given = <List<bool>>[];
  for (final row in givenRaw) {
    if (row is! List || row.length != n) return null;
    given.add([for (final x in row) x == true]);
  }
  // Пометки и цвет: битое — пусто (потерять пометки не страшно, уронить партию — страшно).
  final empty = [for (var r = 0; r < n; r++) List<int>.filled(n, 0)];
  final moves = <SudokuResumeMove>[];
  for (final m in ((s['history'] as Map?)?['past'] as List?) ?? const []) {
    if (m is! Map) continue;
    final r = _int(m['r']), c = _int(m['c']), from = _int(m['from']), to = _int(m['to']);
    if (r == null || c == null || from == null || to == null || r >= n || c >= n) continue;
    final kind = m['kind'] == null ? 'digit' : m['kind'] as String;
    if (kind != 'digit' && kind != 'pencil' && kind != 'color') continue;
    moves.add((kind: kind, r: r, c: c, from: from, to: to));
  }
  return SudokuResumed(
    level: level,
    road: s['road'] is String ? s['road'] as String : 'normal',
    variant: variant,
    n: n,
    br: br,
    bc: bc,
    puzzle: puzzle,
    solution: solution,
    grid: grid,
    given: given,
    colors: _ints(s['cellColors'], n) ?? [for (final row in empty) [...row]],
    marks: _ints(s['marks'], n) ?? [for (final row in empty) [...row]],
    geometry: exportGeometry(s),
    errors: _int(s['errors']) ?? 0,
    hintUses: _int(s['hintUses']) ?? 0,
    // Old v4 attempts never persisted lesson usage. Their independence cannot
    // be proved: keep the board playable, but classify completion as practice.
    answersRevealed: !s.containsKey('answersRevealed') || s['answersRevealed'] == true || s['lesson'] == true,
    backtracks: _int(s['backtrackCount']) ?? 0,
    elapsed: _int(s['elapsed']) ?? 0,
    moves: moves,
  );
}
