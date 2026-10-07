import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_clock.dart';

/// Часы партии для проб: внутри `testWidgets` — поддельное время теста, вне его — настоящее.
///
/// 🔴 ЗАЧЕМ ПО УМОЛЧАНИЮ ДЛЯ ВСЕХ ПРОБ (ставит `flutter_test_config.dart`). `GameTimer`
/// при срабатывании сверяет срок с `gameNow()`, а тот по умолчанию читает часы машины.
/// В пробе без подмены таймер партии стреляет, только когда настоящие миллисекунды успели
/// натикать, — исход зависит от скорости раннера. Замер 02.10.2026: TestFlight 2.56.8
/// упал на `corsi_assessment_step_test.dart` (второй показ ряда пуст за 6 с поддельного
/// времени), а тот же коммит на CI main и в 2.56.7 был зелёным. Без подмены жили
/// 22 пробы экранов на игровых часах, 13 из них — «Судоку».
int testGameWallMs() {
  try {
    final b = TestWidgetsFlutterBinding.instance;
    if (b.inTest) return b.clock.now().millisecondsSinceEpoch;
  } catch (_) {
    // Привязка ещё не создана — обычный `test`, поддельного времени нет.
  }
  return DateTime.now().millisecondsSinceEpoch;
}

/// Часы партии идут вместе с поддельным временем `testWidgets`: `tester.pump(d)` двигает и их.
///
/// 🔴 БЕЗ ЭТОГО ТАЙМЕР ПАРТИИ В ПРОБЕ НЕ СТРЕЛЯЕТ. `GameTimer` ставит обычный `Timer` на
/// остаток и при срабатывании сверяется с `gameNow()`, а тот по умолчанию читает настоящие
/// часы машины — в пробе они почти стоят, и таймер откладывает сам себя без конца.
/// Звать в начале `testWidgets`, до `pumpWidget`: экран берёт отметку старта при создании.
/// С 02.10.2026 то же делает `flutter_test_config.dart` для всех проб; здесь остаётся сброс паузы.
void useFakeGameClock(WidgetTester tester) {
  resetGameClock();
  gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
  addTearDown(() {
    resetGameClock();
    gameWallMs = testGameWallMs;
  });
}
