/// «ТРИ ВИДА» — перенос `core/formation.ts`. Даны виды сверху, спереди и справа — какая из
/// объёмных фигур их даёт. Обратная задача к «Проекции».
///
/// 🔴 ТРИ ВИДА НЕ ОПРЕДЕЛЯЮТ ФИГУРУ ОДНОЗНАЧНО. Кубик, спрятанный за другими по всем трём осям,
/// можно переставить, и все три тени останутся прежними — это второй верный ответ. Поэтому
/// подделка с совпавшими ТРЕМЯ видами выбрасывается.
///
/// 🔴 ОДНОГО ВИДА НЕ ДОЛЖНО ХВАТАТЬ (замер 17.09.2026: в 90 заданиях из 96 ответ находился по
/// одному виду). Собирается пул годных подделок, и из него берётся набор, где для каждого вида
/// есть подделка с ТЕМ ЖЕ видом, что у верной фигуры.
library;

import 'geometry.dart';
import 'levels.dart';
import 'pieces.dart';
import 'projection.dart';
import 'rng.dart';
import 'split.dart';
import 'task.dart';

const List<Axis> _axes = [Axis.x, Axis.y, Axis.z];

class ThreeViews {
  const ThreeViews(this.top, this.front, this.side);
  final List<Cell2D> top;
  final List<Cell2D> front;
  final List<Cell2D> side;
}

/// Три вида фигуры в осях экрана — те же, что у «Проекции».
ThreeViews threeViews(Shape shape) => ThreeViews(
  projectShape(shape, ProjectionView.top),
  projectShape(shape, ProjectionView.front),
  projectShape(shape, ProjectionView.side),
);

/// Совпадают ли ВСЕ ТРИ вида. Один совпавший вид — норма, три — второй верный ответ.
bool sameThreeViews(Shape a, Shape b) {
  final va = threeViews(a), vb = threeViews(b);
  return sameGrid(va.top, vb.top) && sameGrid(va.front, vb.front) && sameGrid(va.side, vb.side);
}

/// Та же фигура, повёрнутая хотя бы на четверть оборота так, что картинка другая.
Shape? _turned(Shape shape, Rng rng) {
  final seen = shapeKey(normalizeShape(shape));
  for (var i = 0; i < 12; i++) {
    var out = shape;
    for (final axis in _axes) {
      out = rotateShape(out, axis, randomInt(rng, 0, 3));
    }
    out = normalizeShape(out);
    if (shapeKey(out) != seen) return out;
  }
  return null;
}

/// Переставить ОДИН кубик так, чтобы вид вдоль оси (0 — x, справа; 1 — y, сверху; 2 — z,
/// спереди) не изменился. Вид вдоль оси совпадает ПО ПОСТРОЕНИЮ, два других обычно меняются.
///
/// ⚠️ Первый вариант сдвигал кубик только вдоль самой оси, и на цепочках из семи кубиков из
/// 68 сдвигов 68 рвали фигуру: вид справа на 20-м уровне не прикрывался никогда.
Shape? moveKeepingView(Shape shape, int axis, Rng rng) {
  String column(Cube c) => [
    for (var i = 0; i < 3; i++)
      if (i != axis) c[i],
  ].join(',');

  final occupied = {for (final c in shape) c.join(',')};
  final variants = <Shape>[];
  for (var from = 0; from < shape.length; from++) {
    final rest = [
      for (var i = 0; i < shape.length; i++)
        if (i != from) shape[i],
    ];
    if (!isFaceConnected(rest)) continue;
    final columns = {for (final c in rest) column(c)};
    final own = column(shape[from]);
    final spots = <String, Cube>{};
    for (final c in rest) {
      for (final d in const [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        final spot = <int>[c[0] + d[0], c[1] + d[1], c[2] + d[2]];
        final key = spot.join(',');
        if (occupied.contains(key)) continue;
        // столбец клетки уже занят остатком — или это столбец снятого кубика, и он не пустеет
        if (!columns.contains(column(spot)) && column(spot) != own) continue;
        if (!columns.contains(own) && column(spot) != own) continue;
        spots[key] = spot;
      }
    }
    for (final spot in spots.values) {
      variants.add([...rest, spot]);
    }
  }
  return variants.isNotEmpty ? pick(rng, variants) : null;
}

/// Сколько годных подделок собирать, прежде чем выбирать набор.
const int _pool = 36;

/// Сколько фигур и ориентаций перебрать в поисках набора, где ни один вид не выдаёт ответ.
const int _fullCoverTries = 24;

List<String> _viewsKey(Shape s) {
  final v = threeViews(s);
  String k(List<Cell2D> cells) => ([for (final c in cells) '${c.col},${c.row}']..sort()).join('|');
  return [k(v.top), k(v.front), k(v.side)];
}

class FormationTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.formation;

  const FormationTask({required this.views, required this.options, required this.correctIdx});
  final ThreeViews views;
  final List<PieceOption> options;
  @override
  final int correctIdx;
}

/// Набор из `count` подделок, при котором ни один вид по отдельности не выдаёт ответ.
/// Подделки группируются по маске совпавших видов (сверху=1, спереди=2, справа=4), перебираются
/// сочетания МАСОК, а не подделок: 120 вариантов вместо десятков тысяч.
({List<PieceOption> decoys, int covered})? _bestDecoys(
  List<({PieceOption option, int mask})> pool,
  int count,
  Rng rng,
) {
  if (pool.length < count) return null;
  final groups = <int, List<PieceOption>>{};
  for (final e in shuffle(rng, pool)) {
    groups[e.mask] = [...?groups[e.mask], e.option];
  }
  final masks = groups.keys.toList();
  List<int>? best;
  var bestCovered = -1;

  void walk(int from, List<int> chosen) {
    if (chosen.length == count) {
      final need = <int, int>{};
      for (final m in chosen) {
        need[m] = (need[m] ?? 0) + 1;
      }
      if (need.entries.any((e) => (groups[e.key]?.length ?? 0) < e.value)) return;
      final bits = chosen.fold<int>(0, (a, m) => a | m);
      final covered = (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);
      if (covered > bestCovered) {
        bestCovered = covered;
        best = [...chosen];
      }
      return;
    }
    for (var i = from; i < masks.length; i++) {
      chosen.add(masks[i]);
      walk(i, chosen);
      chosen.removeLast();
    }
  }

  walk(0, []);
  final chosenMasks = best;
  if (chosenMasks == null) return null;
  final used = <int, int>{};
  final decoys = [
    for (final m in chosenMasks)
      () {
        final i = used[m] ?? 0;
        used[m] = i + 1;
        return groups[m]![i];
      }(),
  ];
  return (decoys: decoys, covered: bestCovered);
}

FormationTask buildFormationTask(int level, Rng rng) {
  final p = levelParams(level);
  final spec = rotationLevelSpec(level);
  final candidates = projectionCandidates(p.minC, p.maxC).where(isVolumetric).toList();
  if (candidates.isEmpty) {
    throw StateError('formation $level: нет объёмных фигур размера ${p.minC}–${p.maxC}');
  }
  ({Shape truth, List<PieceOption> decoys, int covered})? best;

  for (var attempt = 0; attempt < 200; attempt++) {
    // Ориентация эталона случайная: иначе одна и та же фигура давала бы одни и те же виды.
    final truth = _turned(pick(rng, candidates), rng) ?? normalizeShape(pick(rng, candidates));
    final others = [
      for (final s in candidates)
        if (!isValidRotation(truth, s)) s,
    ];
    final truthViews = _viewsKey(truth);
    // Подделки «один кубик» — только первую половину попыток: у цепочек из семи-восьми кубиков
    // есть ось, вдоль которой НИ ОДНА перестановка не сохраняет вид (замер 17.09: 30 из 30).
    final oneCubeOnly = spec.foil == 'one-cube' && attempt < _fullCoverTries / 2;
    final pool = <({PieceOption option, int mask})>[];
    final keys = <String>{shapeKey(truth)};

    for (var k = 0; pool.length < _pool && k < 160; k++) {
      final roll = rng();
      // Половина попыток — перестановка, сохраняющая один вид: такая подделка им не выдаётся.
      final keep = roll < 0.5;
      final flaw = (keep || oneCubeOnly || roll < 0.7)
          ? PieceFlaw.oneCube
          : roll < 0.82
          ? PieceFlaw.otherView
          : roll < 0.92
          ? PieceFlaw.mirror
          : others.isNotEmpty
          ? PieceFlaw.other
          : PieceFlaw.oneCube;
      final raw = keep
          ? moveKeepingView(truth, k % 3, rng)
          : flaw == PieceFlaw.oneCube
          ? moveOneCube(truth, rng)
          : flaw == PieceFlaw.otherView
          ? _turned(truth, rng)
          : flaw == PieceFlaw.mirror
          ? mirrorShape(truth)
          : _turned(pick(rng, others), rng);
      if (raw == null) continue;
      final shape = normalizeShape(raw);
      if (!isVolumetric(shape) || keys.contains(shapeKey(shape))) continue;
      final v = _viewsKey(shape);
      final mask =
          (v[0] == truthViews[0] ? 1 : 0) |
          (v[1] == truthViews[1] ? 2 : 0) |
          (v[2] == truthViews[2] ? 4 : 0);
      if (mask == 7) continue; // все три вида те же — второй верный ответ
      keys.add(shapeKey(shape));
      pool.add((option: PieceOption(shape: shape, isMatch: false, flaw: flaw), mask: mask));
    }

    final chosen = _bestDecoys(pool, p.optionCount - 1, rng);
    if (chosen == null) continue;
    if (best == null || chosen.covered > best.covered) {
      best = (truth: truth, decoys: chosen.decoys, covered: chosen.covered);
    }
    // Все три вида прикрыты — лучше не бывает. Иначе пробуем другую фигуру и ориентацию, а
    // после _fullCoverTries берём лучшее из найденного: партия важнее идеала.
    if (best.covered == 3 || attempt >= _fullCoverTries) break;
  }

  if (best == null) {
    throw StateError(
      'formation $level: не собралось задание с единственным ответом за 200 попыток',
    );
  }
  final options = shuffle(rng, [
    PieceOption(shape: best.truth, isMatch: true, flaw: PieceFlaw.none),
    ...best.decoys,
  ]);
  return FormationTask(
    views: threeViews(best.truth),
    options: options,
    correctIdx: options.indexWhere((o) => o.isMatch),
  );
}
