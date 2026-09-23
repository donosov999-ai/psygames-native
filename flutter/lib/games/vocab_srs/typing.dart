/// ДВИЖОК НАБОРА ПО ОБРАЗЦУ — перенос `frontend/src/services/typing.ts`.
///
/// 🔴 ЭТО НЕ ПОЛЕ ВВОДА, А ПРИЁМНИК НАЖАТИЙ. Обычный текстовый ввод разрешает
/// вставку из буфера, стирание середины и автозамену — то есть даёт обойти саму
/// механику. Здесь значение выставляет ДВИЖОК по одному нажатию: вставленный
/// текст он не примет.
///
/// 🔴 СТРОГИЙ РЕЖИМ (`blockOnError`) — метод Шестова целиком: пока не нажат
/// верный символ, курсор СТОИТ. Ошибка считается, но вперёд не пускает.
///
/// 🔴 ПОСЛАБЛЕНИЕ (`lenient`) — только для диктанта на слух (решение Дениса
/// 11.09.2026). Заглавная буква и запятая на слух НЕ ЗВУЧАТ: требовать их значит
/// мерить орфографию под видом слуха, а при блокировке ещё и запирать человека на
/// символе, которого он не мог услышать. У словаря и беглости печать ПО ОБРАЗЦУ,
/// там нулевая терпимость к опечатке — поэтому послабление отдельным флагом, а не
/// сменой общего правила.
///
/// Сверка с живым TS: раздел `печать` в `flutter/test/fixtures/vocab-srs-reference.json`.
library;

/// Состояние символа образца.
class Mark {
  Mark._();
  static const int pending = 0;
  static const int correct = 1;

  /// Зафиксированная ошибка — только в свободном режиме, где курсор идёт дальше.
  static const int wrong = 2;
}

/// Знаки препинания: их не набирают, они проставляются сами (при послаблении).
final RegExp typingPunct = RegExp(r'[.,!?;:…—–‑\-«»"' "'" r'“”‘’()\[\]]');

bool isPunct(String ch) => typingPunct.hasMatch(ch);

class KeyResult {
  const KeyResult({required this.accepted, required this.wrong, required this.finished});

  /// Символ принят, курсор продвинулся.
  final bool accepted;
  final bool wrong;
  final bool finished;
}

class TypingStats {
  const TypingStats({
    required this.typed,
    required this.errors,
    required this.elapsedMs,
    required this.wpm,
    required this.accuracy,
  });
  final int typed;
  final int errors;
  final int elapsedMs;
  final int wpm;
  final int accuracy;
}

class TypingState {
  TypingState._(this.pattern, this.marks, {required int Function() nowMs}) : _now = nowMs;

  /// Плоский образец: строки соединены переводом строки.
  final String pattern;

  /// Статус каждого символа: [Mark.pending] / [Mark.correct] / [Mark.wrong].
  final List<int> marks;

  final int Function() _now;

  int pos = 0;
  int errors = 0;
  int? startedAt;
  int? finishedAt;

  /// Новое состояние набора.
  ///
  /// ⚠️ При послаблении пропускаются знаки И ПРОБЕЛЫ В НАЧАЛЕ. Фраза может
  /// начинаться со знака («— Привет»): пробел в середине человек набирает сам
  /// (он слышен паузой между словами), а пробел ПЕРЕД первым словом поставил тот
  /// же знак, которого человек не печатал. Без этого курсор вставал на пробел и
  /// партия запиралась на первом же символе.
  factory TypingState.create(List<String> lines, {bool lenient = false, int Function()? nowMs}) {
    final pattern = lines.join('\n');
    final st = TypingState._(
      pattern,
      List<int>.filled(pattern.length, Mark.pending),
      nowMs: nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
    );
    if (lenient) {
      while (st.pos < pattern.length &&
          (isPunct(pattern[st.pos]) || RegExp(r'\s').hasMatch(pattern[st.pos]))) {
        st.marks[st.pos] = Mark.correct;
        st.pos += 1;
      }
    }
    return st;
  }

  void _skipPunct() {
    while (pos < pattern.length && isPunct(pattern[pos])) {
      marks[pos] = Mark.correct;
      pos += 1;
    }
  }

  /// Обработать нажатие. [blockOnError] — не пускать дальше до верного символа.
  KeyResult pressChar(String ch, {required bool blockOnError, bool lenient = false}) {
    if (finishedAt != null) return const KeyResult(accepted: false, wrong: false, finished: true);
    startedAt ??= _now();

    final expected = pos < pattern.length ? pattern[pos] : null;
    // Возврат каретки в образце — ждём перевод строки.
    final norm = ch == '\r' ? '\n' : ch;
    // При послаблении регистр не важен: сравниваем в нижнем регистре ОБА символа,
    // а не приводим образец — на экране он должен остаться как в языке.
    final ok = lenient ? norm.toLowerCase() == (expected ?? '').toLowerCase() : norm == expected;

    if (ok) {
      marks[pos] = Mark.correct;
      pos += 1;
      if (lenient) _skipPunct();
      final done = pos >= pattern.length;
      if (done) finishedAt = _now();
      return KeyResult(accepted: true, wrong: false, finished: done);
    }

    errors += 1;
    if (blockOnError) {
      // Курсор стоит, символ ждёт верного нажатия.
      return const KeyResult(accepted: false, wrong: true, finished: false);
    }
    marks[pos] = Mark.wrong;
    pos += 1;
    final done = pos >= pattern.length;
    if (done) finishedAt = _now();
    return KeyResult(accepted: true, wrong: true, finished: done);
  }

  void backspace() {
    if (finishedAt != null) return;
    if (pos > 0) {
      pos -= 1;
      marks[pos] = Mark.pending;
    }
  }

  TypingStats stats() {
    final now = finishedAt ?? _now();
    final elapsedMs = startedAt != null ? now - startedAt! : 0;
    var correct = 0;
    for (var i = 0; i < pos; i += 1) {
      if (marks[i] == Mark.correct) correct += 1;
    }
    final minutes = elapsedMs / 60000;
    // Слово = пять знаков, как принято в замерах скорости печати.
    final wpm = minutes > 0 ? (correct / 5 / minutes).round() : 0;
    final totalKeys = correct + errors;
    final accuracy = totalKeys > 0 ? (correct / totalKeys * 100).round() : 100;
    return TypingStats(typed: correct, errors: errors, elapsedMs: elapsedMs, wpm: wpm, accuracy: accuracy);
  }
}
