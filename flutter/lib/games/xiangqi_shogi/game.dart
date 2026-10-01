/// ПОДХОД «СЯНЦИ И СЁГИ» — логика без пикселей, по образцу «Го».
///
/// Человек играет атакующим (красные / сэнтэ): касание своей фигуры — выбор, касание
/// поля с точкой — ход; в сёги касание фигуры в руке — выбор сброса. Если ход можно
/// сделать и с превращением, и без — спрашиваем (`pendingPromotion`). Защита отвечает
/// лучшим ходом решателя через полсекунды.
///
/// 🔴 ХОД ЗАСЧИТЫВАЕТСЯ ПО ДЕЛУ: мат после него за оставшиеся ходы всё ещё вынужден
/// (тот же решатель, что доказал задачу; потолок — в пользу человека). Иначе — «так не
/// мат» и «Заново». В сёги ход без шаха — не ошибка, а отказ: по правилам цумэ каждый ход
/// атакующего — шах.
library;

import 'ladder.dart';
import 'mate.dart';
import 'view.dart';

class XsAttempt {
  const XsAttempt({
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

class XsResult {
  const XsResult(this.attempts);
  final List<XsAttempt> attempts;
  int get total => attempts.length;
  int get solved => attempts.where((a) => a.solved).length;
  int get clean => attempts.where((a) => a.clean).length;
  bool get passed => clean >= (total < xsDeck ? total - 1 : xsPassClean);
  bool get failed => solved <= xsFailAtMost;
}

enum XsVerdict { solved, wrong, timeout }

class XsRun {
  XsRun({
    required this.level,
    required this.deck,
    required this.now,
    required this.mode,
  }) : assert(deck.isNotEmpty) {
    _open();
  }

  final int level;
  final List<XsPuzzle> deck;
  final int Function() now;
  final XsMode mode;

  static const int replyMs = 550;

  int step = 0;
  late MateBoard board;
  int made = 0;
  XsMove? lastMove;
  XsMove? hint;

  /// Выбранная фигура на доске (индекс) или вид в руке.
  int? selected;
  String? selectedDrop;

  /// Ход, где можно и превратиться, и нет: ждём выбора.
  (String plain, String promoted)? pendingPromotion;

  /// Почему касание не стало ходом: 'check' (в сёги ход без шаха).
  String? refusal;
  XsVerdict? verdict;
  XsResult? result;
  final List<XsAttempt> attempts = [];

  int _startedAt = 0;
  int _verdictUntil = 0;
  int _replyAt = 0;
  int retries = 0;
  bool hinted = false;

  XsPuzzle get puzzle => deck[step];
  bool get finished => result != null;
  bool get waitingReply => _replyAt > 0;
  int get movesLeft => puzzle.moves - made;
  XsView get view => xsViewOf(mode, board);

  double get secondsLeft {
    final left = xsSeconds - (now() - _startedAt) / 1000;
    return left < 0 ? 0 : left;
  }

  bool get _locked =>
      finished || verdict == XsVerdict.solved || verdict == XsVerdict.timeout;

  bool get canHint =>
      !_locked &&
      verdict == null &&
      !hinted &&
      !waitingReply &&
      secondsLeft <= xsSeconds / 2;

  /// Поля, куда выбранная фигура (или сброс) может пойти.
  Set<int> get targets {
    if (selected == null && selectedDrop == null) return const {};
    final out = <int>{};
    for (final m in board.moves()) {
      final mv = XsMove.parse(mode, m);
      if (selectedDrop != null ? mv.drop == selectedDrop : mv.from == selected) {
        out.add(mv.to);
      }
    }
    return out;
  }

  void _open() {
    _startedAt = now();
    retries = 0;
    hinted = false;
    _reset();
  }

  void _reset() {
    board = xsBoard(mode, puzzle.fen);
    made = 0;
    lastMove = null;
    hint = null;
    selected = null;
    selectedDrop = null;
    pendingPromotion = null;
    refusal = null;
    verdict = null;
    _replyAt = 0;
  }

  void tick() {
    if (finished) return;
    if (verdict == XsVerdict.solved || verdict == XsVerdict.timeout) {
      if (now() >= _verdictUntil) _next();
      return;
    }
    if (_replyAt > 0 && now() >= _replyAt) {
      _replyAt = 0;
      final r = MateSolver(board).bestDefence(movesLeft);
      if (r != null) {
        board.push(r);
        lastMove = XsMove.parse(mode, r);
      }
    }
    if (secondsLeft <= 0) _close(solved: false);
  }

  bool get _canAct =>
      !_locked && verdict != XsVerdict.wrong && !waitingReply;

  /// Касание фигуры в руке (сёги): выбор сброса.
  void tapHand(String kind) {
    if (!_canAct || pendingPromotion != null) return;
    if ((view.hands[0][kind] ?? 0) == 0) return;
    selectedDrop = selectedDrop == kind ? null : kind;
    selected = null;
    refusal = null;
  }

  void tapCell(int index) {
    if (!_canAct || pendingPromotion != null) return;
    final v = view;
    final piece = v.cells[index];
    if (piece != null && piece.side == 0) {
      selected = selected == index ? null : index;
      selectedDrop = null;
      refusal = null;
      return;
    }
    if (selected == null && selectedDrop == null) return;
    final matches = [
      for (final m in board.moves())
        if (() {
          final mv = XsMove.parse(mode, m);
          return mv.to == index &&
              (selectedDrop != null ? mv.drop == selectedDrop : mv.from == selected);
        }())
          m,
    ];
    if (matches.isEmpty) return;
    if (matches.length == 2) {
      final promoted = matches.firstWhere((m) => m.endsWith('+'));
      pendingPromotion = (matches.firstWhere((m) => m != promoted), promoted);
      return;
    }
    _play(matches.single);
  }

  /// Выбор при превращении.
  void choosePromotion(bool promote) {
    final p = pendingPromotion;
    if (p == null) return;
    pendingPromotion = null;
    _play(promote ? p.$2 : p.$1);
  }

  void _play(String move) {
    selected = null;
    selectedDrop = null;
    if (board.checksOnly && !board.checks().contains(move)) {
      refusal = 'check';
      return;
    }
    refusal = null;
    hint = null;
    final left = movesLeft - 1;
    final ok = MateSolver(board).accepts(move, left);
    board.push(move);
    lastMove = XsMove.parse(mode, move);
    made++;
    if (board.inCheck && board.moves().isEmpty) {
      _close(solved: true);
      return;
    }
    if (!ok || left <= 0) {
      verdict = XsVerdict.wrong;
      return;
    }
    _replyAt = now() + replyMs;
  }

  /// «Заново»: исходная позиция той же задачи; часы идут.
  void restart() {
    if (_locked) return;
    retries++;
    _reset();
  }

  /// «Дальше» после «так не мат».
  void giveUp() {
    if (_locked) return;
    _close(solved: false);
  }

  void takeHint() {
    if (!canHint) return;
    hinted = true;
    final win = MateSolver(board).winningMoves(movesLeft);
    if (win.isNotEmpty) hint = XsMove.parse(mode, win.first);
  }

  void _close({required bool solved}) {
    attempts.add(
      XsAttempt(
        puzzleId: puzzle.id,
        solved: solved,
        retries: retries,
        hinted: hinted,
        ms: now() - _startedAt,
      ),
    );
    verdict = solved ? XsVerdict.solved : XsVerdict.timeout;
    _verdictUntil = now() + (solved ? 1100 : 1600);
  }

  void _next() {
    if (step + 1 >= deck.length) {
      result = XsResult(List.unmodifiable(attempts));
      return;
    }
    step++;
    _open();
  }
}
