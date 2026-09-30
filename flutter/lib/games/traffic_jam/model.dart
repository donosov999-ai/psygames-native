/// «ОСВОБОДИ ПУТЬ» — ПРАВИЛА ДОСКИ, БЕЗ FLUTTER.
///
/// Происхождение: движок MindLab `rush-hour/traffic.py` (clean-room) и пилот Codex
/// (ветка codex/mindlab-five), решение Дениса 30.09.2026 «добавляем нативно,
/// дорабатываем потом». Имя «Rush Hour» — марка ThinkFun, в продукте его нет.
///
/// Доска 6×6. Машина едет только вдоль своей оси и сквозь другие не проходит.
/// Машина 0 — красная, всегда горизонтальная, в третьем ряду; партия выиграна,
/// когда она доехала до правого края (выезд справа от третьего ряда).
///
/// 🔴 ХОД — ЭТО ПРОЕЗД МАШИНЫ НА ЛЮБОЕ ЧИСЛО КЛЕТОК, А НЕ ШАГ НА ОДНУ. Так считает
/// и поиск в ширину, которым выгружен банк досок (`tool/gen_traffic_jam.dart`), и
/// общепринятая мера трудности этой головоломки. Считай мы шаги — «минимум ходов»
/// доски и счётчик на экране разошлись бы.
///
/// Файл без `package:flutter`: его же гоняет генератор банка командой `dart run`.
library;

import 'dart:collection';

/// Сторона доски.
const int tjSize = 6;

/// Ряд красной машины (с нуля): третий сверху.
const int tjExitRow = 2;

class TjCar {
  const TjCar({required this.horizontal, required this.fixed, required this.length});

  /// Едет по горизонтали (иначе — по вертикали).
  final bool horizontal;

  /// Неподвижная координата: ряд у горизонтальной, столбец у вертикальной.
  final int fixed;

  /// Длина: 2 или 3 клетки.
  final int length;
}

/// Ход: машина [car] встаёт на позицию [to] (столбец левого края у горизонтальной,
/// ряд верхнего края у вертикальной).
class TjMove {
  const TjMove(this.car, this.to);
  final int car;
  final int to;

  @override
  bool operator ==(Object other) => other is TjMove && other.car == car && other.to == to;

  @override
  int get hashCode => car * 31 + to;

  @override
  String toString() => 'TjMove($car→$to)';
}

/// Доска: машины (неподвижное) и их позиции (меняются ходами).
class TjBoard {
  TjBoard(this.cars, List<int> positions) : positions = List<int>.unmodifiable(positions) {
    if (cars.isEmpty || positions.length != cars.length) {
      throw ArgumentError('машин ${cars.length}, позиций ${positions.length}');
    }
    final red = cars.first;
    if (!red.horizontal || red.fixed != tjExitRow || red.length != 2) {
      throw ArgumentError('красная машина обязана быть горизонтальной двойкой в ряду $tjExitRow');
    }
    final grid = List<int>.filled(tjSize * tjSize, -1);
    for (var i = 0; i < cars.length; i++) {
      for (final cell in cellsOf(i)) {
        if (cell < 0 || cell >= grid.length) throw ArgumentError('машина $i за доской');
        if (grid[cell] != -1) throw ArgumentError('машины ${grid[cell]} и $i на одной клетке');
        grid[cell] = i;
      }
    }
  }

  final List<TjCar> cars;
  final List<int> positions;

  /// Клетки машины [i] (индекс `ряд * 6 + столбец`).
  List<int> cellsOf(int i, [List<int>? pos]) {
    final car = cars[i];
    final p = (pos ?? positions)[i];
    if (p < 0 || p + car.length > tjSize) return const [-1];
    return [
      for (var k = 0; k < car.length; k++)
        car.horizontal ? car.fixed * tjSize + p + k : (p + k) * tjSize + car.fixed,
    ];
  }

  /// Какая машина стоит на клетке; `null` — пусто.
  int? carAt(int row, int col) {
    for (var i = 0; i < cars.length; i++) {
      final car = cars[i];
      final p = positions[i];
      if (car.horizontal) {
        if (row == car.fixed && col >= p && col < p + car.length) return i;
      } else {
        if (col == car.fixed && row >= p && row < p + car.length) return i;
      }
    }
    return null;
  }

  /// Кто стоит на каждой клетке (-1 — пусто). Считается один раз на положение:
  /// генератор банка обходит десятки тысяч положений, и строить сетку заново на
  /// каждую машину стоило бы в разы дороже.
  late final List<int> _grid = () {
    final g = List<int>.filled(tjSize * tjSize, -1);
    for (var i = 0; i < cars.length; i++) {
      for (final c in cellsOf(i)) {
        g[c] = i;
      }
    }
    return g;
  }();

  /// Куда машина [i] может доехать за один ход: самая левая/верхняя и самая
  /// правая/нижняя позиция, до которых путь свободен.
  (int min, int max) range(int i) {
    final g = _grid;
    final car = cars[i];
    final p = positions[i];
    int cell(int along) => car.horizontal ? car.fixed * tjSize + along : along * tjSize + car.fixed;
    var lo = p;
    while (lo - 1 >= 0 && g[cell(lo - 1)] == -1) {
      lo--;
    }
    var hi = p;
    while (hi + car.length < tjSize && g[cell(hi + car.length)] == -1) {
      hi++;
    }
    return (lo, hi);
  }

  /// Все ходы из этого положения.
  List<TjMove> moves() {
    final out = <TjMove>[];
    for (var i = 0; i < cars.length; i++) {
      final (lo, hi) = range(i);
      for (var to = lo; to <= hi; to++) {
        if (to != positions[i]) out.add(TjMove(i, to));
      }
    }
    return out;
  }

  /// Положение после хода; `null` — ход невозможен.
  TjBoard? apply(TjMove m) {
    if (m.car < 0 || m.car >= cars.length || m.to == positions[m.car]) return null;
    final (lo, hi) = range(m.car);
    if (m.to < lo || m.to > hi) return null;
    final next = List<int>.of(positions);
    next[m.car] = m.to;
    return TjBoard(cars, next);
  }

  /// Красная машина у выезда.
  bool get solved => positions[0] + cars[0].length == tjSize;

  /// Ключ положения для поиска: позиции машин (машины неподвижны у доски).
  String get key => positions.join(',');

  /// Доска строками «AA..B.» — формат банка. `X` — красная, `.` — пусто.
  List<String> toRows() {
    const letters = 'XABCDEFGHIJKLMNOPQRSTUVW';
    final g = _grid;
    return [
      for (var r = 0; r < tjSize; r++)
        [for (var c = 0; c < tjSize; c++) g[r * tjSize + c] == -1 ? '.' : letters[g[r * tjSize + c]]].join(),
    ];
  }

  /// Разбор строк банка. Красная — `X`, остальные — любые другие буквы.
  factory TjBoard.parse(List<String> rows) {
    if (rows.length != tjSize || rows.any((r) => r.length != tjSize)) {
      throw ArgumentError('доска обязана быть $tjSize×$tjSize');
    }
    final byId = <String, List<(int, int)>>{};
    for (var r = 0; r < tjSize; r++) {
      for (var c = 0; c < tjSize; c++) {
        final id = rows[r][c];
        if (id != '.') byId.putIfAbsent(id, () => []).add((r, c));
      }
    }
    if (!byId.containsKey('X')) throw ArgumentError('нет красной машины X');
    final ids = ['X', ...(byId.keys.where((x) => x != 'X').toList()..sort())];
    final cars = <TjCar>[];
    final pos = <int>[];
    for (final id in ids) {
      final cells = byId[id]!;
      final horizontal = cells.every((p) => p.$1 == cells.first.$1);
      final vertical = cells.every((p) => p.$2 == cells.first.$2);
      if ((!horizontal && !vertical) || cells.length < 2 || cells.length > 3) {
        throw ArgumentError('машина $id не прямая или не той длины');
      }
      // Клеток не меньше двух, поэтому «один ряд» и «один столбец» разом не бывают.
      final isH = horizontal;
      final along = cells.map((p) => isH ? p.$2 : p.$1).toList()..sort();
      for (var k = 1; k < along.length; k++) {
        if (along[k] != along[k - 1] + 1) throw ArgumentError('в машине $id разрыв');
      }
      cars.add(TjCar(horizontal: isH, fixed: isH ? cells.first.$1 : cells.first.$2, length: cells.length));
      pos.add(along.first);
    }
    return TjBoard(cars, pos);
  }
}

/// Кратчайшее решение поиском в ширину (ход = проезд машины на любое число клеток).
/// Пусто — доска уже решена или решения нет в пределах [maxStates].
List<TjMove> tjSolve(TjBoard from, {int maxStates = 200000}) {
  if (from.solved) return const [];
  final seen = <String>{from.key};
  final queue = Queue<(TjBoard, List<TjMove>)>()..add((from, const []));
  while (queue.isNotEmpty) {
    final (b, path) = queue.removeFirst();
    for (final m in b.moves()) {
      final next = b.apply(m)!;
      if (!seen.add(next.key)) continue;
      final route = [...path, m];
      if (next.solved) return route;
      if (seen.length >= maxStates) return const [];
      queue.add((next, route));
    }
  }
  return const [];
}

/// Доска банка: строки, минимум ходов и номер для повтора (`board_id`).
class TjLevel {
  const TjLevel({required this.id, required this.rows, required this.minMoves});
  final String id;
  final List<String> rows;
  final int minMoves;

  TjBoard get board => TjBoard.parse(rows);

  factory TjLevel.fromJson(Map<String, dynamic> j) => TjLevel(
        id: j['id'] as String,
        rows: [for (final r in j['rows'] as List) r as String],
        minMoves: j['minMoves'] as int,
      );

  Map<String, Object> toJson() => {'id': id, 'rows': rows, 'minMoves': minMoves};
}
