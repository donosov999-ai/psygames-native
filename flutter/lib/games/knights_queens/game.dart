/// ПОДХОД «КОНЯ И ФЕРЗЕЙ» — логика без пикселей, по образцу пасьянса (`SolitaireRun`).
///
/// Экран только показывает и передаёт касания; засчитывается всё здесь. Часы снаружи
/// (`now`), пауза вердикта, подсказка — с половины срока.
///
/// 🔴 ЧИСТОЕ РЕШЕНИЕ = С ПЕРВОЙ ПОПЫТКИ, БЕЗ ПОДСКАЗКИ И БЕЗ «НАЗАД». У ферзей снять
/// своего ферзя — не откат, а сама игра (расстановка — это перебор), поэтому «Назад»
/// там нет. У коня «Назад» — откат прыжка: он разрешён, но решение после него уже не
/// поднимает ступень, как «Заново».
library;

import 'ladder.dart';
import 'queens.dart';
import 'tour.dart';

class KqAttempt {
  const KqAttempt({
    required this.puzzleId,
    required this.solved,
    required this.retries,
    required this.hinted,
    required this.ms,
  });
  final int puzzleId;
  final bool solved;

  /// «Заново» и «Назад» вместе.
  final int retries;
  final bool hinted;
  final int ms;

  bool get clean => solved && retries == 0 && !hinted;
}

class KqResult {
  const KqResult(this.attempts);
  final List<KqAttempt> attempts;
  int get total => attempts.length;
  int get solved => attempts.where((a) => a.solved).length;
  int get clean => attempts.where((a) => a.clean).length;

  /// Порог от размера подхода: у 3×4 задач всего четыре на треть.
  bool get passed => clean >= (total < kqDeck ? total - 1 : kqPassClean);
  bool get failed => solved <= kqFailAtMost;
}

enum KqVerdict { solved, stuck, timeout }

/// Общее у двух режимов: часы, подход, вердикт, подсказка с половины.
abstract class KqRun {
  KqRun({required this.level, required this.now});

  final int level;
  final int Function() now;

  int step = 0;
  KqVerdict? verdict;
  KqResult? result;
  final List<KqAttempt> attempts = [];

  int _startedAt = 0;
  int _verdictUntil = 0;
  int retries = 0;
  bool hinted = false;

  /// Подсвеченная подсказкой клетка и ответ «Где ошибка?» (клетка ошибки).
  int? hintCell;
  int? mistakeCell;

  /// «Где ошибка?» не нашёл за отведённый перебор — сказать честно.
  bool mistakeUnknown = false;

  /// «Где ошибка?» проверил: ошибки нет, путь ещё достраивается.
  bool noMistake = false;

  int get deckLength;
  int get puzzleId;
  int get seconds;
  bool get boardSolved;
  bool get boardStuck;
  void resetBoard();
  void _findHint();
  void _findMistake();

  bool get finished => result != null;

  double get secondsLeft {
    final left = seconds - (now() - _startedAt) / 1000;
    return left < 0 ? 0 : left;
  }

  bool get _locked =>
      finished || verdict == KqVerdict.solved || verdict == KqVerdict.timeout;

  bool get canHint =>
      !_locked && !hinted && secondsLeft <= seconds / 2;

  void open() {
    resetBoard();
    verdict = null;
    hintCell = null;
    mistakeCell = null;
    mistakeUnknown = false;
    noMistake = false;
    _startedAt = now();
    retries = 0;
    hinted = false;
  }

  void tick() {
    if (finished) return;
    if (verdict == KqVerdict.solved || verdict == KqVerdict.timeout) {
      if (now() >= _verdictUntil) _next();
      return;
    }
    if (secondsLeft <= 0) _close(solved: false);
  }

  /// После хода: решено, тупик или дальше.
  void afterMove() {
    hintCell = null;
    mistakeCell = null;
    mistakeUnknown = false;
    noMistake = false;
    if (boardSolved) {
      _close(solved: true);
    } else if (boardStuck) {
      verdict = KqVerdict.stuck;
    } else {
      verdict = null;
    }
  }

  /// «Заново»: исходная доска той же задачи; часы идут.
  void restart() {
    if (_locked) return;
    retries++;
    resetBoard();
    verdict = null;
    hintCell = null;
    mistakeCell = null;
    mistakeUnknown = false;
    noMistake = false;
  }

  void takeHint() {
    if (!canHint) return;
    hinted = true;
    _findHint();
  }

  /// «Где ошибка?» — бесплатно: она не подсказывает ход, а показывает, где
  /// рассуждение сломалось. Но решение после неё уже не чистое: человек узнал,
  /// что путь неверен, не дойдя до тупика сам.
  void whereMistake() {
    if (_locked) return;
    hinted = true;
    _findMistake();
    noMistake = mistakeCell == null && !mistakeUnknown;
  }

  void _close({required bool solved}) {
    attempts.add(
      KqAttempt(
        puzzleId: puzzleId,
        solved: solved,
        retries: retries,
        hinted: hinted,
        ms: now() - _startedAt,
      ),
    );
    verdict = solved ? KqVerdict.solved : KqVerdict.timeout;
    _verdictUntil = now() + (solved ? 900 : 1600);
  }

  void _next() {
    if (step + 1 >= deckLength) {
      result = KqResult(List.unmodifiable(attempts));
      return;
    }
    step++;
    open();
  }
}

class QueensRun extends KqRun {
  QueensRun({required super.level, required this.deck, required super.now})
    : assert(deck.isNotEmpty) {
    open();
  }

  final List<QueensPuzzle> deck;
  late QueensBoard board;

  QueensPuzzle get puzzle => deck[step];
  bool get highlight => queensHighlight(level);

  @override
  int get deckLength => deck.length;
  @override
  int get puzzleId => puzzle.id;
  @override
  int get seconds => kqSeconds(KqMode.queens);
  @override
  bool get boardSolved => board.solved;

  /// Тупик у ферзей — N ферзей стоят, а решения нет: снимай.
  @override
  bool get boardStuck => board.queens.length == board.n && !board.solved;

  @override
  void resetBoard() => board = puzzle.board;

  void tap(int cell) {
    if (_locked) return;
    if (!board.canToggle(cell)) return;
    // Девятого ферзя на 8×8 не бывает: лишний ставится только вместо снятого.
    if (!board.placed.contains(cell) && board.queens.length >= board.n) return;
    board = board.toggle(cell);
    afterMove();
  }

  /// Подсказка: поле решения, совместимого со ВСЕМИ уже стоящими верными ферзями;
  /// если стоящие уже ни в одно решение не входят — показать первую ошибку.
  @override
  void _findHint() {
    final sols = board.solutions;
    final fit = sols.where((s) => board.placed.every(s.contains)).toList();
    if (fit.isEmpty) {
      _findMistake();
      return;
    }
    final missing = fit.first.difference(board.queens).toList()..sort();
    hintCell = missing.isEmpty ? null : missing.first;
  }

  @override
  void _findMistake() => mistakeCell = board.firstMistake();
}

class TourRun extends KqRun {
  TourRun({required super.level, required this.deck, required super.now})
    : assert(deck.isNotEmpty) {
    open();
  }

  final List<TourPuzzle> deck;
  late TourBoard board;
  List<int> path = const [];

  TourPuzzle get puzzle => deck[step];
  List<int> get targets => boardSolved ? const [] : board.nextMoves(path);

  @override
  int get deckLength => deck.length;
  @override
  int get puzzleId => puzzle.id;
  @override
  int get seconds => kqSeconds(KqMode.tour, free: board.free);
  @override
  bool get boardSolved => board.solved(path);
  @override
  bool get boardStuck => !boardSolved && board.nextMoves(path).isEmpty;

  @override
  void resetBoard() {
    board = puzzle.board;
    path = [board.start];
  }

  void tap(int cell) {
    if (_locked || verdict == KqVerdict.stuck) return;
    if (!board.nextMoves(path).contains(cell)) return;
    path = [...path, cell];
    afterMove();
  }

  /// «Назад» — откат прыжка; решение после него не чистое.
  void undo() {
    if (_locked || path.length <= 1) return;
    retries++;
    path = path.sublist(0, path.length - 1);
    afterMove();
  }

  @override
  void _findHint() {
    final s = TourSearch(board, budget: 60000);
    if (s.run(path) == TourOutcome.found) {
      hintCell = s.tour[path.length];
    } else {
      _findMistake();
    }
  }

  /// Клетка, куда конь прыгнул ошибочным ходом; `-1` от перебора — «не нашёл».
  @override
  void _findMistake() {
    final k = tourFirstMistake(board, path);
    if (k == null) {
      mistakeCell = null;
    } else if (k < 0) {
      mistakeUnknown = true;
    } else {
      mistakeCell = path[k];
    }
  }
}
