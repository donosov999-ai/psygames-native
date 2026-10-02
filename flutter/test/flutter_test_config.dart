import 'dart:async';

import 'package:psygames_flutter/shell/game_clock.dart';

import 'support/game_clock_fake.dart';

/// Общая настройка всех проб: часы партии идут по поддельному времени `testWidgets`
/// (см. `testGameWallMs`). Пробы, которым нужны свои часы, по-прежнему ставят `gameWallMs` сами.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  gameWallMs = testGameWallMs;
  await testMain();
}
