// Серия дыхания считает день ПО МЕСТНОМУ времени (задача 2925c9f1).
//
// Веб писал день по UTC, натив — по местному; веб-экран «Дыхания» из приложения убран
// (`/games/breathing` — только `PauseScreen`), так что писатель теперь один. Проба держит
// именно это: ночная практика (02:00 в UTC+5 — это «вчера» по UTC) не рвёт и не удваивает серию.
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/breathing.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late BreathLedger ledger;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    ledger = BreathLedger(await SharedState.open());
  });

  test('ночная практика и дневная на следующие сутки — серия 2, а не 1', () async {
    await ledger.complete(DateTime(2026, 11, 10, 2, 0)); // 02:00 местного
    expect(ledger.streakDays, 1);
    await ledger.complete(DateTime(2026, 11, 11, 23, 30)); // следующий календарный день
    expect(ledger.streakDays, 2);
  });

  test('два подхода за один местный день серию не удваивают, счётчик подходов растёт', () async {
    await ledger.complete(DateTime(2026, 11, 10, 1, 0));
    await ledger.complete(DateTime(2026, 11, 10, 23, 0));
    expect(ledger.streakDays, 1);
    expect(ledger.run, 3, reason: 'подход 1 → 2 → 3');
  });

  test('пропущенный день обнуляет серию до 1', () async {
    await ledger.complete(DateTime(2026, 11, 10, 9, 0));
    await ledger.complete(DateTime(2026, 11, 12, 9, 0));
    expect(ledger.streakDays, 1);
  });
}
