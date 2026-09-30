/// ХОДЫ ФИГУР ВСЛЕПУЮ.
///
/// 🔴 В ВЕБЕ ЭТИ ПРАВИЛА ЖИВУТ В ФАЙЛЕ ЭКРАНА, И ПРОБА ДО НИХ НЕ ДОТЯГИВАЕТСЯ —
/// файл маршрута отдаёт наружу только компонент. Раздел уже вытаскивал по этой
/// причине лестницу и вопросы; здесь правила сразу лежат отдельно и закрыты
/// сверкой с эталоном.
///
/// Взятий в игре нет: фишка идёт только на ПУСТУЮ клетку, ладья, слон и ферзь не
/// перепрыгивают чужих. Пешка не доходит до крайней горизонтали — превращений
/// в игре тоже нет.
library;

import 'dart:math';

import 'questions.dart';

const List<List<int>> _rook = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
const List<List<int>> _bishop = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const List<List<int>> _knight = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

/// Куда может пойти фигура. Клетки отсортированы — порядок не значим, а
/// сравнивать удобнее.
List<int> movesFor({
  required int sq,
  required String type,
  required bool white,
  required Set<int> occupied,
}) {
  final r = sq ~/ 8;
  final c = sq % 8;
  final out = <int>[];

  void push(int rr, int cc) {
    if (rr < 0 || rr > 7 || cc < 0 || cc > 7) return;
    final s = rr * 8 + cc;
    if (!occupied.contains(s)) out.add(s);
  }

  void slide(List<List<int>> dirs) {
    for (final d in dirs) {
      var rr = r + d[0];
      var cc = c + d[1];
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        final s = rr * 8 + cc;
        if (occupied.contains(s)) break;
        out.add(s);
        rr += d[0];
        cc += d[1];
      }
    }
  }

  switch (type) {
    case 'K':
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (dr != 0 || dc != 0) push(r + dr, c + dc);
        }
      }
    case 'N':
      for (final d in _knight) {
        push(r + d[0], c + d[1]);
      }
    case 'R':
      slide(_rook);
    case 'B':
      slide(_bishop);
    case 'Q':
      slide([..._rook, ..._bishop]);
    case 'P':
      // Белые идут вверх (row − 1), чёрные вниз. На крайние горизонтали не
      // заходят: превращений в игре нет.
      final rr = r + (white ? -1 : 1);
      if (rr >= 1 && rr <= 6) {
        final s = rr * 8 + c;
        if (!occupied.contains(s)) out.add(s);
      }
  }
  out.sort();
  return out;
}

/// Один ход вслепую: какая фишка, откуда и куда.
class BlindMove {
  const BlindMove({
    required this.pieceIndex,
    required this.from,
    required this.to,
  });

  final int pieceIndex;
  final int from;
  final int to;
}

/// Цепочка из `count` ходов, применённая к копии позиции.
///
/// Ходит каждый раз ОДНА фишка — та, у которой ход нашёлся первой в перемешанном
/// порядке. Если ходов нет ни у кого, цепочка обрывается: это не ошибка, а
/// свойство позиции, и оно должно быть видно длиной списка.
({List<BlindMove> moves, List<PuzzlePiece> after}) generateBlindMoves({
  required List<PuzzlePiece> pieces,
  required int count,
  Random? random,
}) {
  final rnd = random ?? Random();
  final current = [
    for (final p in pieces) PuzzlePiece(sq: p.sq, type: p.type, white: p.white),
  ];
  final moves = <BlindMove>[];

  for (var step = 0; step < count; step++) {
    final occupied = {for (final p in current) p.sq};
    final order = List<int>.generate(current.length, (i) => i);
    for (var i = order.length - 1; i > 0; i--) {
      final j = rnd.nextInt(i + 1);
      final tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    var moved = false;
    for (final i in order) {
      final p = current[i];
      final options = movesFor(
        sq: p.sq,
        type: p.type,
        white: p.white,
        occupied: occupied,
      );
      if (options.isEmpty) continue;
      final to = options[rnd.nextInt(options.length)];
      moves.add(BlindMove(pieceIndex: i, from: p.sq, to: to));
      current[i] = PuzzlePiece(sq: to, type: p.type, white: p.white);
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return (moves: moves, after: current);
}
