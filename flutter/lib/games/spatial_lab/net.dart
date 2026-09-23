/// «СЕТЬ ТРУБ» — перенос `spatial-core/net.mjs`, `net-levels.mjs` и `net-solver.mjs`.
///
/// Биты концов трубы: 1 — север, 2 — восток, 4 — юг, 8 — запад; поворот на четверть двигает их
/// по кругу. Победа — вода от источника дошла до КАЖДОЙ трубы и нигде не течёт наружу.
///
/// 🔴 ЕДИНСТВЕННОСТЬ ОТВЕТА ДОКАЗЫВАЕТСЯ ПЕРЕБОРОМ, А НЕ ПОСТРОЕНИЕМ. Задание берётся только
/// тогда, когда точный решатель нашёл РОВНО ОДНУ раскладку и не исчерпал бюджет узлов: «я же
/// строил из дерева» — не доказательство, у прямых и крестовых труб повороты неразличимы.
library;

import 'board.dart';

/// (dr, dc, бит в эту сторону, встречный бит соседа).
const List<List<int>> _dirs = [
  [-1, 0, 1, 4],
  [0, 1, 2, 8],
  [1, 0, 4, 1],
  [0, -1, 8, 2],
];

/// Маска клетки с учётом её поворота.
int maskAt(Cell cell) {
  var m = cell.mask;
  for (var i = 0; i < cell.turns; i++) {
    m = ((m << 1) & 15) | (m >> 3);
  }
  return m;
}

/// Течь, связность и победа. `start` — клетка источника: у «Сети со сдвигом» он ездит.
({int leaks, Set<int> connected, bool won}) network(Board b, [int start = 0]) {
  var leaks = 0;
  final adjacency = [for (var i = 0; i < b.cells.length; i++) <int>[]];
  for (var i = 0; i < b.cells.length; i++) {
    final m = maskAt(b.cells[i]);
    final r = i ~/ b.width, c = i % b.width;
    for (final d in _dirs) {
      if ((m & d[2]) == 0) continue;
      final nr = r + d[0], nc = c + d[1];
      final j = nr * b.width + nc;
      if (nr < 0 || nr >= b.height || nc < 0 || nc >= b.width || (maskAt(b.cells[j]) & d[3]) == 0) {
        leaks++;
      } else {
        adjacency[i].add(j);
      }
    }
  }
  final connected = <int>{start};
  final stack = <int>[start];
  while (stack.isNotEmpty) {
    for (final j in adjacency[stack.removeLast()]) {
      if (connected.add(j)) stack.add(j);
    }
  }
  return (
    leaks: leaks,
    connected: connected,
    won: leaks == 0 && connected.length == b.cells.length,
  );
}

/// Случайное дерево обходом в глубину. Достижимо, но единственность НЕ обещана — её проверяет
/// решатель уровня.
({Board initial, Board target, List<Command> solution}) netPuzzle(
  int seed, {
  int width = 5,
  int cycles = 0,
}) {
  if (width < 2 || width > 6) throw RangeError('ширина сети');
  if (cycles < 0 || cycles > (width - 1) * (width - 1)) throw RangeError('циклы');
  final random = labRng(seed);
  final masks = List<int>.filled(width * width, 0);

  final seen = <int>{0};
  final stack = <int>[0];
  while (stack.isNotEmpty) {
    final i = stack.last;
    final r = i ~/ width, c = i % width;
    final choices = [
      for (final d in _dirs)
        if (r + d[0] >= 0 &&
            r + d[0] < width &&
            c + d[1] >= 0 &&
            c + d[1] < width &&
            !seen.contains((r + d[0]) * width + c + d[1]))
          d,
    ];
    if (choices.isEmpty) {
      stack.removeLast();
      continue;
    }
    final d = choices[(random() * choices.length).floor()];
    final j = (r + d[0]) * width + c + d[1];
    masks[i] |= d[2];
    masks[j] |= d[3];
    seen.add(j);
    stack.add(j);
  }

  // Ровно столько лишних рёбер, сколько просили: цикл ломает «дерево» и усложняет разбор.
  if (cycles > 0) {
    final missing = <List<int>>[];
    for (var i = 0; i < masks.length; i++) {
      if (i % width < width - 1 && (masks[i] & 2) == 0) missing.add([i, i + 1, 2, 8]);
      if (i < width * (width - 1) && (masks[i] & 4) == 0) missing.add([i, i + width, 4, 1]);
    }
    for (var k = 0; k < cycles; k++) {
      final j = k + (random() * (missing.length - k)).floor();
      final t = missing[k];
      missing[k] = missing[j];
      missing[j] = t;
      final e = missing[k];
      masks[e[0]] |= e[2];
      masks[e[1]] |= e[3];
    }
  }

  final target = Board(
    width: width,
    height: width,
    cells: [for (var i = 0; i < masks.length; i++) Cell(id: i, mask: masks[i])],
  );
  final commands = [
    for (var index = 0; index < target.cells.length; index++)
      Command.tile(index, amount: (random() * 4).floor()),
  ];
  var initial = replay(target, commands);
  if (network(initial).won) {
    commands.add(const Command.tile(0, amount: 1));
    initial = apply(initial, commands.last);
  }
  return (
    initial: initial,
    target: target,
    solution: [for (final c in commands.reversed) c.inverted],
  );
}

// ─── точный решатель ──────────────────────────────────────────────────────

class NetSolution {
  const NetSolution({
    required this.count,
    required this.exhausted,
    required this.unique,
  });

  final int count;

  /// Бюджет узлов кончился: из неполного перебора единственность НЕ утверждается.
  final bool exhausted;
  final bool unique;
}

/// Точный перебор с распространением ограничений. Считаются ФИЗИЧЕСКИЕ раскладки, а не повороты:
/// у прямой трубы два поворота дают одну и ту же трубу.
NetSolution solveNetwork(
  Board b, {
  List<int> locked = const [],
  int limit = 2,
  int nodeBudget = 100000,
}) {
  final width = b.width, height = b.height, cells = b.cells;
  final fixed = locked.toSet();
  final neighbours = [
    for (var i = 0; i < cells.length; i++)
      [
        for (final d in _dirs)
          () {
            final r = i ~/ width + d[0], c = i % width + d[1];
            final out = r < 0 || r >= height || c < 0 || c >= width;
            return (index: out ? -1 : r * width + c, bit: d[2], opp: d[3]);
          }(),
      ],
  ];
  final domains = [
    for (var i = 0; i < cells.length; i++)
      {
        for (final turns in fixed.contains(i) ? [cells[i].turns] : [0, 1, 2, 3])
          maskAt(cells[i].copyWith(turns: turns)),
      }.where((m) => neighbours[i].every((n) => n.index >= 0 || (m & n.bit) == 0)).toList(),
  ];

  var nodes = 0;
  var exhausted = false;
  final solutions = <Board>[];

  bool propagate(List<List<int>> ds) {
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < ds.length; i++) {
        final valid = [
          for (final m in ds[i])
            if (neighbours[i].every(
              (n) => n.index < 0
                  ? (m & n.bit) == 0
                  : ds[n.index].any((other) => ((m & n.bit) != 0) == ((other & n.opp) != 0)),
            ))
              m,
        ];
        if (valid.isEmpty) return false;
        if (valid.length != ds[i].length) {
          ds[i] = valid;
          changed = true;
        }
      }
    }
    // Даже возможными соединениями не дотянуться до клетки — решения не существует.
    final seen = <int>{0};
    final stack = <int>[0];
    while (stack.isNotEmpty) {
      final i = stack.removeLast();
      for (final n in neighbours[i]) {
        if (n.index >= 0 &&
            !seen.contains(n.index) &&
            ds[i].any((m) => (m & n.bit) != 0) &&
            ds[n.index].any((m) => (m & n.opp) != 0)) {
          seen.add(n.index);
          stack.add(n.index);
        }
      }
    }
    return seen.length == cells.length;
  }

  void visit(List<List<int>> ds) {
    if (solutions.length >= limit) return;
    if (nodes >= nodeBudget) {
      exhausted = true;
      return;
    }
    nodes++;
    if (!propagate(ds)) return;
    var chosen = -1;
    for (var i = 0; i < ds.length; i++) {
      if (ds[i].length > 1 && (chosen < 0 || ds[i].length < ds[chosen].length)) chosen = i;
    }
    if (chosen < 0) {
      final result = Board(
        width: width,
        height: height,
        cells: [for (var i = 0; i < cells.length; i++) Cell(id: cells[i].id, mask: ds[i][0])],
      );
      if (network(result).won) solutions.add(result);
      return;
    }
    for (final m in ds[chosen]) {
      final next = [for (final d in ds) [...d]];
      next[chosen] = [m];
      visit(next);
      if (exhausted || solutions.length >= limit) return;
    }
  }

  visit(domains);
  return NetSolution(
    count: solutions.length,
    exhausted: exhausted,
    unique: !exhausted && solutions.length == 1,
  );
}

// ─── лестница ─────────────────────────────────────────────────────────────

enum Repair { single, adjacent, junction, all, connected }

class NetSpec {
  const NetSpec({
    required this.level,
    required this.width,
    required this.repair,
    this.highlight = false,
    this.lockCorrect = false,
    this.affected = 0,
    this.cycles = 0,
    this.junctions = 0,
    this.liveColour = true,
  });

  final int level;
  final int width;
  final Repair repair;

  /// Подсветить клетки, которые надо починить (обучающие ступени).
  final bool highlight;

  /// Закрепить остальные трубы, чтобы их нельзя было сбить.
  final bool lockCorrect;
  final int affected;
  final int cycles;
  final int junctions;

  /// Подсвечивать связность живым цветом — помощь, которая с 26-й ступени выключается.
  final bool liveColour;
}

const List<NetSpec> _opening = [
  NetSpec(level: 1, width: 3, repair: Repair.single, highlight: true, lockCorrect: true),
  NetSpec(level: 2, width: 3, repair: Repair.single),
  NetSpec(level: 3, width: 3, repair: Repair.adjacent),
  NetSpec(level: 4, width: 3, repair: Repair.junction),
  NetSpec(level: 5, width: 3, repair: Repair.all),
];

/// [ширина, размер связного участка, циклы, минимум развилок, живой цвет].
const List<List<int>> _advanced = [
  [4, 6, 0, 1, 1], [4, 7, 0, 1, 1], [4, 8, 0, 1, 1], [4, 9, 0, 1, 1], [4, 10, 0, 2, 1],
  [4, 11, 0, 2, 1], [4, 12, 0, 2, 1], [4, 13, 0, 2, 1], [4, 14, 0, 2, 1], [4, 16, 0, 2, 1],
  [5, 16, 0, 2, 1], [5, 17, 0, 2, 1], [5, 18, 0, 2, 1], [5, 19, 0, 2, 1], [5, 20, 0, 3, 1],
  [5, 21, 0, 3, 1], [5, 22, 0, 3, 1], [5, 23, 0, 3, 1], [5, 24, 0, 3, 1], [5, 25, 0, 3, 1],
  [5, 25, 0, 3, 0], [5, 23, 1, 3, 0], [5, 24, 1, 3, 0], [5, 23, 2, 4, 0], [5, 24, 2, 4, 0],
  [6, 24, 0, 4, 0], [6, 25, 0, 4, 0], [6, 26, 0, 4, 0], [6, 27, 0, 4, 0], [6, 28, 0, 4, 0],
  [6, 29, 0, 4, 0], [6, 30, 0, 4, 0], [6, 31, 0, 4, 0], [6, 32, 0, 4, 0], [6, 33, 0, 4, 0],
  [6, 30, 1, 5, 0], [6, 31, 1, 5, 0], [6, 32, 1, 5, 0], [6, 30, 2, 5, 0], [6, 31, 2, 5, 0],
  [6, 30, 3, 5, 0], [6, 31, 3, 5, 0], [6, 30, 4, 5, 0], [6, 31, 4, 5, 0], [6, 31, 4, 6, 0],
];

final List<NetSpec> netLevels = [
  ..._opening,
  for (var i = 0; i < _advanced.length; i++)
    NetSpec(
      level: i + 6,
      width: _advanced[i][0],
      repair: Repair.connected,
      affected: _advanced[i][1],
      cycles: _advanced[i][2],
      junctions: _advanced[i][3],
      liveColour: _advanced[i][4] == 1,
    ),
];

List<int> _neighboursOf(Board b, int i) => [
  for (final e in [
    [-b.width, 1],
    [1, 2],
    [b.width, 4],
    [-1, 8],
  ])
    if ((maskAt(b.cells[i]) & e[1]) != 0) i + e[0],
];

int _degree(int m) => [1, 2, 4, 8].where((bit) => (m & bit) != 0).length;

/// Задание уровня: поле, решение, закреплённые и подсвеченные клетки.
class LabTask {
  const LabTask({
    required this.level,
    required this.seed,
    required this.initial,
    required this.solution,
    this.target,
    this.locked = const [],
    this.highlighted = const [],
    this.guide,
    this.minimumMoves,
    this.lowerBound,
  });

  final int level;
  final int seed;
  final Board initial;
  final Board? target;
  final List<Command> solution;
  final List<int> locked;
  final List<int> highlighted;

  /// Подсказанный первый ход обучающей ступени.
  final Command? guide;
  final int? minimumMoves;
  final int? lowerBound;
}

LabTask _openingNetLevel(int level, int seed) {
  final spec = _opening[level - 1];
  final random = labRng(seed);
  for (var attempt = 0; attempt < 100; attempt++) {
    final target = netPuzzle((seed + attempt) & 0xFFFFFFFF, width: spec.width).target;
    final movable = [
      for (var i = 0; i < target.cells.length; i++)
        if (_degree(target.cells[i].mask) != 4) i,
    ];
    List<int> changed;
    switch (spec.repair) {
      case Repair.single:
        changed = [movable[(random() * movable.length).floor()]];
      case Repair.adjacent:
        final a = movable.firstWhere(
          (i) => _neighboursOf(target, i).any(movable.contains),
          orElse: () => -1,
        );
        if (a < 0) continue;
        changed = [a, _neighboursOf(target, a).firstWhere(movable.contains)];
      case Repair.junction:
        final centre = movable.firstWhere(
          (i) =>
              _degree(target.cells[i].mask) == 3 &&
              _neighboursOf(target, i).every(movable.contains),
          orElse: () => -1,
        );
        if (centre < 0) continue;
        changed = [centre, ..._neighboursOf(target, centre)];
      case Repair.all:
        changed = movable;
      case Repair.connected:
        throw StateError('обучающая ступень не бывает связной');
    }
    var initial = target;
    final solution = <Command>[];
    for (final index in changed) {
      final amount = random() < .5 ? 1 : -1;
      initial = apply(initial, Command.tile(index, amount: amount));
      solution.add(Command.tile(index, amount: -amount));
    }
    final locked = spec.lockCorrect
        ? [
            for (final i in movable)
              if (!changed.contains(i)) i,
          ]
        : <int>[];
    if (!solveNetwork(initial, locked: locked).unique) continue;
    return LabTask(
      level: level,
      seed: seed,
      initial: initial,
      target: target,
      solution: solution,
      locked: locked,
      highlighted: spec.highlight ? changed : const [],
    );
  }
  throw StateError('Сеть $level: за 100 попыток не собралось задание с единственным ответом');
}

LabTask netLevel(int level, int seed) {
  if (level < 1 || level > 50) throw RangeError('Сеть: уровень 1…50');
  if (level <= 5) return _openingNetLevel(level, seed);
  final spec = netLevels[level - 1];
  final random = labRng(seed);

  for (var attempt = 0; attempt < 2000; attempt++) {
    final target = netPuzzle(
      (seed + attempt) & 0xFFFFFFFF,
      width: spec.width,
      cycles: spec.cycles,
    ).target;
    final movable = [
      for (var i = 0; i < target.cells.length; i++)
        if (_degree(target.cells[i].mask) != 4) i,
    ];
    if (movable.length < spec.affected) continue;

    // Чинить придётся ОДИН связный участок настоящих труб, а не рассыпанные клетки.
    final first = movable[(random() * movable.length).floor()];
    final chosen = <int>{first};
    final queue = <int>[first];
    for (var h = 0; h < queue.length && chosen.length < spec.affected; h++) {
      for (final j in _neighboursOf(target, queue[h])) {
        if (chosen.length == spec.affected) break;
        if (!chosen.contains(j) && movable.contains(j)) {
          chosen.add(j);
          queue.add(j);
        }
      }
    }
    if (chosen.length != spec.affected) continue;
    if (chosen.where((i) => _degree(target.cells[i].mask) == 3).length < spec.junctions) continue;
    if (!solveNetwork(target, nodeBudget: 20000).unique) continue;

    var initial = target;
    final solution = <Command>[];
    for (final index in chosen) {
      final amount = random() < .5 ? 1 : -1;
      initial = apply(initial, Command.tile(index, amount: amount));
      solution.add(Command.tile(index, amount: -amount));
    }
    return LabTask(
      level: level,
      seed: seed,
      initial: initial,
      target: target,
      solution: solution,
    );
  }
  throw StateError('Сеть $level: бюджет генерации исчерпан');
}
