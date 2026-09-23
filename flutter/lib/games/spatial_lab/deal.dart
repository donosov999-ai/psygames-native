/// РАЗДАЧА ЛАБОРАТОРИИ — перенос `spatial-core/snapshot.mjs` (часть `createDeal`).
///
/// Четыре упражнения на одном поле и одном наборе ходов. Раздача решает три вещи: какое поле
/// выдать, что уже выбрано на старте и что вообще считать победой.
///
/// ⚠️ СВОБОДНАЯ ИГРА У СДВИГОВ — ПОЛЕ 15-й СТУПЕНИ, а не «случайная раздача без уровня». Своего
/// генератора «без уровня» у них нет и не нужно: ступень уже гарантирует, что поле перемешано и
/// собирается обратно.
library;

import 'board.dart';
import 'net.dart';
import 'netslide.dart';
import 'sixteen.dart';
import 'twiddle.dart';

/// Четыре упражнения. Порядок — порядок вкладок на экране.
enum LabMode { twiddle, net, sixteen, netslide }

String labModeWord(LabMode mode) => switch (mode) {
  LabMode.twiddle => 'Поворот чисел',
  LabMode.net => 'Сеть труб',
  LabMode.sixteen => 'Сдвиг чисел',
  LabMode.netslide => 'Сеть со сдвигом',
};

/// Упражнения сдвига: ход — строка или столбец по кругу, а не поворот плитки или блока.
bool isShift(LabMode mode) => mode == LabMode.sixteen || mode == LabMode.netslide;

/// Упражнения сети: победа считается связностью труб, а не порядком чисел.
bool isNetwork(LabMode mode) => mode == LabMode.net || mode == LabMode.netslide;

const int freeLevel = 15;

/// Банки точных позиций 3×3 — данные, а не код: полный обход состояний посчитан заранее.
class LabBanks {
  const LabBanks({required this.twiddle, required this.sixteen});
  final List<BankEntry> twiddle;
  final List<BankEntry> sixteen;

  static const LabBanks empty = LabBanks(twiddle: [], sixteen: []);
}

class Deal {
  Deal({required this.task, required this.state, required this.selection});

  /// Задание ступени; у свободной игры его нет.
  final LabTask? task;
  final LabSession state;

  /// Что выбрано на старте: блок подсказки, линия подсказки или первая подсвеченная клетка.
  final int selection;
}

LabTask levelTask(LabMode mode, int level, int seed, LabBanks banks) => switch (mode) {
  LabMode.net => netLevel(level, seed),
  LabMode.twiddle => twiddleLevel(level, seed, banks.twiddle),
  LabMode.sixteen => sixteenLevel(level, seed, banks.sixteen),
  LabMode.netslide => netslideLevel(level, seed),
};

Board freeBoard(LabMode mode, int seed, LabBanks banks) => switch (mode) {
  LabMode.net => netPuzzle(seed).initial,
  LabMode.twiddle => scramble(seed).initial,
  LabMode.sixteen => sixteenLevel(freeLevel, seed, banks.sixteen).initial,
  LabMode.netslide => netslideLevel(freeLevel, seed).initial,
};

Deal createDeal(LabMode mode, int seed, {int level = 0, LabBanks banks = LabBanks.empty}) {
  final task = level > 0 ? levelTask(mode, level, seed, banks) : null;
  final initial = task?.initial ?? freeBoard(mode, seed, banks);
  final guide = task?.guide;
  final n = initial.width;
  final selection = switch (guide?.kind) {
    CommandKind.block => guide!.row * n + guide.col,
    CommandKind.row => guide!.index * n,
    CommandKind.column => guide!.index,
    _ => task != null && task.highlighted.isNotEmpty ? task.highlighted.first : 0,
  };
  return Deal(task: task, state: LabSession(initial), selection: selection);
}

/// Поле собрано: у чисел — по порядку и без поворота, у сети — вода дошла до каждой трубы.
bool labWon(LabMode mode, Board b) => switch (mode) {
  LabMode.net => network(b).won,
  LabMode.netslide => netslideWon(b),
  _ => solved(b),
};
