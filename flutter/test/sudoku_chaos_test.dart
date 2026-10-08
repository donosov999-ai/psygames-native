import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/reject_why.dart';
import 'package:psygames_flutter/games/sudoku/resume.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 САМОСБОРКА ОБЛАСТЕЙ (6aecf181 п.12, задача 6cee3610): блоков нет, области (9 связных клеток,
/// в каждой 1–9) выводит игрок по подсказкам границ — числу сторон клетки на границе области — и по
/// цифрам. Натив разбиение не решает: доска приходит из выгрузки (эталон — боевой путь ядра). Здесь:
/// подсказки сверены с ответом своим счётом; на доске нет внутренних черт блоков, подсказки на своих
/// клетках; ход без блоков; причина отказа не выдаёт области; нажатиями — область красится цветом и
/// снимается отменой; снимок хранит подсказки; имя и правило на 12 языках.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final ref = jsonDecode(File('test/fixtures/sudoku-chaos-reference.json').readAsStringSync()) as Map<String, Object?>;
  List<List<int>> ints(Object? v) => [for (final row in v! as List) [for (final x in row as List) (x as num).toInt()]];
  final puzzle = ints(ref['puzzle']);
  final solution = ints(ref['solution']);
  final clues = ints(ref['chaos']);
  final regions = ints(ref['regions']);

  test('разбор эталона: подсказка = число сторон на границе области (свой счёт по ответу)', () {
    var shown = 0;
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (clues[r][c] < 0) continue;
        shown++;
        var n = 0;
        for (final (dr, dc) in const [(-1, 0), (1, 0), (0, -1), (0, 1)]) {
          final rr = r + dr, cc = c + dc;
          if (rr < 0 || rr > 8 || cc < 0 || cc > 8 || regions[rr][cc] != regions[r][c]) n++;
        }
        expect(clues[r][c], n, reason: '($r,$c)');
      }
    }
    expect(shown, inInclusiveRange(15, 50));
    // Ответ — честные области: 9 по 9 клеток, в каждой 1–9.
    final digitsOf = <int, Set<int>>{};
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        (digitsOf[regions[r][c]] ??= {}).add(solution[r][c]);
      }
    }
    expect(digitsOf.length, 9);
    for (final d in digitsOf.values) {
      expect(d, hasLength(9));
    }
    expect(BoardGeometry.fromJson({'chaos': clues}).chaos, clues);
  });

  test('🔴 ход без блоков: строка и столбец — да, квадрат 3×3 — нет; с областями — как кривые блоки', () {
    final g = List.generate(9, (_) => List.filled(9, 0));
    g[1][1] = 5;
    expect(isValid(g, 0, 0, 5, 9, 3, 3), isFalse);
    expect(isValid(g, 0, 0, 5, 9, 3, 3, variant: 'chaos'), isTrue, reason: 'квадрата 3×3 нет');
    expect(isValid(g, 1, 7, 5, 9, 3, 3, variant: 'chaos'), isFalse, reason: 'строка');
    final boxes = List.generate(9, (r) => List.generate(9, (c) => (r ~/ 3) * 3 + c ~/ 3));
    expect(isValid(g, 0, 0, 5, 9, 3, 3, variant: 'chaos', geometry: BoardGeometry(regions: boxes)), isFalse);
  });

  test('причина отказа не выдаёт области: конфликт только с квадратом 3×3 — «доказать нечем»', () {
    final g = List.generate(9, (_) => List.filled(9, 0));
    g[1][1] = 5;
    expect(rejectionKey(g, 0, 0, 5, n: 9, br: 3, bc: 3, variant: 'chaos', geometry: BoardGeometry(chaos: clues)), 'sudokuWhyNotLocal');
    expect(rejectionKey(g, 1, 7, 5, n: 9, br: 3, bc: 3, variant: 'chaos', geometry: BoardGeometry(chaos: clues)), isNull,
        reason: 'конфликт в строке виден на доске');
  });

  double sideWidth(WidgetTester tester, int r, int c, String side) {
    final box = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(DecoratedBox)).first;
    final border = (tester.widget<DecoratedBox>(box).decoration as BoxDecoration).border! as Border;
    return switch (side) { 'top' => border.top.width, 'right' => border.right.width, 'bottom' => border.bottom.width, _ => border.left.width };
  }

  testWidgets('🔴 на доске: подсказки границ на своих клетках, внутренних черт блоков нет, край толстый', (tester) async {
    final board = SudokuBoard(
      level: 141, n: 9, br: 3, bc: 3, variant: 'chaos',
      puzzle: puzzle, solution: solution,
      geometry: BoardGeometry(chaos: clues), geometryJson: {'chaos': clues},
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 400,
          height: 460,
          child: SudokuBoardView(
            board: board,
            grid: puzzle,
            given: [for (final row in puzzle) [for (final v in row) v != 0]],
            marks: List.generate(9, (_) => List.filled(9, 0)),
            colors: List.generate(9, (_) => List.filled(9, noSudokuColor)),
            selected: null,
            height: 460,
            onTap: (_, _) {},
          ),
        ),
      ),
    ));
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        final f = find.byKey(Key('border-clue-${r}_$c'));
        if (clues[r][c] < 0) {
          expect(f, findsNothing, reason: '($r,$c)');
          continue;
        }
        expect(find.descendant(of: f, matching: find.text('${clues[r][c]}')), findsOneWidget, reason: '($r,$c)');
        final cell = tester.getRect(find.byKey(Key('cell_${r}_$c')));
        final badge = tester.getRect(f);
        expect(cell.contains(badge.center), isTrue, reason: '($r,$c): подсказка в своей клетке');
      }
    }
    // Там, где у обычной доски черта блока (между столбцами 2 и 3, строками 5 и 6), — тонкая.
    expect(sideWidth(tester, 4, 2, 'right'), lessThan(1));
    expect(sideWidth(tester, 5, 4, 'bottom'), lessThan(1));
    expect(sideWidth(tester, 0, 4, 'top'), greaterThan(1), reason: 'край доски — толстый');
    expect(sideWidth(tester, 4, 8, 'right'), greaterThan(1));
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

    Color? paintAt(WidgetTester tester, int r, int c) {
      final material = find.ancestor(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Material));
      return material.evaluate().isEmpty ? null : tester.widget<Material>(material.first).color;
    }

    testWidgets('🔴 область красится цветом и снимается отменой; подсказки видны, черт блоков нет', (tester) async {
      // Доска самосборки приходит снимком партии: на лестнице её ещё нет (ступени ставит раздел уровней).
      SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '5'});
      await tester.runAsync(() async => state = await SharedState.open());
      await mount(tester);
      await tap(tester, find.byKey(const Key('cell_0_0')));
      await tap(tester, find.byKey(const Key('digit5')));
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      final env = (jsonDecode(state.get(key)!) as Map).cast<String, Object?>();
      final s = (env['state'] as Map).cast<String, Object?>();
      s
        ..['variant'] = 'chaos'
        ..['puzzle'] = puzzle
        ..['solution'] = solution
        ..['grid'] = puzzle
        ..['given'] = [for (final row in puzzle) [for (final v in row) v != 0]]
        ..['marks'] = List.generate(9, (_) => List.filled(9, 0))
        ..['cellColors'] = List.generate(9, (_) => List.filled(9, noSudokuColor))
        ..['history'] = {'past': <Object>[], 'future': <Object>[]}
        ..['errors'] = 0
        ..['regions'] = null
        ..['chaos'] = clues;
      env['state'] = s;
      await tester.runAsync(() => state.set(key, jsonEncode(env)));
      await mount(tester);

      final (cr, cc) = [for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (clues[r][c] >= 0) (r, c)].first;
      expect(find.byKey(Key('border-clue-${cr}_$cc')), findsOneWidget, reason: 'снимок поднял подсказки');
      expect(sideWidth(tester, 4, 2, 'right'), lessThan(1), reason: 'черт блоков на экране нет');

      // Красим две клетки одной области цветом — как игрок отмечает выведенную область.
      final (r1, c1) = [for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (puzzle[r][c] == 0) (r, c)].first;
      final plain = paintAt(tester, r1, c1);
      await tap(tester, find.byKey(const Key('paint')));
      await tap(tester, find.byKey(const Key('swatch2')));
      await tap(tester, find.byKey(Key('cell_${r1}_$c1')));
      expect(paintAt(tester, r1, c1), isNot(plain), reason: 'клетка покрашена');
      await tap(tester, find.byTooltip(L.t('btn_undo')));
      expect(paintAt(tester, r1, c1), plain, reason: 'отмена сняла отметку области');
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    });
  });

  test('снимок партии хранит подсказки границ и поднимает их обратно', () {
    final web = webGeometry({'chaos': clues});
    expect(web['chaos'], clues);
    expect(BoardGeometry.fromJson(exportGeometry(web)).chaos, clues);
  });

  for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi']) {
    test('имя и правило самосборки словами — $lang', () async {
      await L.load(lang);
      for (final k in ['sdkRule_chaos', 'sudokuRuleChaos']) {
        expect(L.has(k), isTrue, reason: '$lang: нет $k');
      }
      expect(variantTitle('chaos'), L.t('sdkRule_chaos'));
      expect(variantRuleKey('chaos'), 'sudokuRuleChaos');
    });
  }
}
