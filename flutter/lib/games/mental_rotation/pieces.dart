/// «НЕДОСТАЮЩАЯ ЧАСТЬ» И «СБОРКА» — перенос `core/pieces.ts`. Два режима на одном разрезе.
///
/// 🔴 ПУСТОТА РИСУЕТСЯ, А НЕ ДОГАДЫВАЕТСЯ. Отзыв Дениса 16.09.2026: не понял правил — ушёл.
/// Место недостающих кубиков видно прямо на фигуре, а вращать в голове приходится варианты.
///
/// 🔴 ВЕРНЫЙ ОТВЕТ ОДИН — ПЕРЕБОРОМ. Подделка отбрасывается, если она поворот верного куска или
/// если из неё вместе со вторым куском складывается целое ([composes]) — это второй верный ответ.
///
/// 🔴 ПУСТОТА НЕ БОЛЬШЕ СПЛОШНОЙ ЧАСТИ И СТОИТ К ЗРИТЕЛЮ (живой кадр 16.09.2026): иначе на
/// экране столбик из двух кубиков и пунктирный контур за ними — что заполнять, понять нельзя.
library;

import 'geometry.dart';
import 'levels.dart';
import 'rng.dart';
import 'rotation.dart';
import 'same.dart';
import 'split.dart';
import 'task.dart';

/// Самый мелкий кусок «недостающей части»: из двух кубиков фигура одна, из трёх — две,
/// подделок того же размера не набрать.
const int minMissingPiece = 4;

/// Чем плох вариант. `other-view` — та же фигура, но повёрнутая: её видит только «Три вида».
enum PieceFlaw { none, oneCube, mirror, other, otherView }

String pieceFlawName(PieceFlaw f) => switch (f) {
  PieceFlaw.none => 'none',
  PieceFlaw.oneCube => 'one-cube',
  PieceFlaw.mirror => 'mirror',
  PieceFlaw.other => 'other',
  PieceFlaw.otherView => 'other-view',
};

class PieceOption {
  const PieceOption({required this.shape, required this.isMatch, required this.flaw});
  final Shape shape;
  final bool isMatch;
  final PieceFlaw flaw;
}

class MissingTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.missing;

  const MissingTask({
    required this.whole,
    required this.hole,
    required this.options,
    required this.correctIdx,
  });

  final Shape whole;

  /// Кубики целого, нарисованные пустыми: их и надо заполнить.
  final Shape hole;
  final List<PieceOption> options;
  @override
  final int correctIdx;
}

class AssemblyTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.assembly;

  const AssemblyTask({required this.parts, required this.options, required this.correctIdx});
  final List<Shape> parts;
  final List<PieceOption> options;
  @override
  final int correctIdx;
}

/// Подделки для верной фигуры `truth`. `fitsAnyway` отвечает, не станет ли подделка вторым
/// верным ответом; `others` — фигуры того же размера для подделки «другая фигура».
List<PieceOption>? _decoys(
  Shape truth,
  int count,
  bool oneCubeOnly,
  List<Shape> others,
  bool Function(Shape candidate) fitsAnyway,
  Rng rng,
) {
  final taken = <Shape>[truth];
  final out = <PieceOption>[];
  for (var attempt = 0; out.length < count && attempt < 150; attempt++) {
    final roll = rng();
    final flaw = (oneCubeOnly || roll < 0.5)
        ? PieceFlaw.oneCube
        : (roll < 0.8 || others.isEmpty)
        ? PieceFlaw.mirror
        : PieceFlaw.other;
    final source = switch (flaw) {
      PieceFlaw.oneCube => relocateCube(truth, rng),
      PieceFlaw.mirror => mirrorShape(truth),
      _ => pick(rng, others),
    };
    if (source == null || source.length != truth.length || !isFaceConnected(source)) continue;
    if (taken.any((t) => isValidRotation(t, source))) continue;
    if (fitsAnyway(source)) continue;
    taken.add(source);
    out.add(PieceOption(shape: tumble(source, rng), isMatch: false, flaw: flaw));
  }
  return out.length == count ? out : null;
}

/// Глубина кубика к зрителю в изометрии рисователя: больше — ближе (так сортируются грани).
int _depth(Cube c) => c[0] + c[1] + c[2];

double _meanDepth(Shape s) => s.fold<int>(0, (sum, c) => sum + _depth(c)) / s.length;

/// Округление как `Math.round` в JS: половина уходит ВВЕРХ, а не «от нуля». На отрицательном
/// счёте (пустота дальше остатка) dart-овский `.round()` дал бы другую ориентацию.
int _jsRound(double x) => (x + 0.5).floor();

/// Поворот целого, при котором пустота ближе всего к зрителю относительно остатка. Перебор
/// 64 сочетаний четвертей; из равных берётся случайный, иначе фигура стояла бы одним боком.
({Shape whole, Shape hole}) holeFacingViewer(Shape whole, Shape hole, Rng rng) {
  String key(Cube c) => c.join(',');
  final holeKeys = {for (final c in hole) key(c)};
  var best = <({Shape whole, Shape hole})>[];
  var bestScore = -1 << 62;
  for (var rx = 0; rx < 4; rx++) {
    for (var ry = 0; ry < 4; ry++) {
      for (var rz = 0; rz < 4; rz++) {
        final turned = rotateShape(
          rotateShape(rotateShape(whole, Axis.x, rx), Axis.y, ry),
          Axis.z,
          rz,
        );
        final inHole = [for (var i = 0; i < whole.length; i++) holeKeys.contains(key(whole[i]))];
        final all = normalizeShape(turned);
        final turnedHole = [
          for (var i = 0; i < all.length; i++)
            if (inHole[i]) all[i],
        ];
        final turnedRest = [
          for (var i = 0; i < all.length; i++)
            if (!inHole[i]) all[i],
        ];
        final score = _jsRound((_meanDepth(turnedHole) - _meanDepth(turnedRest)) * 1000);
        if (score > bestScore) {
          bestScore = score;
          best = [];
        }
        if (score == bestScore) best.add((whole: all, hole: turnedHole));
      }
    }
  }
  return pick(rng, best);
}

/// Повернуть так, чтобы картинка НЕ совпала с `drawnAs`. `null` — фигура так симметрична,
/// что не выходит.
Shape? _turnedAway(Shape shape, Shape drawnAs, Rng rng) {
  final seen = shapeKey(normalizeShape(drawnAs));
  for (var i = 0; i < 16; i++) {
    final turned = tumble(shape, rng);
    if (shapeKey(turned) != seen) return turned;
  }
  return null;
}

MissingTask buildMissingTask(int level, Rng rng) {
  final p = levelParams(level);
  final spec = rotationLevelSpec(level);
  final wholes = rotationCandidates(p);
  for (var attempt = 0; attempt < 200; attempt++) {
    final picked = normalizeShape(pick(rng, wholes));
    final size = minMissingPiece > picked.length ~/ 3 ? minMissingPiece : picked.length ~/ 3;
    if (picked.length - size < size) continue; // пустота не больше сплошной части
    final cut = splitShape(picked, rng, minMissingPiece, size);
    if (cut == null) continue;
    final placed = holeFacingViewer(picked, cut[0], rng);
    final whole = placed.whole, hole = placed.hole;
    final holeKeys = {for (final c in hole) c.join(',')};
    final rest = [
      for (final c in whole)
        if (!holeKeys.contains(c.join(','))) c,
    ];
    final correct = _turnedAway(hole, hole, rng);
    if (correct == null) continue;
    final wrong = _decoys(
      hole,
      p.optionCount - 1,
      spec.foil == 'one-cube',
      const [],
      (candidate) => composes(whole, rest, candidate),
      rng,
    );
    if (wrong == null) continue;
    final options = shuffle(rng, [
      PieceOption(shape: correct, isMatch: true, flaw: PieceFlaw.none),
      ...wrong,
    ]);
    return MissingTask(
      whole: whole,
      hole: hole,
      options: options,
      correctIdx: options.indexWhere((o) => o.isMatch),
    );
  }
  throw StateError('missing $level: не собралось задание с единственным ответом за 200 попыток');
}

AssemblyTask buildAssemblyTask(int level, Rng rng) {
  final p = levelParams(level);
  final spec = rotationLevelSpec(level);
  final wholes = rotationCandidates(p);
  for (var attempt = 0; attempt < 200; attempt++) {
    final whole = normalizeShape(pick(rng, wholes));
    final cut = splitShape(whole, rng, 2, whole.length ~/ 2);
    if (cut == null) continue;
    final a = cut[0], b = cut[1];
    final others = [
      for (final s in wholes)
        if (s.length == whole.length && !isValidRotation(whole, s)) s,
    ];
    final wrong = _decoys(
      whole,
      p.optionCount - 1,
      spec.foil == 'one-cube',
      others,
      (candidate) => composes(candidate, a, b),
      rng,
    );
    if (wrong == null) continue;
    final options = shuffle(rng, [
      PieceOption(shape: tumble(whole, rng), isMatch: true, flaw: PieceFlaw.none),
      ...wrong,
    ]);
    return AssemblyTask(
      parts: [tumble(a, rng), tumble(b, rng)],
      options: options,
      correctIdx: options.indexWhere((o) => o.isMatch),
    );
  }
  throw StateError('assembly $level: не собралось задание с единственным ответом за 200 попыток');
}
