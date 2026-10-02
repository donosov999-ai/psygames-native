/// НЕЗАКОНЧЕННАЯ ПАРТИЯ «ФРАКТАЛА» — СНИМОК В ФОРМАТЕ ВЕБА.
///
/// Сверка «веб против натива» 138f7818, задача b5df5096 п.3 (строка 331): веб хранит партию
/// (`sudoku-fractal.tsx`, `FractalResume`, RESUME_V 3), натив раздавал заново. Конверт и ключ —
/// каркаса (`ResumeStore`: `psygames_resume_sudoku_fractal_<профиль>`), поля — веба:
///   level · puzzle {root {solution, puzzle, blanks, tier, needsChildren}, children[{solution,
///   puzzle, feedsCell, blanks, unlockCells, tier}], portals[{from, to, fromCell, toCell, digit}],
///   level} · play {rootGrid, children[{grid, done}]} · marks {root, children[9]} · paint {root,
///   children[9]} · errors · elapsed · history {past: FractalMove[], future: []} · solverUsed.
///
/// ⚠️ В ленте веба — только ходы цифрами (`useMoveHistory<FractalMove>`); пометки и цвета лежат в
/// снимке целыми полями. Натив пишет так же: после подъёма отменяются цифры, пометки остаются.
///
/// Разбор не доверяет записи: она живёт на устройстве месяц и переживает обновления. Любая
/// несостыковка формы — `null`, и экран раздаёт свою доску (снимок она перезапишет).
library;

import 'rules.dart';

/// Версия снимка — та же, что у веба (`RESUME_V` в sudoku-fractal.tsx).
const fractalResumeVersion = 3;

/// Имя игры в ключе — как у веба и у лестницы уровней.
const fractalGameId = 'sudoku_fractal';

/// Поднятая партия: всё, что нужно экрану, чтобы доска ожила той же.
class FractalResumed {
  FractalResumed({
    required this.level,
    required this.puzzle,
    required this.play,
    required this.marks,
    required this.colors,
    required this.errors,
    required this.elapsed,
    required this.moves,
    required this.solverUsed,
  });

  final int level;
  final FractalPuzzle puzzle;
  final FractalPlayState play;

  /// Индекс 0 — корень, 1…9 — дочерние (как у экрана).
  final List<List<List<int>>> marks;
  final List<List<List<int>>> colors;
  final int errors;
  final int elapsed;
  final List<FractalMove> moves;
  final bool solverUsed;
}

List<List<int>> _copy(List<List<int>> g) => [for (final row in g) [...row]];

Map<String, Object?> fractalPuzzleToJson(FractalPuzzle f) => {
      'root': {
        'solution': _copy(f.rootSolution),
        'puzzle': _copy(f.rootPuzzle),
        'blanks': f.rootBlanks,
        'tier': f.rootTier,
        'needsChildren': f.needsChildren,
      },
      'children': [
        for (final c in f.children)
          {
            'solution': _copy(c.solution),
            'puzzle': _copy(c.puzzle),
            'feedsCell': [...c.feedsCell],
            'blanks': c.blanks,
            'unlockCells': c.unlockCells,
            'tier': c.tier,
          },
      ],
      'portals': [
        for (final p in f.portals)
          {'from': p.from, 'to': p.to, 'fromCell': [...p.fromCell], 'toCell': [...p.toCell], 'digit': p.digit},
      ],
      'level': f.level,
    };

Map<String, Object?> fractalMoveToJson(FractalMove m) => {
      'child': m.child,
      'r': m.r,
      'c': m.c,
      'from': m.from,
      'to': m.to,
      'unlocked': m.unlocked,
      if (m.mirror != null)
        'mirror': {
          'child': m.mirror!.child,
          'r': m.mirror!.r,
          'c': m.mirror!.c,
          'from': m.mirror!.from,
          'unlocked': m.mirror!.unlocked,
        },
    };

/// Снимок в форме `FractalResume` веба.
Map<String, Object?> fractalSnapshot({
  required int level,
  required FractalPuzzle puzzle,
  required FractalPlayState play,
  required List<List<List<int>>> marks,
  required List<List<List<int>>> colors,
  required int errors,
  required int elapsed,
  required List<FractalMove> moves,
  bool solverUsed = false,
}) =>
    {
      'level': level,
      'puzzle': fractalPuzzleToJson(puzzle),
      'play': {
        'rootGrid': _copy(play.rootGrid),
        'children': [for (final c in play.children) {'grid': _copy(c.grid), 'done': c.done}],
      },
      'marks': {'root': _copy(marks[0]), 'children': [for (var i = 1; i <= 9; i++) _copy(marks[i])]},
      'paint': {'root': _copy(colors[0]), 'children': [for (var i = 1; i <= 9; i++) _copy(colors[i])]},
      'errors': errors,
      'elapsed': elapsed,
      'history': {'past': [for (final m in moves) fractalMoveToJson(m)], 'future': const <Object>[]},
      'solverUsed': solverUsed,
    };

List<List<int>>? _grid9(Object? v) {
  if (v is! List || v.length != 9) return null;
  final out = <List<int>>[];
  for (final row in v) {
    if (row is! List || row.length != 9) return null;
    out.add([for (final x in row) x is num ? x.toInt() : 0]);
  }
  return out;
}

List<int>? _pair(Object? v) =>
    v is List && v.length == 2 && v.every((x) => x is num) ? [for (final x in v) (x as num).toInt()] : null;

int? _int(Object? v) => v is num ? v.toInt() : null;

/// Разобрать снимок; `null` — форма не та (экран раздаст свою доску).
FractalResumed? fractalFromSnapshot(Map<String, Object?> s) {
  final level = _int(s['level']);
  final pz = s['puzzle'], pl = s['play'];
  if (level == null || pz is! Map || pl is! Map) return null;
  final root = pz['root'];
  if (root is! Map) return null;
  final rootSolution = _grid9(root['solution']), rootPuzzle = _grid9(root['puzzle']);
  if (rootSolution == null || rootPuzzle == null) return null;
  final kids = pz['children'];
  if (kids is! List || kids.length != 9) return null;
  final children = <FractalChild>[];
  for (final k in kids) {
    if (k is! Map) return null;
    final sol = _grid9(k['solution']), puz = _grid9(k['puzzle']), feeds = _pair(k['feedsCell']);
    if (sol == null || puz == null || feeds == null) return null;
    children.add(FractalChild(
      puzzle: puz,
      solution: sol,
      feedsCell: feeds,
      blanks: _int(k['blanks']) ?? 0,
      unlockCells: _int(k['unlockCells']) ?? 0,
      tier: _int(k['tier']) ?? 0,
    ));
  }
  final portals = <FractalPortal>[];
  for (final p in (pz['portals'] as List?) ?? const []) {
    if (p is! Map) return null;
    final from = _int(p['from']), to = _int(p['to']), digit = _int(p['digit']);
    final fromCell = _pair(p['fromCell']), toCell = _pair(p['toCell']);
    if (from == null || to == null || digit == null || fromCell == null || toCell == null) return null;
    portals.add(FractalPortal(from: from, to: to, fromCell: fromCell, toCell: toCell, digit: digit));
  }
  final puzzle = FractalPuzzle(
    level: _int(pz['level']) ?? level,
    rootPuzzle: rootPuzzle,
    rootSolution: rootSolution,
    rootBlanks: _int(root['blanks']) ?? 0,
    rootTier: _int(root['tier']) ?? 0,
    needsChildren: root['needsChildren'] == true,
    children: children,
    portals: portals,
  );

  final rootGrid = _grid9(pl['rootGrid']);
  final pk = pl['children'];
  if (rootGrid == null || pk is! List || pk.length != 9) return null;
  final playChildren = <({List<List<int>> grid, bool done})>[];
  for (final c in pk) {
    if (c is! Map) return null;
    final g = _grid9(c['grid']);
    if (g == null) return null;
    playChildren.add((grid: g, done: c['done'] == true));
  }

  // Пометки и цвет: битая сетка — пустая (потерять пометки не страшно, уронить партию — страшно).
  List<List<List<int>>> layer(Object? v) {
    final empty = [for (var r = 0; r < 9; r++) List<int>.filled(9, 0)];
    if (v is! Map) return [for (var i = 0; i < 10; i++) _copy(empty)];
    final ch = v['children'];
    return [
      _grid9(v['root']) ?? _copy(empty),
      for (var i = 0; i < 9; i++) (ch is List && i < ch.length ? _grid9(ch[i]) : null) ?? _copy(empty),
    ];
  }

  final moves = <FractalMove>[];
  for (final m in ((s['history'] as Map?)?['past'] as List?) ?? const []) {
    if (m is! Map) continue;
    final r = _int(m['r']), c = _int(m['c']), from = _int(m['from']), to = _int(m['to']);
    if (r == null || c == null || from == null || to == null) continue;
    final mi = m['mirror'];
    moves.add(FractalMove(
      child: _int(m['child']),
      r: r,
      c: c,
      from: from,
      to: to,
      unlocked: m['unlocked'] == true,
      mirror: mi is Map && _int(mi['child']) != null && _int(mi['r']) != null && _int(mi['c']) != null
          ? (
              child: _int(mi['child'])!,
              r: _int(mi['r'])!,
              c: _int(mi['c'])!,
              from: _int(mi['from']) ?? 0,
              unlocked: mi['unlocked'] == true,
            )
          : null,
    ));
  }

  return FractalResumed(
    level: level,
    puzzle: puzzle,
    play: FractalPlayState(rootGrid: rootGrid, children: playChildren),
    marks: layer(s['marks']),
    colors: layer(s['paint']),
    errors: _int(s['errors']) ?? 0,
    elapsed: _int(s['elapsed']) ?? 0,
    moves: moves,
    solverUsed: s['solverUsed'] == true,
  );
}
