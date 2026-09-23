/// «ПОВОРОТ ЧИСЕЛ» — перенос `twiddle-levels.mjs` и `twiddle-solver.mjs`.
///
/// Ход — четверть поворота блока 2×2; числа при этом остаются вертикальными. Надо расставить их
/// по порядку.
///
/// 🔴 ДВЕ РАЗНЫЕ МЕРКИ, И ИХ НЕЛЬЗЯ ПУТАТЬ. На поле 3×3 ступень называет ТОЧНУЮ дистанцию —
/// её дал полный обход всех 9! состояний (банк). На 4×4 и 5×5 полного обхода нет, и ступень
/// задаётся суммарным смещением клеток, а «минимум ходов» честно отсутствует: вместо него —
/// нижняя оценка ceil(смещение/4), потому что один поворот двигает четыре числа на клетку.
library;

import 'board.dart';
import 'net.dart' show LabTask;

/// Восемь ходов поля 3×3: четыре блока × два направления. Порядок — как в TS.
const List<Command> twiddle3Moves = [
  Command.block(row: 0, col: 0, amount: 1),
  Command.block(row: 0, col: 0, amount: -1),
  Command.block(row: 0, col: 1, amount: 1),
  Command.block(row: 0, col: 1, amount: -1),
  Command.block(row: 1, col: 0, amount: 1),
  Command.block(row: 1, col: 0, amount: -1),
  Command.block(row: 1, col: 1, amount: 1),
  Command.block(row: 1, col: 1, amount: -1),
];

/// permutation[куда] = откуда — то же соглашение, что у [apply].
final List<List<int>> _permutations = [
  for (final m in twiddle3Moves)
    () {
      final indices = [for (var i = 0; i < 9; i++) i];
      final a = m.row * 3 + m.col, b = a + 1, c = a + 3, d = c + 1;
      if (m.amount == 1) {
        indices[a] = c;
        indices[b] = a;
        indices[d] = b;
        indices[c] = d;
      } else {
        indices[a] = b;
        indices[b] = d;
        indices[d] = c;
        indices[c] = a;
      }
      return indices;
    }(),
];

String turnKey(String key, int moveIndex) =>
    _permutations[moveIndex].map((i) => key[i]).join();

/// Узел обхода: расстояние до собранного поля, откуда пришли и каким ходом.
class TwiddleStep {
  const TwiddleStep(this.distance, this.parent, this.move);
  final int distance;
  final String? parent;
  final int? move;
}

/// Точные расстояния обходом в ширину от собранного поля. Для мелкой глубины — на лету.
class TwiddleTable {
  TwiddleTable._(this.entries);

  final Map<String, TwiddleStep> entries;

  static TwiddleTable build({int maxDepth = 3}) {
    final entries = <String, TwiddleStep>{'012345678': const TwiddleStep(0, null, null)};
    final queue = <String>['012345678'];
    for (var head = 0; head < queue.length; head++) {
      final key = queue[head];
      final entry = entries[key]!;
      if (entry.distance >= maxDepth) continue;
      for (var move = 0; move < _permutations.length; move++) {
        final next = _permutations[move].map((i) => key[i]).join();
        if (entries.containsKey(next)) continue;
        entries[next] = TwiddleStep(entry.distance + 1, key, move);
        queue.add(next);
      }
    }
    return TwiddleTable._(entries);
  }

  /// Путь от позиции к собранному полю.
  List<Command>? solution(String key) {
    var entry = entries[key];
    if (entry == null) return null;
    final commands = <Command>[];
    while (entry!.parent != null) {
      commands.add(twiddle3Moves[entry.move!].inverted);
      entry = entries[entry.parent];
    }
    return commands;
  }
}

/// Запись банка: позиция, её точная дистанция и решение номерами ходов.
class BankEntry {
  const BankEntry(this.key, this.distance, this.solution);
  final String key;
  final int distance;
  final List<int> solution;

  static List<BankEntry> parse(List<dynamic> raw) => [
    for (final e in raw)
      BankEntry(
        (e as Map<String, dynamic>)['key'] as String,
        e['distance'] as int,
        [for (final i in e['solution'] as List) i as int],
      ),
  ];
}

class TwiddleSpec {
  const TwiddleSpec({
    required this.level,
    required this.width,
    this.distance,
    this.displacement,
    this.guide = false,
    this.distinctBlocks = 1,
    this.liveColour = true,
  });

  final int level;
  final int width;

  /// Точная дистанция (поле 3×3).
  final int? distance;

  /// Суммарное смещение клеток (поля 4×4 и 5×5).
  final int? displacement;
  final bool guide;
  final int distinctBlocks;
  final bool liveColour;
}

final List<TwiddleSpec> twiddleLevels = [
  const TwiddleSpec(level: 1, width: 3, distance: 1, guide: true),
  const TwiddleSpec(level: 2, width: 3, distance: 1),
  const TwiddleSpec(level: 3, width: 3, distance: 2),
  const TwiddleSpec(level: 4, width: 3, distance: 2, distinctBlocks: 2),
  const TwiddleSpec(level: 5, width: 3, distance: 3, distinctBlocks: 2),
  for (var i = 0; i < 8; i++) TwiddleSpec(level: i + 6, width: 3, distance: i + 4),
  const TwiddleSpec(level: 14, width: 3, distance: 11, liveColour: false),
  for (var i = 0; i < 36; i++)
    TwiddleSpec(
      level: i + 15,
      width: i < 10 ? 4 : 5,
      displacement: i < 10 ? 42 + i * 2 : 62 + (i - 10) * 2,
      liveColour: false,
    ),
];

/// Суммарное смещение чисел от своих мест. Один поворот двигает четыре числа на одно ребро,
/// поэтому он уменьшает смещение не больше чем на четыре: это НИЖНЯЯ оценка, а не решение.
int twiddleDisplacement(Board b) {
  var sum = 0;
  for (var i = 0; i < b.cells.length; i++) {
    final c = b.cells[i];
    sum += (i % b.width - c.id % b.width).abs() + (i ~/ b.width - c.id ~/ b.width).abs();
  }
  return sum;
}

Board _fromKey(String key) => Board(
  width: 3,
  height: 3,
  cells: [for (final ch in key.split('')) Cell(id: int.parse(ch))],
);

TwiddleTable? _table;

LabTask twiddleLevel(int level, int seed, List<BankEntry> bank) {
  if (level < 1 || level > twiddleLevels.length) throw RangeError('Поворот: уровень 1…50');
  final spec = twiddleLevels[level - 1];
  final random = labRng(seed);

  if (level <= 5) {
    _table ??= TwiddleTable.build(maxDepth: 3);
    final table = _table!;
    final candidates = <({String key, List<Command> solution})>[];
    for (final e in table.entries.entries) {
      if (e.value.distance != spec.distance) continue;
      final solution = table.solution(e.key)!;
      final distinct = solution.map((c) => '${c.row},${c.col}').toSet().length;
      if (level == 3 ? distinct != 1 : distinct < spec.distinctBlocks) continue;
      candidates.add((key: e.key, solution: solution));
    }
    if (candidates.isEmpty) throw StateError('нет позиции с точной дистанцией ${spec.distance}');
    final chosen = candidates[(random() * candidates.length).floor()];
    return LabTask(
      level: level,
      seed: seed,
      initial: _fromKey(chosen.key),
      solution: chosen.solution,
      minimumMoves: spec.distance,
      guide: spec.guide ? chosen.solution.first : null,
    );
  }

  if (spec.width == 3) {
    final candidates = bank.where((t) => t.distance == spec.distance).toList();
    if (candidates.isEmpty) throw StateError('в банке нет дистанции ${spec.distance}');
    final chosen = candidates[(random() * candidates.length).floor()];
    return LabTask(
      level: level,
      seed: seed,
      initial: _fromKey(chosen.key),
      solution: [for (final i in chosen.solution) twiddle3Moves[i]],
      minimumMoves: spec.distance,
    );
  }

  // Ограниченная блуждающая раздача. Приёмка — по СМЕЩЕНИЮ доски, а не по длине блуждания;
  // стирание петель держит путь возврата конечным и без кружения.
  var initial = board(spec.width);
  var route = <Command>[];
  var keys = <String>[initial.cells.map((c) => c.id).join(',')];
  for (var step = 0; step < 20000; step++) {
    if (step % 1000 == 0) {
      initial = board(spec.width);
      route = [];
      keys = [initial.cells.map((c) => c.id).join(',')];
    }
    final cmd = Command.block(
      row: (random() * (spec.width - 1)).floor(),
      col: (random() * (spec.width - 1)).floor(),
      amount: random() < .5 ? -1 : 1,
    );
    if (route.isNotEmpty) {
      final last = route.last;
      if (last.row == cmd.row && last.col == cmd.col && last.amount == -cmd.amount) continue;
    }
    final candidate = apply(initial, cmd);
    if ((twiddleDisplacement(candidate) - spec.displacement!).abs() >
            (twiddleDisplacement(initial) - spec.displacement!).abs() &&
        random() > .08) {
      continue;
    }
    initial = candidate;
    final key = initial.cells.map((c) => c.id).join(',');
    final seen = keys.indexOf(key);
    if (seen >= 0) {
      route = route.sublist(0, seen);
      keys = keys.sublist(0, seen + 1);
    } else {
      route.add(cmd);
      keys.add(key);
    }
    if (twiddleDisplacement(initial) == spec.displacement) {
      return LabTask(
        level: level,
        seed: seed,
        initial: initial,
        solution: [for (final c in route.reversed) c.inverted],
        lowerBound: (spec.displacement! / 4).ceil(),
      );
    }
  }
  throw StateError('Поворот $level: бюджет генерации исчерпан');
}
