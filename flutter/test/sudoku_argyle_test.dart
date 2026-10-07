import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/reject_why.dart';
import 'package:psygames_flutter/games/sudoku/rule_help.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/variant_decor.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 АРГАЙЛ (6aecf181 п.10, задача 2345d346): восемь коротких диагоналей узора «ромб», на каждой
/// цифры не повторяются. Ходы против живого ядра сверяет `sudoku_rules_test` (эталон выгрузки);
/// здесь — то, что видит человек: узор тот же, что у ядра, линии на доске, имя и правило словами
/// на 12 языках, схема в окне правила.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('🔴 узор — восемь диагоналей: по 8 клеток (r−c = ±1, r+c = 7 и 9) и по 5 (r−c = ±4, r+c = 4 и 12)', () {
    final lines = <String, Set<(int, int)>>{};
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (argyleDiffs.contains(r - c)) (lines['d${r - c}'] ??= {}).add((r, c));
        if (argyleSums.contains(r + c)) (lines['s${r + c}'] ??= {}).add((r, c));
      }
    }
    expect({for (final e in lines.entries) e.key: e.value.length},
        {'d-4': 5, 'd-1': 8, 'd1': 8, 'd4': 5, 's4': 5, 's7': 8, 's9': 8, 's12': 5});
    // Соседи клетки — ровно её диагонали узора без неё самой.
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        final want = <(int, int)>{
          for (final e in lines.values)
            if (e.contains((r, c))) ...e,
        }..remove((r, c));
        expect(argylePeers(r, c, 9).toSet(), want, reason: '($r,$c)');
      }
    }
    expect(argylePeers(0, 1, 6), isEmpty, reason: 'узор только на 9×9');
  });

  test('🔴 правило работает: тройка на диагонали узора запрещает тройку по всей линии, мимо линии — нет', () {
    final g = List.generate(9, (_) => List.filled(9, 0));
    g[2][3] = 3;   // r−c = −1
    expect(isValid(g, 6, 7, 3, 9, 3, 3, variant: 'argyle'), isFalse, reason: 'та же диагональ r−c = −1');
    expect(isValid(g, 6, 7, 3, 9, 3, 3, variant: 'none'), isTrue, reason: 'классика это разрешает');
    expect(isValid(g, 6, 6, 3, 9, 3, 3, variant: 'argyle'), isTrue, reason: 'главная диагональ — не узор аргайла');
    g[0][4] = 5;   // r+c = 4
    expect(isValid(g, 4, 0, 5, 9, 3, 3, variant: 'argyle'), isFalse, reason: 'короткая r+c = 4');
  });

  test('отрезки линий — через центры клеток узора, концы на краях доски', () {
    final segs = argyleSegments();
    expect(segs, hasLength(8));
    for (final (x1, y1, x2, y2) in segs) {
      for (final v in [x1, y1, x2, y2]) {
        expect(v, inInclusiveRange(0, 9));
      }
      expect(x1 == 0 || y1 == 0 || x1 == 9 || y1 == 9, isTrue, reason: 'начало на краю');
      expect(x2 == 0 || y2 == 0 || x2 == 9 || y2 == 9, isTrue, reason: 'конец на краю');
    }
    // Центр клетки (1,0) лежит на отрезке r−c = 1: (0,1)→(8,9).
    expect(segs.first, (4.0, 0.0, 9.0, 5.0), reason: 'r−c = −4');
    expect(segs[2], (0.0, 1.0, 8.0, 9.0), reason: 'r−c = 1');
    expect(segs[4], (0.0, 5.0, 5.0, 0.0), reason: 'r+c = 4');
    expect(segs[7], (4.0, 9.0, 9.0, 4.0), reason: 'r+c = 12');
  });

  testWidgets('🔴 на доске аргайла — слой линий узора, и это именно узор, а не главные диагонали', (tester) async {
    final data = jsonDecode(File('test/fixtures/sudoku-rules-reference.json').readAsStringSync()) as Map<String, Object?>;
    final ref = (data['boards'] as List).cast<Map<String, Object?>>().firstWhere((b) => b['variant'] == 'argyle');
    List<List<int>> ints(Object? v) => [for (final row in v! as List) [for (final x in row as List) (x as num).toInt()]];
    final board = SudokuBoard(
      level: 177, n: 9, br: 3, bc: 3, variant: 'argyle',
      puzzle: ints(ref['grid']), solution: ints(ref['solution']), geometry: const BoardGeometry(),
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 400,
          height: 460,
          child: SudokuBoardView(
            board: board,
            grid: board.puzzle,
            given: [for (final row in board.puzzle) [for (final v in row) v != 0]],
            marks: List.generate(9, (_) => List.filled(9, 0)),
            colors: List.generate(9, (_) => List.filled(9, noSudokuColor)),
            selected: null,
            height: 460,
            onTap: (_, _) {},
          ),
        ),
      ),
    ));
    final layer = find.byKey(const Key('argyle-layer'));
    expect(layer, findsOneWidget);
    final p = tester.widget<CustomPaint>(layer).painter! as BoardLinesPainter;
    expect(p.argyle, isTrue);
    expect(p.diagonals, isFalse, reason: 'главных диагоналей у аргайла нет');
    expect(find.byKey(const Key('diagonal-layer')), findsNothing);
  });

  for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi']) {
    test('имя и правило аргайла словами — $lang', () async {
      await L.load(lang);
      for (final k in ['sdkRule_argyle', 'sudokuRuleArgyle']) {   // sudokuVariant* — только веб
        expect(L.has(k), isTrue, reason: '$lang: нет $k');
      }
      expect(variantTitle('argyle'), L.t('sdkRule_argyle'));
      expect(variantTitle('argyle'), isNot(L.t('sdkRule_none')), reason: 'не «классика»');
      expect(variantRuleKey('argyle'), 'sudokuRuleArgyle');
    });
  }

  test('окно правила: схема 5×5 — тройка на линии узора, тройки по той же линии запрещены', () {
    final g = sudokuExampleGrid('argyle')!;
    expect(g[(2, 2)]?.kind, SudokuExampleKind.source);
    for (final rc in const [(0, 4), (4, 0)]) {
      expect(g[rc]?.kind, SudokuExampleKind.banned, reason: '$rc на той же линии');
    }
    expect(g[(1, 3)]?.kind, SudokuExampleKind.zone);
    expect(sudokuRuleTextKey('argyle'), 'sudokuRuleArgyle');
  });
}
