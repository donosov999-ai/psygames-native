/// ПРОЕКЦИЯ: «КАК ЭТА ФИГУРА ВЫГЛЯДИТ СВЕРХУ» — перенос `core/projection.ts`.
///
/// Правильный ответ ВЫЧИСЛЯЕТСЯ из тех же координат, что и рисунок: две копии разъезжаются, и
/// «правильная» проекция перестаёт быть проекцией показанной фигуры. Подделки — то, что человек и
/// правда путает: вид вдоль другой оси и фигура с одним переставленным кубиком. Каждая сверяется с
/// правильной по множеству клеток: совпавшая была бы вторым верным ответом.
library;

import 'geometry.dart';
import 'rng.dart';
import 'shapes.dart';
import 'task.dart';

enum ProjectionView { top, front, side }

const List<ProjectionView> projectionViews = [
  ProjectionView.top,
  ProjectionView.front,
  ProjectionView.side,
];

String viewName(ProjectionView v) => v.name;

/// Клетка плоской сетки.
class Cell2D {
  const Cell2D(this.col, this.row);
  final int col;
  final int row;
}

/// Клетка, в которую попадает кубик при взгляде вдоль оси (та же изометрия, что в отрисовке).
Cell2D _cellOf(ProjectionView view, Cube c) => switch (view) {
  ProjectionView.top => Cell2D(c[0], c[2]),
  ProjectionView.front => Cell2D(c[0], -c[1]),
  ProjectionView.side => Cell2D(-c[2], -c[1]),
};

/// Отпечаток сетки: порядок клеток ничего не значит.
String gridKey(List<Cell2D> cells) {
  final parts = [for (final c in cells) '${c.col},${c.row}']..sort();
  return parts.join('|');
}

bool sameGrid(List<Cell2D> a, List<Cell2D> b) => gridKey(a) == gridKey(b);

/// Проекция фигуры: занятые клетки, сдвинутые в неотрицательный угол.
List<Cell2D> projectShape(Shape shape, ProjectionView view) {
  if (shape.isEmpty) return [];
  final raw = [for (final c in shape) _cellOf(view, c)];
  var minCol = raw.first.col, minRow = raw.first.row;
  for (final c in raw) {
    if (c.col < minCol) minCol = c.col;
    if (c.row < minRow) minRow = c.row;
  }
  final seen = <String>{};
  final out = <Cell2D>[];
  for (final c in raw) {
    final cell = Cell2D(c.col - minCol, c.row - minRow);
    final key = '${cell.col},${cell.row}';
    if (seen.contains(key)) continue; // за передним кубиком стоит задний — клетка одна
    seen.add(key);
    out.add(cell);
  }
  out.sort((p, q) => p.row != q.row ? p.row - q.row : p.col - q.col);
  return out;
}

/// Размер сетки под набор клеток.
({int cols, int rows}) gridSize(List<Cell2D> cells) {
  if (cells.isEmpty) return (cols: 1, rows: 1);
  var cols = cells.first.col, rows = cells.first.row;
  for (final c in cells) {
    if (c.col > cols) cols = c.col;
    if (c.row > rows) rows = c.row;
  }
  return (cols: cols + 1, rows: rows + 1);
}

const List<List<int>> _neighbours = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

bool _isConnected(Shape shape) {
  if (shape.isEmpty) return false;
  String key(Cube c) => '${c[0]},${c[1]},${c[2]}';
  final keys = {for (final c in shape) key(c)};
  final seen = <String>{key(shape.first)};
  final queue = <Cube>[shape.first];
  for (var i = 0; i < queue.length; i++) {
    final cur = queue[i];
    for (final d in _neighbours) {
      final next = <int>[cur[0] + d[0], cur[1] + d[1], cur[2] + d[2]];
      final k = key(next);
      if (!keys.contains(k) || seen.contains(k)) continue;
      seen.add(k);
      queue.add(next);
    }
  }
  return seen.length == shape.length;
}

/// Переставить ОДИН кубик на свободное место рядом: фигура остаётся связной и того же размера.
Shape? moveOneCube(Shape shape, Rng rng) {
  final order = shuffle(rng, [for (var i = 0; i < shape.length; i++) i]);
  for (final idx in order) {
    final rest = [
      for (var i = 0; i < shape.length; i++)
        if (i != idx) shape[i],
    ];
    if (!_isConnected(rest)) continue;
    String key(Cube c) => '${c[0]},${c[1]},${c[2]}';
    final occupied = {for (final c in rest) key(c)};
    final spots = <Cube>[];
    final spotKeys = <String>{};
    for (final c in rest) {
      for (final d in _neighbours) {
        final spot = <int>[c[0] + d[0], c[1] + d[1], c[2] + d[2]];
        final k = key(spot);
        if (occupied.contains(k) || spotKeys.contains(k)) continue;
        spotKeys.add(k);
        spots.add(spot);
      }
    }
    if (spots.isEmpty) continue;
    return [...rest, pick(rng, spots)];
  }
  return null;
}

/// Фигуры для проекции — объёмные: у плоской вид сверху вырождается в строку.
List<Shape> projectionCandidates(int minCubes, int maxCubes) {
  final band = shapesOfSize(minCubes, maxCubes);
  final solid = band.where(isVolumetric).toList();
  return solid.isNotEmpty ? solid : band;
}

enum ProjectionFlaw { none, otherView, editedShape }

String projectionFlawName(ProjectionFlaw f) => switch (f) {
  ProjectionFlaw.none => 'none',
  ProjectionFlaw.otherView => 'other-view',
  ProjectionFlaw.editedShape => 'edited-shape',
};

class ProjectionOption {
  const ProjectionOption({required this.cells, required this.isMatch, required this.flaw});
  final List<Cell2D> cells;
  final bool isMatch;
  final ProjectionFlaw flaw;
}

class ProjectionTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.projection;

  const ProjectionTask({
    required this.shape,
    required this.view,
    required this.options,
    required this.correctIdx,
  });

  final Shape shape;
  final ProjectionView view;
  final List<ProjectionOption> options;
  @override
  final int correctIdx;
}

ProjectionTask buildProjectionTask(int minCubes, int maxCubes, int optionCount, Rng rng) {
  final candidates = projectionCandidates(minCubes, maxCubes);
  if (candidates.isEmpty) throw StateError('нет фигур размера $minCubes–$maxCubes');
  final shape = pick(rng, candidates);
  final view = pick(rng, projectionViews);
  final correct = projectShape(shape, view);

  final options = <ProjectionOption>[
    ProjectionOption(cells: correct, isMatch: true, flaw: ProjectionFlaw.none),
  ];
  final taken = <String>{gridKey(correct)};

  bool add(List<Cell2D> cells, ProjectionFlaw flaw) {
    if (cells.isEmpty) return false;
    final key = gridKey(cells);
    if (taken.contains(key)) return false; // совпало с правильным или с соседней подделкой
    taken.add(key);
    options.add(ProjectionOption(cells: cells, isMatch: false, flaw: flaw));
    return true;
  }

  // Сначала — вид вдоль другой оси: самая честная путаница из возможных.
  for (final other in shuffle(rng, projectionViews.where((v) => v != view).toList())) {
    if (options.length >= optionCount) break;
    add(projectShape(shape, other), ProjectionFlaw.otherView);
  }

  // Добираем переставленным кубиком: повторы отсеиваются по отпечатку сетки.
  for (var attempt = 0; options.length < optionCount && attempt < 60; attempt++) {
    final edited = moveOneCube(shape, rng);
    if (edited != null) add(projectShape(edited, view), ProjectionFlaw.editedShape);
  }

  final mixed = shuffle(rng, options);
  return ProjectionTask(
    shape: shape,
    view: view,
    options: mixed,
    correctIdx: mixed.indexWhere((o) => o.isMatch),
  );
}
