/// ПОДХОД «ШАХМАТНОГО ПАСЬЯНСА» — логика без пикселей.
///
/// Экран только показывает и передаёт касания; засчитывается всё здесь. Устройство —
/// как у «Найди ход» (`FindMoveRun`): часы снаружи (`now`), пауза вердикта, подсказка
/// с половины срока.
///
/// 🔴 ТУПИК — НЕ ПРОМАХ, НО И НЕ ЧИСТОЕ РЕШЕНИЕ. В коробке Solitaire Chess человек,
/// упёршийся в тупик, расставляет фигуры заново — так и здесь: «Заново» возвращает
/// исходную доску, часы при этом идут. Решение после «Заново» засчитано, но ступень
/// поднимают только решения с первой попытки и без подсказки.
library;

import 'ladder.dart';
import 'puzzle.dart';

class SolitaireAttempt {
  const SolitaireAttempt({
    required this.puzzle,
    required this.solved,
    required this.restarts,
    required this.hinted,
    required this.ms,
  });
  final SolitairePuzzle puzzle;
  final bool solved;
  final int restarts;
  final bool hinted;
  final int ms;

  /// С первой попытки и без подсказки — только такие поднимают ступень.
  bool get clean => solved && restarts == 0 && !hinted;
}

class SolitaireResult {
  const SolitaireResult({required this.attempts});
  final List<SolitaireAttempt> attempts;

  int get total => attempts.length;
  int get solved => attempts.where((a) => a.solved).length;
  int get clean => attempts.where((a) => a.clean).length;
  bool get passed => clean >= solitairePassClean;
  bool get failed => solved <= solitaireFailAtMost;
}

/// Чем кончилась доска: решена, тупик (можно заново) или вышло время.
enum SolitaireVerdict { solved, stuck, timeout }

class SolitaireRun {
  SolitaireRun({required this.level, required this.deck, required this.now})
    : assert(deck.isNotEmpty) {
    _open();
  }

  final int level;
  final List<SolitairePuzzle> deck;
  final int Function() now;

  int step = 0;
  late SolitaireBoard board;
  int? selected;
  List<int> targets = const [];

  /// Последнее взятие — подсвечивается.
  (int, int)? lastCapture;
  int? hintSquare;
  SolitaireVerdict? verdict;
  SolitaireResult? result;
  final List<SolitaireAttempt> attempts = [];

  int _startedAt = 0;
  int _verdictUntil = 0;
  int _restarts = 0;
  bool _hinted = false;

  SolitairePuzzle get puzzle => deck[step];
  bool get finished => result != null;

  double get secondsLeft {
    final left = solitaireSeconds - (now() - _startedAt) / 1000;
    return left < 0 ? 0 : left;
  }

  bool get canHint =>
      !finished &&
      verdict == null &&
      !_hinted &&
      secondsLeft <= solitaireSeconds / 2;

  bool get hinted => _hinted;
  int get restarts => _restarts;

  void _open() {
    board = puzzle.board;
    selected = null;
    targets = const [];
    lastCapture = null;
    hintSquare = null;
    verdict = null;
    _startedAt = now();
    _restarts = 0;
    _hinted = false;
  }

  void tick() {
    if (finished) return;
    if (verdict == SolitaireVerdict.solved ||
        verdict == SolitaireVerdict.timeout) {
      if (now() >= _verdictUntil) _next();
      return;
    }
    // В тупике часы идут: человек решает, начать ли заново.
    if (secondsLeft <= 0) _close(solved: false, timeout: true);
  }

  void tap(int square) {
    if (finished ||
        verdict == SolitaireVerdict.solved ||
        verdict == SolitaireVerdict.timeout) {
      return;
    }
    if (verdict == SolitaireVerdict.stuck) return;
    final from = selected;
    if (from != null && targets.contains(square)) {
      _capture(from, square);
      return;
    }
    final moves = board.capturesFrom(square);
    selected = moves.isEmpty ? null : square;
    targets = moves;
  }

  void _capture(int from, int to) {
    board = board.play(from, to);
    lastCapture = (from, to);
    selected = null;
    targets = const [];
    hintSquare = null;
    if (board.solved) {
      _close(solved: true);
    } else if (board.stuck) {
      verdict = SolitaireVerdict.stuck;
    }
  }

  /// «Заново»: исходная доска той же задачи; часы не останавливаются.
  void restart() {
    if (finished ||
        verdict == SolitaireVerdict.solved ||
        verdict == SolitaireVerdict.timeout) {
      return;
    }
    _restarts++;
    board = puzzle.board;
    selected = null;
    targets = const [];
    lastCapture = null;
    hintSquare = null;
    verdict = null;
  }

  /// Подсказка: фигура, с которой начинается решение ОТ ТЕКУЩЕЙ доски. Если
  /// текущая доска уже проиграна (решения нет, хоть брать и есть что), подсказка
  /// честно возвращает исходную доску — это считается попыткой заново.
  void takeHint() {
    if (!canHint) return;
    _hinted = true;
    var moves = solitaireSolution(board);
    if (moves.isEmpty) {
      restart();
      moves = solitaireSolution(board);
    }
    if (moves.isNotEmpty) hintSquare = moves.first.$1;
  }

  void _close({required bool solved, bool timeout = false}) {
    attempts.add(
      SolitaireAttempt(
        puzzle: puzzle,
        solved: solved,
        restarts: _restarts,
        hinted: _hinted,
        ms: now() - _startedAt,
      ),
    );
    verdict = solved ? SolitaireVerdict.solved : SolitaireVerdict.timeout;
    _verdictUntil = now() + (solved ? 900 : 1600);
  }

  void _next() {
    if (step + 1 >= deck.length) {
      result = SolitaireResult(attempts: List.unmodifiable(attempts));
      return;
    }
    step++;
    _open();
  }
}
