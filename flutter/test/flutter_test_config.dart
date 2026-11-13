import 'dart:async';

import 'package:psygames_flutter/shell/answer_feedback.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/level_result.dart';

import 'support/game_clock_fake.dart';

/// Общая настройка всех проб: часы партии идут по поддельному времени `testWidgets`
/// (см. `testGameWallMs`). Пробы, которым нужны свои часы, по-прежнему ставят `gameWallMs` сами.
/// Автопереход итога уровня ([LevelResult]) в пробах выключен.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  gameWallMs = testGameWallMs;
  // Итог уровня сам начинает следующую партию через 1,5–2,5 с; пробы игр смотрят на итог дольше и
  // этого не ждут. Автопереход проверяет своя проба (`level_result_test.dart`), включая его обратно.
  LevelResult.autoAdvance = false;
  // Анимацию победы (Lottie и Flame) пробы игр не грузят; её проверяет `level_result_test.dart`.
  LevelResult.effects = false;
  // Отклик на ответ в пробах — без звукового движка (подсветка, пауза и вибрация остаются).
  AnswerFeedback.backendFactory = () => null;
  await testMain();
}
