import 'dart:math';

import 'check.dart';
import 'ladder.dart';
import 'run.dart';

/// ПОДХОД «ДЕТСКОГО МАТА» — логика без пикселей.
///
/// Перенос `frontend/src/games/scholars-mate/ScholarsMateGame.tsx`. Всё, что там
/// выстрадано, держится здесь, а экран только показывает и передаёт касания:
/// - 🔴 ВРЕМЯ — ПО ИГРОВЫМ ЧАСАМ ([now] приходит снаружи): пока открыты пауза или
///   правила, часы стоят, иначе замер скорости мерил бы чтение справки;
/// - 🔴 ПОДХОД КОНЧАЕТСЯ РОВНО ОДИН РАЗ, и попытку записывает только первый ответ
///   (в вебе в кадре без перерисовки набегало 1422 попытки на колоду из восьми);
/// - 🔴 ДОСКА СО СТОРОНЫ ХОДЯЩЕГО — по задаче, а не по текущему FEN: внутри связки
///   в несколько ходов сторона чередуется, и доска дёргалась бы;
/// - 🔴 ЖЕРТВА ДОИГРЫВАЕТСЯ ДО МАТА: после верного хода играется ответ соперника;
/// - 🔴 ПОДСКАЗКА — С ПОЛОВИНЫ ВРЕМЕНИ И СТОИТ ЗВЕЗДЫ, время первого касания она
///   не трогает; на вопросе «грозит ли мат» её нет вовсе.
class ScholarsAttempt {
  const ScholarsAttempt({
    required this.puzzle,
    required this.answer,
    required this.correct,
    required this.timeout,
    required this.ms,
    required this.msFirst,
    required this.hinted,
  });

  final ScholarsPuzzle puzzle;
  final String answer;
  final bool correct;
  final bool timeout;

  /// Полное время на позицию и время до первого касания доски.
  final int ms;
  final int msFirst;
  final bool hinted;
}

class ScholarsResult {
  const ScholarsResult({
    required this.attempts,
    required this.solved,
    required this.total,
    required this.medianMs,
    required this.medianFullMs,
    required this.bestMs,
    required this.streak,
    required this.accuracy,
    required this.touched,
    required this.hints,
  });

  final List<ScholarsAttempt> attempts;
  final int solved;
  final int total;

  /// 🔴 ГЛАВНАЯ ЦИФРА — МЕДИАНА ВРЕМЕНИ ВЕРНОГО ОТВЕТА до первого касания, а не
  /// доля решённых: у знающего человека доля и так почти единица.
  final int medianMs;
  final int medianFullMs;
  final int bestMs;
  final int streak;
  final double accuracy;

  /// Хоть одно касание за подход — иначе это открытый экран, а не игра.
  final bool touched;
  final int hints;
}

class ScholarsVerdict {
  const ScholarsVerdict({required this.ok, this.best, this.refutation});

  final bool ok;

  /// Что было верно (SAN) и чем наказали неверную защиту.
  final String? best;
  final String? refutation;
}

class ScholarsRun {
  ScholarsRun({
    required this.level,
    required this.deck,
    required this.now,
    this.flowMs,
  }) : assert(deck.isNotEmpty) {
    final t = now();
    _startedAt = t;
    _flowStartedAt = t;
    fen = shownFen(deck.first);
  }

  final int level;
  final List<ScholarsPuzzle> deck;

  /// Игровые часы, мс. Стоят, пока игра не на экране.
  final int Function() now;

  /// Поток: позиции подряд, пока не кончится время. Пусто — обычный подход.
  final int? flowMs;

  late String fen;
  int step = 0;
  String? selected;
  List<String> targets = const [];
  String? hintSquare;
  int hintsUsed = 0;
  ScholarsVerdict? verdict;

  /// Ход связки, которого ждём («мат с жертвой» — два-три хода подряд).
  int lineStep = 0;
  ScholarsResult? result;
  final List<ScholarsAttempt> attempts = [];

  int _startedAt = 0;
  int _flowStartedAt = 0;
  int _firstTouch = 0;
  int _verdictUntil = 0;

  /// Замок: вердикт доезжает до экрана кадром позже, а второй ответ — сразу.
  bool _answering = false;

  int get seconds => levelParams(level).seconds;
  ScholarsPuzzle get puzzle => deck[step];
  bool get finished => result != null;
  bool get whiteBottom => sideToMove(puzzle) == 'w';

  /// На верхних ступенях вид задания не объявляется (кроме «да/нет»).
  bool get kindHidden => hideKind(level, puzzle.kind);

  double get secondsLeft =>
      max(0, seconds - (now() - _startedAt) / 1000).toDouble();

  /// До конца потока «м:сс».
  String get flowLeft {
    final ms = max(0, (flowMs ?? 0) - (now() - _flowStartedAt));
    final s = (ms / 1000).round();
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  bool get canHint =>
      verdict == null &&
      !finished &&
      puzzle.kind != ScholarsKind.threat &&
      secondsLeft <= seconds / 2;

  /// Подсказка: подсветить поле, с которого начинается решение.
  void takeHint() {
    if (!canHint || hintSquare != null || puzzle.solutions.isEmpty) return;
    hintsUsed++;
    hintSquare = puzzle.solutions.first.substring(0, 2);
  }

  /// Шаг часов: время вышло — промах; вердикт показан достаточно — дальше.
  void tick() {
    if (finished) return;
    if (verdict != null) {
      if (now() >= _verdictUntil) _next();
      return;
    }
    if (secondsLeft <= 0) _answer('', false, timeout: true);
  }

  /// Касание клетки «e4».
  void tap(String square) {
    if (finished || verdict != null || puzzle.kind == ScholarsKind.threat) {
      return;
    }
    if (_firstTouch == 0) _firstTouch = now();
    final from = selected;
    if (from != null && targets.contains(square)) {
      final uci = completeMove(fen, '$from$square');
      final line = puzzle.line;
      if (line.length > 1) {
        final wanted = lineStep * 2 < line.length ? line[lineStep * 2] : null;
        if (wanted != uci) {
          selected = null;
          targets = const [];
          _answer(uci, false, best: puzzle.san.join(' '));
          return;
        }
        final replyIndex = lineStep * 2 + 1;
        final reply = replyIndex < line.length ? line[replyIndex] : null;
        final after = playLineStep(fen, uci, reply);
        fen = after.fen;
        selected = null;
        targets = const [];
        if (after.mated || reply == null) {
          _answer(uci, true, best: puzzle.san.join(' '));
        } else {
          lineStep++;
        }
        return;
      }
      final v = check(puzzle, uci);
      if (v.fenAfter != null) fen = v.fenAfter!;
      _answer(uci, v.correct, best: v.best, refutation: v.refutation);
      return;
    }
    final moves = movesFrom(fen, square);
    if (moves.isEmpty) {
      selected = null;
      targets = const [];
      return;
    }
    selected = square;
    targets = moves;
  }

  /// Ответ на «грозит ли мат?».
  void answerThreat(bool yes) {
    if (finished || verdict != null || puzzle.kind != ScholarsKind.threat) {
      return;
    }
    if (_firstTouch == 0) _firstTouch = now();
    final truth = threatAnswer(puzzle);
    _answer(yes ? 'yes' : 'no', yes == truth, best: truth ? 'yes' : 'no');
  }

  void _answer(
    String answer,
    bool correct, {
    String? best,
    bool timeout = false,
    String? refutation,
  }) {
    if (_answering || finished) return;
    _answering = true;
    final full = now() - _startedAt;
    attempts.add(
      ScholarsAttempt(
        puzzle: puzzle,
        answer: answer,
        correct: correct,
        timeout: timeout,
        ms: full,
        msFirst: _firstTouch != 0 ? _firstTouch - _startedAt : full,
        hinted: hintSquare != null,
      ),
    );
    verdict = ScholarsVerdict(ok: correct, best: best, refutation: refutation);
    _verdictUntil = now() + (correct ? 550 : 1400);
  }

  void _next() {
    _answering = false;
    _firstTouch = 0;
    lineStep = 0;
    verdict = null;
    selected = null;
    targets = const [];
    final next = step + 1;
    final flowOver = flowMs != null && now() - _flowStartedAt >= flowMs!;
    if (next >= deck.length || flowOver) {
      _finish();
      return;
    }
    step = next;
    fen = shownFen(deck[next]);
    hintSquare = null;
    _startedAt = now();
  }

  void _finish() {
    if (finished) return;
    final right = attempts.where((a) => a.correct).toList();
    var run = 0;
    var best = 0;
    for (final a in attempts) {
      run = a.correct ? run + 1 : 0;
      best = max(best, run);
    }
    final firsts = [for (final a in right) a.msFirst];
    result = ScholarsResult(
      attempts: List.unmodifiable(attempts),
      solved: right.length,
      total: attempts.length,
      medianMs: medianMs(firsts),
      medianFullMs: medianMs([for (final a in right) a.ms]),
      bestMs: firsts.isEmpty ? 0 : firsts.reduce(min),
      streak: best,
      accuracy: attempts.isEmpty ? 0 : right.length / attempts.length,
      touched: attempts.any((a) => !a.timeout),
      hints: hintsUsed,
    );
  }
}
