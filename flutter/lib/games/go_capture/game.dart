/// ПОДХОД «ГО: ЗАХВАТ» — логика без пикселей, по образцу «Шашек».
///
/// Человек — чёрные: касание пустого пункта ставит камень. Белые отвечают лучшим
/// ходом решателя через полсекунды, чтобы ответ было видно.
///
/// 🔴 ХОД ЗАСЧИТЫВАЕТСЯ ПО ДЕЛУ, А НЕ ПО СОВПАДЕНИЮ С КЛЮЧОМ. Первый ход у задачи
/// единственный (доказал генератор), дальше путей бывает несколько: ход принимается,
/// если после него захват за оставшиеся ходы всё ещё вынужден. Иначе — «так не
/// взять» и «Заново». Решатель упёрся в потолок — ход принимается (сомнение — в пользу
/// человека), чтобы игра не обвинила верный ход.
library;

import 'ladder.dart';
import 'rules.dart';

class GoCaptureAttempt {
  const GoCaptureAttempt({
    required this.puzzleId,
    required this.solved,
    required this.retries,
    required this.hinted,
    required this.ms,
  });
  final int puzzleId;
  final bool solved;
  final int retries;
  final bool hinted;
  final int ms;
  bool get clean => solved && retries == 0 && !hinted;
}

class GoCaptureResult {
  const GoCaptureResult(this.attempts);
  final List<GoCaptureAttempt> attempts;
  int get total => attempts.length;
  int get solved => attempts.where((a) => a.solved).length;
  int get clean => attempts.where((a) => a.clean).length;
  bool get passed =>
      clean >= (total < goCaptureDeck ? total - 1 : goCapturePassClean);
  bool get failed => solved <= goCaptureFailAtMost;
}

enum GoCaptureVerdict { solved, wrong, timeout }

class GoCaptureRun {
  GoCaptureRun({required this.level, required this.deck, required this.now})
    : assert(deck.isNotEmpty) {
    _open();
  }

  final int level;
  final List<GoCapturePuzzle> deck;
  final int Function() now;

  static const int replyMs = 550;

  int step = 0;
  late GoPosition position;
  int made = 0;
  int? lastMove;
  int? hintPoint;

  /// Почему последнее касание не стало ходом: 'suicide' или 'ko'.
  String? refusal;
  GoCaptureVerdict? verdict;
  GoCaptureResult? result;
  final List<GoCaptureAttempt> attempts = [];

  int _startedAt = 0;
  int _verdictUntil = 0;
  int _replyAt = 0;
  int retries = 0;
  bool hinted = false;

  GoCapturePuzzle get puzzle => deck[step];
  bool get finished => result != null;
  bool get waitingReply => _replyAt > 0;
  int get movesLeft => puzzle.moves - made;

  /// Камни группы-цели сейчас (пусто — снята).
  Set<int> get targetStones => position.at(puzzle.target) == goWhite
      ? position.group(puzzle.target).stones
      : const {};

  double get secondsLeft {
    final left = goCaptureSeconds - (now() - _startedAt) / 1000;
    return left < 0 ? 0 : left;
  }

  bool get _locked =>
      finished ||
      verdict == GoCaptureVerdict.solved ||
      verdict == GoCaptureVerdict.timeout;

  bool get canHint =>
      !_locked &&
      verdict == null &&
      !hinted &&
      !waitingReply &&
      secondsLeft <= goCaptureSeconds / 2;

  void _open() {
    _startedAt = now();
    retries = 0;
    hinted = false;
    _reset();
  }

  void _reset() {
    position = puzzle.position;
    made = 0;
    lastMove = null;
    hintPoint = null;
    refusal = null;
    verdict = null;
    _replyAt = 0;
  }

  void tick() {
    if (finished) return;
    if (verdict == GoCaptureVerdict.solved || verdict == GoCaptureVerdict.timeout) {
      if (now() >= _verdictUntil) _next();
      return;
    }
    if (_replyAt > 0 && now() >= _replyAt) {
      _replyAt = 0;
      _whiteReplies();
    }
    if (secondsLeft <= 0) _close(solved: false);
  }

  void tap(int point) {
    if (_locked || verdict == GoCaptureVerdict.wrong || waitingReply) return;
    if (position.toMove != goBlack || position.at(point) != goEmpty) return;
    final next = position.play(point);
    if (next == null) {
      final prev = position.previous;
      refusal = prev != null && _wouldRepeat(point) ? 'ko' : 'suicide';
      return;
    }
    refusal = null;
    hintPoint = null;
    position = next;
    lastMove = point;
    made++;
    if (position.at(puzzle.target) == goEmpty) {
      _close(solved: true);
      return;
    }
    if (movesLeft <= 0 ||
        CaptureSolver().holdsAfter(position, puzzle.target, movesLeft) ==
            GoVerdict.no) {
      verdict = GoCaptureVerdict.wrong;
      return;
    }
    _replyAt = now() + replyMs;
  }

  /// Ход незаконен из-за ко (а не самоубийства): без правила ко он был бы законен.
  bool _wouldRepeat(int point) =>
      GoPosition(position.size, position.points, toMove: position.toMove)
          .play(point) !=
      null;

  void _whiteReplies() {
    final m = CaptureSolver().defenderReply(position, puzzle.target, movesLeft);
    final next = position.play(m);
    if (next == null) return;
    position = next;
    lastMove = m < 0 ? null : m;
  }

  /// «Заново»: исходная позиция той же задачи; часы идут.
  void restart() {
    if (_locked) return;
    retries++;
    _reset();
  }

  /// Подсказка: пункт, ход в который доказывает захват отсюда.
  void takeHint() {
    if (!canHint) return;
    hinted = true;
    final win = CaptureSolver().winningMoves(position, puzzle.target, movesLeft);
    if (win.isNotEmpty) hintPoint = win.first;
  }

  /// «Дальше» после «так не взять»: задача закрывается нерешённой.
  void giveUp() {
    if (_locked) return;
    _close(solved: false);
  }

  void _close({required bool solved}) {
    attempts.add(
      GoCaptureAttempt(
        puzzleId: puzzle.id,
        solved: solved,
        retries: retries,
        hinted: hinted,
        ms: now() - _startedAt,
      ),
    );
    verdict = solved ? GoCaptureVerdict.solved : GoCaptureVerdict.timeout;
    _verdictUntil = now() + (solved ? 1100 : 1600);
  }

  void _next() {
    if (step + 1 >= deck.length) {
      result = GoCaptureResult(List.unmodifiable(attempts));
      return;
    }
    step++;
    _open();
  }
}
