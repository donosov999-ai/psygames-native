import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/reject_why.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КЛЕТКИ ШРЁДИНГЕРА (6aecf181 п.13, задача f46c796c): цифры 0–9, в каждой строке, столбце и блоке
/// каждая по разу, поэтому одна клетка ряда держит две цифры — где она, выводит игрок. Натив задачу
/// не решает: доска приходит из выгрузки (эталон — боевой путь ядра, код клетки `encodeS`). Здесь:
/// код разобран своим счётом; ход — добавить или убрать цифру, не больше двух; ошибка — только
/// цифра не из ответа, одна верная из пары — не ошибка; нажатиями по экрану — клавиша «0», пара по
/// одной цифре, ошибка, «Стереть», победа; имя и правило на 12 языках.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final ref = jsonDecode(File('test/fixtures/sudoku-schrodinger-reference.json').readAsStringSync()) as Map<String, Object?>;
  List<List<int>> ints(Object? v) => [for (final row in v! as List) [for (final x in row as List) (x as num).toInt()]];
  final puzzle = ints(ref['puzzle']);
  final solution = ints(ref['solution']);

  test('разбор эталона своим счётом: в каждом ряду цифры 0–9 по разу и ровно одна пара', () {
    final units = <List<(int, int)>>[
      for (var i = 0; i < 9; i++) [for (var j = 0; j < 9; j++) (i, j)],
      for (var i = 0; i < 9; i++) [for (var j = 0; j < 9; j++) (j, i)],
      for (var b = 0; b < 9; b++) [for (var j = 0; j < 9; j++) ((b ~/ 3) * 3 + j ~/ 3, (b % 3) * 3 + j % 3)],
    ];
    for (final u in units) {
      final ds = [for (final (r, c) in u) ...schroDigits(solution[r][c])]..sort();
      expect(ds, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(u.where((rc) => schroDigits(solution[rc.$1][rc.$2]).length == 2), hasLength(1));
    }
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (puzzle[r][c] != 0) expect(puzzle[r][c], solution[r][c], reason: '($r,$c)');
        expect(schroCode(schroDigits(solution[r][c])), solution[r][c]);
      }
    }
    expect(puzzle.expand((row) => row).where((v) => v >= 100).length, lessThan(9), reason: 'не все пары показаны');
  });

  test('🔴 код клетки как у ядра: пусто 0, цифра d — d+1, пара — 100+10a+b', () {
    expect(schroDigits(0), isEmpty);
    expect(schroDigits(1), [0]);
    expect(schroDigits(10), [9]);
    expect(schroDigits(127), [2, 7]);
    expect(schroCode([7, 2]), 127);
  });

  test('🔴 ход: цифра добавляется или убирается, не больше двух; клавиша 10 — ноль', () {
    var v = schroToggle(0, 3);
    expect(schroDigits(v), [3]);
    v = schroToggle(v, 10);
    expect(schroDigits(v), [0, 3]);
    expect(schroToggle(v, 5), v, reason: 'третьей цифры не бывает');
    expect(schroDigits(schroToggle(v, 3)), [0], reason: 'нажатая снова — убирается');
  });

  test('🔴 ошибка — только цифра не из ответа; одна верная из пары — клетка не дописана', () {
    final pair = schroCode([2, 7]);
    expect(schroWrong(schroCode([2]), pair), isFalse);
    expect(schroWrong(schroCode([7, 2]), pair), isFalse);
    expect(schroWrong(schroCode([2, 5]), pair), isTrue);
    expect(schroWrong(schroCode([4]), schroCode([3])), isTrue);
  });

  test('🔴 подсветка: одна верная цифра из пары не красная, цифра не из ответа — красная', () {
    final (r, c) = [for (var i = 0; i < 9; i++) for (var j = 0; j < 9; j++) if (solution[i][j] >= 100) (i, j)].first;
    final board = SudokuBoard(level: 145, n: 9, br: 3, bc: 3, variant: 'schrodinger', puzzle: puzzle, solution: solution, geometry: const BoardGeometry());
    const base = (selected: false, sameValue: false, sameLine: false, wrong: true);   // общая подсветка: код ≠ ответа
    final ds = schroDigits(solution[r][c]);
    expect(schroLook(board, base, schroCode([ds[0]]), r, c).wrong, isFalse);
    expect(schroLook(board, base, schroCode([ds[0], (ds[1] + 1) % 10 == ds[0] ? (ds[1] + 2) % 10 : (ds[1] + 1) % 10]), r, c).wrong, isTrue);
    final classic = SudokuBoard(level: 5, n: 9, br: 3, bc: 3, variant: 'none', puzzle: puzzle, solution: solution, geometry: const BoardGeometry());
    expect(schroLook(classic, base, 3, r, c).wrong, isTrue, reason: 'у других вариантов подсветка своя, не трогаем');
  });

  group('нажатиями по экрану', () {
    const key = 'psygames_resume_sudoku_nzt48';
    late SharedState state;

    setUpAll(() async {
      await L.load('ru');
      await WordokuWords.load();
    });

    Future<void> mount(WidgetTester tester) async {
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
        for (var i = 0; i < 80; i++) {
          await tester.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 20));
          if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
        }
      });
      await tester.pump();
    }

    Future<void> tap(WidgetTester tester, Finder f) async {
      await tester.tap(f, warnIfMissed: false);
      await tester.pump();
    }

    String textAt(WidgetTester tester, int r, int c) {
      final t = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
      return t.evaluate().isEmpty ? '' : tester.widget<Text>(t.first).data ?? '';
    }

    Future<Map<String, Object?>> leaveAndRead(WidgetTester tester) async {
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      return ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();
    }

    /// Доска Шрёдингера приходит снимком партии: на лестнице её ещё нет (ступени ставит раздел уровней).
    Future<void> boot(WidgetTester tester, List<List<int>> grid) async {
      SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '5'});
      await tester.runAsync(() async => state = await SharedState.open());
      await mount(tester);
      expect(find.byKey(const Key('digit0')), findsNothing, reason: 'у классики клавиши «0» нет');
      await tap(tester, find.byKey(const Key('cell_0_0')));
      await tap(tester, find.byKey(const Key('digit5')));
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      final env = (jsonDecode(state.get(key)!) as Map).cast<String, Object?>();
      final s = (env['state'] as Map).cast<String, Object?>();
      s
        ..['variant'] = 'schrodinger'
        ..['puzzle'] = puzzle
        ..['solution'] = solution
        ..['grid'] = grid
        ..['given'] = [for (final row in puzzle) [for (final v in row) v != 0]]
        ..['marks'] = List.generate(9, (_) => List.filled(9, 0))
        ..['cellColors'] = List.generate(9, (_) => List.filled(9, noSudokuColor))
        ..['history'] = {'past': <Object>[], 'future': <Object>[]}
        ..['errors'] = 0;
      env['state'] = s;
      await tester.runAsync(() => state.set(key, jsonEncode(env)));
      await mount(tester);
    }

    /// Пустая в задаче клетка-пара (клетка Шрёдингера, которую выводит игрок).
    (int, int) hiddenPair() => [
          for (var r = 0; r < 9; r++)
            for (var c = 0; c < 9; c++)
              if (puzzle[r][c] == 0 && solution[r][c] >= 100) (r, c)
        ].first;
    int keyOf(int d) => d == 0 ? 10 : d;

    testWidgets('🔴 пара по одной цифре без ошибки; цифра не из ответа — ошибка; «Стереть» чистит', (tester) async {
      await boot(tester, puzzle);
      expect(find.byKey(const Key('digit0')), findsOneWidget, reason: 'у Шрёдингера есть клавиша «0»');
      final (r, c) = hiddenPair();
      final ds = schroDigits(solution[r][c]);
      await tap(tester, find.byKey(Key('cell_${r}_$c')));
      await tap(tester, find.byKey(Key('digit${keyOf(ds[0]) % 10}')));
      expect(textAt(tester, r, c), '${ds[0]}');
      await tap(tester, find.byKey(Key('digit${keyOf(ds[1]) % 10}')));
      expect(textAt(tester, r, c), '${ds[0]} ${ds[1]}', reason: 'две цифры в одной клетке');
      var st = await leaveAndRead(tester);
      expect(st['errors'], 0, reason: 'первая верная из пары — не ошибка');
      expect((st['grid']! as List)[r][c], solution[r][c]);

      // Цифра не из ответа — в одиночную клетку.
      await mount(tester);
      final (sr, sc) = [
        for (var i = 0; i < 9; i++)
          for (var j = 0; j < 9; j++)
            if (puzzle[i][j] == 0 && solution[i][j] < 100) (i, j)
      ].first;
      final right = schroDigits(solution[sr][sc]).single;
      final wrong = (right + 1) % 10;
      await tap(tester, find.byKey(Key('cell_${sr}_$sc')));
      await tap(tester, find.byKey(Key('digit${keyOf(wrong) % 10}')));
      expect(textAt(tester, sr, sc), '$wrong');
      await tap(tester, find.byKey(const Key('erase')));
      expect(textAt(tester, sr, sc), '', reason: '«Стереть» чистит клетку');
      st = await leaveAndRead(tester);
      expect(st['errors'], 1, reason: 'цифра не из ответа — ошибка');
    });

    testWidgets('🔴 последняя клетка — пара по двум нажатиям — и доска решена', (tester) async {
      final (r, c) = hiddenPair();
      final grid = [for (final row in solution) [...row]]..[r][c] = 0;
      await boot(tester, grid);
      final ds = schroDigits(solution[r][c]);
      await tap(tester, find.byKey(Key('cell_${r}_$c')));
      await tap(tester, find.byKey(Key('digit${keyOf(ds[1]) % 10}')));
      expect(find.byKey(const Key('next')), findsNothing, reason: 'одна цифра из пары — не решено');
      await tap(tester, find.byKey(Key('digit${keyOf(ds[0]) % 10}')));
      expect(find.byKey(const Key('next')), findsOneWidget, reason: 'доска решена');
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    });
  });

  for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi']) {
    test('имя и правило клеток Шрёдингера словами — $lang', () async {
      await L.load(lang);
      for (final k in ['sdkRule_schrodinger', 'sudokuRuleSchrodinger']) {
        expect(L.has(k), isTrue, reason: '$lang: нет $k');
      }
      expect(variantTitle('schrodinger'), L.t('sdkRule_schrodinger'));
      expect(variantRuleKey('schrodinger'), 'sudokuRuleSchrodinger');
    });
  }
}
