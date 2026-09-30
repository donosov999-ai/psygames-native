import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/samurai/levels.dart';
import 'package:psygames_flutter/games/samurai/rules.dart';
import 'package:psygames_flutter/games/sudoku/lesson.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';

/// 🔴 УЧИТЕЛЬ СУДОКУ ОБЯЗАН НАЗЫВАТЬ ПРИЁМ, А НЕ ПОКАЗЫВАТЬ ОТВЕТ.
///
/// Решение лежит рядом с доской, и «разбор», который просто открывает цифры по
/// порядку, написался бы за пять строк. Он ничему не учит, и внешне неотличим от
/// настоящего: шаги идут, цифры появляются. Поэтому проба мерит ДВЕ вещи —
/// что ходы верны и что у них есть ИМЯ ПРИЁМА.
void main() {
  String say(String key, Map<String, String> args) {
    var out = key;
    for (final e in args.entries) {
      out = '$out ${e.key}=${e.value}';
    }
    return out;
  }

  /// Лёгкая доска 9×9 с единственным решением (задача и ответ рядом).
  const puzzle = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ];

  test('🔴 ходы разбора совпадают с решением доски', () {
    final solution = solveGrid([for (final r in puzzle) [...r]], 9, 3, 3);
    expect(solution, isNotNull, reason: 'доска пробы не решается — проба мерит не то');
    final steps = sudokuLessonSteps(
      say: say, grid: puzzle, solution: solution!, n: 9, br: 3, bc: 3, limit: 8,
    );
    expect(steps.length, 8, reason: 'разбор короче потолка — шаги кончились раньше времени');
    for (final s in steps) {
      final m = s.payload as SudokuMove;
      expect(m.digit, solution[m.r][m.c], reason: 'цифра шага не из решения');
      expect(puzzle[m.r][m.c], 0, reason: 'разбор ставит цифру в занятую клетку');
      expect(m.grid[m.r][m.c], m.digit, reason: 'доска шага не показывает поставленную цифру');
    }
  });

  test('🔴 у каждого шага есть имя приёма, а не «вот ответ»', () {
    final solution = solveGrid([for (final r in puzzle) [...r]], 9, 3, 3)!;
    final steps = sudokuLessonSteps(
      say: say, grid: puzzle, solution: solution, n: 9, br: 3, bc: 3, limit: 8,
    );
    final named = steps.where((s) => !s.text!.startsWith('teachSudokuPlain')).length;
    // ⚠️ Число, а не «есть имена»: на лёгкой доске двух простых приёмов хватает
    // на все восемь шагов, и если завтра их станет пять — проба это покажет.
    expect(named, 8, reason: 'приём назван только у $named шагов из ${steps.length}');
    expect(steps.first.text, contains('d='), reason: 'подстановка цифры не подставилась');
    expect(steps.every((s) => s.box != null), isTrue, reason: 'шаг не показывает, КУДА смотреть');
  });

  test('🔴 разбор идёт от НЫНЕШНЕЙ доски, а не от начальной', () {
    final solution = solveGrid([for (final r in puzzle) [...r]], 9, 3, 3)!;
    // Человек уже поставил несколько цифр — разбор обязан продолжать с них.
    final started = [for (final r in puzzle) [...r]];
    started[0][2] = solution[0][2];
    started[0][3] = solution[0][3];
    final steps = sudokuLessonSteps(
      say: say, grid: started, solution: solution, n: 9, br: 3, bc: 3, limit: 8,
    );
    for (final s in steps) {
      final m = s.payload as SudokuMove;
      expect(started[m.r][m.c], 0, reason: 'разбор объясняет клетку, которую человек уже закрыл');
    }
  });

  test('🔴 самурай: приём называется и на ЕГО правиле, а не только на классике', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final levels = await SamuraiLevels.load();
    var named = 0;
    var total = 0;
    // ⚠️ Проверяем НЕСКОЛЬКО досок, а не одну: выборка одной уже подводила
    // (мутация 23.09 на судоку). Берём по доске с пяти ступеней.
    for (final lv in [1, 3, 5, 7, 9]) {
      final b = levels.boardAt(lv, 0);
      if (b == null) continue;
      final steps = sudokuLessonSteps(
        say: say,
        grid: b.puzzle,
        solution: b.solution,
        n: samuraiSize,
        br: 3,
        bc: 3,
        candidates: (g, r, c) => [for (var d = 1; d <= 9; d += 1) if (isValid(g, r, c, d)) d],
        exists: isSamuraiCell,
        lineSingles: false,
      );
      expect(steps, isNotEmpty, reason: 'на ступени $lv разбор пуст');
      for (final st in steps) {
        final m = st.payload as SudokuMove;
        expect(b.puzzle[m.r][m.c], 0, reason: 'ход в занятую клетку на ступени $lv');
        expect(isSamuraiCell(m.r, m.c), isTrue, reason: 'ход в клетку ВНЕ доски на ступени $lv');
        expect(m.digit, b.solution[m.r][m.c], reason: 'цифра не из решения на ступени $lv');
        total += 1;
        if (!st.text!.startsWith('teachSudokuPlain')) named += 1;
      }
    }
    expect(total, greaterThanOrEqualTo(20), reason: 'шагов для замера мало: $total');
    // 🔴 ЧИСЛО, А НЕ «ЕСТЬ ИМЕНА». Если однажды разбор самурая выродится в показ
    // ответа, проба скажет это числом, а не промолчит.
    expect(named, total, reason: 'приём назван у $named шагов из $total');
  });
}
