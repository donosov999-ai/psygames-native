/// ДЕЛИТЕЛЬ ФИГУРЫ — перенос `core/split.ts`. Одна функция на два режима: «Недостающая
/// часть» (целое минус кусок) и «Сборка» (два куска, из которых складывается целое).
///
/// 🔴 ТРИ ТРЕБОВАНИЯ К РАЗРЕЗУ: обе части связны ПО ГРАНЯМ (касание ребром — в руке
/// рассыпается), части ровно покрывают фигуру, меньшая не мельче `minPart`.
///
/// 🔴 И ЧЕТВЁРТОЕ, НЕ ПРО РАЗРЕЗ, А ПРО ОТВЕТ — [composes]. Подделка, из которой вместе со
/// вторым куском тоже складывается целое, — это ВТОРОЙ ВЕРНЫЙ ОТВЕТ. Проверяется перебором
/// 24 ориентаций и всех положений внутри целого, а не «на вид другая».
library;

import 'geometry.dart';
import 'rng.dart';

const List<Cube> _faces = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

String _key(Cube c) => c.join(',');
Cube _step(Cube c, Cube d) => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];

/// Связность по граням. Повтор кубика — не фигура: такая «часть» не связна по определению.
bool isFaceConnected(Shape shape) {
  if (shape.isEmpty) return false;
  final cells = {for (final c in shape) _key(c)};
  if (cells.length != shape.length) return false;
  final seen = <String>{_key(shape.first)};
  final queue = <Cube>[shape.first];
  for (var i = 0; i < queue.length; i++) {
    for (final d in _faces) {
      final next = _step(queue[i], d);
      final k = _key(next);
      if (cells.contains(k) && !seen.contains(k)) {
        seen.add(k);
        queue.add(next);
      }
    }
  }
  return seen.length == cells.length;
}

/// Разрезать фигуру на две связные части: первая — `size` кубиков (или случайный размер из
/// допустимых), вторая — остальное. Возвращает `[кусок, остаток]` или `null`.
List<Shape>? splitShape(Shape shape, Rng rng, int minPart, [int? size]) {
  final n = shape.length;
  if (minPart < 1 || n < 2 * minPart) return null;
  if (size != null && (size < minPart || n - size < minPart)) return null;
  final all = <String, Cube>{
    for (final c in shape) _key(c): [c[0], c[1], c[2]],
  };

  for (var attempt = 0; attempt < 60; attempt++) {
    final want = size ?? randomInt(rng, minPart, n - minPart);
    final start = pick(rng, all.values.toList());
    final part = <String, Cube>{_key(start): start};
    while (part.length < want) {
      final frontier = <String, Cube>{};
      for (final c in part.values.toList()) {
        for (final d in _faces) {
          final k = _key(_step(c, d));
          if (all.containsKey(k) && !part.containsKey(k)) frontier[k] = all[k]!;
        }
      }
      if (frontier.isEmpty) break;
      final next = pick(rng, frontier.values.toList());
      part[_key(next)] = next;
    }
    if (part.length != want) continue;
    final piece = part.values.toList();
    final rest = [
      for (final c in all.values)
        if (!part.containsKey(_key(c))) c,
    ];
    if (isFaceConnected(piece) && isFaceConnected(rest)) return [piece, rest];
  }
  return null;
}

/// Складывается ли `whole` из `part` и `rest` — куски поворачиваются как угодно, отражать
/// нельзя (настоящую деталь не вывернуть наизнанку).
bool composes(Shape whole, Shape part, Shape rest) {
  if (part.length + rest.length != whole.length || part.isEmpty || rest.isEmpty) return false;
  final cells = {for (final c in whole) _key(c)};
  for (final turned in allOrientations(part)) {
    for (final anchor in whole) {
      final shift = <int>[
        anchor[0] - turned[0][0],
        anchor[1] - turned[0][1],
        anchor[2] - turned[0][2],
      ];
      final placed = [for (final c in turned) _step(c, shift)];
      if (!placed.every((c) => cells.contains(_key(c)))) continue;
      final used = {for (final c in placed) _key(c)};
      final left = [
        for (final c in whole)
          if (!used.contains(_key(c))) c,
      ];
      if (left.length == rest.length && isValidRotation(rest, left)) return true;
    }
  }
  return false;
}
