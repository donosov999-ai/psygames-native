/// ПОДХОД «УГОЛКОВ» — логика без пикселей, по образцу «Шашек» (`draughts_combo`).
///
/// Касание своей фишки выбирает её и подсвечивает, куда она дойдёт одним ходом (шаг
/// или конец цепочки прыжков); касание подсвеченной клетки — ход. Задача решена, если
/// все фишки на клетках цели не позже лимита. Ходы кончились — «Где ошибка?»: первый
/// ход, после которого цель за оставшийся запас уже недостижима (решатель).
///
/// 🔴 ЧЕСТНОЕ «НЕ ЗНАЮ». Решатель ограничен узлами (на 6×6 с шестью фишками проверка
/// от начала стоит секунды — замер 02.10.2026). Упёрся в потолок — экран говорит «не
/// нашёл», а не угадывает ход.
library;

import 'ladder.dart';
import 'rules.dart';

class CornersAttempt {
  const CornersAttempt({
    required this.puzzleId,
    required this.solved,
    required this.moves,
    required this.retries,
    required this.hinted,
    required this.ms,
  });
  final int puzzleId;
  final bool solved;
  final int moves;
  final int retries;
  final bool hinted;
  final int ms;
  bool get clean => solved && retries == 0 && !hinted;
}

class CornersResult {
  const CornersResult(this.attempts);
  final List<CornersAttempt> attempts;
  int get total => attempts.length;
  int get solved => attempts.where((a) => a.solved).length;
  int get clean => attempts.where((a) => a.clean).length;
  bool get passed =>
      clean >= (total < cornersDeck ? total - 1 : cornersPassClean);
  bool get failed => solved <= cornersFailAtMost;
}

enum CornersVerdict2 { solved, outOfMoves, timeout }

class CornersRun {
  CornersRun({
    required this.level,
    required this.deck,
    required this.now,
    this.nodeLimit = 300000,
  }) : assert(deck.isNotEmpty) {
    _open();
  }

  final int level;
  final List<CornersPuzzle> deck;
  final int Function() now;

  /// Потолок решателя на один вопрос («подсказка», «где ошибка»).
  final int nodeLimit;

  int step = 0;
  late int pieces;
  final List<(int, int)> history = [];
  int? selected;
  Set<int> targets = const {};
  (int, int)? hint;
  bool hintFailed = false;
  CornersVerdict2? verdict;
  CornersResult? result;
  final List<CornersAttempt> attempts = [];

  int _startedAt = 0;
  int _verdictUntil = 0;
  int retries = 0;
  bool hinted = false;

  CornersPuzzle get puzzle => deck[step];
  CornersBoard get board => puzzle.board;
  int get limit => cornersLimit(puzzle, level);
  int get movesLeft => limit - history.length;
  bool get finished => result != null;

  double get secondsLeft {
    final left = cornersSeconds - (now() - _startedAt) / 1000;
    return left < 0 ? 0 : left;
  }

  bool get _locked =>
      finished ||
      verdict == CornersVerdict2.solved ||
      verdict == CornersVerdict2.timeout;

  bool get canHint =>
      !_locked &&
      verdict == null &&
      !hinted &&
      secondsLeft <= cornersSeconds / 2;

  void _open() {
    _startedAt = now();
    retries = 0;
    hinted = false;
    _reset();
  }

  void _reset() {
    pieces = puzzle.startMask;
    history.clear();
    selected = null;
    targets = const {};
    hint = null;
    hintFailed = false;
    verdict = null;
  }

  void tick() {
    if (finished) return;
    if (verdict == CornersVerdict2.solved || verdict == CornersVerdict2.timeout) {
      if (now() >= _verdictUntil) _next();
      return;
    }
    if (secondsLeft <= 0) _close(solved: false);
  }

  bool own(int cell) => pieces >> cell & 1 == 1;

  void tap(int cell) {
    if (_locked || verdict == CornersVerdict2.outOfMoves) return;
    final from = selected;
    if (from != null && targets.contains(cell)) {
      _play((from, cell));
      return;
    }
    if (own(cell) && cell != from) {
      selected = cell;
      targets = board.targetsFrom(pieces, cell);
    } else {
      selected = null;
      targets = const {};
    }
  }

  void _play((int, int) move) {
    pieces = CornersBoard.apply(pieces, move);
    history.add(move);
    selected = null;
    targets = const {};
    hint = null;
    hintFailed = false;
    if (board.solved(pieces)) {
      _close(solved: true);
    } else if (movesLeft <= 0) {
      verdict = CornersVerdict2.outOfMoves;
    }
  }

  /// «Отменить»: последний ход назад. Решение после этого не чистое.
  void undo() {
    if (_locked || history.isEmpty) return;
    final (from, to) = history.removeLast();
    pieces = CornersBoard.apply(pieces, (to, from));
    retries++;
    verdict = null;
    selected = null;
    targets = const {};
    hint = null;
  }

  /// «Заново»: начальная расстановка той же задачи; часы идут.
  void restart() {
    if (_locked) return;
    retries++;
    _reset();
  }

  /// Подсказка: первый ход линии решателя из ТЕКУЩЕЙ позиции в оставшийся запас.
  void takeHint() {
    if (!canHint) return;
    hinted = true;
    final search = CornersSearch(board, nodeLimit: nodeLimit);
    if (search.reachable(pieces, movesLeft) == CornersVerdict.yes &&
        search.line.isNotEmpty) {
      hint = search.line.first;
    } else {
      hintFailed = true;
    }
  }

  /// «Где ошибка?»: номер хода (1 — первый), после которого цель за оставшийся
  /// запас недостижима. `null` — ошибки нет (из текущей позиции ещё можно успеть);
  /// `-1` — решатель упёрся в потолок, честно «не нашёл».
  int? firstMistake() {
    var pos = puzzle.startMask;
    final search = CornersSearch(board, nodeLimit: nodeLimit);
    for (var i = 0; i <= history.length; i++) {
      final v = search.reachable(pos, limit - i);
      if (v == CornersVerdict.unknown) return -1;
      if (v == CornersVerdict.no) return i;
      if (i < history.length) pos = CornersBoard.apply(pos, history[i]);
    }
    return null;
  }

  void _close({required bool solved}) {
    attempts.add(
      CornersAttempt(
        puzzleId: puzzle.id,
        solved: solved,
        moves: history.length,
        retries: retries,
        hinted: hinted,
        ms: now() - _startedAt,
      ),
    );
    verdict = solved ? CornersVerdict2.solved : CornersVerdict2.timeout;
    _verdictUntil = now() + (solved ? 1100 : 1600);
  }

  /// «Сдаться» по исчерпанию ходов и времени — задача уходит нерешённой.
  void giveUp() {
    if (_locked) return;
    _close(solved: false);
  }

  void _next() {
    if (step + 1 >= deck.length) {
      result = CornersResult(List.unmodifiable(attempts));
      return;
    }
    step++;
    _open();
  }
}
