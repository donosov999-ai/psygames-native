/// РАЗВЁРТКА: «КАКОЙ КУБИК СЛОЖИТСЯ ИЗ ЭТОЙ ВЫКРОЙКИ» — перенос `core/net.ts`.
///
/// 🔴 СБОРКА СЧИТАЕТСЯ, А НЕ ПРОПИСЫВАЕТСЯ РУКАМИ. Кубик КАТИТСЯ по выкройке: грань, легшая на
/// клетку, и есть та, в которую эта клетка сложится. Перекат и складывание — одно движение,
/// только в обратную сторону. Выписанная таблица «клетка → грань» — место, где опечатку не видно.
///
/// ⚠️ Выкройка проверяется на складываемость исполнением: обход обязан накрыть шесть клеток и
/// раздать им ШЕСТЬ РАЗНЫХ граней.
library;

import 'cube_faces.dart';
import 'rng.dart';
import 'task.dart';

class NetCell {
  const NetCell(this.col, this.row);
  final int col;
  final int row;
}

class CubeNet {
  const CubeNet(this.id, this.cells);
  final String id;

  /// Ровно шесть клеток, связных по рёбрам. Складываемость проверяется [foldNet].
  final List<NetCell> cells;
}

const List<CubeNet> cubeNets = [
  // латинский крест: 1–4–1 по вертикали
  CubeNet('cross', [
    NetCell(1, 0),
    NetCell(0, 1),
    NetCell(1, 1),
    NetCell(2, 1),
    NetCell(1, 2),
    NetCell(1, 3),
  ]),
  // 1–4–1: полоса из четырёх, по клетке сверху и снизу над разными столбцами
  CubeNet('strip-mid', [
    NetCell(1, 0),
    NetCell(0, 1),
    NetCell(1, 1),
    NetCell(2, 1),
    NetCell(3, 1),
    NetCell(2, 2),
  ]),
  CubeNet('strip-ends', [
    NetCell(0, 0),
    NetCell(0, 1),
    NetCell(1, 1),
    NetCell(2, 1),
    NetCell(3, 1),
    NetCell(3, 2),
  ]),
  // 2–3–1 «сапожок»
  CubeNet('boot', [
    NetCell(0, 0),
    NetCell(1, 0),
    NetCell(1, 1),
    NetCell(2, 1),
    NetCell(3, 1),
    NetCell(3, 2),
  ]),
  // лесенка 2–2–2
  CubeNet('stairs', [
    NetCell(0, 0),
    NetCell(1, 0),
    NetCell(1, 1),
    NetCell(2, 1),
    NetCell(2, 2),
    NetCell(3, 2),
  ]),
  // 3–3 со сдвигом
  CubeNet('double-row', [
    NetCell(0, 0),
    NetCell(1, 0),
    NetCell(2, 0),
    NetCell(2, 1),
    NetCell(3, 1),
    NetCell(4, 1),
  ]),
];

String netCellKey(NetCell cell) => '${cell.col},${cell.row}';

/// Ориентация катящегося кубика: какая грань куда смотрит на листе.
class _Rolling {
  const _Rolling({
    required this.bottom,
    required this.top,
    required this.north,
    required this.south,
    required this.east,
    required this.west,
  });

  /// Лежит на клетке — она и станет этой гранью выкройки.
  final CubeFace bottom;
  final CubeFace top;

  /// Вверх по листу (row − 1).
  final CubeFace north;
  final CubeFace south;

  /// Вправо по листу (col + 1).
  final CubeFace east;
  final CubeFace west;
}

const _Rolling _start = _Rolling(
  bottom: CubeFace.down,
  top: CubeFace.up,
  north: CubeFace.back,
  south: CubeFace.front,
  east: CubeFace.right,
  west: CubeFace.left,
);

enum _Dir { north, south, east, west }

/// Перекат через общее ребро: четыре грани по кругу, две поперечные на месте.
_Rolling _roll(_Rolling o, _Dir dir) => switch (dir) {
  _Dir.east => _Rolling(
    bottom: o.east,
    east: o.top,
    top: o.west,
    west: o.bottom,
    north: o.north,
    south: o.south,
  ),
  _Dir.west => _Rolling(
    bottom: o.west,
    west: o.top,
    top: o.east,
    east: o.bottom,
    north: o.north,
    south: o.south,
  ),
  _Dir.south => _Rolling(
    bottom: o.south,
    south: o.top,
    top: o.north,
    north: o.bottom,
    east: o.east,
    west: o.west,
  ),
  _Dir.north => _Rolling(
    bottom: o.north,
    north: o.top,
    top: o.south,
    south: o.bottom,
    east: o.east,
    west: o.west,
  ),
};

const List<({_Dir dir, int dc, int dr})> _steps = [
  (dir: _Dir.east, dc: 1, dr: 0),
  (dir: _Dir.west, dc: -1, dr: 0),
  (dir: _Dir.south, dc: 0, dr: 1),
  (dir: _Dir.north, dc: 0, dr: -1),
];

/// Сложить выкройку: клетка → грань собранного куба. `null` — кубом не складывается.
Map<String, CubeFace>? foldNet(CubeNet net) {
  if (net.cells.length != 6) return null;
  final byKey = {for (final c in net.cells) netCellKey(c): c};
  if (byKey.length != 6) return null; // две клетки в одном месте

  final faceOfCell = <String, CubeFace>{};
  final start = net.cells.first;
  final queue = <({NetCell cell, _Rolling cube})>[(cell: start, cube: _start)];
  faceOfCell[netCellKey(start)] = _start.bottom;

  for (var i = 0; i < queue.length; i++) {
    final (cell: cell, cube: cube) = queue[i];
    for (final step in _steps) {
      final next = NetCell(cell.col + step.dc, cell.row + step.dr);
      final key = netCellKey(next);
      if (!byKey.containsKey(key) || faceOfCell.containsKey(key)) continue;
      final rolled = _roll(cube, step.dir);
      faceOfCell[key] = rolled.bottom;
      queue.add((cell: next, cube: rolled));
    }
  }

  if (faceOfCell.length != 6) return null; // выкройка распалась на куски
  if (faceOfCell.values.toSet().length != 6) return null; // две клетки легли на одну грань
  return faceOfCell;
}

class AssembledNet {
  const AssembledNet(this.faceOfCell, this.markOfCell, this.cube);
  final Map<String, CubeFace> faceOfCell;
  final Map<String, FaceMark> markOfCell;
  final FaceMap cube;
}

/// Раздать значки клеткам выкройки и получить куб, который из неё складывается.
AssembledNet assembleNet(CubeNet net, List<FaceMark> marks) {
  final faceOfCell = foldNet(net);
  if (faceOfCell == null) throw StateError('выкройка «${net.id}» кубом не складывается');
  if (marks.length != 6 || marks.toSet().length != 6) {
    throw ArgumentError('нужно шесть РАЗНЫХ значков');
  }

  final markOfCell = <String, FaceMark>{};
  final cube = <CubeFace, FaceMark>{};
  for (var i = 0; i < net.cells.length; i++) {
    final key = netCellKey(net.cells[i]);
    markOfCell[key] = marks[i];
    cube[faceOfCell[key]!] = marks[i];
  }
  return AssembledNet(faceOfCell, markOfCell, cube);
}

/// Соседние (не противоположные) грани — перестановка именно их и путается.
List<List<CubeFace>> adjacentPairs() {
  final pairs = <List<CubeFace>>[];
  for (var i = 0; i < cubeFaces.length; i++) {
    for (var j = i + 1; j < cubeFaces.length; j++) {
      final a = cubeFaces[i], b = cubeFaces[j];
      if (oppositeFace(a) != b) pairs.add([a, b]);
    }
  }
  return pairs;
}

enum NetFlaw { none, mirror, swap }

class NetOption {
  const NetOption({required this.faces, required this.isMatch, required this.flaw});

  /// Куб в ракурсе показа: рисуются грани up/front/right.
  final FaceMap faces;
  final bool isMatch;
  final NetFlaw flaw;
}

class NetTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.net;

  const NetTask({
    required this.net,
    required this.markOfCell,
    required this.cube,
    required this.options,
    required this.correctIdx,
  });

  final CubeNet net;

  /// Значок на каждой клетке выкройки, ключ — `col,row`.
  final Map<String, FaceMark> markOfCell;

  /// Куб, который РЕАЛЬНО складывается из выкройки.
  final FaceMap cube;
  final List<NetOption> options;
  @override
  final int correctIdx;
}

NetTask buildNetTask(int optionCount, Rng rng) {
  final net = pick(rng, cubeNets);
  final marks = shuffle(rng, faceMarks);
  final assembled = assembleNet(net, marks);
  final cube = assembled.cube;

  final legal = allVisibleTriples(cube);
  final options = <NetOption>[];
  final shown = <String>{};

  // Ракурс настоящего куба: любой из 24 — он законен по построению.
  final truthful = pick(rng, allCubeOrientations(cube));
  options.add(NetOption(faces: truthful, isMatch: true, flaw: NetFlaw.none));
  shown.add(visibleTriple(truthful));

  // Подделка берётся только в том ракурсе, которого у настоящего куба НЕТ: перестановка двух
  // граней оставляет часть углов нетронутыми, и взятый вслепую ракурс бывает законным видом.
  bool addFrom(FaceMap spoiled, NetFlaw flaw) {
    for (final cand in shuffle(rng, allCubeOrientations(spoiled))) {
      final triple = visibleTriple(cand);
      if (legal.contains(triple) || shown.contains(triple)) continue;
      shown.add(triple);
      options.add(NetOption(faces: cand, isMatch: false, flaw: flaw));
      return true;
    }
    return false;
  }

  addFrom(mirrorCube(cube), NetFlaw.mirror);
  for (final pair in shuffle(rng, adjacentPairs())) {
    if (options.length >= optionCount) break;
    addFrom(swapFaces(cube, pair[0], pair[1]), NetFlaw.swap);
  }

  final mixed = shuffle(rng, options);
  return NetTask(
    net: net,
    markOfCell: assembled.markOfCell,
    cube: cube,
    options: mixed,
    correctIdx: mixed.indexWhere((o) => o.isMatch),
  );
}

/// Габарит выкройки — нужен отрисовке, чтобы вписать её в квадрат.
({int cols, int rows}) netSize(CubeNet net) {
  var cols = net.cells.first.col, rows = net.cells.first.row;
  for (final c in net.cells) {
    if (c.col > cols) cols = c.col;
    if (c.row > rows) rows = c.row;
  }
  return (cols: cols + 1, rows: rows + 1);
}
