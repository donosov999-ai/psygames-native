import 'dart:math';

/// «НАЙДИ ДРУГУЮ» — поиск той, что не как все, без образца.
///
/// Перенос движка MindLab `abstract-games-hub/engines/mindlab/kids/find.py` («Find»,
/// clean-room). Решение Дениса 30.09.2026: движки MindLab добавляем в разделы нативно,
/// дорабатываем потом (задача c8a2783f, раздел «Поиск»).
///
/// Поле фигур; одна отличается. В «Зрительном поиске» цель показана образцом заранее,
/// здесь образца НЕТ — «другая» выводится из самого поля, сравнением. Это отдельная
/// задача внимания (odd-one-out), а не копия соседней игры.
///
/// ЛЕСТНИЦА — оси движка («размер поля, число признаков, схожесть дистракторов»),
/// разложенные по ступеням так, чтобы соседние не совпадали:
/// · поле 3×3 → 8×8;
/// · признак отличия: цвет (выскакивает сам) → форма → размер (тише всего);
/// · с L10 помехи РАЗНОРОДНЫЕ: все различаются лишним признаком, и «выскочить» цели
///   нечем — отличие ищется по одному признаку, остальное надо не видеть;
/// · с L13 — поиск по СОЧЕТАНИЮ: помехи двух видов, у каждого с целью общий один
///   признак, другая — единственная с их сочетанием;
/// · с L16 — время на доску: 10 с и минус 0,5 с за ступень, граница 3 с (L30).
///
/// ⚠️ ЦВЕТА — палитра Okabe–Ito (оранжево-красный, синий, жёлтый, пурпурный), без пары
/// «красный — зелёный»: у «Найди признак» тот же урок — отличие цветом у человека с
/// нарушением цветового зрения превращалось бы в нерешаемую доску.
enum FindColor { vermillion, blue, yellow, purple }

enum FindShape { circle, square, triangle, star }

enum FindSize { small, big }

/// Чем другая отличается на доске.
enum FindAxis { color, shape, size, conjunction }

class FindItem {
  const FindItem(this.color, this.shape, this.size);
  final FindColor color;
  final FindShape shape;
  final FindSize size;

  @override
  bool operator ==(Object other) =>
      other is FindItem && other.color == color && other.shape == shape && other.size == size;

  @override
  int get hashCode => color.index * 100 + shape.index * 10 + size.index;

  @override
  String toString() => '${color.name}/${shape.name}/${size.name}';
}

/// Досок на ступень и сколько ошибок ступень прощает.
const int findBoards = 5;
const int findErrorsAllowed = 1;

/// Ступень — все оси разом.
class FindLevel {
  const FindLevel({
    required this.side,
    required this.axis,
    required this.mixed,
    this.seconds,
  });

  /// Сторона поля: side × side фигур.
  final int side;
  final FindAxis axis;

  /// Помехи разнородны: различаются признаком, который НЕ отличает цель.
  final bool mixed;

  /// Секунд на доску; `null` — без времени.
  final double? seconds;

  String get signature => '$side|${axis.name}|$mixed|$seconds';
}

/// Ступени 1–9: по три на признак (цвет, форма, размер), поле растёт внутри тройки.
/// Дальше признак идёт по кругу, а поле, разнородность, сочетание и время — по своим осям.
FindLevel findLevelFor(int level) {
  final l = max(1, level);
  final sides = [3, 4, 5];
  if (l <= 9) {
    return FindLevel(side: sides[(l - 1) % 3], axis: FindAxis.values[(l - 1) ~/ 3], mixed: false);
  }
  final side = min(8, 5 + (l - 10) ~/ 3);
  final axis = l >= 13 && l % 2 == 1 ? FindAxis.conjunction : FindAxis.values[(l - 10) % 3];
  double? seconds;
  if (l >= 16) seconds = max(3.0, 10 - 0.5 * (l - 16));
  return FindLevel(side: side, axis: axis, mixed: true, seconds: seconds);
}

class FindBoard {
  FindBoard({required this.side, required this.items, required this.target, required this.axis});

  final int side;
  final List<FindItem> items;
  final int target;
  final FindAxis axis;

  /// Проверка по правилу, а не по номеру: ровно одна фигура на доске отличается от
  /// всех остальных по признаку оси (для сочетания — по паре признаков).
  bool get unique => items.where((m) => _key(m) == _key(items[target])).length == 1;

  Object _key(FindItem m) => switch (axis) {
        FindAxis.color => m.color,
        FindAxis.shape => m.shape,
        FindAxis.size => m.size,
        FindAxis.conjunction => (m.color, m.shape),
      };

  /// Раздача. Цель — одна; для оси признака у всех помех значение этого признака одно
  /// и то же, у цели — другое. Разнородные помехи различаются ДРУГИМИ признаками.
  /// Сочетание: помехи двух видов (цвет A + форма X и цвет B + форма Y), цель — A + Y.
  factory FindBoard.deal(int level, Random rnd) {
    final lv = findLevelFor(level);
    final n = lv.side * lv.side;
    T pick<T>(List<T> v) => v[rnd.nextInt(v.length)];
    T other<T>(List<T> v, T not) => pick(v.where((x) => x != not).toList());
    final baseColor = pick(FindColor.values);
    final baseShape = pick(FindShape.values);
    final baseSize = pick(FindSize.values);
    final target = rnd.nextInt(n);
    final items = <FindItem>[];
    switch (lv.axis) {
      case FindAxis.conjunction:
        // Два вида помех и цель — третье сочетание тех же двух цветов и двух форм.
        final colorB = other(FindColor.values, baseColor);
        final shapeB = other(FindShape.values, baseShape);
        final size = baseSize;
        for (var i = 0; i < n; i++) {
          if (i == target) {
            items.add(FindItem(baseColor, shapeB, size));
          } else {
            final first = i.isEven != (i ~/ lv.side).isEven;
            items.add(first ? FindItem(baseColor, baseShape, size) : FindItem(colorB, shapeB, size));
          }
        }
        // Помехи перемешаны, чтобы виды не стояли шахматкой — иначе цель видна узором.
        final rest = [for (var i = 0; i < n; i++) if (i != target) items[i]]..shuffle(rnd);
        var k = 0;
        for (var i = 0; i < n; i++) {
          if (i != target) items[i] = rest[k++];
        }
      case FindAxis.color || FindAxis.shape || FindAxis.size:
        final tColor = lv.axis == FindAxis.color ? other(FindColor.values, baseColor) : null;
        final tShape = lv.axis == FindAxis.shape ? other(FindShape.values, baseShape) : null;
        final tSize = lv.axis == FindAxis.size ? other(FindSize.values, baseSize) : null;
        for (var i = 0; i < n; i++) {
          // Разнородность: помеха меняет признаки, КРОМЕ диагностического.
          FindColor c = baseColor;
          FindShape s = baseShape;
          FindSize z = baseSize;
          if (lv.mixed) {
            if (lv.axis != FindAxis.color) c = pick(FindColor.values);
            if (lv.axis != FindAxis.shape) s = pick(FindShape.values);
            if (lv.axis != FindAxis.size) z = pick(FindSize.values);
          }
          if (i == target) {
            items.add(FindItem(tColor ?? c, tShape ?? s, tSize ?? z));
          } else {
            items.add(FindItem(c, s, z));
          }
        }
    }
    return FindBoard(side: lv.side, items: items, target: target, axis: lv.axis);
  }
}
