import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/generator/contract.dart';
import 'package:psygames_flutter/games/sudoku/generator/engine.dart';
import 'package:psygames_flutter/games/sudoku/generator/store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПРИЁМКА §9.1: СТО АДАПТИВНЫХ ПАРТИЙ НЕ ТРОГАЮТ ПРОПИСАННЫЕ УРОВНИ.
///
/// Вариант В (решение Дениса 18.09): генератор идёт ОТДЕЛЬНЫМ путём рядом с 92
/// прописанными ступенями. Прогресс Вали и всех игроков на них не двигается — ни на
/// байт. Проверяется не чтением кода, а снимком хранилища: все ключи до и после.
void main() {
  late SharedState state;
  late GeneratorStore store;

  /// Прогресс человека на прописанном пути — то, что ломать нельзя.
  const fixedKeys = {
    'psygames_sudoku_level_nzt48': '54',
    'psygames_sudoku_level_easy_nzt48': '41',
    'psygames_sudoku_level_hard_nzt48': '12',
    'psygames_sudoku_samurai_level_nzt48': '7',
    'psygames_sudoku_fractal_level_nzt48': '18',
    'psygames_puzzles_solo_level_nzt48': '3',
  };

  setUp(() async {
    SharedPreferences.setMockInitialValues({...fixedKeys});
    state = await SharedState.open();
    store = GeneratorStore(state);
  });

  Map<String, String?> snapshotFixed() =>
      {for (final k in fixedKeys.keys) k: state.get(k)};

  test('🔴 сто адаптивных партий — прописанные ключи байт в байт прежние', () {
    final before = snapshotFixed();
    final pool = [
      for (var i = 0; i < 12; i++)
        Template(id: 'шаблон$i', band: i, rating: 900 + i * 90.0, variant: 'вариант${i % 4}'),
    ];

    var s = store.load();
    store.setEnabled(true);
    for (var i = 0; i < 100; i++) {
      final t = pickNext(s, pool, Leniency.normal)!;
      s = applyOutcome(
        s,
        OutcomeEvent(
          eventId: 'партия$i',
          task: TaskId(
            gameId: 'sudoku', templateId: t.id, difficultyBand: t.band,
            generatorVersion: 1, seed: 'зерно$i',
          ),
          outcome: i % 3 == 0 ? Outcome.failed : Outcome.passed,
          at: DateTime(2026, 9, 23).add(Duration(minutes: i)),
        ),
        template: t,
      );
      store.save(s);
    }

    expect(snapshotFixed(), before, reason: 'прописанные уровни сдвинулись — это вариант В сломан');
    expect(s.adaptiveWins, greaterThan(50), reason: 'побед начислено: ${s.adaptiveWins}');
    expect(state.get(store.stateKey), isNotNull, reason: 'своё состояние генератор пишет');
  });

  test('🔴 откат пилота стирает путь генератора и не трогает прописанное', () {
    store.setEnabled(true);
    store.save(AdaptiveState(adaptiveWins: 42, skillRating: 1500));
    store.appendShadow({'что_выбрал_бы': 'шаблон3'});

    final before = snapshotFixed();
    store.reset();

    expect(store.enabled, isFalse);
    expect(store.load().adaptiveWins, 0, reason: 'состояние стёрто');
    expect(store.shadowLog(), isEmpty);
    expect(snapshotFixed(), before, reason: 'откат не смеет трогать прописанные ключи');
  });

  test('🔴 путь генератора выключен по умолчанию: пилот за флагом', () {
    expect(GeneratorStore(state).enabled, isFalse);
  });

  test('ключи генератора не пересекаются с ключами прописанного пути', () {
    for (final k in [store.stateKey, store.flagKey, store.shadowKey]) {
      expect(fixedKeys.containsKey(k), isFalse, reason: 'ключ $k занят прописанным путём');
      expect(k.startsWith('psygames_sudoku_adaptive'), isTrue, reason: k);
    }
  });

  test('журнал теневого выбора не растёт бесконечно', () {
    for (var i = 0; i < 250; i++) {
      store.appendShadow({'i': i}, limit: 200);
    }
    final log = store.shadowLog();
    expect(log.length, 200);
    expect(log.first['i'], 50, reason: 'обрезается с начала, свежее сохраняется');
  });
}
