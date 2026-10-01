import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_clock.dart';

/// Часы партии идут вместе с поддельным временем `testWidgets`: `tester.pump(d)` двигает и их.
///
/// 🔴 БЕЗ ЭТОГО ТАЙМЕР ПАРТИИ В ПРОБЕ НЕ СТРЕЛЯЕТ. `GameTimer` ставит обычный `Timer` на
/// остаток и при срабатывании сверяется с `gameNow()`, а тот по умолчанию читает настоящие
/// часы машины — в пробе они почти стоят, и таймер откладывает сам себя без конца.
/// Звать в начале `testWidgets`, до `pumpWidget`: экран берёт отметку старта при создании.
void useFakeGameClock(WidgetTester tester) {
  resetGameClock();
  gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
  addTearDown(() {
    resetGameClock();
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
  });
}
