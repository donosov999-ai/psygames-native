/// РЕШАТЕЛЬ КОМБИНАЦИЙ «ОТДАЙ И ЗАБЕРИ» — перебор без экрана.
///
/// Задача 41ac876c. Один и тот же код у генератора задач (`tools/draughts_corpus.dart`)
/// и у игры: генератор доказывает, что у задачи есть комбинация и ключевой ход
/// единственный, а игра тем же перебором решает, засчитан ли ход человека.
///
/// Мера — материал белых минус материал чёрных (простая 1, дамка 3). Горизонт —
/// число ходов белых; после последнего хода белых взятия доигрываются до тишины
/// («хвост»): иначе комбинация, где соперник отбивает на следующем ходу, считалась
/// бы выигрышем. Чёрные выбирают лучший для себя ответ из ВСЕХ ходов, не только из
/// взятий: «отдай и забери» засчитывается, только если соперник не может уйти.
library;

import '../draughts_common/rules.dart';

/// Проигрыш стороны без ходов — больше любого материала.
const int comboMate = 100;

int comboScore(DraughtsPosition p) => p.material(1) - p.material(-1);

class ComboSolver {
  ComboSolver({this.budget = 400000});

  /// Потолок узлов на один вызов [value]: генератор и подсказка не должны
  /// подвешивать телефон. Превышен — [exhausted] = true, ответ ненадёжен.
  final int budget;
  int nodes = 0;
  bool exhausted = false;

  /// Оценка позиции [p] для белых, если у белых осталось [whiteLeft] ходов.
  int value(DraughtsPosition p, int whiteLeft) {
    if (++nodes > budget) {
      exhausted = true;
      return comboScore(p);
    }
    final moves = draughtsLegalMoves(p);
    if (moves.isEmpty) return p.turn == 1 ? -comboMate : comboMate;
    final white = p.turn == 1;
    if (white && whiteLeft <= 0) return _quiesce(p, moves);
    var best = white ? -comboMate * 2 : comboMate * 2;
    for (final m in moves) {
      final v = value(draughtsApply(p, m), white ? whiteLeft - 1 : whiteLeft);
      if (white ? v > best : v < best) best = v;
    }
    return best;
  }

  /// Хвост: пока у стороны есть взятия (они обязательны) — доигрываем их.
  int _quiesce(DraughtsPosition p, List<DraughtsMove> moves) {
    if (moves.isEmpty || !moves.first.isCapture) return comboScore(p);
    final white = p.turn == 1;
    var best = white ? -comboMate * 2 : comboMate * 2;
    for (final m in moves) {
      final next = draughtsApply(p, m);
      if (++nodes > budget) {
        exhausted = true;
        return comboScore(next);
      }
      final nm = draughtsLegalMoves(next);
      final v = nm.isEmpty
          ? (next.turn == 1 ? -comboMate : comboMate)
          : _quiesce(next, nm);
      if (white ? v > best : v < best) best = v;
    }
    return best;
  }

  /// Оценка позиции после хода в ДОБИВАНИИ (за горизонтом): доигрываются только
  /// взятия — ровно то, что [value] делает на горизонте. Игра обязана судить ходы
  /// хвоста этим, а не [value]: иначе после добивания у соперника появляется
  /// свободный ход, которого решатель не давал.
  int tail(DraughtsPosition p) {
    final moves = draughtsLegalMoves(p);
    if (moves.isEmpty) return p.turn == 1 ? -comboMate : comboMate;
    return _quiesce(p, moves);
  }

  /// Оценка каждого хода белых в [p] при горизонте [whiteMoves].
  List<(DraughtsMove, int)> rank(DraughtsPosition p, int whiteMoves) => [
    for (final m in draughtsLegalMoves(p))
      (m, value(draughtsApply(p, m), whiteMoves - 1)),
  ];
}

/// Выигрыш комбинации и её ключевой ход, если он единственный.
class ComboVerdict {
  const ComboVerdict({
    required this.whiteMoves,
    required this.gain,
    required this.key,
    required this.legal,
  });
  final int whiteMoves;
  final int gain;
  final DraughtsMove key;
  final int legal;
}

/// Есть ли в позиции (ход белых) комбинация «отдай и забери» длиной ровно
/// [whiteMoves]: единственный первый ход даёт выигрыш материала ≥ 1, а после него
/// соперник ОБЯЗАН бить (жертва). Остальные первые ходы — без выигрыша.
ComboVerdict? comboAt(DraughtsPosition p, int whiteMoves, {int budget = 400000}) {
  if (p.turn != 1) return null;
  final first = draughtsLegalMoves(p);
  if (first.isEmpty || first.first.isCapture) return null;
  final solver = ComboSolver(budget: budget);
  final base = comboScore(p);
  DraughtsMove? key;
  var keyGain = 0;
  for (final m in first) {
    final v = solver.value(draughtsApply(p, m), whiteMoves - 1) - base;
    if (solver.exhausted) return null;
    if (v >= 1) {
      if (key != null) return null; // два выигрывающих — ключ не единственный
      key = m;
      keyGain = v;
    }
  }
  if (key == null) return null;
  final after = draughtsApply(p, key);
  final replies = draughtsLegalMoves(after);
  if (replies.isEmpty || !replies.every((r) => r.isCapture)) return null;
  return ComboVerdict(
    whiteMoves: whiteMoves,
    gain: keyGain,
    key: key,
    legal: first.length,
  );
}

/// Главная линия комбинации от [p]: ход белых, лучший ответ чёрных, … до конца
/// горизонта и хвоста взятий. Для разбора и для ответа соперника в игре.
List<DraughtsMove> comboLine(DraughtsPosition p, int whiteMoves) {
  final solver = ComboSolver();
  final line = <DraughtsMove>[];
  var x = p;
  var left = whiteMoves;
  while (true) {
    final moves = draughtsLegalMoves(x);
    if (moves.isEmpty) break;
    final white = x.turn == 1;
    if (white && left == 0 && !moves.first.isCapture) break;
    DraughtsMove? best;
    var bestV = white ? -comboMate * 3 : comboMate * 3;
    for (final m in moves) {
      final v = solver.value(draughtsApply(x, m), white && left > 0 ? left - 1 : left);
      if (white ? v > bestV : v < bestV) {
        bestV = v;
        best = m;
      }
    }
    line.add(best!);
    if (white) left = left > 0 ? left - 1 : 0;
    x = draughtsApply(x, best);
    if (!white && left == 0 && !draughtsLegalMoves(x).any((m) => m.isCapture)) {
      break;
    }
  }
  return line;
}
