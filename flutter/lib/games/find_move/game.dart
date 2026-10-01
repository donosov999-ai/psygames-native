/// ПОДХОД «НАЙДИ ХОД» — логика без пикселей.
///
/// Экран только показывает и передаёт касания; всё, что засчитывается, живёт
/// здесь и закрыто пробами. Устройство — как у «Детского мата» (`ScholarsRun`):
/// те же часы, та же пауза вердикта, та же подсказка ценой звезды.
///
/// 🔴 ХОД СОПЕРНИКА ПОКАЗЫВАЕТСЯ. Первый ход записи играется до вопроса, и его
/// клетки подсвечены: без этого человек видит позицию, но не видит, что
/// изменилось, а в задачах Lichess именно этот ход создаёт тактику.
library;

import 'dart:math';

// Расширения bishop (fen, checkmate) — без них у Game нет этих полей.
import 'package:bishop/bishop.dart';

import '../scholars_mate/check.dart' show movesFrom, sanOf;
import 'corpus.dart';
import 'ladder.dart';

class FindMoveAttempt {
  const FindMoveAttempt({
    required this.puzzle,
    required this.correct,
    required this.timeout,
    required this.hinted,
    required this.ms,
    required this.msFirst,
  });
  final FindMovePuzzle puzzle;
  final bool correct;
  final bool timeout;
  final bool hinted;
  final int ms;
  final int msFirst;
}

class FindMoveResult {
  const FindMoveResult({required this.attempts});
  final List<FindMoveAttempt> attempts;

  int get total => attempts.length;
  int get solved => attempts.where((a) => a.correct).length;

  /// Верные БЕЗ подсказки — только они поднимают ступень.
  int get clean => attempts.where((a) => a.correct && !a.hinted).length;
  int get hints => attempts.where((a) => a.hinted).length;
  bool get touched => attempts.any((a) => !a.timeout);

  /// Медиана времени ВЕРНОГО ответа, мс; 0 — верных нет.
  int get medianMs {
    final ms = [
      for (final a in attempts)
        if (a.correct) a.ms,
    ]..sort();
    if (ms.isEmpty) return 0;
    final m = ms.length ~/ 2;
    return ms.length.isOdd ? ms[m] : (ms[m - 1] + ms[m]) ~/ 2;
  }
}

class FindMoveVerdict {
  const FindMoveVerdict({required this.ok, this.best});
  final bool ok;

  /// Верный ход в записи SAN — показывается после ошибки.
  final String? best;
}

class FindMoveRun {
  FindMoveRun({required this.level, required this.deck, required this.now})
    : assert(deck.isNotEmpty) {
    _open();
  }

  final int level;
  final List<FindMovePuzzle> deck;
  final int Function() now;

  int step = 0;

  /// Номер хода человека в задаче (0 — первый).
  int moveIndex = 0;
  late String fen;

  /// Последний сыгранный ход (uci) — подсвечивается на доске.
  String? lastMove;
  String? selected;
  List<String> targets = const [];

  /// Превращение ждёт выбора фигуры: четыре хода uci.
  List<String> promotion = const [];
  String? hintSquare;
  FindMoveVerdict? verdict;
  FindMoveResult? result;
  final List<FindMoveAttempt> attempts = [];

  int _startedAt = 0;
  int _firstTouch = 0;
  int _verdictUntil = 0;

  FindMovePuzzle get puzzle => deck[step];
  bool get finished => result != null;
  bool get themeShown => findMoveStep(level).themeShown;

  /// Доска снизу — сторона человека (она ходит после хода соперника).
  bool get whiteBottom => fen.split(' ')[1] == 'w';
  double get secondsLeft =>
      max(0, findMoveSeconds - (now() - _startedAt) / 1000).toDouble();
  bool get canHint =>
      verdict == null && !finished && secondsLeft <= findMoveSeconds / 2;

  void _open() {
    final g = findMovePosition(puzzle, 0);
    fen = g.fen;
    lastMove = puzzle.opponent;
    moveIndex = 0;
    _startedAt = now();
    _firstTouch = 0;
    selected = null;
    targets = const [];
    promotion = const [];
    hintSquare = null;
    verdict = null;
  }

  void takeHint() {
    if (!canHint || hintSquare != null) return;
    hintSquare = puzzle.line[moveIndex * 2].substring(0, 2);
    _hintTaken.add(step);
  }

  void tick() {
    if (finished) return;
    if (verdict != null) {
      if (now() >= _verdictUntil) _next();
      return;
    }
    if (secondsLeft <= 0) _answer(false, timeout: true);
  }

  void tap(String square) {
    if (finished || verdict != null) return;
    if (_firstTouch == 0) _firstTouch = now();
    final from = selected;
    if (from != null && targets.contains(square)) {
      // Превращение: у хода четыре продолжения — выбор за человеком.
      final promos = ['q', 'r', 'b', 'n']
          .map((p) => '$from$square$p')
          .where((u) => sanOf(fen, u) != null)
          .toList();
      if (promos.isNotEmpty) {
        promotion = promos;
        return;
      }
      play('$from$square');
      return;
    }
    promotion = const [];
    final moves = movesFrom(fen, square);
    selected = moves.isEmpty ? null : square;
    targets = moves;
  }

  /// Сыграть ход человека (uci) — после касания или выбора превращения.
  void play(String uci) {
    if (finished || verdict != null) return;
    selected = null;
    targets = const [];
    promotion = const [];
    if (!findMoveAccepts(puzzle, moveIndex, uci)) {
      final expected = puzzle.line[moveIndex * 2];
      _answer(false, best: sanOf(fen, expected) ?? expected);
      return;
    }
    final g = findMoveBoard(fen);
    findMovePlay(g, uci);
    lastMove = uci;
    if (moveIndex == puzzle.playerMoves - 1) {
      fen = g.fen;
      _answer(true);
      return;
    }
    final reply = puzzle.line[moveIndex * 2 + 1];
    findMovePlay(g, reply);
    fen = g.fen;
    lastMove = reply;
    moveIndex++;
    hintSquare = null;
  }

  void _answer(bool correct, {String? best, bool timeout = false}) {
    if (finished || verdict != null) return;
    final full = now() - _startedAt;
    attempts.add(
      FindMoveAttempt(
        puzzle: puzzle,
        correct: correct,
        timeout: timeout,
        hinted: _hintTaken.contains(step),
        ms: full,
        msFirst: _firstTouch != 0 ? _firstTouch - _startedAt : full,
      ),
    );
    verdict = FindMoveVerdict(ok: correct, best: best);
    _verdictUntil = now() + (correct ? 700 : 1600);
  }

  /// Задачи, где брали подсказку, — на любом ходе задачи, не только последнем.
  final Set<int> _hintTaken = {};

  void _next() {
    final next = step + 1;
    if (next >= deck.length) {
      result = FindMoveResult(attempts: List.unmodifiable(attempts));
      return;
    }
    step = next;
    _open();
  }
}
