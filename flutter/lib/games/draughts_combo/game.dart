/// ПОДХОД «ШАШЕК» — логика без пикселей, по образцу пасьянса и «Коня и ферзей».
///
/// Человек играет белыми, ответ чёрных — лучший по тому же решателю, что доказал
/// задачу (`solver.dart`), через полсекунды, чтобы ход соперника было видно.
///
/// 🔴 ХОД ЗАСЧИТЫВАЕТСЯ ПО ДЕЛУ, А НЕ ПО СОВПАДЕНИЮ С ЗАПИСЬЮ. Ключевой ход у задачи
/// единственный (это доказал генератор), но дальше путей к тому же выигрышу бывает
/// несколько: ход принимается, если после него выигрыш материала задачи всё ещё
/// вынужден. Иначе — «не выигрывает», и задачу можно начать заново (решение после
/// этого не чистое).
library;

import '../draughts_common/rules.dart';
import 'ladder.dart';
import 'solver.dart';

class ComboAttempt {
  const ComboAttempt({
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

class ComboResult {
  const ComboResult(this.attempts);
  final List<ComboAttempt> attempts;
  int get total => attempts.length;
  int get solved => attempts.where((a) => a.solved).length;
  int get clean => attempts.where((a) => a.clean).length;
  bool get passed => clean >= (total < comboDeck ? total - 1 : comboPassClean);
  bool get failed => solved <= comboFailAtMost;
}

enum ComboVerdict2 { solved, wrong, timeout }

class ComboRun {
  ComboRun({required this.level, required this.deck, required this.now})
    : assert(deck.isNotEmpty) {
    _open();
  }

  final int level;
  final List<ComboPuzzle> deck;
  final int Function() now;

  /// Через сколько мс отвечают чёрные.
  static const int replyMs = 550;

  int step = 0;
  late DraughtsPosition position;
  int made = 0;
  int? selected;
  Set<int> targets = const {};
  DraughtsMove? lastMove;
  int? hintCell;
  ComboVerdict2? verdict;
  ComboResult? result;
  final List<ComboAttempt> attempts = [];

  int _startedAt = 0;
  int _verdictUntil = 0;
  int _replyAt = 0;
  int retries = 0;
  bool hinted = false;
  late int _base;

  ComboPuzzle get puzzle => deck[step];
  bool get finished => result != null;
  bool get waitingReply => _replyAt > 0;

  int get gainNow => comboScore(position) - _base;

  double get secondsLeft {
    final left = comboSeconds - (now() - _startedAt) / 1000;
    return left < 0 ? 0 : left;
  }

  bool get _locked =>
      finished ||
      verdict == ComboVerdict2.solved ||
      verdict == ComboVerdict2.timeout;

  bool get canHint =>
      !_locked && verdict == null && !hinted && secondsLeft <= comboSeconds / 2;

  void _open() {
    _startedAt = now();
    retries = 0;
    hinted = false;
    _reset();
  }

  void _reset() {
    position = puzzle.position;
    _base = comboScore(position);
    made = 0;
    selected = null;
    targets = const {};
    lastMove = null;
    hintCell = null;
    verdict = null;
    _replyAt = 0;
  }

  void tick() {
    if (finished) return;
    if (verdict == ComboVerdict2.solved || verdict == ComboVerdict2.timeout) {
      if (now() >= _verdictUntil) _next();
      return;
    }
    if (_replyAt > 0 && now() >= _replyAt) {
      _replyAt = 0;
      _blackReplies();
    }
    // Время идёт и после неверного хода: «Заново» — не повод сидеть бесконечно.
    if (secondsLeft <= 0) _close(solved: false);
  }

  int get _leftAfterMove {
    final l = puzzle.whiteMoves - made - 1;
    return l < 0 ? 0 : l;
  }

  /// Ход белых сверх объявленных — добивание: судится по взятиям, как у решателя.
  bool get _tailMove => made >= puzzle.whiteMoves;

  /// Оценка позиции после хода белых — по правилу решателя.
  int _afterWhite(ComboSolver solver, DraughtsPosition after) =>
      _tailMove ? solver.tail(after) : solver.value(after, _leftAfterMove);

  void tap(int cell) {
    if (_locked || verdict == ComboVerdict2.wrong || waitingReply) return;
    if (position.turn != 1) return;
    final moves = draughtsLegalMoves(position);
    final from = selected;
    if (from != null && targets.contains(cell)) {
      final cand = moves.where((m) => m.from == from && m.to == cell).toList();
      _play(cand.length == 1 ? cand.first : _bestOf(cand));
      return;
    }
    final mine = moves.where((m) => m.from == cell).toList();
    selected = mine.isEmpty ? null : cell;
    targets = {for (final m in mine) m.to};
  }

  /// Из нескольких путей на одно поле (дамка бьёт разными дорогами) — лучший.
  DraughtsMove _bestOf(List<DraughtsMove> cand) {
    final solver = ComboSolver();
    cand.sort(
      (a, b) => _afterWhite(solver, draughtsApply(position, b))
          .compareTo(_afterWhite(solver, draughtsApply(position, a))),
    );
    return cand.first;
  }

  void _play(DraughtsMove m) {
    final after = draughtsApply(position, m);
    final v = _afterWhite(ComboSolver(), after) - _base;
    position = after;
    lastMove = m;
    selected = null;
    targets = const {};
    hintCell = null;
    made++;
    if (v < puzzle.gain) {
      verdict = ComboVerdict2.wrong;
      return;
    }
    final replies = draughtsLegalMoves(position);
    if (replies.isEmpty) {
      _close(solved: true);
      return;
    }
    // 🔴 ПОСЛЕ ГОРИЗОНТА ИГРА ИДЁТ ПО ПРАВИЛУ РЕШАТЕЛЯ: доигрываются только взятия.
    // Ход сверх объявленных (добивание) — «хвост»; если соперник после него бить не
    // обязан, задача окончена. Иначе соперник получал бы лишний свободный ход,
    // которого у решателя нет, и доказанная комбинация «переставала» выигрывать
    // (поймано пробой: 5 задач из 276 застревали на добивании).
    if (made > puzzle.whiteMoves && !replies.first.isCapture) {
      _close(solved: gainNow >= puzzle.gain);
      return;
    }
    _replyAt = now() + replyMs;
  }

  void _blackReplies() {
    final moves = draughtsLegalMoves(position);
    if (moves.isEmpty) {
      _close(solved: gainNow >= puzzle.gain);
      return;
    }
    final left = puzzle.whiteMoves - made;
    final solver = ComboSolver();
    DraughtsMove? best;
    var bestV = comboMate * 3;
    for (final r in moves) {
      final next = draughtsApply(position, r);
      // В добивании соперник бьёт (иначе задача уже закрыта), дальше — снова хвост.
      final v = made > puzzle.whiteMoves
          ? solver.tail(next)
          : solver.value(next, left < 0 ? 0 : left);
      if (v < bestV) {
        bestV = v;
        best = r;
      }
    }
    position = draughtsApply(position, best!);
    lastMove = best;
    // Конец: ходы белых исчерпаны и бить больше нечего — считаем выигрыш.
    final white = draughtsLegalMoves(position);
    final done =
        white.isEmpty || (made >= puzzle.whiteMoves && !white.first.isCapture);
    if (done) _close(solved: gainNow >= puzzle.gain);
  }

  /// «Заново»: исходная позиция той же задачи; часы идут.
  void restart() {
    if (_locked) return;
    retries++;
    _reset();
  }

  /// Подсказка: шашка, с которой начинается выигрывающий ход отсюда.
  void takeHint() {
    if (!canHint) return;
    hinted = true;
    final solver = ComboSolver();
    final base = _base;
    for (final m in draughtsLegalMoves(position)) {
      if (_afterWhite(solver, draughtsApply(position, m)) - base >=
          puzzle.gain) {
        hintCell = m.from;
        return;
      }
    }
  }

  void _close({required bool solved}) {
    attempts.add(
      ComboAttempt(
        puzzleId: puzzle.id,
        solved: solved,
        retries: retries,
        hinted: hinted,
        ms: now() - _startedAt,
      ),
    );
    verdict = solved ? ComboVerdict2.solved : ComboVerdict2.timeout;
    _verdictUntil = now() + (solved ? 1100 : 1600);
  }

  void _next() {
    if (step + 1 >= deck.length) {
      result = ComboResult(List.unmodifiable(attempts));
      return;
    }
    step++;
    _open();
  }
}
