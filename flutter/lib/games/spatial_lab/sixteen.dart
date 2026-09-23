/// «СДВИГ ЧИСЕЛ» — перенос `sixteen-levels.mjs` и `sixteen-solver.mjs`.
///
/// Ход — циклический сдвиг строки или столбца на одну клетку; числа надо расставить по порядку.
///
/// 🔴 ЛЕСТНИЦА ПОСТРОЕНА НА ЗАМЕРЕ, А НЕ НА ГЛАЗ. Полный обход 3×3 (17.09.2026): достижимы
/// 181 440 позиций (каждый сдвиг — тройной цикл, то есть чётная перестановка), самая дальняя —
/// восемь ходов. Отсюда ровно восемь ступеней с ТОЧНОЙ дистанцией, дальше поле растёт.
///
/// ⚠️ СТЫКИ ТОЖЕ ПО ЗАМЕРУ. Первая версия начинала 4×4 со сдвига 8 — нижняя оценка два хода,
/// то есть девятая ступень была ЛЕГЧЕ восьмой.
library;

import 'board.dart';
import 'net.dart' show LabTask;
import 'twiddle.dart' show BankEntry;

/// Двенадцать ходов поля 3×3: три строки и три столбца × два направления. Порядок — как в TS.
const List<Command> sixteen3Moves = [
  Command.line(CommandKind.row, 0, amount: 1),
  Command.line(CommandKind.row, 0, amount: -1),
  Command.line(CommandKind.row, 1, amount: 1),
  Command.line(CommandKind.row, 1, amount: -1),
  Command.line(CommandKind.row, 2, amount: 1),
  Command.line(CommandKind.row, 2, amount: -1),
  Command.line(CommandKind.column, 0, amount: 1),
  Command.line(CommandKind.column, 0, amount: -1),
  Command.line(CommandKind.column, 1, amount: 1),
  Command.line(CommandKind.column, 1, amount: -1),
  Command.line(CommandKind.column, 2, amount: 1),
  Command.line(CommandKind.column, 2, amount: -1),
];

final List<List<int>> _permutations = [
  for (final m in sixteen3Moves)
    () {
      final indices = [for (var i = 0; i < 9; i++) i];
      for (var i = 0; i < 3; i++) {
        final j = ((i + m.amount) % 3 + 3) % 3;
        final from = m.kind == CommandKind.row ? m.index * 3 + i : i * 3 + m.index;
        final to = m.kind == CommandKind.row ? m.index * 3 + j : j * 3 + m.index;
        indices[to] = from;
      }
      return indices;
    }(),
];

String slideKey(String key, int moveIndex) =>
    _permutations[moveIndex].map((i) => key[i]).join();

class SixteenSpec {
  const SixteenSpec({
    required this.level,
    required this.width,
    this.distance,
    this.displacement,
    this.guide = false,
  });

  final int level;
  final int width;
  final int? distance;
  final int? displacement;
  final bool guide;
}

final List<SixteenSpec> sixteenLevels = [
  for (var i = 0; i < 8; i++)
    SixteenSpec(level: i + 1, width: 3, distance: i + 1, guide: i == 0),
  for (var i = 0; i < 20; i++)
    SixteenSpec(level: i + 9, width: 4, displacement: 18 + i * 2),
  for (var i = 0; i < 22; i++)
    SixteenSpec(level: i + 29, width: 5, displacement: 50 + i * 2),
];

/// Суммарный циклический сдвиг и НИЖНЯЯ ОЦЕНКА числа ходов: сдвиг строки двигает ровно `width`
/// чисел на клетку по горизонтали, поэтому сумма меняется за ход не больше чем на `width`.
({int total, int lowerBound}) sixteenDisplacement(Board b) {
  var across = 0, down = 0;
  for (var i = 0; i < b.cells.length; i++) {
    final c = b.cells[i];
    final col = i % b.width, row = i ~/ b.width;
    final tc = c.id % b.width, tr = c.id ~/ b.width;
    final dc = (col - tc).abs(), dr = (row - tr).abs();
    across += dc < b.width - dc ? dc : b.width - dc;
    down += dr < b.height - dr ? dr : b.height - dr;
  }
  return (
    total: across + down,
    lowerBound: (across / b.width).ceil() + (down / b.height).ceil(),
  );
}

Board _fromKey(String key) => Board(
  width: 3,
  height: 3,
  cells: [for (final ch in key.split('')) Cell(id: int.parse(ch))],
);

LabTask sixteenLevel(int level, int seed, List<BankEntry> bank) {
  if (level < 1 || level > sixteenLevels.length) throw RangeError('Сдвиг: уровень 1…50');
  final spec = sixteenLevels[level - 1];
  final random = labRng(seed);

  if (spec.width == 3) {
    final candidates = bank.where((t) => t.distance == spec.distance).toList();
    if (candidates.isEmpty) throw StateError('в банке нет дистанции ${spec.distance}');
    final chosen = candidates[(random() * candidates.length).floor()];
    final solution = [for (final i in chosen.solution) sixteen3Moves[i]];
    return LabTask(
      level: level,
      seed: seed,
      initial: _fromKey(chosen.key),
      solution: solution,
      minimumMoves: spec.distance,
      guide: spec.guide ? solution.first : null,
    );
  }

  // Ограниченная блуждающая раздача к нужному смещению; стирание петель держит путь конечным.
  final lines = spec.width;
  var initial = board(spec.width);
  var route = <Command>[];
  var keys = <String>[initial.cells.map((c) => c.id).join(',')];
  for (var step = 0; step < 40000; step++) {
    if (step % 2000 == 0) {
      initial = board(spec.width);
      route = [];
      keys = [initial.cells.map((c) => c.id).join(',')];
    }
    final cmd = Command.line(
      random() < .5 ? CommandKind.row : CommandKind.column,
      (random() * lines).floor(),
      amount: random() < .5 ? -1 : 1,
    );
    if (route.isNotEmpty) {
      final last = route.last;
      if (last.kind == cmd.kind && last.index == cmd.index && last.amount == -cmd.amount) continue;
    }
    final candidate = apply(initial, cmd);
    if ((sixteenDisplacement(candidate).total - spec.displacement!).abs() >
            (sixteenDisplacement(initial).total - spec.displacement!).abs() &&
        random() > .1) {
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
    final d = sixteenDisplacement(initial);
    if (d.total == spec.displacement) {
      return LabTask(
        level: level,
        seed: seed,
        initial: initial,
        solution: [for (final c in route.reversed) c.inverted],
        lowerBound: d.lowerBound,
      );
    }
  }
  throw StateError('Сдвиг $level: бюджет генерации исчерпан');
}
