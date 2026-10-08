/// Партия ФИЛВОРДОВ внутри «Корректуры» — второе задание экрана (задача caaa1596).
///
/// Правило зачёта, поле, подсказка и шаг линии живут в ядре (`games/fillwords/core`, перенос
/// «Слов», сверен с живым TS). Здесь — только то, что веб держит в самом экране
/// (`proofreading.tsx`: `fwBegin`, `fwStep`, `fwCommit`, `fwRelease`, `fwTakeHint`), без
/// виджетов: так правила ввода пробуются без пальца и без кадра.
///
/// ⚠️ ДВА СПОСОБА ВЕСТИ ЛИНИЮ, ОДНО ПРАВИЛО. Протягивание и тапы по соседним буквам идут через
/// один `stepTrace`. Сданной считается только ПРОТЯНУТАЯ линия: набранная тапами при
/// отпускании не сдаётся — человек ещё набирает, и штрафовать каждую промежуточную букву
/// было бы наказанием за способ ввода (веб, `fwRelease`).
///
/// ⚠️ СЛОВО ЗАСЧИТЫВАЕТСЯ В МИГ, КОГДА ЛИНИЯ ЕГО НАКРЫЛА, не дожидаясь отпускания. Это
/// безопасно, потому что раскладка — разбиение: клетки слов не пересекаются, и недостроенная
/// линия одного слова не может совпасть с полным путём другого (веб, `fwCommit`).
library;

import '../../shell/game_clock.dart';
import '../fillwords/core/fillwords.dart';

/// Что случилось после жеста — экрану, чтобы ответить отзывом.
enum FwOutcome { none, hit, miss }

class FwRound {
  FwRound({
    required this.level,
    required FillwordsPuzzle puzzle,
    required SubmitOrder order,
    required this.hintsAllowed,
    required this.timeLimitSec,
    int Function()? nowMs,
  })  : session = createFillwordsSession(puzzle, order),
        // Часы партии — игровые: стоят, пока поверх пауза, разбор или приложение в фоне.
        _now = nowMs ?? gameNow;

  final int level;

  /// Подсказок на уровне — ступень лестницы (`fillwordsLevel(level).hints`), не константа.
  final int hintsAllowed;

  /// Лимит партии, с. 0 — без лимита.
  final int timeLimitSec;
  final int Function() _now;

  FillwordsSession session;

  /// Черновик линии — клетки, по которым сейчас ведут палец (ещё не сдан).
  List<int> trace = const [];

  /// Что показывает подсказка; гаснет вместе со словом, которое показывала.
  FillwordsHint? hint;
  bool finished = false;
  bool _dragged = false;
  int _startedAt = 0;

  FillwordsPuzzle get puzzle => session.puzzle;
  int get found => session.found.length;
  int get total => puzzle.words.length;
  int get mistakes => session.mistakes;
  int get hintsLeft => hintsAllowed - session.hints < 0 ? 0 : hintsAllowed - session.hints;
  bool get cleared => isCleared(session);

  void begin() {
    _startedAt = _now();
    finished = false;
  }

  double get elapsedSec => (_now() - _startedAt) / 1000.0;
  bool get timeUp => timeLimitSec > 0 && elapsedSec >= timeLimitSec;
  double get finalSec => timeLimitSec > 0 && elapsedSec > timeLimitSec ? timeLimitSec.toDouble() : elapsedSec;

  /// Палец коснулся клетки (`fwBegin`). Касание НЕ рядом с концом линии начинает новую:
  /// человек передумал и взялся за другое слово, а не продолжает старое через полполя.
  FwOutcome touch(int cell) {
    _dragged = false;
    if (finished) return FwOutcome.none;
    if (trace.isNotEmpty && stepTrace(session, trace, cell).length != trace.length) return _step(cell);
    trace = session.owner[cell] == -1 ? [cell] : const [];
    return FwOutcome.none;
  }

  /// Палец ведёт по клетке (`fwExtend`).
  FwOutcome drag(int cell) {
    _dragged = true;
    return _step(cell);
  }

  /// Один шаг линии (`fwStep`): правило шага — ядра (`stepTrace`).
  FwOutcome _step(int cell) {
    if (finished) return FwOutcome.none;
    final next = stepTrace(session, trace, cell);
    if (next.length == trace.length) return FwOutcome.none; // шаг незаконный или на месте
    if (next.length < trace.length) {
      trace = next; // стёрли хвост
      return FwOutcome.none;
    }
    return _commit(next);
  }

  /// Линия накрыла слово — засчитать сразу (`fwCommit`); иначе — это просто черновик.
  FwOutcome _commit(List<int> next) {
    final step = applyTrace(session, next);
    if (!step.trace.ok) {
      trace = next;
      return FwOutcome.none;
    }
    session = step.session;
    trace = const [];
    if (hint != null && hint!.wordIndex == step.trace.wordIndex) hint = null;
    if (cleared) finished = true;
    return FwOutcome.hit;
  }

  /// Палец отпущен (`fwRelease`). Попадание засчитано по ходу — сюда доходит только промах.
  FwOutcome release() {
    final dragged = _dragged;
    _dragged = false;
    if (!dragged) return FwOutcome.none;
    final path = trace;
    trace = const [];
    if (finished || path.length < 2) return FwOutcome.none;
    final step = applyTrace(session, path);
    if (!step.trace.ok && step.trace.reason == FillwordsRejectReason.noMatch) {
      session = step.session;
      return FwOutcome.miss;
    }
    return FwOutcome.none;
  }

  /// Подсказка (`fwTakeHint`): самое короткое ненайденное слово целиком — правило ядра.
  bool takeHintNow() {
    if (finished || session.hints >= hintsAllowed) return false;
    final taken = takeHint(session);
    session = taken.session;
    hint = taken.hint;
    return taken.hint != null;
  }

  void stopByTime() => finished = true;
}

/// Поля партии филвордов — как веб (`saveSession`): то же, что у букв, но мера — слова, а
/// проход — поле разобрано ЦЕЛИКОМ (допуска нет: оставшиеся буквы — нерешённое поле).
Map<String, Object?> fillwordsSessionDetails(FwRound r, {required Map<String, Object?> levelCondition}) {
  final total = r.total;
  final found = r.found;
  final missed = total - found < 0 ? 0 : total - found;
  return {
    'level': r.level,
    ...levelCondition,
    'hits': found,
    'errors': r.mistakes,
    'missed': missed,
    'n_targets': total,
    'proof_omission_pct': total > 0 ? (missed / total * 100).round() : 0,
    'accuracy': total > 0 ? (found / total * 100).round() : 100,
    'rows': r.puzzle.rows,
    'cols': r.puzzle.cols,
    'time_limit_sec': r.timeLimitSec,
    'task_mode': 'fillwords',
    'hints': r.session.hints,
    'letters_left': lettersLeft(r.session),
  };
}
