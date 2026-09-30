import 'ladder.dart';

/// ИТОГ ПОДХОДА «ДЕТСКОГО МАТА» — перенос `frontend/src/games/scholars-mate/core/run.ts`.
///
/// Сверяется с вебом эталоном (`test/fixtures/scholars-mate-check-reference.json`,
/// раздел `modes`), снятым прогоном живого TS.

/// Прятать ли вид ИМЕННО ЭТОЙ задачи: на верхних ступенях вопрос не объявляется
/// (ось «непредсказуемость»), но «да/нет» без вопроса — неисправность, а не
/// трудность, поэтому вид `threat` не прячется никогда.
bool hideKind(num level, ScholarsKind kind) =>
    !announceKind(level) && kind != ScholarsKind.threat;

/// Куда двигать ступень в потоке.
enum StepMove { up, down, stay }

/// 🔴 В ПОТОКЕ СТУПЕНЬ ДВИЖЕТСЯ ПО МЕДИАНЕ ВРЕМЕНИ, А НЕ ПО ДОЛЕ ВЕРНЫХ — той же
/// откалиброванной шкалой, что рисует звёзды: «быстро» в звёздах и «быстро» в
/// лестнице — одна величина. Без единого верного ответа медианы нет, и ступень
/// стоит: это не повод понижать молча.
StepMove stepByMedian(int medianMs, num level) {
  if (medianMs == 0) return StepMove.stay;
  final stars = starsFor(medianMs, level);
  return stars == 3
      ? StepMove.up
      : stars == 1
      ? StepMove.down
      : StepMove.stay;
}
