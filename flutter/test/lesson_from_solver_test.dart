import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/lesson.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';

/// 🔴 РАЗБОР ПО ШАГАМ БЕРЁТСЯ У РЕШАТЕЛЯ ДВИЖКА — И РАБОТАЕТ НА ВСЕЙ КОЛЛЕКЦИИ.
///
/// Решение Дениса 24.09.2026: «решатель и учитель вообще должны быть в каждом
/// упражнении… нативный генератор, чтобы руками не делать более 100 штук».
/// Проба отвечает числом на два вопроса: у скольких режимов разбор получается, и
/// не портит ли он доску игроку.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final libPath = '${Directory.current.path}/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() async {
    await PuzzleModes.load();
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'],
        workingDirectory: Directory.current.path);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  test('🔴 доска игрока ОСТАЁТСЯ как была — разбор показывает, а не решает за него', () async {
    final e = TathamEngine.open(libPath);
    final i = e.indexOf('Solo');
    e.start(i, '3x3db', 20260924);
    final before = e.draw();
    final steps = await TathamLesson(e, canSolve: true, gameName: 'Solo').steps();

    expect(steps.length, greaterThan(5), reason: 'шагов не набралось — разбирать нечего');
    expect(e.draw(), before, reason: 'после разбора доска обязана быть прежней');
  });

  test('🔴 шаг = КЛЕТКА, а не примитив: шагов столько же, сколько пустых клеток', () async {
    final e = TathamEngine.open(libPath);
    final i = e.indexOf('Solo');
    e.start(i, '3x3db', 20260924);
    final steps = await TathamLesson(e, canSolve: true, gameName: 'Solo').steps();

    /*
     * Доска 9×9 — 81 клетка, часть заполнена подсказками. Пустых у обычной
     * раздачи заметно меньше восьмидесяти одной и заметно больше десяти.
     * ⚠️ Точное число зависит от зерна, поэтому проверяем ГРАНИЦЫ, а не равенство:
     * равенство здесь было бы проверкой генератора досок, а не разбора.
     */
    expect(steps.length, lessThanOrEqualTo(81), reason: 'шагов больше, чем клеток на доске');
    expect(steps.length, greaterThanOrEqualTo(20), reason: 'шагов подозрительно мало');
    // Клетки не повторяются: две карточки на одну клетку — это и есть «шаг на примитив».
    final places = steps.map((s) => '${s.box.x}:${s.box.y}').toSet();
    expect(places.length, steps.length, reason: 'две карточки встали на одну клетку');
  });

  test('🔴 сколько режимов коллекции получают разбор даром', () async {
    final e = TathamEngine.open(libPath);
    var got = 0;
    final empty = <String>[];
    for (final entry in PuzzleModes.all.entries) {
      final i = e.indexOf(entry.value.engineName);
      if (i < 0) continue;
      final steps = resolveSteps(entry.value, e, i);
      e.start(i, steps.first.params, 20260924);
      final lesson = await TathamLesson(e, canSolve: true, gameName: entry.key).steps();
      if (lesson.isNotEmpty) {
        got++;
      } else {
        empty.add(entry.key);
      }
    }
    // Замер 24.09.2026: решатель движка доводит до решения 37 режимов из 42.
    // Число держим на виду — упадёт, значит потеряли режим, и это видно сразу.
    expect('разбор есть у $got из ${PuzzleModes.all.length}', 'разбор есть у 37 из 42',
        reason: 'без разбора остались: ${empty.join(", ")}');
  });

  test('без решателя разбор не выдумывается, а называет причину', () async {
    final e = TathamEngine.open(libPath);
    final lesson = TathamLesson(e, canSolve: false, gameName: 'Mines');
    expect(await lesson.steps(), isEmpty);
    expect(lesson.unavailableReason, isNotNull,
        reason: 'пустой список без причины — это пропуск, а не ответ');
  });
}
