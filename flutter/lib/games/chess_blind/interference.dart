/// СЧЁТ МЕЖДУ ХОДАМИ И ОПРОСОМ — ось «интерференция» (с 11-й ступени).
///
/// Перенос с живого TS (`frontend/src/games/chess-blind/core/interference.ts`).
/// Между последним ходом вслепую и вопросами — пример «a + b = c», человек
/// говорит «верно / неверно». Удержать доску проговором «конь це-три» больше
/// нельзя: голова занята счётом (приём operation span, Turner & Engle).
///
/// ⚠️ Ответ на пример в счёт партии НЕ входит: это помеха, а не задание.
library;

import 'dart:math';

/// С какой ступени включается помеха — тот же рубеж, что у «розыска».
const int interferenceLevel = 11;

bool needsInterference(int level) => level >= interferenceLevel;

/// Сколько примеров за подход: 1 → 2 (с 14-й) → 3 (с 20-й). Потолок три — не
/// лень: четвёртый растил бы длину партии, а не трудность удержания.
int examplesPerRound(int level) {
  if (!needsInterference(level)) return 0;
  if (level >= 20) return 3;
  return level >= 14 ? 2 : 1;
}

/// Пример на счёт: левая часть, ПОКАЗАННЫЙ ответ и верен ли он.
class MathExample {
  const MathExample({
    required this.left,
    required this.shown,
    required this.correct,
  });

  /// «7 + 5». Всегда слева направо — математика не зеркалится.
  final String left;
  final int shown;
  final bool correct;
}

/// Пример. [hard] (с 14-й ступени) добавляет умножение и числа до 12.
///
/// ⚠️ НЕВЕРНЫЙ ОТВЕТ ОТЛИЧАЕТСЯ НА 1–3: отличие в десятки видно без счёта, и
/// помеха перестала бы быть счётом.
MathExample makeExample(bool hard, Random rnd) {
  final a = 1 + rnd.nextInt(hard ? 12 : 9);
  final b = 1 + rnd.nextInt(hard ? 12 : 9);
  final signs = hard ? const ['+', '-', '×'] : const ['+', '-'];
  final sign = signs[rnd.nextInt(signs.length)];
  final answer = switch (sign) {
    '+' => a + b,
    '-' => a - b,
    _ => a * b,
  };
  final correct = rnd.nextDouble() < 0.5;
  final shift = (rnd.nextDouble() < 0.5 ? -1 : 1) * (1 + rnd.nextInt(3));
  final shown = correct ? answer : answer + shift;
  // Сдвиг мог дать тот же ответ — тогда пример верный, и врать нельзя.
  return MathExample(
    left: '$a $sign $b',
    shown: shown,
    correct: shown == answer,
  );
}
