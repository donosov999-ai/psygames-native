/// ЯДРО ЛАБОРАТОРИИ — перенос `src/games/spatial-core/core.mjs`.
///
/// Одно поле и один ход на четыре упражнения: поворот плитки («Сеть труб»), поворот блока 2×2
/// («Поворот чисел»), циклический сдвиг строки или столбца («Сдвиг чисел», «Сеть со сдвигом»).
/// Всё чистое и неизменяемое: ход возвращает НОВОЕ поле, а не правит старое, — на этом стоят
/// отмена, повтор и восстановление партии прогоном записанных ходов.
///
/// 🔴 ПОЛОЖИТЕЛЬНАЯ ЧЕТВЕРТЬ — ПО ЧАСОВОЙ СТРЕЛКЕ в экранных координатах (строка вниз). Знак
/// здесь один на все упражнения и на отмену: перепутай его — и «отменить» станет вторым ходом.
library;

/// Клетка: номер плитки, её поворот и (у сети) маска концов трубы.
class Cell {
  const Cell({required this.id, this.turns = 0, this.mask = 0});

  final int id;

  /// Четверти поворота, 0…3.
  final int turns;

  /// Биты концов трубы: 1 — север, 2 — восток, 4 — юг, 8 — запад.
  final int mask;

  Cell copyWith({int? id, int? turns, int? mask}) =>
      Cell(id: id ?? this.id, turns: turns ?? this.turns, mask: mask ?? this.mask);

  @override
  bool operator ==(Object other) =>
      other is Cell && other.id == id && other.turns == turns && other.mask == mask;

  @override
  int get hashCode => Object.hash(id, turns, mask);
}

class Board {
  const Board({required this.width, required this.height, required this.cells});

  final int width;
  final int height;
  final List<Cell> cells;

  int at(int row, int col) => row * width + col;

  Board copyWith({List<Cell>? cells}) =>
      Board(width: width, height: height, cells: cells ?? this.cells);
}

Board board(int width, [int? height]) {
  final h = height ?? width;
  if (width < 1 || width > 100 || h < 1 || h > 100) throw RangeError('размер поля');
  return Board(
    width: width,
    height: h,
    cells: [for (var id = 0; id < width * h; id++) Cell(id: id)],
  );
}

int _mod(int n, int d) => ((n % d) + d) % d;

enum CommandKind { tile, block, row, column }

/// Ход. Одна форма на все упражнения — иначе отмена и восстановление партии разошлись бы.
class Command {
  const Command({
    required this.kind,
    this.index = 0,
    this.row = 0,
    this.col = 0,
    this.size = 2,
    this.orient = false,
    this.amount = 1,
  });

  const Command.tile(this.index, {this.amount = 1})
    : kind = CommandKind.tile,
      row = 0,
      col = 0,
      size = 2,
      orient = false;

  const Command.block({
    required this.row,
    required this.col,
    this.size = 2,
    this.amount = 1,
    this.orient = false,
  }) : kind = CommandKind.block,
       index = 0;

  const Command.line(this.kind, this.index, {this.amount = 1})
    : row = 0,
      col = 0,
      size = 2,
      orient = false;

  final CommandKind kind;
  final int index;
  final int row;
  final int col;
  final int size;

  /// Поворачивать ли сами плитки вместе с блоком: у чисел — нет, у направленных труб — да.
  final bool orient;
  final int amount;

  Command get inverted => Command(
    kind: kind,
    index: index,
    row: row,
    col: col,
    size: size,
    orient: orient,
    amount: -amount,
  );

  @override
  bool operator ==(Object other) =>
      other is Command &&
      other.kind == kind &&
      other.index == index &&
      other.row == row &&
      other.col == col &&
      other.size == size &&
      other.orient == orient &&
      other.amount == amount;

  @override
  int get hashCode => Object.hash(kind, index, row, col, size, orient, amount);

  @override
  String toString() => switch (kind) {
    CommandKind.tile => 'плитка $index ×$amount',
    CommandKind.block => 'блок $row,$col ×$amount',
    CommandKind.row => 'строка $index ×$amount',
    CommandKind.column => 'столбец $index ×$amount',
  };
}

Board apply(Board b, Command command) {
  final cells = [...b.cells];
  int at(int r, int c) => r * b.width + c;

  switch (command.kind) {
    case CommandKind.tile:
      if (command.index < 0 || command.index >= cells.length) throw RangeError('индекс плитки');
      cells[command.index] = cells[command.index].copyWith(
        turns: _mod(cells[command.index].turns + command.amount, 4),
      );
    case CommandKind.block:
      final size = command.size;
      if (size < 2 || size > (b.width < b.height ? b.width : b.height)) {
        throw RangeError('размер блока');
      }
      if (command.row < 0 || command.row > b.height - size) throw RangeError('строка блока');
      if (command.col < 0 || command.col > b.width - size) throw RangeError('столбец блока');
      for (var t = 0; t < _mod(command.amount, 4); t++) {
        final before = [...cells];
        for (var r = 0; r < size; r++) {
          for (var c = 0; c < size; c++) {
            var cell = before[at(command.row + r, command.col + c)];
            // Числа остаются вертикально; направленные плитки едут вместе с блоком.
            if (command.orient) cell = cell.copyWith(turns: _mod(cell.turns + 1, 4));
            cells[at(command.row + c, command.col + size - 1 - r)] = cell;
          }
        }
      }
    case CommandKind.row:
    case CommandKind.column:
      final isRow = command.kind == CommandKind.row;
      final limit = (isRow ? b.height : b.width) - 1;
      if (command.index < 0 || command.index > limit) throw RangeError('номер линии');
      final length = isRow ? b.width : b.height;
      for (var i = 0; i < length; i++) {
        final from = isRow ? at(command.index, i) : at(i, command.index);
        final to = isRow
            ? at(command.index, _mod(i + command.amount, length))
            : at(_mod(i + command.amount, length), command.index);
        cells[to] = b.cells[from];
      }
  }
  return b.copyWith(cells: cells);
}

Board replay(Board initial, List<Command> commands) =>
    commands.fold(initial, (b, c) => apply(b, c));

/// Поле собрано: каждая плитка на своём месте и не повёрнута.
bool solved(Board b) {
  for (var i = 0; i < b.cells.length; i++) {
    if (b.cells[i].id != i || b.cells[i].turns != 0) return false;
  }
  return true;
}

/// Партия: начальное поле, текущее и две стопки ходов.
class LabSession {
  LabSession(Board initial) : initial = initial, present = initial;

  final Board initial;
  Board present;
  final List<Command> past = [];
  final List<Command> future = [];

  void commit(Command command) {
    present = apply(present, command);
    past.add(command);
    future.clear();
  }

  void undo() {
    if (past.isEmpty) return;
    final command = past.removeLast();
    present = apply(present, command.inverted);
    future.insert(0, command);
  }

  void redo() {
    if (future.isEmpty) return;
    final command = future.removeAt(0);
    present = apply(present, command);
    past.add(command);
  }
}

/// Тот же линейный конгруэнтный поток, что в TS: одно семя — одно поле на любом устройстве.
double Function() labRng(int seed) {
  if (seed < 0 || seed > 0xffffffff) throw RangeError('семя');
  var n = seed;
  return () {
    n = (n * 1664525 + 1013904223) & 0xFFFFFFFF;
    return n / 4294967296;
  };
}

/// Перемешивание блоками. Достижимость гарантирована построением; глубина — НЕ мера сложности.
({Board initial, List<Command> solution, List<Command> scramble}) scramble(
  int seed, {
  int depth = 12,
}) {
  final random = labRng(seed);
  final initial = board(4);
  final commands = <Command>[];
  for (var i = 0; i < depth; i++) {
    commands.add(
      Command.block(
        row: (random() * 3).floor(),
        col: (random() * 3).floor(),
        amount: random() < .5 ? -1 : 1,
      ),
    );
  }
  var present = replay(initial, commands);
  if (solved(present)) {
    commands.add(const Command.block(row: 0, col: 0, amount: 1));
    present = replay(initial, commands);
  }
  return (
    initial: present,
    solution: [for (final c in commands.reversed) c.inverted],
    scramble: commands,
  );
}
