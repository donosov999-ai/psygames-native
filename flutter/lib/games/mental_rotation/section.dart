/// «СРЕЗ» — перенос `core/section.ts`. В фигуре выделен ОДИН слой кубиков: как выглядит этот
/// срез сверху, спереди или справа. Вид всегда поперёк слоя, поэтому срез — плоская клетчатая
/// фигура без наложений.
///
/// ⚠️ ЭТО ОРТОГОНАЛЬНЫЙ ВАРИАНТ, И ЭТО ОСОЗНАННОЕ ОГРАНИЧЕНИЕ (задача 4f85b6a9): плоскость
/// идёт только по осям. Косой срез — отдельная геометрия, он живёт в `oblique.dart`.
///
/// 🔴 ОТВЕТ СЧИТАЕТСЯ ТОЙ ЖЕ ФУНКЦИЕЙ, ЧТО У «ПРОЕКЦИИ»: человек, выучивший «сверху» в одном
/// задании, не получит здесь перевёрнутый ответ.
///
/// 🔴 СРЕЗ ОБЯЗАН ОТЛИЧАТЬСЯ ОТ ПРОЕКЦИИ ВСЕЙ ФИГУРЫ — иначе задание решается без слоя вообще.
/// А проекция всей фигуры — первая подделка: ровно это и путают, когда не удерживают слой.
library;

import 'geometry.dart';
import 'levels.dart';
import 'projection.dart';
import 'rng.dart';
import 'task.dart';

/// Ось, поперёк которой лежит слой, видимый с этой стороны. Индекс координаты [x, y, z].
const Map<ProjectionView, int> sectionAxis = {
  ProjectionView.top: 1,
  ProjectionView.front: 2,
  ProjectionView.side: 0,
};

/// Кубики слоя: координата по оси вида равна `layer`.
Shape layerOf(Shape shape, ProjectionView view, int layer) {
  final axis = sectionAxis[view]!;
  return [
    for (final c in shape)
      if (c[axis] == layer) c,
  ];
}

/// Срез: клетки слоя в осях вида. Та же функция, что у «Проекции», — ориентация одна.
List<Cell2D> sectionOf(Shape shape, ProjectionView view, int layer) =>
    projectShape(layerOf(shape, view, layer), view);

List<Cell2D> _normalizeGrid(List<Cell2D> cells) {
  if (cells.isEmpty) return [];
  var minCol = cells.first.col, minRow = cells.first.row;
  for (final c in cells) {
    if (c.col < minCol) minCol = c.col;
    if (c.row < minRow) minRow = c.row;
  }
  return [for (final c in cells) Cell2D(c.col - minCol, c.row - minRow)]
    ..sort((p, q) => p.row != q.row ? p.row - q.row : p.col - q.col);
}

/// Зеркало по горизонтали: лево и право вида поменялись.
List<Cell2D> mirrorGrid(List<Cell2D> cells) {
  var maxCol = cells.first.col;
  for (final c in cells) {
    if (c.col > maxCol) maxCol = c.col;
  }
  return _normalizeGrid([for (final c in cells) Cell2D(maxCol - c.col, c.row)]);
}

/// Четверть оборота по часовой стрелке.
List<Cell2D> turnGrid(List<Cell2D> cells) {
  var maxRow = cells.first.row;
  for (final c in cells) {
    if (c.row > maxRow) maxRow = c.row;
  }
  return _normalizeGrid([for (final c in cells) Cell2D(maxRow - c.row, c.col)]);
}

const List<List<int>> _steps = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/// Одна клетка переставлена на свободное место рядом с остальными. Размер тот же.
List<Cell2D>? moveOneCell(List<Cell2D> cells, Rng rng) {
  for (final idx in shuffle(rng, [for (var i = 0; i < cells.length; i++) i])) {
    final rest = [
      for (var i = 0; i < cells.length; i++)
        if (i != idx) cells[i],
    ];
    if (rest.isEmpty) return null;
    final taken = {for (final c in cells) '${c.col},${c.row}'};
    final spots = <Cell2D>[];
    for (final c in rest) {
      for (final d in _steps) {
        final s = Cell2D(c.col + d[0], c.row + d[1]);
        if (taken.contains('${s.col},${s.row}') ||
            spots.any((q) => q.col == s.col && q.row == s.row)) {
          continue;
        }
        spots.add(s);
      }
    }
    if (spots.isNotEmpty) return _normalizeGrid([...rest, pick(rng, spots)]);
  }
  return null;
}

enum SectionFlaw { none, whole, neighbour, mirror, turned, oneCell }

String sectionFlawName(SectionFlaw f) => switch (f) {
  SectionFlaw.none => 'none',
  SectionFlaw.whole => 'whole',
  SectionFlaw.neighbour => 'neighbour',
  SectionFlaw.mirror => 'mirror',
  SectionFlaw.turned => 'turned',
  SectionFlaw.oneCell => 'one-cell',
};

class SectionOption {
  const SectionOption({required this.cells, required this.isMatch, required this.flaw});
  final List<Cell2D> cells;
  final bool isMatch;
  final SectionFlaw flaw;
}

class SectionTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.section;

  const SectionTask({
    required this.shape,
    required this.view,
    required this.layer,
    required this.cubes,
    required this.rest,
    required this.options,
    required this.correctIdx,
  });

  final Shape shape;
  final ProjectionView view;

  /// Координата слоя по оси вида ([sectionAxis]).
  final int layer;

  /// Кубики слоя — рисуются сплошными.
  final Shape cubes;

  /// Остальные кубики фигуры — рисуются пунктиром.
  final Shape rest;
  final List<SectionOption> options;
  @override
  final int correctIdx;
}

const List<Axis> _axes = [Axis.x, Axis.y, Axis.z];

SectionTask buildSectionTask(int level, Rng rng) {
  final p = levelParams(level);
  final candidates = projectionCandidates(p.minC, p.maxC).where(isVolumetric).toList();
  if (candidates.isEmpty) {
    throw StateError('section $level: нет объёмных фигур размера ${p.minC}–${p.maxC}');
  }

  for (var attempt = 0; attempt < 200; attempt++) {
    // Ориентация случайная: иначе одна фигура давала бы одни и те же слои.
    var shape = pick(rng, candidates);
    for (final axis in _axes) {
      shape = rotateShape(shape, axis, randomInt(rng, 0, 3));
    }
    shape = normalizeShape(shape);
    final view = pick(rng, projectionViews);
    final axis = sectionAxis[view]!;
    final layers = ({for (final c in shape) c[axis]}.toList())..sort();
    if (layers.length < 2) continue; // один слой — срез и есть вся фигура
    final whole = projectShape(shape, view);
    final good = [
      for (final k in shuffle(rng, layers))
        if (sectionOf(shape, view, k).length >= 2 &&
            gridKey(sectionOf(shape, view, k)) != gridKey(whole))
          k,
    ];
    if (good.isEmpty) continue;
    final layer = good.first;
    final correct = sectionOf(shape, view, layer);

    // Проекция всей фигуры — первая подделка и берётся ВСЕГДА: от среза она отличается по
    // построению (слой отобран так), а подделка, совпавшая с ней, — повтор, а не ловушка.
    final taken = <String>{gridKey(correct), gridKey(whole)};
    final pool = <SectionOption>[];
    void add(List<Cell2D>? cells, SectionFlaw flaw) {
      if (cells == null || cells.isEmpty) return;
      final key = gridKey(cells);
      if (taken.contains(key)) return; // совпала с верным или с соседней подделкой
      taken.add(key);
      pool.add(SectionOption(cells: cells, isMatch: false, flaw: flaw));
    }

    for (final k in shuffle(rng, [layer - 1, layer + 1]).where(layers.contains)) {
      add(sectionOf(shape, view, k), SectionFlaw.neighbour);
    }
    add(mirrorGrid(correct), SectionFlaw.mirror);
    add(turnGrid(correct), SectionFlaw.turned);
    for (var i = 0; i < 12; i++) {
      add(moveOneCell(correct, rng), SectionFlaw.oneCell);
    }

    // Остальные подделки — вразнобой по видам ошибки.
    final decoys = <SectionOption>[
      SectionOption(cells: whole, isMatch: false, flaw: SectionFlaw.whole),
    ];
    final byFlaw = <SectionFlaw, List<SectionOption>>{};
    for (final o in shuffle(rng, pool)) {
      byFlaw[o.flaw] = [...?byFlaw[o.flaw], o];
    }
    // По кругу по видам ошибки: одна подделка каждого вида, потом вторая и так далее.
    for (var round = 0; decoys.length < p.optionCount - 1; round++) {
      var added = false;
      for (final flaw in shuffle(rng, byFlaw.keys.toList())) {
        final list = byFlaw[flaw]!;
        if (round >= list.length || decoys.length >= p.optionCount - 1) continue;
        decoys.add(list[round]);
        added = true;
      }
      if (!added) break;
    }
    if (decoys.length < p.optionCount - 1) continue;

    final options = shuffle(rng, [
      SectionOption(cells: correct, isMatch: true, flaw: SectionFlaw.none),
      ...decoys,
    ]);
    final rest = [
      for (final c in shape)
        if (c[axis] != layer) c,
    ];
    return SectionTask(
      shape: shape,
      view: view,
      layer: layer,
      cubes: layerOf(shape, view, layer),
      rest: rest,
      options: options,
      correctIdx: options.indexWhere((o) => o.isMatch),
    );
  }
  throw StateError('section $level: не собралось задание за 200 попыток');
}
