/// «СЕТЬ СО СДВИГОМ» — перенос `netslide-levels.mjs`.
///
/// Трубы не поворачиваются, а ездят целыми строками и столбцами по кругу. Цель та же, что у
/// «Сети труб»: вода от источника доходит до каждой трубы, открытых концов нет.
///
/// ⚠️ ИСТОЧНИК ЕЗДИТ ВМЕСТЕ СО СТРОКОЙ. Это плитка с номером 0, а не клетка в углу: связность
/// считается от того места, где плитка сейчас стоит.
///
/// ⚠️ «МИНИМУМА ХОДОВ» ЗДЕСЬ НЕТ, И ЭТО ЧЕСТНО: победа — ЛЮБАЯ связная раскладка, а не одна
/// целевая. Поэтому ступень называет число сдвигов, которыми поле перемешано, а не длину решения.
library;

import 'board.dart';
import 'net.dart';

class NetslideSpec {
  const NetslideSpec({
    required this.level,
    required this.width,
    required this.shifts,
    this.guide = false,
  });

  final int level;
  final int width;
  final int shifts;
  final bool guide;
}

final List<NetslideSpec> netslideLevels = [
  for (var i = 0; i < 6; i++)
    NetslideSpec(level: i + 1, width: 3, shifts: i + 1, guide: i == 0),
  for (var i = 0; i < 20; i++) NetslideSpec(level: i + 7, width: 4, shifts: 4 + i),
  for (var i = 0; i < 16; i++) NetslideSpec(level: i + 27, width: 5, shifts: 8 + i),
  for (var i = 0; i < 8; i++) NetslideSpec(level: i + 43, width: 6, shifts: 12 + i),
];

/// Где сейчас источник — плитка с номером 0.
int sourceAt(Board b) => b.cells.indexWhere((c) => c.id == 0);

bool netslideWon(Board b) => network(b, sourceAt(b)).won;

LabTask netslideLevel(int level, int seed) {
  if (level < 1 || level > netslideLevels.length) throw RangeError('Сеть со сдвигом: 1…50');
  final spec = netslideLevels[level - 1];
  final random = labRng(seed);

  for (var attempt = 0; attempt < 200; attempt++) {
    final target = netPuzzle((seed + attempt) & 0xFFFFFFFF, width: spec.width).target;
    var initial = target;
    final commands = <Command>[];
    for (var k = 0; commands.length < spec.shifts && k < spec.shifts * 20; k++) {
      final cmd = Command.line(
        random() < .5 ? CommandKind.row : CommandKind.column,
        (random() * spec.width).floor(),
        amount: random() < .5 ? -1 : 1,
      );
      if (commands.isNotEmpty) {
        final last = commands.last;
        if (last.kind == cmd.kind && last.index == cmd.index && last.amount == -cmd.amount) {
          continue;
        }
      }
      // Полный оборот одной линией — пустой ход: столько же сдвигов подряд не берём.
      final run = commands.length >= spec.width - 1
          ? commands.sublist(commands.length - (spec.width - 1))
          : <Command>[];
      if (run.length == spec.width - 1 &&
          run.every((c) => c.kind == cmd.kind && c.index == cmd.index && c.amount == cmd.amount)) {
        continue;
      }
      initial = apply(initial, cmd);
      commands.add(cmd);
    }
    if (commands.length != spec.shifts || netslideWon(initial)) continue;
    final solution = [for (final c in commands.reversed) c.inverted];
    return LabTask(
      level: level,
      seed: seed,
      initial: initial,
      target: target,
      solution: solution,
      guide: spec.guide ? solution.first : null,
    );
  }
  throw StateError('Сеть со сдвигом $level: за 200 попыток поле не перемешалось');
}
